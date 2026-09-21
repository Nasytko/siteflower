import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, SlugEntityType } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { wouldCreateRedirectLoop } from './catalog.logic';

const MAX_REDIRECT_HOPS = 5;

@Injectable()
export class SlugRedirectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records `fromSlug → toSlug` and repoints redirects that targeted the old
   * slug, so lookups stay one hop and can never cycle.
   */
  async record(
    tx: Prisma.TransactionClient,
    entityType: SlugEntityType,
    fromSlug: string,
    toSlug: string,
  ): Promise<void> {
    const existing = await tx.slugRedirect.findMany({
      where: { entityType },
      select: { fromSlug: true, toSlug: true },
    });
    if (wouldCreateRedirectLoop(existing, fromSlug, toSlug)) {
      throw new ConflictException('This slug change would create a redirect loop');
    }

    await tx.slugRedirect.deleteMany({ where: { entityType, fromSlug: toSlug } });
    await tx.slugRedirect.updateMany({
      where: { entityType, toSlug: fromSlug },
      data: { toSlug },
    });
    await tx.slugRedirect.upsert({
      where: { entityType_fromSlug: { entityType, fromSlug } },
      create: { entityType, fromSlug, toSlug },
      update: { toSlug },
    });
  }

  async findTarget(entityType: SlugEntityType, fromSlug: string): Promise<string | null> {
    const redirect = await this.prisma.client.slugRedirect.findUnique({
      where: { entityType_fromSlug: { entityType, fromSlug } },
      select: { toSlug: true },
    });
    return redirect?.toSlug ?? null;
  }

  /** Follows the redirect chain, returning every candidate slug in order. */
  async resolveChain(entityType: SlugEntityType, slug: string): Promise<string[]> {
    const chain = [slug];
    let current = slug;
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
      const next = await this.findTarget(entityType, current);
      if (!next || chain.includes(next)) break;
      chain.push(next);
      current = next;
    }
    return chain;
  }
}

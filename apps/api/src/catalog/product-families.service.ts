import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProductFamilyDto } from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { isEffectivelyPublished } from './catalog.logic';
import { PRODUCT_INCLUDE, toProductFamilyDto, type MediaUrlResolver } from './catalog.mapper';

@Injectable()
export class ProductFamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Array<{ id: string; name: string; version: number; membersCount: number }>> {
    const rows = await this.prisma.client.productFamily.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      membersCount: row._count.members,
    }));
  }

  async create(name: string): Promise<{ id: string; name: string; version: number }> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Family name is required');
    const row = await this.prisma.client.productFamily.create({
      data: { name: trimmed },
    });
    return { id: row.id, name: row.name, version: row.version };
  }

  async rename(id: string, name: string, expectedVersion: number) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Family name is required');
    const existing = await this.prisma.client.productFamily.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Family not found');
    if (existing.version !== expectedVersion) {
      throw new BadRequestException('Family was modified elsewhere');
    }
    return this.prisma.client.productFamily.update({
      where: { id },
      data: { name: trimmed, version: { increment: 1 } },
      select: { id: true, name: true, version: true },
    });
  }

  async getDto(
    familyId: string,
    urlFor: MediaUrlResolver,
    currentProductId?: string,
    options?: { publishedOnly?: boolean; now?: Date },
  ): Promise<ProductFamilyDto | null> {
    const family = await this.prisma.client.productFamily.findUnique({
      where: { id: familyId },
      include: {
        members: {
          orderBy: { sortOrder: 'asc' },
          include: { product: { include: PRODUCT_INCLUDE } },
        },
      },
    });
    if (!family) return null;
    const now = options?.now ?? new Date();
    const members = family.members
      .filter((member) =>
        options?.publishedOnly ? isEffectivelyPublished(member.product, now) : true,
      )
      .map((member) => ({
        productId: member.productId,
        sortOrder: member.sortOrder,
        product: member.product,
      }));
    return toProductFamilyDto(family, members, urlFor, currentProductId);
  }

  /**
   * Assign product to family (or clear). Runs inside caller's transaction.
   * A product may belong to at most one family.
   */
  async setProductFamilyInTx(
    tx: Prisma.TransactionClient,
    productId: string,
    familyId: string | null,
    sortOrder?: number,
  ): Promise<void> {
    await tx.productFamilyMember.deleteMany({ where: { productId } });
    if (!familyId) return;

    const family = await tx.productFamily.findUnique({ where: { id: familyId } });
    if (!family) throw new BadRequestException('Product family not found');

    const max = await tx.productFamilyMember.aggregate({
      where: { familyId },
      _max: { sortOrder: true },
    });
    await tx.productFamilyMember.create({
      data: {
        familyId,
        productId,
        sortOrder: sortOrder ?? (max._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async reorderMembers(familyId: string, orderedProductIds: string[]): Promise<void> {
    const family = await this.prisma.client.productFamily.findUnique({
      where: { id: familyId },
      include: { members: true },
    });
    if (!family) throw new NotFoundException('Family not found');
    const existing = new Set(family.members.map((m) => m.productId));
    if (
      orderedProductIds.length !== existing.size ||
      orderedProductIds.some((id) => !existing.has(id))
    ) {
      throw new BadRequestException('orderedProductIds must match family members exactly');
    }
    await this.prisma.client.$transaction(async (tx) => {
      for (const [index, productId] of orderedProductIds.entries()) {
        await tx.productFamilyMember.update({
          where: { productId },
          data: { sortOrder: index },
        });
      }
      await tx.productFamily.update({
        where: { id: familyId },
        data: { version: { increment: 1 } },
      });
    });
  }
}

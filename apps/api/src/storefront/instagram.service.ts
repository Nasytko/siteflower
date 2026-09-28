import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  parseInstagramHandle,
  type InstagramFeedPublicDto,
  type InstagramPostDto,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import { StorefrontSettingsService } from './storefront-settings.service';

export type CreateInstagramPostInput = {
  imageUrl: string;
  postUrl?: string | null;
  caption?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

export type UpdateInstagramPostInput = {
  imageUrl?: string;
  postUrl?: string | null;
  caption?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

function toDto(row: {
  id: string;
  imageUrl: string;
  postUrl: string | null;
  caption: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): InstagramPostDto {
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    postUrl: row.postUrl,
    caption: row.caption,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireUrl(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} is required`);
  }
  if (trimmed.length > 1000) {
    throw new BadRequestException(`${field} is too long`);
  }
  try {
    // Allow absolute http(s) or same-origin /api/v1/media paths.
    if (trimmed.startsWith('/')) return trimmed;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
    return trimmed;
  } catch {
    throw new BadRequestException(`${field} must be a valid URL`);
  }
}

function optionalUrl(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  return requireUrl(value, field);
}

function optionalCaption(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new BadRequestException('caption is too long');
  }
  return trimmed;
}

@Injectable()
export class InstagramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StorefrontSettingsService,
  ) {}

  async listAdmin(): Promise<InstagramPostDto[]> {
    const rows = await this.prisma.client.instagramPost.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDto);
  }

  async getPublicFeed(): Promise<InstagramFeedPublicDto> {
    const [settings, rows] = await Promise.all([
      this.settings.getPublic(),
      this.prisma.client.instagramPost.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      brandName: settings.brandName,
      profileUrl: settings.instagramUrl,
      handle: parseInstagramHandle(settings.instagramUrl),
      posts: rows.map(toDto),
    };
  }

  async create(input: CreateInstagramPostInput): Promise<InstagramPostDto> {
    const imageUrl = requireUrl(input.imageUrl, 'imageUrl');
    const max = await this.prisma.client.instagramPost.aggregate({
      _max: { sortOrder: true },
    });
    const row = await this.prisma.client.instagramPost.create({
      data: {
        imageUrl,
        postUrl: optionalUrl(input.postUrl, 'postUrl'),
        caption: optionalCaption(input.caption),
        enabled: input.enabled ?? true,
        sortOrder: input.sortOrder ?? (max._max.sortOrder ?? 0) + 10,
      },
    });
    return toDto(row);
  }

  async update(id: string, input: UpdateInstagramPostInput): Promise<InstagramPostDto> {
    const existing = await this.prisma.client.instagramPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Instagram post not found');

    const row = await this.prisma.client.instagramPost.update({
      where: { id },
      data: {
        ...(input.imageUrl !== undefined
          ? { imageUrl: requireUrl(input.imageUrl, 'imageUrl') }
          : {}),
        ...(input.postUrl !== undefined ? { postUrl: optionalUrl(input.postUrl, 'postUrl') } : {}),
        ...(input.caption !== undefined ? { caption: optionalCaption(input.caption) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.client.instagramPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Instagram post not found');
    await this.prisma.client.instagramPost.delete({ where: { id } });
  }

  async reorder(orderedIds: string[]): Promise<InstagramPostDto[]> {
    const unique = [...new Set(orderedIds)];
    if (unique.length === 0) {
      throw new BadRequestException('orderedIds is required');
    }
    const existing = await this.prisma.client.instagramPost.findMany({
      select: { id: true },
    });
    if (existing.length !== unique.length || existing.some((row) => !unique.includes(row.id))) {
      throw new BadRequestException('orderedIds must include every post exactly once');
    }
    await this.prisma.client.$transaction(
      unique.map((id, index) =>
        this.prisma.client.instagramPost.update({
          where: { id },
          data: { sortOrder: (index + 1) * 10 },
        }),
      ),
    );
    return this.listAdmin();
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  type FlowerOriginDto,
  type FlowerTypeDto,
  type FlowerVarietyDto,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class FlowerRefsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes(visibleOnly = false): Promise<FlowerTypeDto[]> {
    const rows = await this.prisma.client.flowerType.findMany({
      where: visibleOnly ? { visibility: 'VISIBLE' } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
    }));
  }

  async listVarieties(flowerTypeId?: string, visibleOnly = false): Promise<FlowerVarietyDto[]> {
    const rows = await this.prisma.client.flowerVariety.findMany({
      where: {
        ...(flowerTypeId ? { flowerTypeId } : {}),
        ...(visibleOnly ? { visibility: 'VISIBLE' } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      flowerTypeId: row.flowerTypeId,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
    }));
  }

  async listOrigins(visibleOnly = false): Promise<FlowerOriginDto[]> {
    const rows = await this.prisma.client.flowerOrigin.findMany({
      where: visibleOnly ? { visibility: 'VISIBLE' } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
    }));
  }

  async createType(input: { name: string; slug?: string; sortOrder?: number }): Promise<FlowerTypeDto> {
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    try {
      const row = await this.prisma.client.flowerType.create({
        data: { name: input.name.trim(), slug, sortOrder: input.sortOrder ?? 0 },
      });
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
      };
    } catch {
      throw new ConflictException('Flower type slug already in use');
    }
  }

  async createVariety(input: {
    flowerTypeId: string;
    name: string;
    slug?: string;
    sortOrder?: number;
  }): Promise<FlowerVarietyDto> {
    const type = await this.prisma.client.flowerType.findUnique({
      where: { id: input.flowerTypeId },
    });
    if (!type) throw new NotFoundException('Flower type not found');
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    try {
      const row = await this.prisma.client.flowerVariety.create({
        data: {
          flowerTypeId: input.flowerTypeId,
          name: input.name.trim(),
          slug,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      return {
        id: row.id,
        flowerTypeId: row.flowerTypeId,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
      };
    } catch {
      throw new ConflictException('Flower variety slug already in use');
    }
  }

  async createOrigin(input: {
    name: string;
    slug?: string;
    sortOrder?: number;
  }): Promise<FlowerOriginDto> {
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    try {
      const row = await this.prisma.client.flowerOrigin.create({
        data: { name: input.name.trim(), slug, sortOrder: input.sortOrder ?? 0 },
      });
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
      };
    } catch {
      throw new ConflictException('Flower origin slug already in use');
    }
  }

  async assertVarietyMatchesType(
    flowerTypeId: string | null | undefined,
    flowerVarietyId: string | null | undefined,
  ): Promise<void> {
    if (!flowerVarietyId) return;
    const variety = await this.prisma.client.flowerVariety.findUnique({
      where: { id: flowerVarietyId },
    });
    if (!variety) throw new BadRequestException('Flower variety not found');
    // Variety always requires its owning type — never allow orphan variety on Product.
    if (!flowerTypeId || variety.flowerTypeId !== flowerTypeId) {
      throw new BadRequestException('Flower variety does not belong to the selected flower type');
    }
  }
}

import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { actorFrom } from '../common/actor.util';
import { HomepageConfigService } from './homepage-config.service';

class UpdateHomepageSeoBodyDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  h1?: string | null;
}

class DiscoveryTileBodyDto {
  @IsString()
  @MaxLength(80)
  id!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsString()
  @MaxLength(500)
  href!: string;

  @IsOptional()
  destination?: {
    kind?: string;
    ref?: string | null;
    href?: string | null;
  } | null;

  @IsString()
  @MaxLength(500)
  imageUrl!: string;

  @IsString()
  @MaxLength(200)
  imageAlt!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

class UpdateHomepageDiscoveryTilesBodyDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscoveryTileBodyDto)
  discoveryTiles!: DiscoveryTileBodyDto[];
}

class HeroSlideBodyDto {
  @IsString()
  @MaxLength(80)
  id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mobileImageUrl?: string | null;

  @IsString()
  @MaxLength(80)
  ctaLabel!: string;

  @IsString()
  @MaxLength(500)
  ctaHref!: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  kicker?: string | null;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

class UpdateHomepageHeroSlidesBodyDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeroSlideBodyDto)
  heroSlides!: HeroSlideBodyDto[];
}

@ApiTags('admin-storefront-homepage')
@Controller('admin/storefront/homepage')
export class AdminHomepageController {
  constructor(private readonly homepage: HomepageConfigService) {}

  @Get()
  @RequirePermissions('CONTENT_READ')
  get() {
    return this.homepage.getAdmin();
  }

  @Patch('seo')
  @RequirePermissions('SEO_UPDATE')
  updateSeo(
    @Body() body: UpdateHomepageSeoBodyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.homepage.updateSeo(
      {
        expectedVersion: body.expectedVersion,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        h1: body.h1,
      },
      actorFrom(admin, req),
    );
  }

  @Patch('hero-slides')
  @RequirePermissions('CONTENT_UPDATE')
  updateHeroSlides(
    @Body() body: UpdateHomepageHeroSlidesBodyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.homepage.updateHeroSlides(
      {
        expectedVersion: body.expectedVersion,
        heroSlides: body.heroSlides.map((slide, index) => ({
          id: slide.id,
          title: slide.title,
          subtitle: slide.subtitle ?? '',
          imageUrl: slide.imageUrl ?? null,
          mobileImageUrl: slide.mobileImageUrl ?? null,
          ctaLabel: slide.ctaLabel,
          ctaHref: slide.ctaHref,
          kicker: slide.kicker ?? null,
          enabled: slide.enabled,
          sortOrder: slide.sortOrder ?? (index + 1) * 10,
          startsAt: null,
          endsAt: null,
        })),
      },
      actorFrom(admin, req),
    );
  }

  @Patch('discovery-tiles')
  @RequirePermissions('CONTENT_UPDATE')
  updateDiscoveryTiles(
    @Body() body: UpdateHomepageDiscoveryTilesBodyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.homepage.updateDiscoveryTiles(
      {
        expectedVersion: body.expectedVersion,
        discoveryTiles: body.discoveryTiles.map((tile) => ({
          id: tile.id,
          label: tile.label,
          href: tile.href,
          destination: tile.destination
            ? {
                kind: (tile.destination.kind as 'custom') ?? 'custom',
                ref: tile.destination.ref ?? null,
                href: tile.destination.href ?? tile.href,
              }
            : { kind: 'custom' as const, href: tile.href },
          imageUrl: tile.imageUrl,
          imageAlt: tile.imageAlt,
          enabled: tile.enabled,
          sortOrder: tile.sortOrder,
        })),
      },
      actorFrom(admin, req),
    );
  }
}

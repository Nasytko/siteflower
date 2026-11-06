import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
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

@ApiTags('admin-storefront-homepage')
@Controller('admin/storefront/homepage')
export class AdminHomepageController {
  constructor(private readonly homepage: HomepageConfigService) {}

  @Get()
  @RequirePermissions('SEO_READ')
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
}

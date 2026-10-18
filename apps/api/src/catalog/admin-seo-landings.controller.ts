import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SEO_LANDING_STATUSES, type SeoLandingStatus } from '@bouquet-one/contracts';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { ExpectedVersionDto } from './products.dto';
import { SeoLandingsService } from './seo-landings.service';

class CreateSeoLandingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  h1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20_000)
  body?: string | null;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsBoolean()
  navVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  pinnedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  excludedProductIds?: string[];
}

class UpdateSeoLandingDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  h1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20_000)
  body?: string | null;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsBoolean()
  navVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn([...SEO_LANDING_STATUSES])
  status?: SeoLandingStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  pinnedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  excludedProductIds?: string[];
}

class PreviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number = 24;
}

class PreviewRulesDto {
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  pinnedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  excludedProductIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number = 24;
}

@ApiTags('admin-seo-landings')
@Controller('admin/seo/landings')
export class AdminSeoLandingsController {
  constructor(private readonly landings: SeoLandingsService) {}

  @Get()
  @RequirePermissions('SEO_READ')
  list() {
    return this.landings.listAdmin();
  }

  @Post('preview-rules')
  @RequirePermissions('SEO_READ')
  previewRules(@Body() body: PreviewRulesDto) {
    return this.landings.previewRules(
      {
        rules: body.rules,
        pinnedProductIds: body.pinnedProductIds,
        excludedProductIds: body.excludedProductIds,
      },
      { page: body.page, pageSize: body.pageSize },
    );
  }

  @Post()
  @RequirePermissions('SEO_UPDATE')
  create(
    @Body() body: CreateSeoLandingDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.landings.create(body, actorFrom(admin, req));
  }

  @Get(':id')
  @RequirePermissions('SEO_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.landings.getAdmin(id);
  }

  @Get(':id/preview-products')
  @RequirePermissions('SEO_READ')
  previewProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PreviewQueryDto,
  ) {
    return this.landings.previewProducts(id, query);
  }

  @Patch(':id')
  @RequirePermissions('SEO_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSeoLandingDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.landings.update(id, body, actorFrom(admin, req));
  }

  @Post(':id/publish')
  @RequirePermissions('SEO_UPDATE')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.landings.publish(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('SEO_UPDATE')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.landings.remove(id, body.expectedVersion, actorFrom(admin, req));
  }
}

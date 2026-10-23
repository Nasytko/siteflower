import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { CatalogPagesService } from './catalog-pages.service';
import { isCatalogPageKind, type CatalogPageKind } from '@bouquet-one/contracts';

class ExpectedVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class CreateCatalogPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  h1?: string;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  pinnedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedProductIds?: string[];
}

class UpdateCatalogPageDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  h1?: string | null;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsBoolean()
  navVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  pinnedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedProductIds?: string[];
}

@ApiTags('admin-catalog')
@Controller('admin/catalog/pages')
export class AdminCatalogPagesController {
  constructor(private readonly pages: CatalogPagesService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list(
    @Query('pageKind') pageKind?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('withCounts') withCounts?: string,
  ) {
    const kind =
      pageKind && isCatalogPageKind(pageKind) ? (pageKind as CatalogPageKind) : undefined;
    return this.pages.listAdmin({
      pageKind: kind,
      status,
      q,
      withCounts: withCounts === '1' || withCounts === 'true',
    });
  }

  @Get('traits')
  @RequirePermissions('CATALOG_READ')
  listTraits() {
    return this.pages.listTraitDefinitions();
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.getAdmin(id);
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateCatalogPageDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.pages.createThematic(body, actorFrom(admin, req));
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCatalogPageDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.pages.updateThematic(id, body, actorFrom(admin, req));
  }

  @Post(':id/publish')
  @RequirePermissions('CATALOG_PUBLISH')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.pages.publish(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post(':id/unpublish')
  @RequirePermissions('CATALOG_PUBLISH')
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.pages.unpublish(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Get(':id/delete-impact')
  @RequirePermissions('CATALOG_READ')
  deleteImpact(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.deleteImpact(id);
  }

  @Delete(':id')
  @RequirePermissions('CATALOG_UPDATE')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.pages.deletePage(id, body.expectedVersion, actorFrom(admin, req));
  }
}

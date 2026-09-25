import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
} from 'class-validator';
import {
  COLLECTION_TYPES,
  TAXONOMY_VISIBILITIES,
  type CollectionType,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import type { Request } from 'express';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { CollectionsService } from './collections.service';
import { ExpectedVersionDto } from './products.dto';

class CollectionListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(COLLECTION_TYPES)
  type?: CollectionType;

  @IsOptional()
  @IsIn(TAXONOMY_VISIBILITIES)
  visibility?: TaxonomyVisibility;
}

class CreateCollectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(COLLECTION_TYPES)
  type?: CollectionType;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(TAXONOMY_VISIBILITIES)
  visibility?: TaxonomyVisibility;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;
}

class UpdateCollectionDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(COLLECTION_TYPES)
  type?: CollectionType;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(TAXONOMY_VISIBILITIES)
  visibility?: TaxonomyVisibility;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;
}

class SetCollectionMembersDto extends ExpectedVersionDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  productIds!: string[];
}

class PreviewCollectionRulesDto {
  @IsObject()
  rules!: Record<string, unknown>;
}

@ApiTags('admin-catalog-collections')
@Controller('admin/catalog/collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list(@Query() query: CollectionListQueryDto) {
    return this.collections.list(query);
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateCollectionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.collections.create(body, actorFrom(admin, req));
  }

  @Post('preview')
  @RequirePermissions('CATALOG_READ')
  preview(@Body() body: PreviewCollectionRulesDto) {
    return this.collections.previewRules(body.rules);
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.collections.getById(id);
  }

  @Get(':id/preview')
  @RequirePermissions('CATALOG_READ')
  previewById(@Param('id', ParseUUIDPipe) id: string) {
    return this.collections.previewById(id);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCollectionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.collections.update(id, body, actorFrom(admin, req));
  }

  @Put(':id/products')
  @RequirePermissions('CATALOG_UPDATE')
  setMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetCollectionMembersDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.collections.setMembers(
      id,
      body.expectedVersion,
      body.productIds,
      actorFrom(admin, req),
    );
  }
}

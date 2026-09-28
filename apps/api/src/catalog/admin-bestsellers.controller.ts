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
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { BestsellersService } from './bestsellers.service';
import { ExpectedVersionDto } from './products.dto';

class CreateBestsellerGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  /** Storefront heading override; falls back to `name`. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateBestsellerGroupDto extends ExpectedVersionDto {
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
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class SetBestsellerProductsDto extends ExpectedVersionDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  productIds!: string[];
}

@ApiTags('admin-catalog-bestsellers')
@Controller('admin/catalog/bestsellers')
export class AdminBestsellersController {
  constructor(private readonly bestsellers: BestsellersService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {
    return this.bestsellers.listAdmin();
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateBestsellerGroupDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.bestsellers.create(body, actorFrom(admin, req));
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.bestsellers.getAdmin(id);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBestsellerGroupDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.bestsellers.update(id, body, actorFrom(admin, req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('CATALOG_UPDATE')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.bestsellers.remove(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Put(':id/products')
  @RequirePermissions('CATALOG_UPDATE')
  setProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetBestsellerProductsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.bestsellers.setProducts(
      id,
      body.expectedVersion,
      body.productIds,
      actorFrom(admin, req),
    );
  }

  @Put(':id/products/order')
  @RequirePermissions('CATALOG_UPDATE')
  reorderProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetBestsellerProductsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.bestsellers.reorderProducts(
      id,
      body.expectedVersion,
      body.productIds,
      actorFrom(admin, req),
    );
  }
}

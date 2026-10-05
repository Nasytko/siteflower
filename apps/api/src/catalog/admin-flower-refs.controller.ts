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
  IsIn,
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
import type { Request } from 'express';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { FlowerRefsService } from './flower-refs.service';
import { ExpectedVersionDto } from './products.dto';

class CreateFlowerTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

class CreateFlowerVarietyDto {
  @IsUUID()
  flowerTypeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

class CreateFlowerOriginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

class UpdateFlowerRefDto extends ExpectedVersionDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['VISIBLE', 'HIDDEN'])
  visibility?: 'VISIBLE' | 'HIDDEN';
}

class UpdateFlowerVarietyDto extends UpdateFlowerRefDto {
  @IsOptional()
  @IsUUID()
  flowerTypeId?: string;
}

class ReassignTypeDto extends ExpectedVersionDto {
  @IsUUID()
  targetFlowerTypeId!: string;
}

class ReassignVarietyDto extends ExpectedVersionDto {
  @IsUUID()
  targetVarietyId!: string;
}

class MoveVarietyDto extends ExpectedVersionDto {
  @IsUUID()
  targetFlowerTypeId!: string;
}

class ReassignOriginDto extends ExpectedVersionDto {
  @IsUUID()
  targetOriginId!: string;
}

class CreateFlowerItemDto {
  @IsUUID()
  flowerTypeId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  flowerFormId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  flowerVarietyId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  flowerOriginId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  stemLengthCm?: number | null;

  /** @deprecated Prefer stemLengthCm */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  heightCm?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

class UpdateFlowerItemDto extends ExpectedVersionDto {
  @IsOptional()
  @IsUUID()
  flowerTypeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  flowerFormId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  flowerVarietyId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  flowerOriginId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  stemLengthCm?: number | null;

  /** @deprecated Prefer stemLengthCm */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  heightCm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['VISIBLE', 'HIDDEN'])
  visibility?: 'VISIBLE' | 'HIDDEN';
}

@ApiTags('admin-catalog')
@Controller('admin/catalog/flower-refs')
export class AdminFlowerRefsController {
  constructor(private readonly flowerRefs: FlowerRefsService) {}

  @Get('types')
  @RequirePermissions('CATALOG_READ')
  listTypes() {
    return this.flowerRefs.listTypesAdmin();
  }

  @Get('varieties')
  @RequirePermissions('CATALOG_READ')
  listVarieties(@Query('flowerTypeId') flowerTypeId?: string) {
    return this.flowerRefs.listVarietiesAdmin(flowerTypeId);
  }

  @Get('origins')
  @RequirePermissions('CATALOG_READ')
  listOrigins() {
    return this.flowerRefs.listOriginsAdmin();
  }

  @Get('forms')
  @RequirePermissions('CATALOG_READ')
  listForms(
    @Query('flowerTypeId') flowerTypeId?: string,
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.flowerRefs.listFormsAdmin(
      flowerTypeId,
      includeHidden === '1' || includeHidden === 'true',
    );
  }

  @Post('forms')
  @RequirePermissions('CATALOG_CREATE')
  createForm(
    @Body() body: CreateFlowerVarietyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    // Reuse variety DTO shape: flowerTypeId + name (+ optional slug/sortOrder).
    return this.flowerRefs.createForm(body, actorFrom(admin, req));
  }

  @Get('items')
  @RequirePermissions('CATALOG_READ')
  listItems(
    @Query('flowerTypeId') flowerTypeId?: string,
    @Query('flowerFormId') flowerFormId?: string,
    @Query('flowerVarietyId') flowerVarietyId?: string,
    @Query('flowerOriginId') flowerOriginId?: string,
    @Query('includeHidden') includeHidden?: string,
    @Query('visibility') visibility?: 'VISIBLE' | 'HIDDEN',
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? Number(page) : undefined;
    const parsedPageSize = pageSize ? Number(pageSize) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.flowerRefs.listItemsAdmin({
      flowerTypeId,
      flowerFormId,
      flowerVarietyId,
      flowerOriginId,
      includeHidden: includeHidden === '1' || includeHidden === 'true',
      visibility: visibility === 'VISIBLE' || visibility === 'HIDDEN' ? visibility : undefined,
      q,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      pageSize: Number.isFinite(parsedPageSize) ? parsedPageSize : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('items/:id')
  @RequirePermissions('CATALOG_READ')
  getItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.flowerRefs.getItemAdmin(id);
  }

  @Post('items')
  @RequirePermissions('CATALOG_CREATE')
  createItem(
    @Body() body: CreateFlowerItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.createItem(body, actorFrom(admin, req));
  }

  @Patch('items/:id')
  @RequirePermissions('CATALOG_UPDATE')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlowerItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.updateItem(id, body, actorFrom(admin, req));
  }

  @Delete('items/:id')
  @RequirePermissions('CATALOG_UPDATE')
  deleteItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.deleteItemEmpty(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post('types')
  @RequirePermissions('CATALOG_CREATE')
  createType(
    @Body() body: CreateFlowerTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.createType(body, actorFrom(admin, req));
  }

  @Post('varieties')
  @RequirePermissions('CATALOG_CREATE')
  createVariety(
    @Body() body: CreateFlowerVarietyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.createVariety(body, actorFrom(admin, req));
  }

  @Post('origins')
  @RequirePermissions('CATALOG_CREATE')
  createOrigin(
    @Body() body: CreateFlowerOriginDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.createOrigin(body, actorFrom(admin, req));
  }

  @Patch('types/:id')
  @RequirePermissions('CATALOG_UPDATE')
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlowerRefDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.updateType(id, body, actorFrom(admin, req));
  }

  @Patch('varieties/:id')
  @RequirePermissions('CATALOG_UPDATE')
  updateVariety(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlowerVarietyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.updateVariety(id, body, actorFrom(admin, req));
  }

  @Patch('origins/:id')
  @RequirePermissions('CATALOG_UPDATE')
  updateOrigin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlowerRefDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.updateOrigin(id, body, actorFrom(admin, req));
  }

  @Delete('types/:id')
  @RequirePermissions('CATALOG_UPDATE')
  deleteType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.deleteTypeEmpty(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post('types/:id/reassign-and-delete')
  @RequirePermissions('CATALOG_UPDATE')
  reassignType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReassignTypeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.reassignProductsAndDeleteType(id, body, actorFrom(admin, req));
  }

  @Delete('varieties/:id')
  @RequirePermissions('CATALOG_UPDATE')
  deleteVariety(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.deleteVarietyEmpty(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post('varieties/:id/reassign-and-delete')
  @RequirePermissions('CATALOG_UPDATE')
  reassignVariety(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReassignVarietyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.reassignProductsAndDeleteVariety(id, body, actorFrom(admin, req));
  }

  @Post('varieties/:id/move')
  @RequirePermissions('CATALOG_UPDATE')
  moveVariety(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoveVarietyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.moveVarietyToType(id, body, actorFrom(admin, req));
  }

  @Delete('origins/:id')
  @RequirePermissions('CATALOG_UPDATE')
  deleteOrigin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.deleteOriginEmpty(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post('origins/:id/reassign-and-delete')
  @RequirePermissions('CATALOG_UPDATE')
  reassignOrigin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReassignOriginDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.flowerRefs.reassignProductsAndDeleteOrigin(id, body, actorFrom(admin, req));
  }
}

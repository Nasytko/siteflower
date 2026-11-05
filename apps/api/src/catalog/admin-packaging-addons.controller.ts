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
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Request } from 'express';
import {
  ERP_SKU_PATTERN,
  normalizeErpSku,
  PACKAGING_ADDON_KINDS,
  type PackagingAddonKind,
} from '@bouquet-one/contracts';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { ExpectedVersionDto } from './products.dto';
import { PackagingAddonsService } from './packaging-addons.service';

const PRICE_MINOR_PATTERN = /^\d{1,15}$/;

class CreatePackagingAddonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn([...PACKAGING_ADDON_KINDS])
  kind?: PackagingAddonKind;

  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'surchargeMinor must be integer minor units as a string' })
  surchargeMinor!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(ERP_SKU_PATTERN, {
    message: 'erpSku must be A–Z / 0–9 / . _ - and start with alphanumeric',
  })
  erpSku?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

class UpdatePackagingAddonDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([...PACKAGING_ADDON_KINDS])
  kind?: PackagingAddonKind;

  @IsOptional()
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'surchargeMinor must be integer minor units as a string' })
  surchargeMinor?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(ERP_SKU_PATTERN, {
    message: 'erpSku must be A–Z / 0–9 / . _ - and start with alphanumeric',
  })
  erpSku?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

@ApiTags('admin-packaging-addons')
@Controller('admin/catalog/packaging-addons')
export class AdminPackagingAddonsController {
  constructor(private readonly packagingAddons: PackagingAddonsService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.packagingAddons.list({
      includeInactive: includeInactive === '1' || includeInactive === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagingAddons.get(id);
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreatePackagingAddonDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.packagingAddons.create(
      {
        name: body.name,
        kind: body.kind,
        surchargeMinor: body.surchargeMinor,
        erpSku: body.erpSku === undefined ? undefined : normalizeErpSku(body.erpSku),
        active: body.active,
        sortOrder: body.sortOrder,
      },
      actorFrom(admin, req),
    );
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePackagingAddonDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.packagingAddons.update(
      id,
      {
        name: body.name,
        kind: body.kind,
        surchargeMinor: body.surchargeMinor,
        erpSku: body.erpSku === undefined ? undefined : normalizeErpSku(body.erpSku),
        active: body.active,
        sortOrder: body.sortOrder,
        expectedVersion: body.expectedVersion,
      },
      actorFrom(admin, req),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('CATALOG_UPDATE')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ): Promise<void> {
    await this.packagingAddons.remove(id, actorFrom(admin, req));
  }
}

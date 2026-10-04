import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RequirePermissions } from '../auth/decorators';
import { FlowerRefsService } from './flower-refs.service';

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

@ApiTags('admin-catalog')
@Controller('admin/catalog/flower-refs')
export class AdminFlowerRefsController {
  constructor(private readonly flowerRefs: FlowerRefsService) {}

  @Get('types')
  @RequirePermissions('CATALOG_READ')
  listTypes() {
    return this.flowerRefs.listTypes();
  }

  @Get('varieties')
  @RequirePermissions('CATALOG_READ')
  listVarieties(@Query('flowerTypeId') flowerTypeId?: string) {
    return this.flowerRefs.listVarieties(flowerTypeId);
  }

  @Get('origins')
  @RequirePermissions('CATALOG_READ')
  listOrigins() {
    return this.flowerRefs.listOrigins();
  }

  @Post('types')
  @RequirePermissions('CATALOG_UPDATE')
  createType(@Body() body: CreateFlowerTypeDto) {
    return this.flowerRefs.createType(body);
  }

  @Post('varieties')
  @RequirePermissions('CATALOG_UPDATE')
  createVariety(@Body() body: CreateFlowerVarietyDto) {
    return this.flowerRefs.createVariety(body);
  }

  @Post('origins')
  @RequirePermissions('CATALOG_UPDATE')
  createOrigin(@Body() body: CreateFlowerOriginDto) {
    return this.flowerRefs.createOrigin(body);
  }
}

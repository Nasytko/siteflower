import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators';
import {
  PROMOTION_STATUSES,
  PromotionsService,
  type PromotionStatus,
} from './promotions.service';

class PromotionListQueryDto {
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
  @IsIn(PROMOTION_STATUSES)
  status?: PromotionStatus = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

/**
 * Read-only overview for the admin «Акции» page. Promotions are written through
 * the owning product (`PUT /admin/catalog/products/:id/promotion`).
 */
@ApiTags('admin-catalog-promotions')
@Controller('admin/catalog/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list(@Query() query: PromotionListQueryDto) {
    return this.promotions.listAdmin(query);
  }
}

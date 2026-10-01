import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  SEO_ENTITY_TYPES,
  SEO_HEALTH_STATUSES,
  type SeoEntityType,
  type SeoHealthStatus,
} from '@bouquet-one/contracts';
import { RequirePermissions } from '../auth/decorators';
import { SeoHealthService } from './seo-health.service';

class SeoHealthQueryDto {
  @IsOptional()
  @IsIn([...SEO_HEALTH_STATUSES, 'all'])
  status?: SeoHealthStatus | 'all';

  @IsOptional()
  @IsIn([...SEO_ENTITY_TYPES, 'all'])
  type?: SeoEntityType | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

@ApiTags('admin-seo')
@Controller('admin/seo')
export class AdminSeoController {
  constructor(private readonly seoHealth: SeoHealthService) {}

  /** Aggregated SEO health for dashboard widget (counts only). */
  @Get('summary')
  @RequirePermissions('SEO_READ')
  summary() {
    return this.seoHealth.getSummary();
  }

  /** Paginated SEO health report for /admin/seo. */
  @Get('health')
  @RequirePermissions('SEO_READ')
  health(@Query() query: SeoHealthQueryDto) {
    return this.seoHealth.getReport(query);
  }
}

import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  MEDIA_ASSET_LIST_STATUSES,
  type MediaAssetListStatus,
} from '@bouquet-one/contracts';
import { RequirePermissions } from '../auth/decorators';
import { MediaOrphanService } from './media-orphan.service';

class MediaAssetListQueryDto {
  @IsIn([...MEDIA_ASSET_LIST_STATUSES])
  status!: MediaAssetListStatus;

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

@ApiTags('admin-media-assets')
@Controller('admin/media/assets')
export class AdminMediaAssetsController {
  constructor(private readonly orphans: MediaOrphanService) {}

  @Get()
  @RequirePermissions('SITE_HEALTH_READ')
  list(@Query() query: MediaAssetListQueryDto) {
    return this.orphans.listAssets({
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post(':id/purge')
  @RequirePermissions('SITE_HEALTH_WRITE')
  purge(@Param('id', ParseUUIDPipe) id: string) {
    return this.orphans.purgeAsset(id);
  }
}

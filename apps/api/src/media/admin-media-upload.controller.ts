import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { memoryStorage } from 'multer';
import { RequirePermissions } from '../auth/decorators';
import { PrismaService } from '../database/prisma.service';
import { MEDIA_UPLOAD_MAX_INPUT_BYTES, MEDIA_UPLOAD_THROTTLE } from './media.constants';
import { MEDIA_ERROR_CODES, mediaHttpException } from './media-errors';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';
import { MediaService } from './media.service';
import { Inject } from '@nestjs/common';

class MediaLibraryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

/**
 * Standalone media upload + recent library for CMS editors (homepage, etc.).
 * Reuses MediaService pipeline — does not create a second storage system.
 * Deleting a CMS block must NOT purge the MediaAsset (orphan reconciler handles that).
 */
@ApiTags('admin-media-upload')
@Controller('admin/media')
export class AdminMediaUploadController {
  constructor(
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  @Post('upload')
  @RequirePermissions('CONTENT_UPDATE')
  @Throttle({ default: { limit: MEDIA_UPLOAD_THROTTLE.limit, ttl: MEDIA_UPLOAD_THROTTLE.ttl } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.MEDIA_MAX_BYTES ?? MEDIA_UPLOAD_MAX_INPUT_BYTES),
        files: 1,
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw mediaHttpException(MEDIA_ERROR_CODES.FILE_REQUIRED);
    }
    return this.media.uploadImage(file.buffer, file.originalname);
  }

  @Get('library')
  @RequirePermissions('CONTENT_READ')
  async library(@Query() query: MediaLibraryQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), 50);
    const [total, assets] = await Promise.all([
      this.prisma.client.mediaAsset.count(),
      this.prisma.client.mediaAsset.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          storageKey: true,
          byteSize: true,
          mimeType: true,
          width: true,
          height: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      items: assets.map((asset) => ({
        id: asset.id,
        url: this.storage.getPublicUrl(asset.storageKey),
        byteSize: asset.byteSize,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        createdAt: asset.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}

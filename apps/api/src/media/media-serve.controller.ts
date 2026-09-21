import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Public } from '../auth/decorators';
import { AppConfigService } from '../config/app-config.service';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/**
 * Serves local media files. S3 mode uses direct public/CDN URLs instead.
 */
@SkipThrottle()
@Controller('media')
export class MediaServeController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Public()
  @Get('*path')
  async serve(@Param('path') pathParts: string[] | string, @Res() res: Response) {
    if (this.appConfig.mediaStorageDriver !== 'local') {
      throw new NotFoundException();
    }
    const relative = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;
    if (!relative || relative.includes('..')) {
      throw new NotFoundException();
    }
    const full = join(process.cwd(), this.appConfig.mediaLocalRoot, relative);
    try {
      await access(full);
    } catch {
      throw new NotFoundException();
    }

    const mime = MIME_BY_EXT[extname(full).toLowerCase()] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    // Explicit for media even if global Helmet config changes later.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    createReadStream(full).pipe(res);
  }
}

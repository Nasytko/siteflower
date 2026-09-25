import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { extname } from 'node:path';
import { Public } from '../auth/decorators';
import { AppConfigService } from '../config/app-config.service';
import { resolveMediaPathInsideRoot } from './media-path.util';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * Serves local media files. S3 mode uses direct public/CDN URLs instead.
 * SVG is intentionally not served from local uploads.
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
    const full = resolveMediaPathInsideRoot(this.appConfig.mediaLocalRoot, relative);
    if (!full) {
      throw new NotFoundException();
    }
    try {
      await access(full);
    } catch {
      throw new NotFoundException();
    }

    const mime = MIME_BY_EXT[extname(full).toLowerCase()];
    if (!mime) {
      throw new NotFoundException();
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    // Explicit for media even if global Helmet config changes later.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    createReadStream(full).pipe(res);
  }
}

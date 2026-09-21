import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseModule } from '../database/database.module';
import { LocalMediaStorage } from './local-media.storage';
import { MEDIA_STORAGE } from './media-storage';
import { MediaService } from './media.service';
import { MediaServeController } from './media-serve.controller';
import { S3MediaStorage } from './s3-media.storage';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [MediaServeController],
  providers: [
    MediaService,
    {
      provide: MEDIA_STORAGE,
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => {
        if (appConfig.mediaStorageDriver === 's3') {
          return new S3MediaStorage({
            endpoint: appConfig.s3Endpoint,
            region: appConfig.s3Region,
            bucket: appConfig.s3Bucket!,
            accessKeyId: appConfig.s3AccessKeyId!,
            secretAccessKey: appConfig.s3SecretAccessKey!,
            publicBaseUrl:
              appConfig.s3PublicBaseUrl ?? appConfig.mediaPublicBaseUrl,
          });
        }
        const root = join(process.cwd(), appConfig.mediaLocalRoot);
        return new LocalMediaStorage(root, appConfig.mediaPublicBaseUrl);
      },
    },
  ],
  exports: [MediaService, MEDIA_STORAGE],
})
export class MediaModule {}

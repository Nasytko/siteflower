import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
  ],
  providers: [AppConfigService, StorefrontRevalidateService],
  exports: [AppConfigService, StorefrontRevalidateService],
})
export class AppConfigModule {}

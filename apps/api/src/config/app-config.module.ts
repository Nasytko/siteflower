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
      // Integration tests spawn the API with an explicit env; do not let local
      // .env (often a stale Docker :5433 URL) override DATABASE_URL / ports.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      envFilePath: ['.env', '../../.env'],
    }),
  ],
  providers: [AppConfigService, StorefrontRevalidateService],
  exports: [AppConfigService, StorefrontRevalidateService],
})
export class AppConfigModule {}

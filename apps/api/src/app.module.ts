import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AuthModule } from './auth/auth.module';
import { AdminCsrfGuard } from './auth/csrf.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { CatalogModule } from './catalog/catalog.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { sanitizeRequestId, setRequestId } from './common/middleware/request-id.middleware';
import { sanitizeSensitiveUrl } from './common/sanitize-sensitive-url.util';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { StorefrontModule } from './storefront/storefront.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        pinoHttp: {
          level: appConfig.logLevel,
          genReqId: (req, res) => {
            const header = req.headers['x-request-id'];
            const existing = Array.isArray(header) ? header[0] : header;
            const requestId = sanitizeRequestId(existing);
            setRequestId(req as never, requestId);
            res.setHeader('x-request-id', requestId);
            return requestId;
          },
          transport:
            appConfig.nodeEnv !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.newPassword',
              'req.body.purchaserPhone',
              'req.body.recipientPhone',
              'req.body.purchaserName',
              'req.body.recipientName',
              'req.body.deliveryAddress',
              'req.body.addressDetails',
              'req.body.cardMessage',
              'req.body.customerComment',
              'req.params.token',
            ],
            remove: true,
          },
          serializers: {
            req(req) {
              const serialized = {
                id: req.id,
                method: req.method,
                url: sanitizeSensitiveUrl(req.url),
              };
              return serialized;
            },
          },
          customProps: (req) => ({
            requestId: (req as { requestId?: string }).requestId,
          }),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => [
        {
          name: 'default',
          ttl: appConfig.throttleTtlMs,
          limit: appConfig.throttleLimit,
        },
      ],
    }),
    HealthModule,
    AuthModule,
    AdminUsersModule,
    AuditModule,
    MediaModule,
    CatalogModule,
    StorefrontModule,
    OrdersModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AdminAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AdminCsrfGuard,
    },
  ],
})
export class AppModule {}

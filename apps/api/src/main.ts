import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const appConfig = app.get(AppConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const httpAdapter = app.getHttpAdapter().getInstance();
  if (appConfig.trustProxy && typeof httpAdapter.set === 'function') {
    httpAdapter.set('trust proxy', 1);
  }

  // Bound JSON/urlencoded payloads for admin/checkout; media uploads use multipart separately.
  // Capture rawBody for integration HMAC verification (exact bytes).
  app.useBodyParser('json', {
    limit: '256kb',
    verify: (req: { rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
      req.rawBody = Buffer.from(buf);
    },
  });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });

  app.use(requestIdMiddleware);
  app.use(cookieParser());
  // Public media is loaded cross-origin from the Next storefront/admin (rewrites
  // or absolute MEDIA_PUBLIC_BASE_URL). Helmet's default CORP same-origin blocks
  // <img> embeds — keep the rest of Helmet, allow cross-origin resource loads.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      contentSecurityPolicy: false, // deliberate: full CSP needs separate design for Next/admin/media
    }),
  );

  app.enableCors({
    origin: appConfig.corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  if (appConfig.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BUKET №1 Commerce API')
      .setDescription('Commerce API contract for storefront, admin, and future mobile clients.')
      .setVersion(appConfig.appVersion)
      .addServer(`http://localhost:${appConfig.port}`, 'Local')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  await app.listen(appConfig.port);
  logger.log(
    `API listening on :${appConfig.port} (env=${appConfig.nodeEnv}, swagger=${appConfig.swaggerEnabled})`,
  );
}

void bootstrap();

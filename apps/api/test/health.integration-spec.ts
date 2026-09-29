import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { requestIdMiddleware } from '../src/common/middleware/request-id.middleware';
import { AppConfigModule } from '../src/config/app-config.module';
import { HealthModule } from '../src/health/health.module';

describe('Health (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.TRUST_PROXY = 'false';
    process.env.SESSION_HMAC_SECRET = 'test-session-hmac-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health returns ok', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.checks.application.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeDefined();
  });
});

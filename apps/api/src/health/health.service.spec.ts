import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns application ok status', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    const service = moduleRef.get(HealthService);
    const result = service.getHealth({
      service: 'bouquet-one',
      version: '0.0.0',
      requestId: 'test-request',
    });

    expect(result.status).toBe('ok');
    expect(result.checks.application.status).toBe('ok');
    expect(result.requestId).toBe('test-request');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

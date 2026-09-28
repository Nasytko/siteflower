import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { OutboxRepository } from '../src/integration/outbox.repository';
import { computeBackoffMs, shouldMarkFailed } from '../src/integration/backoff';

const hasDb = Boolean(process.env.DATABASE_URL);

(hasDb ? describe : describe.skip)('integration outbox (integration)', () => {
  let prisma: PrismaService;
  let outbox: OutboxRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.SESSION_HMAC_SECRET = 'test-session-hmac-secret-32chars!!';
    process.env.INTEGRATION_MODE = 'DISABLED';
    process.env.INTEGRATION_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    outbox = moduleRef.get(OutboxRepository);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.onModuleDestroy();
    }
  });

  it('claimBatch is exclusive under concurrency (SKIP LOCKED)', async () => {
    const now = new Date();
    const ids = [randomUUID(), randomUUID(), randomUUID()];

    for (const id of ids) {
      await prisma.client.outboxEvent.create({
        data: {
          id,
          eventType: 'ORDER_CREATED',
          aggregateType: 'Order',
          aggregateId: randomUUID(),
          schemaVersion: 1,
          payload: { eventId: id, test: true },
          status: 'PENDING',
          availableAt: now,
        },
      });
    }

    const [a, b] = await Promise.all([
      outbox.claimBatch(2, 'worker-a', now, 60),
      outbox.claimBatch(2, 'worker-b', now, 60),
    ]);

    const claimedIds = [...a, ...b].map((e) => e.id);
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds.length).toBeLessThanOrEqual(3);
    expect(claimedIds.length).toBeGreaterThanOrEqual(2);

    // cleanup
    await prisma.client.outboxEvent.deleteMany({ where: { id: { in: ids } } });
  });

  it('unit-level backoff helpers remain consistent', () => {
    expect(computeBackoffMs(1, () => 0)).toBe(30_000);
    expect(shouldMarkFailed('AUTH_FAILED', 2, 12)).toBe(true);
  });
});

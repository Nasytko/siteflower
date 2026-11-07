import { recoverMissingTelegramEvents } from './telegram-recovery';

describe('recoverMissingTelegramEvents', () => {
  it('dry-run reports create without writing when Telegram is missing', async () => {
    const prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([{ aggregateId: 'ord-1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord-1',
          orderNumber: '260101-001',
          erpSyncStatus: 'SYNCED',
          erpRemoteReference: 'ERP-1',
          paymentMethod: 'CASH_ON_DELIVERY',
          paymentStatus: 'NOT_REQUIRED',
          fulfillmentType: 'PICKUP',
          fulfillmentDate: '2026-01-02',
          timeWindowLabel: '10:00–12:00',
          purchaserName: 'Test',
          purchaserPhoneE164: '+375291111111',
          addressKnown: true,
          deliveryAddress: null,
          totalMinor: 100n,
          items: [],
        }),
      },
    };

    const report = await recoverMissingTelegramEvents(prisma as never, {
      dryRun: true,
      limit: 10,
    });

    expect(report.created).toBe(1);
    expect(report.items[0]?.action).toBe('created');
    expect(report.items[0]?.reason).toMatch(/^dry-run:/);
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('skips when a Telegram event already exists', async () => {
    const prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([{ aggregateId: 'ord-1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'tg-1', status: 'DELIVERED' }),
        create: jest.fn(),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord-1',
          orderNumber: '260101-001',
          erpSyncStatus: 'SYNCED',
          items: [],
        }),
      },
    };

    const report = await recoverMissingTelegramEvents(prisma as never, {
      dryRun: false,
      limit: 10,
    });

    expect(report.skipped).toBe(1);
    expect(report.created).toBe(0);
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });
});

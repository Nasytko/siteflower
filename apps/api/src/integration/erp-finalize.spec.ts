import { markDeliveredOwned } from './erp-finalize';

describe('markDeliveredOwned', () => {
  it('returns false when updateMany affects no rows (stale lease)', async () => {
    const tx = {
      outboxEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const ok = await markDeliveredOwned(
      tx as never,
      'evt-1',
      'worker-a',
      'remote-1',
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(ok).toBe(false);
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'evt-1',
          status: 'PROCESSING',
          leaseOwner: 'worker-a',
        }),
      }),
    );
  });

  it('returns true when the owning worker still holds the lease', async () => {
    const tx = {
      outboxEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const ok = await markDeliveredOwned(tx as never, 'evt-1', 'worker-a', 'remote-1');
    expect(ok).toBe(true);
  });
});

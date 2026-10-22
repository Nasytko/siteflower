import { lockProductRows } from './product-lock.util';

describe('lockProductRows', () => {
  it('locks each id once, in sorted order, and skips rows that are gone', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRawUnsafe: async (_query: string, ...values: unknown[]) => {
        const value = String(values[0] ?? '');
        calls.push(value);
        if (value === 'missing') return [];
        return [{ id: value }];
      },
    };

    const locked = await lockProductRows(tx, ['b-id', 'a-id', 'b-id', '', 'missing']);

    expect(calls).toEqual(['a-id', 'b-id', 'missing']);
    expect(locked).toEqual(['a-id', 'b-id']);
  });
});

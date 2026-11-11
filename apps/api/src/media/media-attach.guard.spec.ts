import { ConflictException } from '@nestjs/common';
import { assertMediaAttachable } from './media-attach.guard';

describe('assertMediaAttachable', () => {
  it('allows assets without purgeStartedAt', async () => {
    const tx = {
      mediaAsset: {
        findUnique: async () => ({ purgeStartedAt: null }),
      },
    };
    await expect(assertMediaAttachable(tx as never, 'asset-1')).resolves.toBeUndefined();
  });

  it('rejects assets claimed for orphan purge', async () => {
    const tx = {
      mediaAsset: {
        findUnique: async () => ({ purgeStartedAt: new Date('2026-01-01T00:00:00.000Z') }),
      },
    };
    await expect(assertMediaAttachable(tx as never, 'asset-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects missing assets', async () => {
    const tx = {
      mediaAsset: {
        findUnique: async () => null,
      },
    };
    await expect(assertMediaAttachable(tx as never, 'missing')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

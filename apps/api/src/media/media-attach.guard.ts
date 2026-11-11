import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@bouquet-one/database';

/**
 * Blocks ProductMedia / NavigationMenuItem attach while orphan purge has claimed
 * the asset (`purgeStartedAt` set). Call before create/update that references an
 * existing MediaAsset id.
 */
export async function assertMediaAttachable(
  tx: Prisma.TransactionClient,
  mediaAssetId: string,
): Promise<void> {
  const row = await tx.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: { purgeStartedAt: true },
  });
  if (!row) {
    throw new ConflictException('Медиафайл не найден');
  }
  if (row.purgeStartedAt) {
    throw new ConflictException(
      'Медиафайл удаляется очисткой orphan — повторите привязку чуть позже',
    );
  }
}

/**
 * Lease-gated ERP terminal writes shared by the worker.
 * Kept free of Nest DI so unit tests can exercise the SQL predicates.
 */
import type { IntegrationFailureCategory } from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { sanitizeErrorMessage } from './backoff';

type Tx = Prisma.TransactionClient;

export async function markDeliveredOwned(
  tx: Tx,
  id: string,
  workerId: string,
  remoteReference: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await tx.outboxEvent.updateMany({
    where: {
      id,
      status: 'PROCESSING',
      leaseOwner: workerId,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: 'DELIVERED',
      deliveredAt: now,
      processedAt: now,
      remoteReference: remoteReference.slice(0, 200),
      leaseOwner: null,
      leaseExpiresAt: null,
      failureCategory: null,
      lastErrorSanitized: null,
      nextAttemptAt: null,
      availableAt: now,
    },
  });
  return result.count === 1;
}

export async function markFailedOwned(
  tx: Tx,
  id: string,
  workerId: string,
  category: IntegrationFailureCategory,
  sanitizedError: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await tx.outboxEvent.updateMany({
    where: {
      id,
      status: 'PROCESSING',
      leaseOwner: workerId,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: 'FAILED',
      failureCategory: category,
      lastErrorSanitized: sanitizeErrorMessage(sanitizedError),
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    },
  });
  return result.count === 1;
}

export async function markRetryOwned(
  tx: Tx,
  id: string,
  workerId: string,
  category: IntegrationFailureCategory,
  sanitizedError: string,
  nextAttemptAt: Date,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await tx.outboxEvent.updateMany({
    where: {
      id,
      status: 'PROCESSING',
      leaseOwner: workerId,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: 'RETRY',
      failureCategory: category,
      lastErrorSanitized: sanitizeErrorMessage(sanitizedError),
      nextAttemptAt,
      availableAt: nextAttemptAt,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  return result.count === 1;
}

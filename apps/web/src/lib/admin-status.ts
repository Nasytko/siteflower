import type { CommercialAvailability, ProductLifecycle } from '@bouquet-one/contracts';

/** Visual chip class for publication lifecycle (distinct from availability). */
export function lifecycleChipClass(lifecycle: ProductLifecycle): string {
  switch (lifecycle) {
    case 'PUBLISHED':
      return 'admin-chip admin-chip--lifecycle-published';
    case 'ARCHIVED':
      return 'admin-chip admin-chip--lifecycle-archived';
    case 'DRAFT':
    default:
      return 'admin-chip admin-chip--lifecycle-draft';
  }
}

/** Visual chip class for commercial availability (distinct from lifecycle). */
export function availabilityChipClass(availability: CommercialAvailability): string {
  return availability === 'AVAILABLE'
    ? 'admin-chip admin-chip--availability-ok'
    : 'admin-chip admin-chip--availability-warn';
}

import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@bouquet-one/contracts';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/** AND semantics: every listed permission is required. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

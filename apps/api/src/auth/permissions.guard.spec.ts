import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from './decorators';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new PermissionsGuard(reflector);

  function contextWithAdmin(admin: { role: string } | undefined): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ admin }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.mocked(reflector.getAllAndOverride).mockReset();
  });

  it('returns 403 when authenticated role lacks required permission', () => {
    jest.mocked(reflector.getAllAndOverride).mockImplementation((key: unknown) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === REQUIRED_PERMISSIONS_KEY) return ['USERS_CREATE'];
      return undefined;
    });

    expect(() =>
      guard.canActivate(contextWithAdmin({ role: 'CONTENT_MANAGER' })),
    ).toThrow(ForbiddenException);
  });

  it('allows when role includes CATALOG_CREATE', () => {
    jest.mocked(reflector.getAllAndOverride).mockImplementation((key: unknown) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === REQUIRED_PERMISSIONS_KEY) return ['CATALOG_CREATE'];
      return undefined;
    });

    expect(guard.canActivate(contextWithAdmin({ role: 'CONTENT_MANAGER' }))).toBe(true);
    expect(guard.canActivate(contextWithAdmin({ role: 'MANAGER' }))).toBe(true);
  });
});

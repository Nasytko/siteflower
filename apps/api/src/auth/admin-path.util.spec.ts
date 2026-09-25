import { isAdminApiPath } from './admin-path.util';

describe('isAdminApiPath', () => {
  it('matches admin API namespace', () => {
    expect(isAdminApiPath('/api/v1/admin')).toBe(true);
    expect(isAdminApiPath('/api/v1/admin/orders')).toBe(true);
    expect(isAdminApiPath('/api/v1/admin/auth/me')).toBe(true);
  });

  it('rejects substring false positives', () => {
    expect(isAdminApiPath('/api/v1/orders')).toBe(false);
    expect(isAdminApiPath('/api/v1/media/admin-photo.jpg')).toBe(false);
    expect(isAdminApiPath('/admin')).toBe(false);
    expect(isAdminApiPath('/api/v1/administration')).toBe(false);
  });
});

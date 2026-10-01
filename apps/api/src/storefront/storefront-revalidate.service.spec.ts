import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { StorefrontRevalidateService } from './storefront-revalidate.service';

describe('StorefrontRevalidateService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  async function createService(url?: string, secret?: string) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorefrontRevalidateService,
        {
          provide: AppConfigService,
          useValue: {
            revalidateUrl: url,
            revalidateSecret: secret,
          },
        },
      ],
    }).compile();
    return moduleRef.get(StorefrontRevalidateService);
  }

  it('no-ops when URL and secret are unset', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService(undefined, undefined);
    await service.ping();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops when only URL is set (fail-soft)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService('http://web:3000/api/revalidate', undefined);
    await service.ping();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops when only secret is set (fail-soft)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService(undefined, 'revalidate-secret-16');
    await service.ping();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to internal URL with secret header and default tags/paths', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService(
      'http://web:3000/api/revalidate',
      'revalidate-secret-16',
    );
    await service.ping();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://web:3000/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-revalidate-secret': 'revalidate-secret-16',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      tags: ['catalog', 'storefront'],
      paths: ['/', '/bukety'],
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards custom tags and paths', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService(
      'http://web:3000/api/revalidate',
      'revalidate-secret-16',
    );
    await service.ping({ tags: ['catalog'], paths: ['/bukety/rose'] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      tags: ['catalog'],
      paths: ['/bukety/rose'],
    });
  });

  it('fail-soft on non-OK HTTP without throwing', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService(
      'http://web:3000/api/revalidate',
      'revalidate-secret-16',
    );
    await expect(service.ping()).resolves.toBeUndefined();
  });

  it('fail-soft on network/timeout errors without throwing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('The operation was aborted'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = await createService(
      'http://web:3000/api/revalidate',
      'revalidate-secret-16',
    );
    await expect(service.ping()).resolves.toBeUndefined();
  });
});

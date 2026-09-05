import { checkAuthAttempt } from '@/lib/auth/auth-attempt-guard';
import { captureOperationalError } from '@/lib/monitoring/sentry';

type Counter = { count: number; expires: number };
const counters = new Map<string, Counter>();
const mockEval = jest.fn(
  async (_script: string, keys: string[], args: number[]) => {
    const [window, accountLimit, ipLimit] = args;
    const limits = [accountLimit, ipLimit];
    const current = keys.map(key => {
      const counter = counters.get(key);
      return counter && counter.expires > Date.now()
        ? counter
        : { count: 0, expires: Date.now() + window * 1000 };
    });
    const retry = Math.max(
      ...current.map((counter, index) =>
        counter.count >= limits[index]
          ? Math.ceil((counter.expires - Date.now()) / 1000)
          : 0
      )
    );
    if (retry > 0) return [0, retry];
    keys.forEach((key, index) =>
      counters.set(key, {
        count: current[index].count + 1,
        expires: current[index].expires,
      })
    );
    return [1, 0];
  }
);
const mockGetRedis = jest.fn<{ eval: typeof mockEval } | null, []>(() => ({
  eval: mockEval,
}));

jest.mock('@/lib/rate-limiting/redis-client', () => ({
  getOrCreateRedis: () => mockGetRedis(),
}));
jest.mock('@/lib/monitoring/sentry', () => ({
  captureOperationalError: jest.fn(),
}));
jest.mock('@/lib/env', () => ({ assertEnv: () => 'test-only-signing-key' }));

const originalEnv = { ...process.env };
const ipHeaders = (ip = '192.0.2.10') => new Headers({ 'x-forwarded-for': ip });

describe('TASK-01 actual password authentication budgets', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T00:00:00Z'));
    counters.clear();
    jest.clearAllMocks();
    process.env.TRUSTED_PROXY_COUNT = '1';
    delete process.env.VERCEL;
    delete process.env.TRUST_CF_HEADERS;
    mockGetRedis.mockReturnValue({ eval: mockEval });
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...originalEnv };
  });

  it('allows 10 accounts to authenticate three times each behind one shared IP', async () => {
    for (let account = 0; account < 10; account++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(
          await checkAuthAttempt(`staff${account}@clinic.example`, ipHeaders())
        ).toBeNull();
      }
    }
    expect(mockEval).toHaveBeenCalledTimes(30);
  });

  it('shares normalized account budgets across IPs and releases them after the TTL', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(
        await checkAuthAttempt(
          ' Staff@Clinic.Example ',
          ipHeaders(`192.0.2.${attempt + 1}`)
        )
      ).toBeNull();
    }
    expect(
      await checkAuthAttempt('staff@clinic.example', ipHeaders())
    ).toMatchObject({
      success: false,
      code: 'AUTH_RATE_LIMITED',
      retryAfterSeconds: 900,
    });
    jest.advanceTimersByTime(900_000);
    expect(
      await checkAuthAttempt('staff@clinic.example', ipHeaders())
    ).toBeNull();
  });

  it('limits one IP after 100 actual attempts while changing account names', async () => {
    for (let account = 0; account < 100; account++) {
      expect(
        await checkAuthAttempt(`staff${account}@clinic.example`, ipHeaders())
      ).toBeNull();
    }
    expect(
      await checkAuthAttempt('next@clinic.example', ipHeaders())
    ).toMatchObject({ code: 'AUTH_RATE_LIMITED' });
    expect(
      await checkAuthAttempt('next@clinic.example', ipHeaders('192.0.2.99'))
    ).toBeNull();
  });

  it('reserves both budgets in a single atomic backend call under concurrent attempts', async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        checkAuthAttempt('staff@clinic.example', ipHeaders())
      )
    );
    expect(results.filter(result => result === null)).toHaveLength(10);
    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call'),
      [expect.any(String), expect.any(String)],
      [900, 10, 100]
    );
  });

  it('does not put email, IP or caller supplied user identifiers into Redis keys', async () => {
    await checkAuthAttempt(
      'staff@clinic.example',
      new Headers({
        'x-forwarded-for': '192.0.2.10',
        'x-user-id': 'spoofed-user',
      })
    );
    const keys = mockEval.mock.calls[0]?.[1];
    expect(keys).toEqual([
      expect.stringMatching(/^auth-attempt:account:[a-f0-9]{64}$/),
      expect.stringMatching(/^auth-attempt:ip:[a-f0-9]{64}$/),
    ]);
  });

  it('ignores untrusted forwarding headers and fails closed in production without a trusted address', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TRUSTED_PROXY_COUNT;
    expect(
      await checkAuthAttempt(
        'staff@clinic.example',
        new Headers({
          'x-forwarded-for': '192.0.2.10',
          'x-vercel-forwarded-for': '192.0.2.20',
          'cf-connecting-ip': '192.0.2.30',
          'x-user-id': 'spoofed-user',
        })
      )
    ).toMatchObject({ code: 'AUTH_UNAVAILABLE', retryAfterSeconds: 60 });
    expect(mockEval).not.toHaveBeenCalled();
  });

  it('fails closed on Redis errors without exposing backend error details or flooding monitoring', async () => {
    process.env.NODE_ENV = 'production';
    jest.advanceTimersByTime(120_000);
    mockEval.mockRejectedValueOnce(
      new Error('secret password token staff@clinic.example')
    );
    mockEval.mockRejectedValueOnce(
      new Error('secret password token staff@clinic.example')
    );
    const first = await checkAuthAttempt('staff@clinic.example', ipHeaders());
    const second = await checkAuthAttempt('staff@clinic.example', ipHeaders());
    expect(first).toMatchObject({
      code: 'AUTH_UNAVAILABLE',
      retryAfterSeconds: 60,
    });
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('secret');
    expect(captureOperationalError).toHaveBeenCalledTimes(1);
    expect(captureOperationalError).toHaveBeenCalledWith(
      new Error('Authentication attempt guard unavailable'),
      expect.objectContaining({ source: 'auth-attempt-guard' })
    );
  });

  it('fails closed when the production Redis backend is missing', async () => {
    process.env.NODE_ENV = 'production';
    mockGetRedis.mockReturnValue(null);
    expect(
      await checkAuthAttempt('staff@clinic.example', ipHeaders())
    ).toMatchObject({ code: 'AUTH_UNAVAILABLE' });
    expect(mockEval).not.toHaveBeenCalled();
  });

  it('does not trust a fake Vercel header on a configured generic proxy', async () => {
    await checkAuthAttempt(
      'staff@clinic.example',
      new Headers({
        'x-vercel-forwarded-for': '192.0.2.99',
        'x-forwarded-for': '192.0.2.200, 192.0.2.10',
      })
    );
    const firstKeys = mockEval.mock.calls[0]?.[1];
    await checkAuthAttempt('staff@clinic.example', ipHeaders('192.0.2.10'));
    expect(mockEval.mock.calls[1]?.[1]).toEqual(firstKeys);
  });

  it('canonicalizes equivalent IPv6 addresses into the same budget', async () => {
    await checkAuthAttempt(
      'staff@clinic.example',
      ipHeaders('2001:0db8:0:0:0:0:0:1')
    );
    const firstKeys = mockEval.mock.calls[0]?.[1];
    await checkAuthAttempt('staff@clinic.example', ipHeaders('2001:db8::1'));
    expect(mockEval.mock.calls[1]?.[1]).toEqual(firstKeys);
  });
});

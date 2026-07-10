import {
  isTurnstileNonProductionBypassEnabled,
  verifyTurnstileForPublicReservation,
} from '@/lib/turnstile';

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Turnstile verification policy', () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const originalBypass = process.env.TURNSTILE_BYPASS_NON_PRODUCTION;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'turnstile-site-key';
    process.env.TURNSTILE_BYPASS_NON_PRODUCTION = 'false';
  });

  afterAll(() => {
    restore('TURNSTILE_SECRET_KEY', originalSecret);
    restore('NEXT_PUBLIC_TURNSTILE_SITE_KEY', originalSiteKey);
    restore('TURNSTILE_BYPASS_NON_PRODUCTION', originalBypass);
  });

  it('allows an explicit bypass only outside production', () => {
    expect(
      isTurnstileNonProductionBypassEnabled({
        NODE_ENV: 'development',
        TURNSTILE_BYPASS_NON_PRODUCTION: 'true',
      })
    ).toBe(true);
    expect(
      isTurnstileNonProductionBypassEnabled({
        NODE_ENV: 'production',
        TURNSTILE_BYPASS_NON_PRODUCTION: 'true',
      })
    ).toBe(false);
  });

  it.each([
    ['rate limited', 429],
    ['server error', 503],
  ])(
    'returns CAPTCHA_UNAVAILABLE for %s siteverify responses',
    async (_name, status) => {
      const result = await verifyTurnstileForPublicReservation({
        token: 'token',
        skipForVerifiedLine: false,
        fetcher: async () => response(status, { success: false }),
      });

      expect(result).toEqual({
        ok: false,
        status: 'unavailable',
        code: 'CAPTCHA_UNAVAILABLE',
      });
    }
  );

  it('returns CAPTCHA_UNAVAILABLE for an invalid siteverify payload', async () => {
    const result = await verifyTurnstileForPublicReservation({
      token: 'token',
      skipForVerifiedLine: false,
      fetcher: async () => response(200, { unexpected: true }),
    });

    expect(result).toEqual({
      ok: false,
      status: 'unavailable',
      code: 'CAPTCHA_UNAVAILABLE',
    });
  });

  it('returns CAPTCHA_UNAVAILABLE for a network failure', async () => {
    const result = await verifyTurnstileForPublicReservation({
      token: 'token',
      skipForVerifiedLine: false,
      fetcher: async () => {
        throw new TypeError('network down');
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 'unavailable',
      code: 'CAPTCHA_UNAVAILABLE',
    });
  });

  it('returns CAPTCHA_UNAVAILABLE when Turnstile is not configured', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    const result = await verifyTurnstileForPublicReservation({
      token: 'token',
      skipForVerifiedLine: false,
    });

    expect(result).toEqual({
      ok: false,
      status: 'unavailable',
      code: 'CAPTCHA_UNAVAILABLE',
    });
  });

  it('keeps the verified LINE exemption when Turnstile is unavailable', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const fetcher = jest.fn();

    const result = await verifyTurnstileForPublicReservation({
      token: undefined,
      skipForVerifiedLine: true,
      fetcher,
    });

    expect(result).toEqual({ ok: true, status: 'skipped_line' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

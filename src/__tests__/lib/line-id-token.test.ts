const TEST_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const LOGIN_CHANNEL_ID = '2000000001';

type TestFetch = (input: string, init: RequestInit) => Promise<Response>;

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(async () => result),
  };
  return query;
}

function createLineBookingClient() {
  const from = jest.fn((tableName: string) => {
    if (tableName === 'clinic_feature_flags') {
      return {
        select: jest.fn(() =>
          createQuery({
            data: { line_booking_enabled: true },
            error: null,
          })
        ),
      };
    }

    if (tableName === 'clinic_line_credentials') {
      return {
        select: jest.fn(() =>
          createQuery({
            data: {
              is_active: true,
              liff_id: '2000000000-AbCdEfGh',
              login_channel_id: LOGIN_CHANNEL_ID,
              oa_basic_id: '@testclinic',
            },
            error: null,
          })
        ),
      };
    }

    throw new Error(`Unexpected table: ${tableName}`);
  });

  return { from };
}

describe('LINE ID token verification', () => {
  const originalLineKey = process.env.LINE_CREDENTIALS_ENCRYPTION_KEY;
  const originalKillSwitch = process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = 'true';
  });

  afterAll(() => {
    restoreEnvValue('LINE_CREDENTIALS_ENCRYPTION_KEY', originalLineKey);
    restoreEnvValue('NEXT_PUBLIC_ENABLE_LIFF_BOOKING', originalKillSwitch);
  });

  it('成功時はsubとdisplayNameを返し、当該院のlogin_channel_idをclient_idに使う', async () => {
    const { verifyLineIdTokenForClinic } = await import('@/lib/line/id-token');
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(
      async (_input, init) => {
        expect(init.method).toBe('POST');
        expect(String(init.body)).toContain(`client_id=${LOGIN_CHANNEL_ID}`);
        expect(String(init.body)).toContain('id_token=id-token-001');
        return new Response(
          JSON.stringify({
            sub: 'Uline-user-001',
            aud: LOGIN_CHANNEL_ID,
            exp: 1_799_999_999,
            name: 'LINE 太郎',
          }),
          { status: 200 }
        );
      }
    );

    const result = await verifyLineIdTokenForClinic({
      supabase: createLineBookingClient(),
      clinicId: CLINIC_ID,
      idToken: 'id-token-001',
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
    });

    expect(result).toEqual({
      ok: true,
      lineUserId: 'Uline-user-001',
      displayName: 'LINE 太郎',
      audience: LOGIN_CHANNEL_ID,
    });
  });

  it('LINE verifyが200でもaudが当該院のlogin_channel_idと違う場合は拒否する', async () => {
    const { verifyLineIdTokenForClinic } = await import('@/lib/line/id-token');
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          sub: 'Uline-user-001',
          aud: 'other-channel',
          exp: 1_799_999_999,
          name: 'LINE 太郎',
        }),
        { status: 200 }
      );
    });

    const result = await verifyLineIdTokenForClinic({
      supabase: createLineBookingClient(),
      clinicId: CLINIC_ID,
      idToken: 'id-token-001',
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
    });

    expect(result).toEqual({ ok: false, reason: 'aud_mismatch' });
  });

  it('期限切れIDトークンは拒否する', async () => {
    const { verifyLineIdTokenForClinic } = await import('@/lib/line/id-token');
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          sub: 'Uline-user-001',
          aud: LOGIN_CHANNEL_ID,
          exp: 1_783_209_599,
          name: 'LINE 太郎',
        }),
        { status: 200 }
      );
    });

    const result = await verifyLineIdTokenForClinic({
      supabase: createLineBookingClient(),
      clinicId: CLINIC_ID,
      idToken: 'id-token-001',
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
    });

    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('verify呼び出しがタイムアウトした場合はtimeoutとしてfail-openできる結果を返す', async () => {
    const { verifyLineIdTokenForClinic } = await import('@/lib/line/id-token');
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        })
    );

    const result = await verifyLineIdTokenForClinic({
      supabase: createLineBookingClient(),
      clinicId: CLINIC_ID,
      idToken: 'id-token-001',
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
      timeoutMs: 1,
    });

    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });
});

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

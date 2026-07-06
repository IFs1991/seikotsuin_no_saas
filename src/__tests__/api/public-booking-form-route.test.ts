const mockCreatePublicClinicContext = jest.fn();
const TEST_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ORIGINAL_LINE_CREDENTIALS_ENCRYPTION_KEY =
  process.env.LINE_CREDENTIALS_ENCRYPTION_KEY;
const ORIGINAL_ENABLE_LIFF_BOOKING =
  process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING;
const ORIGINAL_TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createPublicClinicContext: (...args: unknown[]) =>
    mockCreatePublicClinicContext(...args),
  ClinicNotFoundError: class ClinicNotFoundError extends Error {},
  ClinicInactiveError: class ClinicInactiveError extends Error {},
}));

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';

type PublicBookingFormRouteResponse = {
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

const buildRequest = (clinicId = CLINIC_ID) =>
  ({
    nextUrl: new URL(
      `https://example.com/api/public/booking-form?clinic_id=${clinicId}`
    ),
  }) as { nextUrl: URL };

type PublicBookingFormClientOptions = {
  settingsError?: { message: string } | null;
  lineBookingEnabled?: boolean;
  lineCredentials?: {
    is_active: boolean;
    liff_id: string | null;
    login_channel_id: string | null;
    oa_basic_id: string | null;
  } | null;
};

const buildQuery = (
  data: unknown,
  error: { message: string } | null = null
) => {
  const query = {
    eq: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({
      data,
      error,
    }),
  };
  return query;
};

const buildSettingsClient = (
  settings: unknown,
  options: PublicBookingFormClientOptions = {}
) => ({
  from: jest.fn((table: string) => {
    if (table === 'clinic_settings') {
      return {
        select: jest
          .fn()
          .mockReturnValue(
            buildQuery(
              settings === null ? null : { settings },
              options.settingsError ?? null
            )
          ),
      };
    }
    if (table === 'clinic_feature_flags') {
      return {
        select: jest.fn().mockReturnValue(
          buildQuery({
            line_booking_enabled: options.lineBookingEnabled === true,
          })
        ),
      };
    }
    if (table === 'clinic_line_credentials') {
      return {
        select: jest
          .fn()
          .mockReturnValue(buildQuery(options.lineCredentials ?? null)),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
});

describe('GET /api/public/booking-form', () => {
  let GET: (
    request: ReturnType<typeof buildRequest>
  ) => Promise<PublicBookingFormRouteResponse>;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = '';
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = 'false';
    restoreEnvValue('TURNSTILE_SECRET_KEY', undefined);
    restoreEnvValue('NEXT_PUBLIC_TURNSTILE_SITE_KEY', undefined);
    const mod = await import('@/app/api/public/booking-form/route');
    GET = mod.GET as (
      request: ReturnType<typeof buildRequest>
    ) => Promise<PublicBookingFormRouteResponse>;
  });

  afterAll(() => {
    restoreEnvValue(
      'LINE_CREDENTIALS_ENCRYPTION_KEY',
      ORIGINAL_LINE_CREDENTIALS_ENCRYPTION_KEY
    );
    restoreEnvValue(
      'NEXT_PUBLIC_ENABLE_LIFF_BOOKING',
      ORIGINAL_ENABLE_LIFF_BOOKING
    );
    restoreEnvValue('TURNSTILE_SECRET_KEY', ORIGINAL_TURNSTILE_SECRET_KEY);
    restoreEnvValue(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      ORIGINAL_TURNSTILE_SITE_KEY
    );
  });

  it('未保存の場合はデフォルト設定をno-storeで返す', async () => {
    mockCreatePublicClinicContext.mockResolvedValue({
      client: buildSettingsClient(null),
      clinic: { id: CLINIC_ID, name: 'テスト整骨院' },
    });

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(data).toMatchObject({
      success: true,
      data: {
        staffSelection: 'optional',
        fields: {
          phone: { enabled: true, required: true },
        },
      },
    });
  });

  it('設定取得に失敗した場合は500を返す', async () => {
    mockCreatePublicClinicContext.mockResolvedValue({
      client: buildSettingsClient(null, {
        settingsError: { message: 'database unavailable' },
      }),
      clinic: { id: CLINIC_ID, name: 'テスト整骨院' },
    });

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: 'Failed to load booking form settings',
    });
  });

  it('非公開質問をsanitizeして返さない', async () => {
    mockCreatePublicClinicContext.mockResolvedValue({
      client: buildSettingsClient({
        fields: {
          nameKana: { enabled: true, required: false },
          phone: { enabled: true, required: true },
          email: { enabled: true, required: false },
          birthDate: { enabled: false, required: false },
          gender: { enabled: false, required: false },
          notes: { enabled: true, required: false },
        },
        staffSelection: 'optional',
        questions: [
          {
            id: 'q_public',
            label: '公開質問',
            type: 'text',
            options: [],
            required: false,
            active: true,
            sortOrder: 1,
          },
          {
            id: 'q_private',
            label: '非公開質問',
            type: 'text',
            options: [],
            required: false,
            active: false,
            sortOrder: 2,
          },
        ],
        consents: [],
        completionMessage: '',
      }),
      clinic: { id: CLINIC_ID, name: 'テスト整骨院' },
    });

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      data: {
        questions: [
          {
            id: 'q_public',
            label: '公開質問',
          },
        ],
      },
    });
  });

  it('LINE有効化条件を満たす場合だけLIFF公開メタデータを返す', async () => {
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = 'true';
    mockCreatePublicClinicContext.mockResolvedValue({
      client: buildSettingsClient(null, {
        lineBookingEnabled: true,
        lineCredentials: {
          is_active: true,
          liff_id: '2000000000-AbCdEfGh',
          login_channel_id: '2000000001',
          oa_basic_id: '@testclinic',
        },
      }),
      clinic: { id: CLINIC_ID, name: 'テスト整骨院' },
    });

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      data: {
        liff_id: '2000000000-AbCdEfGh',
        oa_basic_id: '@testclinic',
      },
    });
    expect(JSON.stringify(data)).not.toContain('2000000001');
  });

  it('Turnstile site keyはsecretとsite keyの両方がある場合だけ返す', async () => {
    mockCreatePublicClinicContext.mockResolvedValue({
      client: buildSettingsClient(null),
      clinic: { id: CLINIC_ID, name: 'テスト整骨院' },
    });

    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'turnstile-site-key';
    const disabledResponse = await GET(buildRequest());
    const disabledData = await disabledResponse.json();
    expect(disabledResponse.status).toBe(200);
    expect(disabledData).toMatchObject({
      success: true,
      data: {
        turnstile_site_key: undefined,
      },
    });

    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    const enabledResponse = await GET(buildRequest());
    const enabledData = await enabledResponse.json();
    expect(enabledResponse.status).toBe(200);
    expect(enabledData).toMatchObject({
      success: true,
      data: {
        turnstile_site_key: 'turnstile-site-key',
      },
    });
    expect(JSON.stringify(enabledData)).not.toContain('turnstile-secret');
  });
});

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

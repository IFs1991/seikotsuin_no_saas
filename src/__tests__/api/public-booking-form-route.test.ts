const mockCreatePublicClinicContext = jest.fn();

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

const buildSettingsClient = (settings: unknown) => ({
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: settings === null ? null : { settings },
        error: null,
      }),
    }),
  }),
});

describe('GET /api/public/booking-form', () => {
  let GET: (
    request: ReturnType<typeof buildRequest>
  ) => Promise<PublicBookingFormRouteResponse>;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    const mod = await import('@/app/api/public/booking-form/route');
    GET = mod.GET as (
      request: ReturnType<typeof buildRequest>
    ) => Promise<PublicBookingFormRouteResponse>;
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
});

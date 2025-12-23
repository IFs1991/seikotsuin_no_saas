import { ensureClinicAccess } from '@/lib/supabase/guards';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {},
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

let postHandler: any;

beforeAll(async () => {
  const dailyReportsModule = await import('@/app/api/daily-reports/route');
  postHandler = dailyReportsModule.POST;
});

const createRequest = (body: unknown) => ({
  json: jest.fn().mockResolvedValue(body),
});

describe('POST /api/daily-reports', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns validation error when payload is invalid', async () => {
    const request = createRequest({
      clinic_id: 'not-a-uuid',
      report_date: '2025-01-01',
      total_patients: -1,
    });

    const response = await postHandler(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.fieldErrors?.clinic_id?.[0]).toContain('UUID');
  });

  it('creates or updates a daily report when payload is valid', async () => {
    const upsertSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'report-1',
            clinic_id: '11111111-1111-4111-8111-111111111111',
          },
          error: null,
        }),
      }),
    });

    ensureClinicAccessMock.mockResolvedValue({
      supabase: {
        from: jest.fn(() => ({
          upsert: upsertSpy,
        })),
      },
    });

    const request = createRequest({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      report_date: '2025-01-01',
      total_patients: 10,
      new_patients: 2,
      total_revenue: 30000,
      insurance_revenue: 12000,
      private_revenue: 18000,
      report_text: 'テスト日報',
    });

    const response = await postHandler(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: '11111111-1111-4111-8111-111111111111',
        total_patients: 10,
        total_revenue: 30000,
      }),
      expect.any(Object)
    );
  });

  it('rejects payloads where new patients exceed total patients', async () => {
    const request = createRequest({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      report_date: '2025-01-01',
      total_patients: 1,
      new_patients: 3,
      total_revenue: 10000,
      insurance_revenue: 5000,
      private_revenue: 5000,
    });

    const response = await postHandler(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.fieldErrors?.new_patients?.[0]).toContain(
      'total_patients以下'
    );
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});

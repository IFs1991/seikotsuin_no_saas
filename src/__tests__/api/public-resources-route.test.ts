/**
 * GET /api/public/resources route tests
 *
 * Verifies that the public booking form can load bookable staff resources
 * without using authenticated app APIs.
 */

const mockCreatePublicClinicContext = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createPublicClinicContext: (...args: unknown[]) =>
    mockCreatePublicClinicContext(...args),
  ClinicNotFoundError: class ClinicNotFoundError extends Error {
    constructor(msg = 'Clinic not found') {
      super(msg);
      this.name = 'ClinicNotFoundError';
    }
  },
  ClinicInactiveError: class ClinicInactiveError extends Error {
    constructor(msg = 'Clinic is not active') {
      super(msg);
      this.name = 'ClinicInactiveError';
    }
  },
}));

const VALID_CLINIC_ID = '00000000-0000-0000-0000-000000000101';

const buildRequest = (url: string) => ({ url }) as any;

describe('GET /api/public/resources', () => {
  let GET: (req: any) => Promise<any>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    const mod = await import('@/app/api/public/resources/route');
    GET = mod.GET;
  });

  it('bookable staff resources を返す', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'resource-1',
          name: '院長',
          type: 'staff',
          max_concurrent: 1,
          display_order: 1,
        },
      ],
      error: null,
    });
    const eq = jest.fn().mockReturnThis();
    const query = { eq, order };
    eq.mockReturnValue(query);

    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(query),
      }),
    };
    mockCreatePublicClinicContext.mockResolvedValue({
      client: supabase,
      clinicId: VALID_CLINIC_ID,
      clinic: { id: VALID_CLINIC_ID, name: 'テスト整骨院', is_active: true },
    });

    const response = await GET(
      buildRequest(
        `http://localhost/api/public/resources?clinic_id=${VALID_CLINIC_ID}&type=staff`
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      data: {
        clinic_id: VALID_CLINIC_ID,
        clinic_name: 'テスト整骨院',
        resources: [
          {
            id: 'resource-1',
            name: '院長',
            type: 'staff',
            max_concurrent: 1,
            display_order: 1,
          },
        ],
      },
    });
    expect(supabase.from).toHaveBeenCalledWith('resources');
    expect(eq).toHaveBeenCalledWith('clinic_id', VALID_CLINIC_ID);
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(eq).toHaveBeenCalledWith('is_bookable', true);
    expect(eq).toHaveBeenCalledWith('is_deleted', false);
    expect(eq).toHaveBeenCalledWith('type', 'staff');
  });

  it('不正な clinic_id は 400 を返す', async () => {
    const response = await GET(
      buildRequest('http://localhost/api/public/resources?clinic_id=bad-id')
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid query parameters');
  });
});

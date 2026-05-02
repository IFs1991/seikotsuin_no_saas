/**
 * GET /api/public/menus route tests
 *
 * Verifies that the public booking form only exposes public active menus.
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

describe('GET /api/public/menus', () => {
  let GET: (req: any) => Promise<any>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    const mod = await import('@/app/api/public/menus/route');
    GET = mod.GET;
  });

  it('public active menus だけを返す', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'menu-1',
          name: '標準施術',
          description: null,
          price: 5000,
          duration_minutes: 60,
          category: 'general',
          is_insurance_applicable: false,
        },
      ],
      error: null,
    });
    const query = {
      eq: jest.fn().mockReturnThis(),
      order,
    };
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
        `http://localhost/api/public/menus?clinic_id=${VALID_CLINIC_ID}`
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.menus).toHaveLength(1);
    expect(supabase.from).toHaveBeenCalledWith('menus');
    expect(query.eq).toHaveBeenCalledWith('clinic_id', VALID_CLINIC_ID);
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.eq).toHaveBeenCalledWith('is_public', true);
    expect(query.eq).toHaveBeenCalledWith('is_deleted', false);
  });
});

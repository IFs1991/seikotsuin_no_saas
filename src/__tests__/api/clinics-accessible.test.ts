import { processApiRequest } from '@/lib/api-helpers';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;

function createClinicsQueryMock(data: unknown[], error: unknown = null) {
  const order = jest.fn().mockResolvedValue({ data, error });
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  return { select, eq, order };
}

describe('GET /api/clinics/accessible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-C01: staff ロールのユーザーは自クリニックのみ返す', async () => {
    const clinics = [{ id: 'clinic-1', name: '本院' }];
    const clinicsQuery = createClinicsQueryMock(clinics);

    const from = jest.fn().mockImplementation((table: string) => {
      if (table === 'clinics') {
        return { select: clinicsQuery.select };
      }
      return null;
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new Request('http://localhost/api/clinics/accessible') as any
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.clinics).toEqual(clinics);
    expect(body.data.currentClinicId).toBe('clinic-1');
  });

  it('TC-C05: 非アクティブクリニック (is_active=false) は含まれない', async () => {
    const clinics = [{ id: 'clinic-2', name: '新宿院' }];
    const clinicsQuery = createClinicsQueryMock(clinics);

    const from = jest.fn().mockImplementation((table: string) => {
      if (table === 'clinics') {
        return { select: clinicsQuery.select };
      }
      return null;
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-2', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-2',
        clinic_scope_ids: ['clinic-2', 'clinic-3'],
      },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    await GET(new Request('http://localhost/api/clinics/accessible') as any);

    expect(clinicsQuery.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('TC-C06: 未認証リクエストは 401 を返す', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401 }
      ),
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new Request('http://localhost/api/clinics/accessible') as any
    );

    expect(response.status).toBe(401);
  });

  it('TC-C07: 返される name が clinics.name と一致する', async () => {
    const clinics = [
      {
        id: '3d9f420f-6c5d-4a96-bf9e-fcb8c95f88e2',
        name: '池袋院',
      },
    ];
    const clinicsQuery = createClinicsQueryMock(clinics);

    const from = jest.fn().mockImplementation((table: string) => {
      if (table === 'clinics') {
        return { select: clinicsQuery.select };
      }
      return null;
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-3', email: 'u3@example.com', role: 'clinic_admin' },
      permissions: { role: 'clinic_admin', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new Request('http://localhost/api/clinics/accessible') as any
    );
    const body = await response.json();

    expect(body.data.clinics[0].name).toBe('池袋院');
    expect(body.data.clinics[0].name).not.toBe(body.data.clinics[0].id);
  });
});

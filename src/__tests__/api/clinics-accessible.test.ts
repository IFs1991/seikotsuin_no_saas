import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

function createClinicsQueryMock(data: unknown[], error: unknown = null) {
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    returns: jest.fn().mockResolvedValue({ data, error }),
  };
  return query;
}

describe('GET /api/clinics/accessible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-C01: staff ロールのユーザーは自クリニックのみ返す', async () => {
    const clinics = [{ id: 'clinic-1', name: '本院' }];
    const clinicsQuery = createClinicsQueryMock(clinics);

    const from = jest.fn().mockReturnValue(clinicsQuery);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.clinics).toEqual(clinics);
    expect(body.data.currentClinicId).toBe('clinic-1');
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', ['clinic-1']);
  });

  it('TC-C05: 非アクティブクリニック (is_active=false) は含まれない', async () => {
    const clinics = [{ id: 'clinic-2', name: '新宿院', parent_id: null }];
    const clinicsQuery = createClinicsQueryMock(clinics);

    const from = jest.fn().mockReturnValue(clinicsQuery);
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      scopedClinicIds: ['clinic-2', 'clinic-3'],
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
    await GET(new NextRequest('http://localhost/api/clinics/accessible'));

    expect(clinicsQuery.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('TC-C08: HQ admin は exact canonical scope に含まれる子店舗を返す', async () => {
    const clinics = [
      { id: 'parent-1', name: '本部', parent_id: null },
      { id: 'child-1', name: '新宿院', parent_id: 'parent-1' },
      { id: 'child-2', name: '池袋院', parent_id: 'parent-1' },
    ];
    const clinicsQuery = createClinicsQueryMock(clinics);
    const from = jest.fn().mockReturnValue(clinicsQuery);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'parent-1',
        clinic_scope_ids: ['parent-1', 'child-1', 'child-2'],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      scopedClinicIds: ['parent-1', 'child-1', 'child-2'],
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', [
      'parent-1',
      'child-1',
      'child-2',
    ]);
    expect(clinicsQuery.or).not.toHaveBeenCalled();
    expect(body.data.clinics).toEqual([
      { id: 'child-1', name: '新宿院' },
      { id: 'child-2', name: '池袋院' },
    ]);
    expect(body.data.currentClinicId).toBeNull();
  });

  it('TC-C09: HQ admin のスコープ内に予約対象の子店舗がない場合は空配列を返す', async () => {
    const clinics = [{ id: 'parent-1', name: '本部', parent_id: null }];
    const clinicsQuery = createClinicsQueryMock(clinics);
    const from = jest.fn().mockReturnValue(clinicsQuery);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'parent-1',
        clinic_scope_ids: ['parent-1'],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      scopedClinicIds: ['3d9f420f-6c5d-4a96-bf9e-fcb8c95f88e2'],
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.clinics).toEqual([]);
    expect(body.data.currentClinicId).toBeNull();
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
      new NextRequest('http://localhost/api/clinics/accessible')
    );

    expect(response.status).toBe(401);
  });

  it('TC-C07: 返される name が clinics.name と一致する', async () => {
    const clinics = [
      {
        id: '3d9f420f-6c5d-4a96-bf9e-fcb8c95f88e2',
        name: '池袋院',
        parent_id: 'parent-1',
      },
    ];
    const clinicsQuery = createClinicsQueryMock(clinics);

    const from = jest.fn().mockReturnValue(clinicsQuery);
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      scopedClinicIds: ['parent-1'],
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-3', email: 'u3@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'parent-1',
        clinic_scope_ids: ['3d9f420f-6c5d-4a96-bf9e-fcb8c95f88e2'],
      },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(body.data.clinics[0].name).toBe('池袋院');
    expect(body.data.clinics[0].name).not.toBe(body.data.clinics[0].id);
  });

  it('TC-C10: clinic_admin も exact canonical scope 内の子店舗を返す', async () => {
    const clinics = [
      { id: 'parent-1', name: '本部', parent_id: null },
      { id: 'child-1', name: '新宿院', parent_id: 'parent-1' },
      { id: 'child-2', name: '池袋院', parent_id: 'parent-1' },
    ];
    const clinicsQuery = createClinicsQueryMock(clinics);
    const from = jest.fn().mockReturnValue(clinicsQuery);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'parent-1',
        clinic_scope_ids: ['parent-1', 'child-1', 'child-2'],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      scopedClinicIds: ['parent-1', 'child-1', 'child-2'],
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', [
      'parent-1',
      'child-1',
      'child-2',
    ]);
    expect(clinicsQuery.or).not.toHaveBeenCalled();
    expect(body.data.clinics).toEqual([
      { id: 'child-1', name: '新宿院' },
      { id: 'child-2', name: '池袋院' },
    ]);
    expect(body.data.currentClinicId).toBeNull();
  });
});

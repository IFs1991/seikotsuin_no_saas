import { processClinicScopedBody } from '@/lib/route-helpers';
import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';
import type { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual('@/lib/route-helpers');
  return {
    ...actual,
    processClinicScopedBody: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const userId = '123e4567-e89b-12d3-a456-426614174001';

describe('GET /api/menus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists clinic menus through scoped admin client after route-level scope guard', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const menu = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      clinic_id: clinicId,
      name: '子院独自メニュー',
      description: '子テナント登録',
      category: 'treatment',
      price: 4500,
      duration_minutes: 45,
      is_insurance_applicable: false,
      options: [],
      is_active: true,
    };
    const order = jest.fn().mockResolvedValue({ data: [menu], error: null });
    const eqDeleted = jest.fn().mockReturnValue({ order });
    const eqClinic = jest.fn().mockReturnValue({ eq: eqDeleted });
    const select = jest.fn().mockReturnValue({ eq: eqClinic });
    const adminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'menus') return { select };
        return {};
      }),
    };
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'clinic_admin',
      clinic_id: clinicId,
      clinic_scope_ids: [clinicId],
    };
    const request = {
      nextUrl: {
        searchParams: new URLSearchParams({ clinic_id: clinicId }),
      },
      url: `http://localhost/api/menus?clinic_id=${clinicId}`,
      method: 'GET',
    } as any;

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth: {
        id: userId,
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/menus/route');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId,
      requireClinicMatch: true,
    });
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(adminClient.from).toHaveBeenCalledWith('menus');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(json.data).toEqual([
      expect.objectContaining({
        id: menu.id,
        clinicId,
        name: '子院独自メニュー',
        durationMinutes: 45,
      }),
    ]);
  });

  it('manager lists assigned clinic menus through the guarded user client without permission fallback', async () => {
    const menu = {
      id: '123e4567-e89b-12d3-a456-426614174003',
      clinic_id: clinicId,
      name: '担当院メニュー',
      description: null,
      category: 'treatment',
      price: 5000,
      duration_minutes: 30,
      is_insurance_applicable: false,
      options: [],
      is_active: true,
    };
    const order = jest.fn().mockResolvedValue({ data: [menu], error: null });
    const eqDeleted = jest.fn().mockReturnValue({ order });
    const eqClinic = jest.fn().mockReturnValue({ eq: eqDeleted });
    const select = jest.fn().mockReturnValue({ eq: eqClinic });
    const userScopedSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'menus') return { select };
        return {};
      }),
    };
    const request = {
      nextUrl: {
        searchParams: new URLSearchParams({ clinic_id: clinicId }),
      },
      url: `http://localhost/api/menus?clinic_id=${clinicId}`,
      method: 'GET',
    } as unknown as NextRequest;

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth: {
        id: userId,
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: 'fallback-clinic',
        clinic_scope_ids: ['jwt-clinic'],
      },
      supabase: userScopedSupabase,
    });

    const { GET } = await import('@/app/api/menus/route');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId,
      requireClinicMatch: true,
    });
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(userScopedSupabase.from).toHaveBeenCalledWith('menus');
    expect(json.data).toEqual([
      expect.objectContaining({
        id: menu.id,
        clinicId,
        name: '担当院メニュー',
      }),
    ]);
  });
});

describe('POST /api/menus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a clinic menu through scoped admin client after route-level scope guard', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const savedMenu = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      clinic_id: clinicId,
      name: '自費整体',
      description: '標準メニュー',
      category: 'treatment',
      price: 6000,
      duration_minutes: 60,
      is_insurance_applicable: false,
      options: [],
      is_active: true,
    };
    const single = jest.fn().mockResolvedValue({ data: savedMenu, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const adminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'menus') return { insert };
        return {};
      }),
    };
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'clinic_admin',
      clinic_id: clinicId,
      clinic_scope_ids: [clinicId],
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: clinicId,
        name: '自費整体',
        description: '標準メニュー',
        category: 'treatment',
        price: 6000,
        durationMinutes: 60,
        isInsuranceApplicable: false,
        isActive: true,
        options: [],
      },
      auth: { id: userId, email: 'clinic-admin@example.com', role: 'clinic_admin' },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/menus/route');
    const response = await POST({} as any);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { allowedRoles: Array.from(CLINIC_ADMIN_ROLES) }
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(adminClient.from).toHaveBeenCalledWith('menus');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        created_by: userId,
        name: '自費整体',
        duration_minutes: 60,
      })
    );
    expect(json.data).toMatchObject({
      id: savedMenu.id,
      clinicId,
      durationMinutes: 60,
      isInsuranceApplicable: false,
    });
  });
});

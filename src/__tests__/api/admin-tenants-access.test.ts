import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createAdminClient: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;

function createListQueryMock(result: unknown[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    then(
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve({ data: result, error: null }).then(
        resolve,
        reject
      );
    },
  };

  return query;
}

describe('Admin tenants access alignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/admin/tenants scopes list by clinic_scope_ids for HQ admin', async () => {
    const clinics = [{ id: 'clinic-1', name: 'Scope Clinic' }];
    const clinicsQuery = createListQueryMock(clinics);
    const mockAdminClient = {
      from: jest.fn().mockReturnValue(clinicsQuery),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      },
      supabase: {},
    });
    createScopedAdminContextMock.mockReturnValue({
      client: mockAdminClient,
      scopedClinicIds: ['clinic-1', 'clinic-2'],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/tenants/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/tenants')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', [
      'clinic-1',
      'clinic-2',
    ]);
    expect(body.data.items).toEqual(clinics);
  });

  it('GET /api/admin/tenants fails closed when admin has no clinic scope and no clinic_id', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
    });
    createScopedAdminContextMock.mockImplementation(() => {
      throw new ScopeNotConfiguredError();
    });

    const { GET } = await import('@/app/api/admin/tenants/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/tenants')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('PATCH /api/admin/tenants/[clinic_id] rejects scope-out clinic', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['clinic-1'],
      },
      supabase: {},
      body: { is_active: false },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from: jest.fn() },
      scopedClinicIds: ['clinic-1'],
      assertClinicInScope: jest.fn(() => {
        throw new ScopeAccessError();
      }),
    });

    const { PATCH } = await import('@/app/api/admin/tenants/[clinic_id]/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/tenants/clinic-2', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
      { params: { clinic_id: 'clinic-2' } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('POST /api/admin/tenants creates a clinic_admin account when login credentials are provided', async () => {
    const createdClinic = {
      id: 'clinic-new',
      name: '新宿西口院',
      address: '東京都新宿区',
      phone_number: '03-9999-0000',
      is_active: true,
      created_at: '2026-04-20T00:00:00.000Z',
    };

    const clinicsInsertQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: createdClinic,
        error: null,
      }),
    };

    const scopedAdminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'clinics') {
          return clinicsInsertQuery;
        }
        throw new Error(`Unexpected scoped table: ${table}`);
      }),
    };

    const profilesQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const staffQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const permissionsQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };

    const adminClient = {
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
          }),
          deleteUser: jest.fn(),
        },
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return profilesQuery;
        }
        if (table === 'staff') {
          return staffQuery;
        }
        if (table === 'user_permissions') {
          return permissionsQuery;
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['hq-1'],
      },
      supabase: {},
      body: {
        name: createdClinic.name,
        address: createdClinic.address,
        phone_number: createdClinic.phone_number,
        is_active: true,
        login_email: 'clinic-admin@example.com',
        login_password: 'StorePass1!',
      },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: scopedAdminClient,
      scopedClinicIds: ['hq-1'],
      assertClinicInScope: jest.fn(),
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/tenants/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: createdClinic.name,
          address: createdClinic.address,
          phone_number: createdClinic.phone_number,
          is_active: true,
          login_email: 'clinic-admin@example.com',
          login_password: 'StorePass1!',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'clinic-admin@example.com',
        password: 'StorePass1!',
        email_confirm: true,
      })
    );
    expect(profilesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        clinic_id: createdClinic.id,
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      }),
      { onConflict: 'user_id' }
    );
    expect(staffQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        clinic_id: createdClinic.id,
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
        password_hash: 'managed_by_supabase',
      }),
      { onConflict: 'id' }
    );
    expect(permissionsQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: 'user-1',
        clinic_id: createdClinic.id,
        username: 'clinic-admin@example.com',
        role: 'clinic_admin',
        hashed_password: 'managed_by_supabase',
      }),
      { onConflict: 'staff_id' }
    );
    expect(body.data.admin_account).toEqual({
      email: 'clinic-admin@example.com',
      role: 'clinic_admin',
    });
  });
});

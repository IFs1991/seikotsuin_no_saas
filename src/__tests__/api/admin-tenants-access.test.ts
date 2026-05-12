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
const SCOPED_CLINIC_IDS = ['clinic-1', 'clinic-2'] as const;
const CLINIC_SCOPE_OR_FILTER =
  'id.in.(clinic-1,clinic-2),parent_id.in.(clinic-1,clinic-2)';

function createListQueryMock(result: unknown[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
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

function createSingleClinicQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: result,
      error: null,
    }),
  };
}

function createCountQuery(count: number) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({
      count,
      error: null,
    }),
  };
}

describe('Admin tenants access alignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/admin/tenants scopes list by clinic_scope_ids and scoped parent_id for HQ admin', async () => {
    const clinics = [
      {
        id: 'clinic-1',
        name: 'Scope Clinic',
        address: null,
        phone_number: null,
        is_active: true,
        created_at: '2026-04-20T00:00:00.000Z',
        parent_id: null,
      },
      {
        id: 'clinic-new-child',
        name: 'New Child Clinic',
        address: null,
        phone_number: null,
        is_active: true,
        created_at: '2026-04-21T00:00:00.000Z',
        parent_id: 'clinic-1',
      },
    ];
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
        clinic_scope_ids: [...SCOPED_CLINIC_IDS],
      },
      supabase: {},
    });
    createScopedAdminContextMock.mockReturnValue({
      client: mockAdminClient,
      scopedClinicIds: [...SCOPED_CLINIC_IDS],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/tenants/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/tenants')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.or).toHaveBeenCalledWith(CLINIC_SCOPE_OR_FILTER);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: 'clinic-1',
        name: 'Scope Clinic',
        parent_id: null,
        parent_name: null,
        clinic_type: 'hq',
        child_count: 1,
      }),
      expect.objectContaining({
        id: 'clinic-new-child',
        name: 'New Child Clinic',
        parent_id: 'clinic-1',
        parent_name: 'Scope Clinic',
        clinic_type: 'child',
        child_count: 0,
      }),
    ]);
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

  it('POST /api/admin/tenants rejects standalone HQ creation before insert', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['11111111-1111-4111-8111-111111111111'],
      },
      supabase: {},
      body: {
        name: 'スコープ外本部',
        address: '東京都新宿区',
        phone_number: '03-9999-0000',
        is_active: true,
        parent_id: null,
        login_email: 'clinic-admin@example.com',
        login_password: 'StorePass1!',
      },
    });

    const { POST } = await import('@/app/api/admin/tenants/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: 'スコープ外本部',
          address: '東京都新宿区',
          phone_number: '03-9999-0000',
          is_active: true,
          parent_id: null,
          login_email: 'clinic-admin@example.com',
          login_password: 'StorePass1!',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('POST /api/admin/tenants rejects missing parent_id before insert', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['11111111-1111-4111-8111-111111111111'],
      },
      supabase: {},
      body: {
        name: '親なしテナント',
        address: '東京都新宿区',
        phone_number: '03-9999-0000',
        is_active: true,
      },
    });

    const { POST } = await import('@/app/api/admin/tenants/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: '親なしテナント',
          address: '東京都新宿区',
          phone_number: '03-9999-0000',
          is_active: true,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('POST /api/admin/tenants creates a clinic_admin account with the supplied full name', async () => {
    const hqClinicId = '11111111-1111-4111-8111-111111111111';
    const createdClinic = {
      id: 'clinic-new',
      name: '新宿西口院',
      address: '東京都新宿区',
      phone_number: '03-9999-0000',
      is_active: true,
      created_at: '2026-04-20T00:00:00.000Z',
      parent_id: hqClinicId,
    };
    const clinicAdminName = '山田 院長';

    const clinicsInsertQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            id: hqClinicId,
            name: '本部',
            parent_id: null,
            is_active: true,
          },
          error: null,
        })
        .mockResolvedValueOnce({
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
    const resourcesQuery = {
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
        if (table === 'resources') {
          return resourcesQuery;
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
        clinic_scope_ids: [hqClinicId],
      },
      supabase: {},
      body: {
        name: createdClinic.name,
        address: createdClinic.address,
        phone_number: createdClinic.phone_number,
        is_active: true,
        parent_id: hqClinicId,
        login_full_name: clinicAdminName,
        login_email: 'clinic-admin@example.com',
        login_password: 'StorePass1!',
      },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: scopedAdminClient,
      scopedClinicIds: [hqClinicId],
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
          parent_id: hqClinicId,
          login_full_name: clinicAdminName,
          login_email: 'clinic-admin@example.com',
          login_password: 'StorePass1!',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(clinicsInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: createdClinic.name,
        parent_id: hqClinicId,
      })
    );
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'clinic-admin@example.com',
        password: 'StorePass1!',
        email_confirm: true,
        user_metadata: {
          full_name: clinicAdminName,
        },
      })
    );
    expect(profilesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        clinic_id: createdClinic.id,
        email: 'clinic-admin@example.com',
        full_name: clinicAdminName,
        role: 'clinic_admin',
      }),
      { onConflict: 'user_id' }
    );
    expect(staffQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        clinic_id: createdClinic.id,
        name: clinicAdminName,
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
        password_hash: 'managed_by_supabase',
        is_therapist: true,
      }),
      { onConflict: 'id' }
    );
    expect(resourcesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        clinic_id: createdClinic.id,
        name: clinicAdminName,
        type: 'staff',
        email: 'clinic-admin@example.com',
        is_active: true,
        is_bookable: true,
        is_deleted: false,
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
    expect(body.data).toEqual(
      expect.objectContaining({
        parent_id: hqClinicId,
        parent_name: '本部',
        clinic_type: 'child',
      })
    );
  });

  it('POST /api/admin/tenants uses the legacy admin name fallback when full name is omitted', async () => {
    const hqClinicId = '11111111-1111-4111-8111-111111111111';
    const childClinicId = '22222222-2222-4222-8222-222222222222';
    const createdClinic = {
      id: childClinicId,
      name: '渋谷支店',
      address: '東京都渋谷区',
      phone_number: '03-1234-0000',
      is_active: true,
      created_at: '2026-04-20T00:00:00.000Z',
      parent_id: hqClinicId,
    };
    const fallbackAdminName = `${createdClinic.name} 管理者`;

    const clinicsInsertQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            id: hqClinicId,
            name: '本部',
            parent_id: null,
            is_active: true,
          },
          error: null,
        })
        .mockResolvedValueOnce({
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
    const resourcesQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const permissionsQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };

    const adminClient = {
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-2' } },
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
        if (table === 'resources') {
          return resourcesQuery;
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
        clinic_scope_ids: [hqClinicId, childClinicId],
      },
      supabase: {},
      body: {
        name: createdClinic.name,
        address: createdClinic.address,
        phone_number: createdClinic.phone_number,
        is_active: true,
        parent_id: hqClinicId,
        login_email: 'child-admin@example.com',
        login_password: 'StorePass1!',
      },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: scopedAdminClient,
      scopedClinicIds: [hqClinicId, childClinicId],
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
          parent_id: hqClinicId,
          login_email: 'child-admin@example.com',
          login_password: 'StorePass1!',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(clinicsInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: createdClinic.name,
        parent_id: hqClinicId,
      })
    );
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: {
          full_name: fallbackAdminName,
        },
      })
    );
    expect(profilesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: fallbackAdminName,
      }),
      { onConflict: 'user_id' }
    );
    expect(staffQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: fallbackAdminName,
      }),
      { onConflict: 'id' }
    );
    expect(resourcesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: fallbackAdminName,
      }),
      { onConflict: 'id' }
    );
    expect(body.data).toEqual(
      expect.objectContaining({
        parent_id: hqClinicId,
        parent_name: '本部',
        clinic_type: 'child',
        child_count: 0,
      })
    );
  });

  it('PATCH /api/admin/tenants/[clinic_id] rejects changing a child tenant to standalone HQ', async () => {
    const currentParentId = '11111111-1111-4111-8111-111111111111';
    const childClinicId = '22222222-2222-4222-8222-222222222222';
    const currentClinicQuery = createSingleClinicQuery({
      id: childClinicId,
      name: '渋谷支店',
      parent_id: currentParentId,
      is_active: true,
    });
    const childCountQuery = createCountQuery(0);
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    const queries = [currentClinicQuery, childCountQuery, updateQuery];
    const scopedAdminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table !== 'clinics') {
          throw new Error(`Unexpected scoped table: ${table}`);
        }

        const nextQuery = queries.shift();
        if (!nextQuery) {
          throw new Error('Unexpected extra clinics query');
        }

        return nextQuery;
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [currentParentId, childClinicId],
      },
      supabase: {},
      body: { parent_id: null },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: scopedAdminClient,
      scopedClinicIds: [currentParentId, childClinicId],
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/admin/tenants/[clinic_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/tenants/${childClinicId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: null }),
      }),
      { params: { clinic_id: childClinicId } }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/admin/tenants/[clinic_id] allows moving a child tenant to another in-scope HQ tenant', async () => {
    const currentParentId = '11111111-1111-4111-8111-111111111111';
    const nextParentId = '33333333-3333-4333-8333-333333333333';
    const childClinicId = '22222222-2222-4222-8222-222222222222';
    const currentClinicQuery = createSingleClinicQuery({
      id: childClinicId,
      name: '渋谷支店',
      parent_id: currentParentId,
      is_active: true,
    });
    const childCountQuery = createCountQuery(0);
    const parentClinicQuery = createSingleClinicQuery({
      id: nextParentId,
      name: '第二本部',
      parent_id: null,
      is_active: true,
    });
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: childClinicId,
          name: '渋谷支店',
          address: null,
          phone_number: null,
          is_active: true,
          created_at: '2026-04-20T00:00:00.000Z',
          parent_id: nextParentId,
        },
        error: null,
      }),
    };

    const queries = [
      currentClinicQuery,
      childCountQuery,
      parentClinicQuery,
      updateQuery,
    ];
    const scopedAdminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table !== 'clinics') {
          throw new Error(`Unexpected scoped table: ${table}`);
        }

        const nextQuery = queries.shift();
        if (!nextQuery) {
          throw new Error('Unexpected extra clinics query');
        }

        return nextQuery;
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [currentParentId, nextParentId, childClinicId],
      },
      supabase: {},
      body: { parent_id: nextParentId },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: scopedAdminClient,
      scopedClinicIds: [currentParentId, nextParentId, childClinicId],
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/admin/tenants/[clinic_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/tenants/${childClinicId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: nextParentId }),
      }),
      { params: { clinic_id: childClinicId } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: nextParentId,
      })
    );
    expect(body.data).toEqual(
      expect.objectContaining({
        id: childClinicId,
        parent_id: nextParentId,
        parent_name: '第二本部',
        clinic_type: 'child',
        child_count: 0,
      })
    );
  });
});

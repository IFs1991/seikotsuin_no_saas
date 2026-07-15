import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';

const mockResolveEffectiveClinicScope = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveEffectiveClinicScope: (...args: unknown[]) =>
    mockResolveEffectiveClinicScope(...args),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
  resolveScopedClinicIds: jest.fn(permissions => {
    if (permissions?.clinic_scope_ids?.length) {
      return permissions.clinic_scope_ids;
    }
    return permissions?.clinic_id ? [permissions.clinic_id] : null;
  }),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const ADMIN_SCOPE_IDS = ['clinic-1'];

type ManagerScopeMockInput = {
  permissions: {
    clinic_scope_ids?: string[];
  };
};

type QueryRow = Record<string, unknown>;

function createListQuery<T extends QueryRow>(rows: T[]) {
  const result = { data: rows, error: null };
  const query = {
    select: jest.fn(),
    ilike: jest.fn(),
    or: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    in: jest.fn(),
    limit: jest.fn(),
    then: jest.fn(
      (
        resolve: (value: typeof result) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject)
    ),
  };

  query.select.mockReturnValue(query);
  query.ilike.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);

  return query;
}

describe('GET /api/admin/users/candidates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEffectiveClinicScope.mockImplementation(
      ({ permissions }: ManagerScopeMockInput) => ({
        source: 'manager_assignments',
        clinicIds: permissions.clinic_scope_ids ?? [],
      })
    );
  });

  it('Japanese name search returns display-safe user candidates', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ADMIN_SCOPE_IDS,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([
      {
        id: 'user-1',
        email: 'staff-yamada@example.com',
        name: '山田 太郎',
        clinic_id: 'clinic-1',
        role: 'therapist',
        clinics: { name: '新宿院' },
      },
    ]);
    const profileSearchQuery = createListQuery([{ user_id: 'user-1' }]);
    const profileDetailsQuery = createListQuery([
      {
        user_id: 'user-1',
        email: 'yamada@example.com',
        full_name: '山田 太郎',
        is_active: true,
      },
    ]);
    const permissionsQuery = createListQuery([
      {
        id: 'permission-1',
        staff_id: 'user-1',
        role: 'manager',
        clinic_id: 'clinic-1',
        clinics: { name: '新宿院' },
      },
    ]);

    const tableQueries = {
      staff: [staffSearchQuery],
      profiles: [profileSearchQuery, profileDetailsQuery],
      user_permissions: [permissionsQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/users/candidates?search=%E5%B1%B1%E7%94%B0'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(staffSearchQuery.or).toHaveBeenCalledWith(
      'name.ilike.%山田%,email.ilike.%山田%'
    );
    expect(profileSearchQuery.or).toHaveBeenCalledWith(
      'full_name.ilike.%山田%,email.ilike.%山田%'
    );
    expect(profileDetailsQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        email: 'yamada@example.com',
        full_name: '山田 太郎',
        clinic_name: '新宿院',
        current_role: 'manager',
        permission_clinic_name: '新宿院',
        candidate_source: 'staff',
      }),
    ]);
  });

  it('returns profile-only candidates for admin when include_unassigned is true', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ADMIN_SCOPE_IDS,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([]);
    const profileSearchQuery = createListQuery([{ user_id: 'profile-only-1' }]);
    const staffByProfileQuery = createListQuery([]);
    const unassignedProfilesQuery = createListQuery([
      {
        user_id: 'profile-only-1',
        email: 'profile-only@example.com',
        full_name: '未付与 太郎',
        is_active: true,
        clinic_id: 'clinic-1',
        clinics: { name: '新宿院' },
      },
    ]);
    const unassignedPermissionsQuery = createListQuery([]);
    const unassignedStaffQuery = createListQuery([]);

    const tableQueries = {
      staff: [staffSearchQuery, staffByProfileQuery, unassignedStaffQuery],
      profiles: [profileSearchQuery, unassignedProfilesQuery],
      user_permissions: [unassignedPermissionsQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/users/candidates?search=profile&include_unassigned=true'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(unassignedProfilesQuery.eq).toHaveBeenCalledWith(
      'is_active',
      true
    );
    expect(unassignedProfilesQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      ADMIN_SCOPE_IDS
    );
    expect(unassignedProfilesQuery.or).toHaveBeenCalledWith(
      'full_name.ilike.%profile%,email.ilike.%profile%'
    );
    expect(unassignedPermissionsQuery.in).toHaveBeenCalledWith('staff_id', [
      'profile-only-1',
    ]);
    expect(unassignedStaffQuery.in).toHaveBeenCalledWith('id', [
      'profile-only-1',
    ]);
    expect(body.data.items).toEqual([
      {
        user_id: 'profile-only-1',
        email: 'profile-only@example.com',
        full_name: '未付与 太郎',
        clinic_id: 'clinic-1',
        clinic_name: '新宿院',
        staff_role: null,
        current_role: null,
        permission_id: null,
        permission_clinic_id: null,
        permission_clinic_name: null,
        candidate_source: 'profile',
      },
    ]);
  });

  it('does not return profile-only candidates without include_unassigned', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ADMIN_SCOPE_IDS,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([]);
    const profileSearchQuery = createListQuery([{ user_id: 'profile-only-1' }]);
    const staffByProfileQuery = createListQuery([]);
    const tableQueries = {
      staff: [staffSearchQuery, staffByProfileQuery],
      profiles: [profileSearchQuery],
      user_permissions: [],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/users/candidates?search=profile'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([]);
  });

  it('does not return profile-only candidates to clinic_admin even when requested', async () => {
    const scopedClinicIds = ['clinic-a'];
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'clinic-a',
        clinic_scope_ids: scopedClinicIds,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([]);
    const profileSearchQuery = createListQuery([{ user_id: 'profile-only-1' }]);
    const staffByProfileQuery = createListQuery([]);
    const tableQueries = {
      staff: [staffSearchQuery, staffByProfileQuery],
      profiles: [profileSearchQuery],
      user_permissions: [],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/users/candidates?search=profile&include_unassigned=true'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(staffSearchQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(body.data.items).toEqual([]);
  });

  it('excludes inactive and already-permitted profiles from unassigned candidates', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ADMIN_SCOPE_IDS,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([]);
    const unassignedProfilesQuery = createListQuery([
      {
        user_id: 'active-1',
        email: 'active@example.com',
        full_name: '有効 太郎',
        is_active: true,
        clinic_id: 'clinic-1',
      },
      {
        user_id: 'inactive-1',
        email: 'inactive@example.com',
        full_name: '無効 花子',
        is_active: false,
        clinic_id: 'clinic-1',
      },
      {
        user_id: 'permitted-1',
        email: 'permitted@example.com',
        full_name: '権限 済',
        is_active: true,
        clinic_id: 'clinic-1',
      },
    ]);
    const unassignedPermissionsQuery = createListQuery([
      { staff_id: 'permitted-1' },
    ]);
    const unassignedStaffQuery = createListQuery([]);

    const tableQueries = {
      staff: [staffSearchQuery, unassignedStaffQuery],
      profiles: [unassignedProfilesQuery],
      user_permissions: [unassignedPermissionsQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/users/candidates?include_unassigned=true'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: 'active-1',
        candidate_source: 'profile',
      }),
    ]);
  });

  it('limits clinic_admin candidates to scoped clinics', async () => {
    const scopedClinicIds = ['clinic-a', 'clinic-b'];

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'clinic-a',
        clinic_scope_ids: scopedClinicIds,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([
      {
        id: 'user-1',
        email: 'staff-sato@example.com',
        name: '佐藤 花子',
        clinic_id: 'clinic-b',
        role: 'therapist',
        clinics: { name: '渋谷院' },
      },
    ]);
    const profileSearchQuery = createListQuery([]);
    const profileDetailsQuery = createListQuery([
      {
        user_id: 'user-1',
        email: 'sato@example.com',
        full_name: '佐藤 花子',
        is_active: true,
      },
    ]);
    const permissionsQuery = createListQuery([]);

    const tableQueries = {
      staff: [staffSearchQuery],
      profiles: [profileSearchQuery, profileDetailsQuery],
      user_permissions: [permissionsQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/users/candidates?search=sato')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(staffSearchQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(profileSearchQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(profileDetailsQuery.in).toHaveBeenCalledWith('user_id', ['user-1']);
    expect(permissionsQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        clinic_id: 'clinic-b',
        clinic_name: '渋谷院',
        candidate_source: 'staff',
      }),
    ]);
  });

  it('limits manager candidates to scoped clinics', async () => {
    const scopedClinicIds = ['clinic-a', 'clinic-b'];
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: 'clinic-a',
        clinic_scope_ids: scopedClinicIds,
      },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([
      {
        id: 'user-1',
        email: 'clinic-admin@example.com',
        name: '店舗 管理者',
        clinic_id: 'clinic-b',
        role: 'clinic_admin',
        clinics: { name: '渋谷院' },
      },
      {
        id: 'user-2',
        email: 'area-manager@example.com',
        name: '別エリア 管理者',
        clinic_id: 'clinic-b',
        role: 'manager',
        clinics: { name: '渋谷院' },
      },
    ]);
    const profileSearchQuery = createListQuery([]);
    const profileDetailsQuery = createListQuery([
      {
        user_id: 'user-1',
        email: 'clinic-admin@example.com',
        full_name: '店舗 管理者',
        is_active: true,
      },
      {
        user_id: 'user-2',
        email: 'area-manager@example.com',
        full_name: '別エリア 管理者',
        is_active: true,
      },
    ]);
    const permissionsQuery = createListQuery([
      {
        id: 'permission-1',
        staff_id: 'user-1',
        role: 'clinic_admin',
        clinic_id: 'clinic-b',
        clinics: { name: '渋谷院' },
      },
      {
        id: 'permission-2',
        staff_id: 'user-2',
        role: 'manager',
        clinic_id: 'clinic-b',
        clinics: { name: '渋谷院' },
      },
    ]);

    const tableQueries = {
      staff: [staffSearchQuery],
      profiles: [profileSearchQuery, profileDetailsQuery],
      user_permissions: [permissionsQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/users/candidates?search=sato')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(staffSearchQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(profileSearchQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(profileDetailsQuery.in).toHaveBeenCalledWith('user_id', [
      'user-1',
      'user-2',
    ]);
    expect(permissionsQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        clinic_id: 'clinic-b',
        current_role: 'clinic_admin',
        candidate_source: 'staff',
      }),
    ]);
    expect(JSON.stringify(body.data.items)).not.toContain('permission-2');
    expect(JSON.stringify(body.data.items)).not.toContain('area-manager');
  });
});

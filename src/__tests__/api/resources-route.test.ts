import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';

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

const processApiRequestMock = processApiRequest as jest.Mock;
const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const VALID_CLINIC_ID = '123e4567-e89b-12d3-a456-426614174000';

type QueryResult<T> = { data: T[]; error: null };
type ResourceRow = {
  id: string;
  name: string;
  type: string;
  working_hours: Record<string, unknown> | null;
  supported_menus: string[] | null;
  max_concurrent: number | null;
  nomination_fee?: number | null;
  is_active: boolean | null;
  is_bookable: boolean | null;
};
type StaffCandidateRow = {
  id: string;
  name: string;
  role: string;
  is_therapist: boolean | null;
};
type PermissionCandidateRow = {
  staff_id: string | null;
  role: string;
  username: string | null;
};
type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean | null;
};
type ResourceQuery = {
  select: jest.MockedFunction<(columns: string) => ResourceQuery>;
  eq: jest.MockedFunction<(field: string, value: unknown) => ResourceQuery>;
  order: jest.MockedFunction<
    (
      field: string,
      options: { ascending: boolean }
    ) => Promise<QueryResult<ResourceRow>>
  >;
};
type StaffQuery = {
  select: jest.MockedFunction<(columns: string) => StaffQuery>;
  eq: jest.MockedFunction<
    (field: string, value: unknown) => Promise<QueryResult<StaffCandidateRow>>
  >;
};
type PermissionQuery = {
  select: jest.MockedFunction<(columns: string) => PermissionQuery>;
  eq: jest.MockedFunction<(field: string, value: unknown) => PermissionQuery>;
  in: jest.MockedFunction<
    (
      field: string,
      values: unknown[]
    ) => Promise<QueryResult<PermissionCandidateRow>>
  >;
};
type ProfileQuery = {
  select: jest.MockedFunction<(columns: string) => ProfileQuery>;
  in: jest.MockedFunction<
    (field: string, values: unknown[]) => Promise<QueryResult<ProfileRow>>
  >;
};

function buildRequest(path = `/api/resources?clinic_id=${VALID_CLINIC_ID}`) {
  return new NextRequest(`http://localhost${path}`);
}

function createResourceQuery(rows: ResourceRow[]): ResourceQuery {
  const query = {} as ResourceQuery;
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockReturnValue(query);
  query.order = jest.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

function createStaffQuery(rows: StaffCandidateRow[]): StaffQuery {
  const query = {} as StaffQuery;
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

function createPermissionQuery(
  rows: PermissionCandidateRow[]
): PermissionQuery {
  const query = {} as PermissionQuery;
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockReturnValue(query);
  query.in = jest.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

function createProfileQuery(rows: ProfileRow[]): ProfileQuery {
  const query = {} as ProfileQuery;
  query.select = jest.fn().mockReturnValue(query);
  query.in = jest.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

describe('GET /api/resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('active staff resource がある場合は staff フォールバックを読まない', async () => {
    const resourceQuery = createResourceQuery([
      {
        id: 'resource-1',
        name: '田中先生',
        type: 'staff',
        working_hours: null,
        supported_menus: null,
        max_concurrent: 1,
        nomination_fee: 1500,
        is_active: true,
        is_bookable: true,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'resource-1',
        name: '田中先生',
        type: 'staff',
        isActive: true,
        isBookable: true,
        nominationFee: 1500,
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('resources');
  });

  it('staff resource の予約可否を isBookable として返す', async () => {
    const resourceQuery = createResourceQuery([
      {
        id: 'resource-1',
        name: '予約担当',
        type: 'staff',
        working_hours: null,
        supported_menus: null,
        max_concurrent: 1,
        is_active: true,
        is_bookable: true,
      },
      {
        id: 'resource-2',
        name: '受付スタッフ',
        type: 'staff',
        working_hours: null,
        supported_menus: null,
        max_concurrent: 1,
        is_active: true,
        is_bookable: false,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'resource-1',
        isBookable: true,
      }),
      expect.objectContaining({
        id: 'resource-2',
        isBookable: false,
      }),
    ]);
    expect(resourceQuery.select).toHaveBeenCalledWith(
      expect.stringContaining('is_bookable')
    );
    expect(resourceQuery.select).toHaveBeenCalledWith(
      expect.stringContaining('nomination_fee')
    );
  });

  it('active でも予約不可の staff resource だけなら権限由来の施術者候補を補完する', async () => {
    const resourceQuery = createResourceQuery([
      {
        id: 'staff-1',
        name: '受付スタッフ',
        type: 'staff',
        working_hours: null,
        supported_menus: null,
        max_concurrent: 1,
        is_active: true,
        is_bookable: false,
      },
    ]);
    const staffQuery = createStaffQuery([]);
    const permissionQuery = createPermissionQuery([
      {
        staff_id: 'therapist-1',
        role: 'therapist',
        username: 'therapist@example.com',
      },
    ]);
    const profileQuery = createProfileQuery([
      {
        user_id: 'therapist-1',
        email: 'therapist@example.com',
        full_name: '予約担当者',
        is_active: true,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        if (table === 'staff') return staffQuery;
        if (table === 'user_permissions') return permissionQuery;
        if (table === 'profiles') return profileQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'staff-1',
        isBookable: false,
      }),
      expect.objectContaining({
        id: 'therapist-1',
        name: '予約担当者',
        isBookable: true,
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledWith('user_permissions');
  });

  it('staff resource がない場合だけ staff から施術者候補を補完する', async () => {
    const resourceQuery = createResourceQuery([]);
    const staffQuery = createStaffQuery([
      {
        id: 'staff-1',
        name: '院長',
        role: 'clinic_admin',
        is_therapist: false,
      },
      {
        id: 'staff-2',
        name: '受付',
        role: 'staff',
        is_therapist: false,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        if (table === 'staff') return staffQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'staff-1',
        name: '院長',
        type: 'staff',
        isActive: true,
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledWith('resources');
    expect(supabase.from).toHaveBeenCalledWith('staff');
  });

  it('staff/resource がない場合は user_permissions の施術者を補完する', async () => {
    const resourceQuery = createResourceQuery([]);
    const staffQuery = createStaffQuery([]);
    const permissionQuery = createPermissionQuery([
      {
        staff_id: 'therapist-1',
        role: 'therapist',
        username: 'therapist@example.com',
      },
      {
        staff_id: 'staff-1',
        role: 'staff',
        username: 'staff@example.com',
      },
    ]);
    const profileQuery = createProfileQuery([
      {
        user_id: 'therapist-1',
        email: 'therapist@example.com',
        full_name: '山田先生',
        is_active: true,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        if (table === 'staff') return staffQuery;
        if (table === 'user_permissions') return permissionQuery;
        if (table === 'profiles') return profileQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'therapist-1',
        name: '山田先生',
        type: 'staff',
        isActive: true,
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledWith('user_permissions');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(permissionQuery.in).toHaveBeenCalledWith(
      'role',
      expect.arrayContaining(['therapist'])
    );
  });
});

describe('POST /api/resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nominationFee を nomination_fee として staff resource に保存する', async () => {
    const insertSingle = jest.fn().mockResolvedValue({
      data: { id: 'resource-1', nomination_fee: 1200 },
      error: null,
    });
    const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
    const insert = jest.fn().mockReturnValue({ select: insertSelect });
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return { insert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: VALID_CLINIC_ID,
        name: '田中先生',
        type: 'staff',
        maxConcurrent: 1,
        nominationFee: 1200,
        isActive: true,
      },
      auth: { id: 'user-1' },
      supabase,
    });

    const { POST } = await import('@/app/api/resources/route');
    const response = await POST(
      new NextRequest('http://localhost/api/resources')
    );

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nomination_fee: 1200,
      })
    );
  });
});

describe('PATCH /api/resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nominationFee を nomination_fee として更新する', async () => {
    const updateSingle = jest.fn().mockResolvedValue({
      data: { id: 'resource-1', nomination_fee: 1800 },
      error: null,
    });
    const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
    const updateEqClinic = jest.fn().mockReturnValue({ select: updateSelect });
    const updateEqId = jest.fn().mockReturnValue({ eq: updateEqClinic });
    const update = jest.fn().mockReturnValue({ eq: updateEqId });
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return { update };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: VALID_CLINIC_ID,
        id: '123e4567-e89b-12d3-a456-426614174010',
        nominationFee: 1800,
      },
      auth: { id: 'user-1' },
      supabase,
    });

    const { PATCH } = await import('@/app/api/resources/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/resources')
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        nomination_fee: 1800,
      })
    );
  });
});

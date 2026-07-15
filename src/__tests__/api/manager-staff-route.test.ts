import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerStaffListResponse } from '@/types/manager-staff-list';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (error: string, status = 500) =>
    Response.json({ success: false, error }, { status }),
  createSuccessResponse: <T>(data: T, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsMock = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

type ApiSuccessPayload = {
  success: true;
  data: ManagerStaffListResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

type StaffRow = {
  id: string;
  name: string;
  clinic_id: string;
  is_active: boolean | null;
  is_deleted: boolean | null;
  is_bookable: boolean | null;
  type: string;
};

class ResourceQueryMock {
  private rows: StaffRow[];

  constructor(rows: readonly StaffRow[]) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  in(column: string, values: string[]) {
    if (column === 'clinic_id') {
      this.rows = this.rows.filter(row => values.includes(row.clinic_id));
    }
    return this;
  }

  eq(column: string, value: string | boolean) {
    this.rows = this.rows.filter(row => {
      if (column === 'type') return row.type === value;
      if (column === 'is_deleted') return row.is_deleted === value;
      return true;
    });
    return this;
  }

  order() {
    return this;
  }

  range(from: number, to: number) {
    this.rows = this.rows.slice(from, to + 1);
    return this;
  }

  returns<T>() {
    return Promise.resolve({ data: this.rows as T, error: null });
  }
}

function isSuccessPayload(value: unknown): value is ApiSuccessPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
  );
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false &&
    'error' in value
  );
}

function mockAuth(role = 'manager') {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'manager-user',
      email: 'manager@example.com',
      role,
    },
    permissions: {
      role,
      clinic_id: clinicB,
      clinic_scope_ids: [clinicB],
    },
    supabase: { from: jest.fn() },
  });
}

function mockAdminClient(rows: readonly StaffRow[]) {
  createAdminClientMock.mockReturnValue({
    from: () => new ResourceQueryMock(rows),
  });
}

async function getStaff(path = '/api/manager/staff') {
  const { GET } = await import('@/app/api/manager/staff/route');
  return await GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/manager/staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    mockAdminClient([
      {
        id: 'staff-a',
        name: '佐藤 太郎',
        clinic_id: clinicA,
        is_active: true,
        is_deleted: false,
        is_bookable: true,
        type: 'staff',
      },
      {
        id: 'staff-b',
        name: '担当外 花子',
        clinic_id: clinicB,
        is_active: true,
        is_deleted: false,
        is_bookable: true,
        type: 'staff',
      },
    ]);
  });

  it('returns 401 for unauthenticated requests', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      ),
    });

    const response = await getStaff();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users', async () => {
    mockAuth('clinic_admin');

    const response = await getStaff();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns staff resources for assigned clinics only', async () => {
    const response = await getStaff();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.clinics).toEqual([{ id: clinicA, name: '池袋院' }]);
    expect(json.data.staff).toEqual([
      {
        staffId: 'staff-a',
        staffName: '佐藤 太郎',
        clinicId: clinicA,
        clinicName: '池袋院',
        isActive: true,
        isBookable: true,
      },
    ]);
  });

  it('keeps all assigned clinics in response when filtering by clinic_id', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'assignment-b',
        manager_user_id: 'manager-user',
        clinic_id: clinicB,
        clinic_name: '横浜院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);

    const response = await getStaff(`/api/manager/staff?clinic_id=${clinicA}`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    // 院フィルター select の選択肢を維持するため、clinics は常に全担当院を返す
    expect(json.data.clinics).toEqual([
      { id: clinicA, name: '池袋院' },
      { id: clinicB, name: '横浜院' },
    ]);
    expect(json.data.staff.map(row => row.clinicId)).toEqual([clinicA]);
  });

  it('returns 403 for unassigned clinic_id', async () => {
    const response = await getStaff(`/api/manager/staff?clinic_id=${clinicB}`);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
  });

  it('returns empty staff when manager has no assignments without fallback scope', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);

    const response = await getStaff();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.clinics).toEqual([]);
    expect(json.data.staff).toEqual([]);
  });

  it('aggregates all rows beyond the PostgREST 1000-row page limit', async () => {
    mockAdminClient(
      Array.from({ length: 1001 }, (_, index) => ({
        id: `staff-${index}`,
        name: `スタッフ ${index}`,
        clinic_id: clinicA,
        is_active: true,
        is_deleted: false,
        is_bookable: null,
        type: 'staff',
      }))
    );

    const response = await getStaff();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.staff).toHaveLength(1001);
  });
});

import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerRostersResponse } from '@/types/manager-rosters';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (error: string, status = 500) =>
    Response.json({ success: false, error }, { status }),
  createSuccessResponse: <T>(data: T, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsMock = jest.mocked(
  resolveManagerAssignedClinics
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

type ApiSuccessPayload = {
  success: true;
  data: ManagerRostersResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

type RosterRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  resources: {
    id: string;
    name: string;
    clinic_id: string;
    type: string;
  } | null;
  clinics: {
    id: string;
    name: string;
  } | null;
};

class StaffShiftsRosterQueryMock {
  private rows: RosterRow[];

  constructor(rows: readonly RosterRow[]) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  eq(column: string, value: string) {
    this.rows = this.rows.filter(row => {
      if (column === 'clinic_id') return row.clinic_id === value;
      if (column === 'status') return row.status === value;
      return true;
    });
    return this;
  }

  gte(column: string, value: string) {
    if (column === 'start_time') {
      this.rows = this.rows.filter(row => row.start_time >= value);
    }
    return this;
  }

  lte(column: string, value: string) {
    if (column === 'start_time') {
      this.rows = this.rows.filter(row => row.start_time <= value);
    }
    return this;
  }

  order() {
    this.rows = [...this.rows].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
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
      clinic_id: null,
      clinic_scope_ids: [clinicA],
    },
    supabase: { from: jest.fn() },
  });
}

function mockAdminClient(rows: readonly RosterRow[]) {
  createAdminClientMock.mockReturnValue({
    from: (table: string) => {
      if (table !== 'staff_shifts') {
        throw new Error(`unexpected table: ${table}`);
      }
      return new StaffShiftsRosterQueryMock(rows);
    },
  });
}

async function getRosters(path: string) {
  const { GET } = await import('@/app/api/manager/rosters/route');
  return await GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/manager/rosters', () => {
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
        id: 'shift-a',
        clinic_id: clinicA,
        staff_id: 'staff-a',
        start_time: '2026-07-01T01:45:00.000Z',
        end_time: '2026-07-01T13:30:00.000Z',
        status: 'confirmed',
        notes: '終日',
        resources: {
          id: 'staff-a',
          name: '佐藤 太郎',
          clinic_id: clinicA,
          type: 'staff',
        },
        clinics: { id: clinicA, name: '池袋院' },
      },
      {
        id: 'shift-draft',
        clinic_id: clinicA,
        staff_id: 'staff-b',
        start_time: '2026-07-01T06:00:00.000Z',
        end_time: '2026-07-01T13:30:00.000Z',
        status: 'draft',
        notes: null,
        resources: {
          id: 'staff-b',
          name: '下書き 花子',
          clinic_id: clinicA,
          type: 'staff',
        },
        clinics: { id: clinicA, name: '池袋院' },
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

    const response = await getRosters(
      `/api/manager/rosters?clinic_id=${clinicA}&start=2026-07-01&end=2026-07-02`
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users', async () => {
    mockAuth('clinic_admin');

    const response = await getRosters(
      `/api/manager/rosters?clinic_id=${clinicA}&start=2026-07-01&end=2026-07-02`
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('groups confirmed staff shifts by date for an assigned clinic', async () => {
    const response = await getRosters(
      `/api/manager/rosters?clinic_id=${clinicA}&start=2026-07-01&end=2026-07-02`
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.clinics).toEqual([{ id: clinicA, name: '池袋院' }]);
    expect(json.data.days).toHaveLength(2);
    expect(json.data.days[0]).toMatchObject({
      date: '2026-07-01',
      shifts: [
        {
          shift_id: 'shift-a',
          staff_id: 'staff-a',
          staff_profile_id: null,
          staff_name: '佐藤 太郎',
          work_clinic_id: clinicA,
          work_clinic_name: '池袋院',
          assignment_type: 'regular',
          time_preset: null,
          status: 'confirmed',
          notes: '終日',
        },
      ],
    });
    expect(json.data.days[1]).toEqual({
      date: '2026-07-02',
      shifts: [],
    });
    expect(json.data.totalShifts).toBe(1);
  });

  it('returns 403 for unassigned clinic_id', async () => {
    const response = await getRosters(
      `/api/manager/rosters?clinic_id=${clinicB}&start=2026-07-01&end=2026-07-02`
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
  });

  it('validates date range length', async () => {
    const response = await getRosters(
      `/api/manager/rosters?clinic_id=${clinicA}&start=2026-07-01&end=2026-11-01`
    );

    expect(response.status).toBe(400);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});

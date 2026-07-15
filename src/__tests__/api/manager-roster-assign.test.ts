import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerRosterAssignResponse } from '@/types/manager-rosters';

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
const resolveManagerAssignedClinicsWithinScopeMock = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
const staffA = '33333333-3333-4333-8333-333333333333';

type ApiSuccessPayload = {
  success: true;
  data: ManagerRosterAssignResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

type StaffResourceRow = {
  id: string;
  name: string;
  clinic_id: string;
  type: string;
  is_deleted: boolean | null;
};

type ShiftRequestRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  request_type: string;
  status: string;
};

type ExistingShiftRow = {
  id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
};

type InsertedShiftRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

type InsertPayload = {
  clinic_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string | null;
  created_by?: string | null;
};

class TableQueryMock {
  private staffRows: StaffResourceRow[];
  private requestRows: ShiftRequestRow[];
  private shiftRows: ExistingShiftRow[];
  private inserted: InsertPayload | null = null;

  constructor(
    staffRows: readonly StaffResourceRow[],
    requestRows: readonly ShiftRequestRow[],
    shiftRows: readonly ExistingShiftRow[]
  ) {
    this.staffRows = [...staffRows];
    this.requestRows = [...requestRows];
    this.shiftRows = [...shiftRows];
  }

  select() {
    return this;
  }

  eq(column: string, value: string | boolean) {
    this.staffRows = this.staffRows.filter(row => {
      if (column === 'id') return row.id === value;
      if (column === 'clinic_id') return row.clinic_id === value;
      if (column === 'type') return row.type === value;
      if (column === 'is_deleted') return row.is_deleted === value;
      return true;
    });
    this.requestRows = this.requestRows.filter(row => {
      if (column === 'id') return row.id === value;
      if (column === 'clinic_id') return row.clinic_id === value;
      if (column === 'staff_id') return row.staff_id === value;
      return true;
    });
    this.shiftRows = this.shiftRows.filter(row => {
      if (column === 'staff_id') return row.staff_id === value;
      return true;
    });
    return this;
  }

  neq(column: string, value: string) {
    if (column === 'status') {
      this.shiftRows = this.shiftRows.filter(row => row.status !== value);
    }
    return this;
  }

  in(column: string, values: readonly string[]) {
    if (column === 'status') {
      this.requestRows = this.requestRows.filter(row =>
        values.includes(row.status)
      );
    }
    if (column === 'request_type') {
      this.requestRows = this.requestRows.filter(row =>
        values.includes(row.request_type)
      );
    }
    return this;
  }

  lt(column: string, value: string) {
    if (column === 'start_time') {
      this.shiftRows = this.shiftRows.filter(row => row.start_time < value);
    }
    return this;
  }

  gt(column: string, value: string) {
    if (column === 'end_time') {
      this.shiftRows = this.shiftRows.filter(row => row.end_time > value);
    }
    return this;
  }

  limit() {
    return this;
  }

  insert(payload: InsertPayload) {
    this.inserted = payload;
    return this;
  }

  maybeSingle<T>() {
    const row = this.staffRows[0] ?? this.requestRows[0] ?? null;
    return Promise.resolve({ data: row as T | null, error: null });
  }

  returns<T>() {
    return Promise.resolve({ data: this.shiftRows as T, error: null });
  }

  single<T>() {
    if (!this.inserted) {
      return Promise.resolve({ data: null as T | null, error: null });
    }
    const inserted: InsertedShiftRow = {
      id: 'shift-created',
      clinic_id: this.inserted.clinic_id,
      staff_id: this.inserted.staff_id,
      start_time: this.inserted.start_time,
      end_time: this.inserted.end_time,
      status: this.inserted.status,
      notes: this.inserted.notes ?? null,
    };
    return Promise.resolve({ data: inserted as T, error: null });
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

function mockAdminClient(options: {
  staffRows?: readonly StaffResourceRow[];
  requestRows?: readonly ShiftRequestRow[];
  shiftRows?: readonly ExistingShiftRow[];
}) {
  const staffRows = options.staffRows ?? [
    {
      id: staffA,
      name: '佐藤 太郎',
      clinic_id: clinicA,
      type: 'staff',
      is_deleted: false,
    },
  ];
  const requestRows = options.requestRows ?? [];
  const shiftRows = options.shiftRows ?? [];

  createAdminClientMock.mockReturnValue({
    from: () => new TableQueryMock(staffRows, requestRows, shiftRows),
  });
}

async function postAssign(body: object) {
  const { POST } = await import('@/app/api/manager/rosters/assign/route');
  return await POST(
    new NextRequest('http://localhost/api/manager/rosters/assign', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('POST /api/manager/rosters/assign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    resolveManagerAssignedClinicsWithinScopeMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    mockAdminClient({});
  });

  it('creates a confirmed same-clinic staff shift', async () => {
    const response = await postAssign({
      clinic_id: clinicA,
      staff_id: staffA,
      time_preset: 'afternoon',
      start_time: '2026-07-01T06:00:00.000Z',
      end_time: '2026-07-01T13:30:00.000Z',
      notes: '午後出勤',
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.shift).toMatchObject({
      shift_id: 'shift-created',
      staff_id: staffA,
      staff_name: '佐藤 太郎',
      work_clinic_id: clinicA,
      work_clinic_name: '池袋院',
      assignment_type: 'regular',
      time_preset: 'afternoon',
      status: 'confirmed',
      notes: '午後出勤',
    });
  });

  it('returns 403 for an unassigned clinic', async () => {
    const response = await postAssign({
      clinic_id: clinicB,
      staff_id: staffA,
      time_preset: 'afternoon',
      start_time: '2026-07-01T06:00:00.000Z',
      end_time: '2026-07-01T13:30:00.000Z',
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
  });

  it('returns 409 when the staff member already has an overlapping shift', async () => {
    mockAdminClient({
      shiftRows: [
        {
          id: 'shift-existing',
          staff_id: staffA,
          start_time: '2026-07-01T05:00:00.000Z',
          end_time: '2026-07-01T08:00:00.000Z',
          status: 'confirmed',
        },
      ],
    });

    const response = await postAssign({
      clinic_id: clinicA,
      staff_id: staffA,
      time_preset: 'afternoon',
      start_time: '2026-07-01T06:00:00.000Z',
      end_time: '2026-07-01T13:30:00.000Z',
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(isErrorPayload(json)).toBe(true);
  });

  it('returns an information-free 503 before writes when assignment authority lookup fails', async () => {
    resolveManagerAssignedClinicsWithinScopeMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
        'manager assignment table details',
        503
      )
    );

    const response = await postAssign({
      clinic_id: clinicA,
      staff_id: staffA,
      time_preset: 'afternoon',
      start_time: '2026-07-01T06:00:00.000Z',
      end_time: '2026-07-01T13:30:00.000Z',
    });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(JSON.stringify(json)).not.toContain('assignment');
  });
});

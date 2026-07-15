import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import {
  hashCalendarFeedToken,
  type CalendarFeedTokenRow,
  type CalendarIcsShiftRow,
} from '@/lib/calendar-feed';

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const createAdminClientMock = jest.mocked(createAdminClient);
const selectedColumns: string[] = [];

const activeToken: CalendarFeedTokenRow = {
  id: 'token-a',
  clinic_id: 'clinic-a',
  staff_profile_id: 'profile-a',
  feed_type: 'staff',
  token_hash: hashCalendarFeedToken('raw-token'),
  label: '個人シフト',
  is_active: true,
  created_by: 'user-a',
  created_at: '2026-06-26T00:00:00.000Z',
  revoked_at: null,
};

const shift: CalendarIcsShiftRow = {
  id: 'shift-a',
  clinic_id: 'clinic-a',
  staff_id: 'staff-a',
  staff_profile_id: 'profile-a',
  home_clinic_id: 'clinic-home',
  assignment_type: 'help',
  time_preset: 'afternoon',
  start_time: '2026-07-01T06:00:00.000Z',
  end_time: '2026-07-01T13:30:00.000Z',
  status: 'confirmed',
  resources: { id: 'staff-a', name: '佐藤 太郎', clinic_id: 'clinic-home' },
  clinics: { id: 'clinic-a', name: '道玄坂院' },
};

const otherClinicShift: CalendarIcsShiftRow = {
  ...shift,
  id: 'shift-b',
  clinic_id: 'clinic-b',
  assignment_type: 'help',
  clinics: { id: 'clinic-b', name: '池袋院' },
};

type CalendarFeedQueryOptions = {
  tokenRows: readonly CalendarFeedTokenRow[];
  shiftRows?: readonly CalendarIcsShiftRow[];
  staffProfileActive?: boolean;
  staffProfileUserId?: string | null;
  linkedProfileActive?: boolean | null;
  membershipType?: string | null;
  clinicActive?: boolean;
};

class CalendarFeedQueryMock {
  private readonly tableName: string;
  private readonly options: CalendarFeedQueryOptions;
  private tokenRows: CalendarFeedTokenRow[];
  private shiftRows: CalendarIcsShiftRow[];
  private excludedMembershipType: string | null = null;

  constructor(tableName: string, options: CalendarFeedQueryOptions) {
    this.tableName = tableName;
    this.options = options;
    this.tokenRows = [...options.tokenRows];
    this.shiftRows = [...(options.shiftRows ?? [])];
  }

  select(columns: string) {
    selectedColumns.push(columns);
    return this;
  }

  neq(column: string, value: string) {
    if (column === 'membership_type') {
      this.excludedMembershipType = value;
    }
    return this;
  }

  eq(column: string, value: string) {
    this.tokenRows = this.tokenRows.filter(row => {
      if (column === 'token_hash') return row.token_hash === value;
      if (column === 'feed_type') return row.feed_type === value;
      return true;
    });
    this.shiftRows = this.shiftRows.filter(row => {
      if (column === 'staff_profile_id') return row.staff_profile_id === value;
      if (column === 'clinic_id') return row.clinic_id === value;
      if (column === 'status') return row.status === value;
      return true;
    });
    return this;
  }

  gte() {
    return this;
  }

  lte() {
    return this;
  }

  order() {
    return this;
  }

  maybeSingle<T>() {
    const staffProfileUserId =
      this.options.staffProfileUserId === undefined
        ? 'user-a'
        : this.options.staffProfileUserId;
    const membershipType = this.options.membershipType ?? 'home';
    let data: object | CalendarFeedTokenRow | null = null;

    if (this.tableName === 'calendar_feed_tokens') {
      data = this.tokenRows[0] ?? null;
    } else if (this.tableName === 'staff_profiles') {
      data = {
        id: 'profile-a',
        user_id: staffProfileUserId,
        is_active: this.options.staffProfileActive ?? true,
      };
    } else if (this.tableName === 'staff_clinic_memberships') {
      data =
        this.options.membershipType === null ||
        membershipType === this.excludedMembershipType
          ? null
          : {
              staff_profile_id: 'profile-a',
              clinic_id: 'clinic-a',
              membership_type: membershipType,
            };
    } else if (this.tableName === 'clinics') {
      data = {
        id: 'clinic-a',
        is_active: this.options.clinicActive ?? true,
      };
    } else if (this.tableName === 'profiles') {
      data =
        this.options.linkedProfileActive === null
          ? null
          : {
              user_id: staffProfileUserId,
              is_active: this.options.linkedProfileActive ?? true,
            };
    }

    return Promise.resolve({
      data: data as T | null,
      error: null,
    });
  }

  returns<T>() {
    return Promise.resolve({ data: this.shiftRows as T, error: null });
  }
}

function mockAdminClient(options: CalendarFeedQueryOptions) {
  createAdminClientMock.mockReturnValue({
    from: (tableName: string) => new CalendarFeedQueryMock(tableName, options),
  });
}

describe('GET /api/calendar/staff/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectedColumns.length = 0;
  });

  it('returns staff confirmed shifts as an ICS feed', async () => {
    mockAdminClient({
      tokenRows: [activeToken],
      shiftRows: [shift, otherClinicShift],
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/calendar');
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('SUMMARY:ヘルプ勤務：道玄坂院');
    expect(text).not.toContain('池袋院');
    expect(selectedColumns.join('\n')).not.toContain('notes');
  });

  it('returns 404 for legacy unscoped staff tokens', async () => {
    mockAdminClient({
      tokenRows: [
        {
          ...activeToken,
          clinic_id: null,
        },
      ],
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 for revoked tokens', async () => {
    mockAdminClient({
      tokenRows: [
        {
          ...activeToken,
          is_active: false,
          revoked_at: '2026-06-27T00:00:00.000Z',
        },
      ],
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 after the staff profile is deactivated', async () => {
    mockAdminClient({
      tokenRows: [activeToken],
      staffProfileActive: false,
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 after the linked application profile is deactivated', async () => {
    mockAdminClient({
      tokenRows: [activeToken],
      linkedProfileActive: false,
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 after the clinic membership is blocked', async () => {
    mockAdminClient({
      tokenRows: [activeToken],
      membershipType: 'blocked',
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 after the target clinic is deactivated', async () => {
    mockAdminClient({
      tokenRows: [activeToken],
      clinicActive: false,
    });
    const { GET } = await import('@/app/api/calendar/staff/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/staff/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });
});

describe('GET /api/calendar/clinic/[token]', () => {
  const clinicToken: CalendarFeedTokenRow = {
    ...activeToken,
    staff_profile_id: null,
    feed_type: 'clinic',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    selectedColumns.length = 0;
  });

  it('returns confirmed shifts while the clinic is active', async () => {
    mockAdminClient({
      tokenRows: [clinicToken],
      shiftRows: [shift, otherClinicShift],
    });
    const { GET } = await import('@/app/api/calendar/clinic/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/clinic/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('UID:shift-a@tiramisu-roster');
    expect(text).not.toContain('UID:shift-b@tiramisu-roster');
    expect(selectedColumns.join('\n')).not.toContain('notes');
  });

  it('returns 404 after the clinic is deactivated', async () => {
    mockAdminClient({
      tokenRows: [clinicToken],
      clinicActive: false,
    });
    const { GET } = await import('@/app/api/calendar/clinic/[token]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/calendar/clinic/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(404);
  });
});

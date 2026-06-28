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

const activeToken: CalendarFeedTokenRow = {
  id: 'token-a',
  clinic_id: null,
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
  notes: null,
  resources: { id: 'staff-a', name: '佐藤 太郎', clinic_id: 'clinic-home' },
  clinics: { id: 'clinic-a', name: '道玄坂院' },
};

class CalendarFeedQueryMock {
  private tokenRows: CalendarFeedTokenRow[];
  private shiftRows: CalendarIcsShiftRow[];

  constructor(
    tokenRows: readonly CalendarFeedTokenRow[],
    shiftRows: readonly CalendarIcsShiftRow[]
  ) {
    this.tokenRows = [...tokenRows];
    this.shiftRows = [...shiftRows];
  }

  select() {
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
    return Promise.resolve({
      data: (this.tokenRows[0] ?? null) as T | null,
      error: null,
    });
  }

  returns<T>() {
    return Promise.resolve({ data: this.shiftRows as T, error: null });
  }
}

function mockAdminClient(options: {
  tokenRows: readonly CalendarFeedTokenRow[];
  shiftRows?: readonly CalendarIcsShiftRow[];
}) {
  createAdminClientMock.mockReturnValue({
    from: () =>
      new CalendarFeedQueryMock(options.tokenRows, options.shiftRows ?? []),
  });
}

describe('GET /api/calendar/staff/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns staff confirmed shifts as an ICS feed', async () => {
    mockAdminClient({ tokenRows: [activeToken], shiftRows: [shift] });
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
});

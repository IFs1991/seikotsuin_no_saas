import { NextRequest } from 'next/server';
import { GET } from '@/app/api/public/availability/route';
import { availabilityQuerySchema } from '@/app/api/public/schema';
import {
  isJSTDateString,
  parseJSTDateStart,
  addJSTCalendarDays,
  toJSTDateString,
  getJSTWeekdayKey,
  jstDateTimeToDate,
} from '@/lib/jst';

const mockContext = jest.fn();
jest.mock('@/lib/supabase/scoped-admin', () => ({
  ...jest.requireActual<typeof import('@/lib/supabase/scoped-admin')>(
    '@/lib/supabase/scoped-admin'
  ),
  createPublicClinicContext: (...args: unknown[]) => mockContext(...args),
}));
const clinic = '00000000-0000-0000-0000-000000000101';
const menu = '00000000-0000-0000-0000-000000000201';
function query(date: string) {
  return {
    clinic_id: clinic,
    menu_id: menu,
    resource_id: 'any',
    date_from: date,
    date_to: date,
  };
}

describe('AUDIT-V2 V06 calendar dates at the public availability boundary', () => {
  beforeEach(() => {
    mockContext
      .mockReset()
      .mockRejectedValue(new Error('Must validate before data access'));
  });

  it.each([
    '2025-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '0000-01-01',
  ])(
    'rejects nonexistent date %s without rolling into another month',
    async date => {
      expect(isJSTDateString(date)).toBe(false);
      expect(() => parseJSTDateStart(date)).toThrow();
      expect(() => getJSTWeekdayKey(date)).toThrow();
      expect(() => jstDateTimeToDate(date, '10:30')).toThrow();
      expect(availabilityQuerySchema.safeParse(query(date)).success).toBe(
        false
      );
    }
  );

  it.each(['2026-02-30', '2025-02-29', '2026-13-01'])(
    'rejects invalid API date %s before data access',
    async date => {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/public/availability?${new URLSearchParams(query(date))}`
        )
      );
      expect(response.status).toBe(400);
      expect(mockContext).not.toHaveBeenCalled();
    }
  );

  it.each(['2024-02-29', '2026-04-30', '2026-12-31', '0099-12-31'])(
    'preserves valid date %s through JST parsing',
    date => {
      expect(isJSTDateString(date)).toBe(true);
      expect(availabilityQuerySchema.safeParse(query(date)).success).toBe(true);
      expect(toJSTDateString(parseJSTDateStart(date))).toBe(date);
      expect(toJSTDateString(jstDateTimeToDate(date, '23:59'))).toBe(date);
    }
  );

  it('keeps leap-day, month-end and JST midnight arithmetic', () => {
    expect(getJSTWeekdayKey('2026-09-09')).toBe('wednesday');
    expect(addJSTCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addJSTCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addJSTCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(parseJSTDateStart('2026-09-09').toISOString()).toBe(
      '2026-09-08T15:00:00.000Z'
    );
    expect(toJSTDateString(new Date('2026-09-08T14:59:59.999Z'))).toBe(
      '2026-09-08'
    );
  });
});

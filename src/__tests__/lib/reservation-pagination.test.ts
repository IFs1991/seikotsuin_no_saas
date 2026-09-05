import {
  buildReservationPagination,
  decodeReservationCursor,
  encodeReservationCursor,
  matchesReservationCursor,
  reservationCursorFilter,
  type ReservationCursorContext,
} from '@/lib/reservations/pagination';
import { reservationsQuerySchema } from '@/app/api/reservations/schema';

const clinic = '11111111-1111-4111-8111-111111111111';
const patient = '22222222-2222-4222-8222-222222222222';
const context: ReservationCursorContext = {
  clinicId: clinic,
  startDate: null,
  endDate: null,
  staffId: null,
  customerId: patient,
  order: 'asc',
};
const id = (index: number) =>
  `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`;

describe('reservation pagination contract', () => {
  it.each([0, 1, 999, 1000, 1001, 1550])(
    'traverses %i tied-time rows in both orders under a Data API cap below the requested limit',
    size => {
      const fixture = Array.from({ length: size }, (_, index) => ({
        id: id(index),
        start_time: '2026-09-05T01:00:00.123456+00:00',
      }));
      for (const order of ['asc', 'desc'] as const) {
        const expected = order === 'asc' ? fixture : [...fixture].reverse();
        const received: string[] = [];
        let remaining = expected;
        do {
          // Upstream is limited to 73 even though caller requested 100.
          const rows = remaining.slice(0, 73);
          const page = buildReservationPagination(rows, remaining.length, {
            ...context,
            order,
          });
          received.push(...rows.map(row => row.id));
          if (!page.has_more) break;
          const cursor = decodeReservationCursor(page.next_cursor ?? '');
          expect(cursor).not.toBeNull();
          if (!cursor) throw new Error('Expected valid cursor');
          expect(cursor.startTime).toBe('2026-09-05T01:00:00.123456+00:00');
          remaining = expected.filter(row =>
            order === 'asc' ? row.id > cursor.id : row.id < cursor.id
          );
        } while (remaining.length > 0);
        expect(received).toEqual(expected.map(row => row.id));
        expect(new Set(received).size).toBe(size);
      }
    }
  );

  it('binds every filter and preserves precise, validated query positions', () => {
    const cursor = {
      ...context,
      version: 1 as const,
      startTime: '2026-09-05T14:59:59.999999Z',
      id: id(1),
    };
    expect(decodeReservationCursor(encodeReservationCursor(cursor))).toEqual(
      cursor
    );
    expect(reservationCursorFilter(cursor)).toContain(
      'start_time.eq.2026-09-05T14:59:59.999999Z'
    );
    expect(matchesReservationCursor(cursor, context)).toBe(true);
    for (const replacement of [
      { clinicId: patient },
      { customerId: clinic },
      { staffId: clinic },
      { order: 'desc' as const },
      { startDate: '2026-09-01T00:00:00Z' },
      { endDate: '2026-09-30T00:00:00Z' },
    ])
      expect(
        matchesReservationCursor(cursor, { ...context, ...replacement })
      ).toBe(false);
    for (const invalid of [
      '',
      'not-json',
      'x'.repeat(2049),
      Buffer.from(
        JSON.stringify({ ...cursor, startTime: 'x),clinic_id.neq.y' })
      ).toString('base64url'),
    ]) {
      expect(decodeReservationCursor(invalid)).toBeNull();
    }
  });

  it.each([null, -1, NaN, Infinity])('rejects unusable count %s', count => {
    expect(() => buildReservationPagination([], count, context)).toThrow();
  });
  it('fails when matching data cannot make cursor progress', () => {
    expect(() => buildReservationPagination([], 10, context)).toThrow();
  });

  it('accepts a six-week inclusive window across JST month boundaries and retains single lookup', () => {
    expect(
      reservationsQuerySchema.safeParse({ clinic_id: clinic, id: id(1) })
        .success
    ).toBe(true);
    expect(
      reservationsQuerySchema.safeParse({
        clinic_id: clinic,
        start_date: '2026-08-30T15:00:00.000Z',
        end_date: '2026-10-11T14:59:59.999Z',
      }).success
    ).toBe(true);
  });
  it.each([
    {},
    { staff_id: patient },
    { start_date: '2026-09-05T00:00:00Z' },
    { start_date: 'invalid', end_date: '2026-09-05T00:00:00Z' },
    { start_date: '2026-09-06T00:00:00Z', end_date: '2026-09-05T00:00:00Z' },
    { start_date: '2026-09-01T00:00:00Z', end_date: '2026-10-13T00:00:00Z' },
    { customer_id: patient, limit: 0 },
    { customer_id: patient, limit: 201 },
    { customer_id: patient, limit: 'abc' },
    { customer_id: patient, limit: 1.5 },
  ])('rejects invalid or unbounded filter %j', query => {
    expect(
      reservationsQuerySchema.safeParse({ clinic_id: clinic, ...query }).success
    ).toBe(false);
  });
});

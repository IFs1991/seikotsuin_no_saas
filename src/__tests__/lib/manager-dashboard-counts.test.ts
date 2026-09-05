import { fetchManagerDashboardCounts } from '@/lib/manager-dashboard-counts';

const clinic = '11111111-1111-4111-8111-111111111111';
const today = '2026-09-05';
const previousWeekday = '2026-08-29';

function createClient(
  total: number,
  failure: 'error' | 'missing' | null = null
) {
  const calls: {
    table: string;
    filters: [string, unknown][];
    head: boolean;
  }[] = [];
  const from = jest.fn((table: string) => {
    const call = { table, filters: [] as [string, unknown][], head: false };
    calls.push(call);
    const query = {
      select: jest.fn(
        (_columns: string, options: { head: boolean; count: string }) => {
          call.head = options.head && options.count === 'exact';
          return query;
        }
      ),
      eq: jest.fn((key: string, value: string) => {
        call.filters.push([key, value]);
        return query;
      }),
      in: jest.fn((key: string, value: string[]) => {
        call.filters.push([key, value]);
        return query;
      }),
      gte: jest.fn((key: string, value: string) => {
        call.filters.push([key, value]);
        return query;
      }),
      lt: jest.fn((key: string, value: string) => {
        call.filters.push([key, value]);
        return query;
      }),
      or: jest.fn((value: string) => {
        call.filters.push(['or', value]);
        return query;
      }),
      returns: jest.fn(async () => ({
        data: null,
        count: failure === 'missing' ? null : total,
        error: failure === 'error' ? new Error('database failure') : null,
      })),
    };
    return query;
  });
  return { client: { from }, calls };
}

describe('TASK-02A scoped DB counts', () => {
  it.each([0, 999, 1000, 1001, 1200])(
    'keeps exact counts above Data API row caps: %i',
    async total => {
      const { client, calls } = createClient(total);
      const result = await fetchManagerDashboardCounts(client, [clinic], {
        today,
        previousWeekday,
      });
      expect(result).toEqual([
        {
          clinicId: clinic,
          todayActive: total,
          todayCancelled: total,
          previousActive: total,
          reviewCount: total,
        },
      ]);
      expect(calls).toHaveLength(4);
      expect(
        calls.every(
          call =>
            call.head &&
            call.filters.some(
              ([key, value]) => key === 'clinic_id' && value === clinic
            )
        )
      ).toBe(true);
      const reservations = calls.filter(
        call => call.table === 'reservation_list_view'
      );
      expect(reservations).toHaveLength(3);
      expect(reservations[0].filters).toContainEqual([
        'or',
        'status.is.null,status.not.in.(cancelled,no_show,noshow)',
      ]);
      expect(reservations[1].filters).toContainEqual([
        'status',
        ['cancelled', 'no_show', 'noshow'],
      ]);
      expect(reservations[2].filters).toContainEqual([
        'start_time',
        '2026-08-28T15:00:00.000Z',
      ]);
      expect(reservations[2].filters).toContainEqual([
        'start_time',
        '2026-08-29T15:00:00.000Z',
      ]);
      const review = calls.find(call => call.table === 'daily_report_items');
      expect(review?.filters).toContainEqual([
        'estimate_status',
        ['needs_review', 'draft', 'rejected', 'blocked'],
      ]);
      expect(reservations[0].filters).toContainEqual([
        'start_time',
        '2026-09-04T15:00:00.000Z',
      ]);
      expect(reservations[0].filters).toContainEqual([
        'start_time',
        '2026-09-05T15:00:00.000Z',
      ]);
    }
  );
  it.each(['error', 'missing'] as const)(
    'does not turn %s into zero',
    async failure => {
      const { client } = createClient(0, failure);
      await expect(
        fetchManagerDashboardCounts(client, [clinic], {
          today,
          previousWeekday,
        })
      ).rejects.toThrow();
    }
  );
  it('does not query on empty scope', async () => {
    const { client } = createClient(1200);
    expect(
      await fetchManagerDashboardCounts(client, [], { today, previousWeekday })
    ).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
  it('keeps 50-clinic scope explicit on every count', async () => {
    const clinics = Array.from({ length: 50 }, (_, index) => `clinic-${index}`);
    const { client, calls } = createClient(60);
    const result = await fetchManagerDashboardCounts(client, clinics, {
      today,
      previousWeekday,
    });
    expect(result.reduce((sum, item) => sum + item.todayActive, 0)).toBe(3000);
    expect(calls).toHaveLength(200);
    expect(
      calls.every(call =>
        call.filters.some(
          ([key, value]) =>
            key === 'clinic_id' &&
            typeof value === 'string' &&
            clinics.includes(value)
        )
      )
    ).toBe(true);
  });
});

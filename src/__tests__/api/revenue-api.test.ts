import { NextRequest } from 'next/server';
import { GET } from '@/app/api/revenue/route';
import { ensureClinicAccess } from '@/lib/supabase/guards';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';

function createResolvedRangeQuery<TData>(data: TData) {
  const result = Promise.resolve({ data, error: null });

  return {
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    then: result.then.bind(result),
  };
}

describe('GET /api/revenue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aggregates revenue from daily reports and menu ranking from report items', async () => {
    const currentReportsQuery = createResolvedRangeQuery([
      {
        report_date: '2026-05-01',
        total_patients: 2,
        total_revenue: 10000,
        insurance_revenue: 7000,
        private_revenue: 3000,
      },
      {
        report_date: '2026-05-07',
        total_patients: 4,
        total_revenue: 20000,
        insurance_revenue: 10000,
        private_revenue: 10000,
      },
      {
        report_date: '2026-05-08',
        total_patients: 3,
        total_revenue: 15000,
        insurance_revenue: 8000,
        private_revenue: 7000,
      },
    ]);
    const reportItemsQuery = createResolvedRangeQuery([
      {
        menu_id: 'menu-1',
        treatment_name: '整体',
        fee: 5000,
      },
      {
        menu_id: 'menu-1',
        treatment_name: '整体',
        fee: 5000,
      },
      {
        menu_id: 'menu-2',
        treatment_name: '鍼灸',
        fee: 12000,
      },
    ]);
    const lastYearReportsQuery = createResolvedRangeQuery([
      { total_revenue: 30000 },
    ]);
    const dailyReportQueries = [currentReportsQuery, lastYearReportsQuery];
    const dailyReportsTable = {
      select: jest.fn(() => dailyReportQueries.shift() ?? lastYearReportsQuery),
    };
    const dailyReportItemsTable = {
      select: jest.fn(() => reportItemsQuery),
    };
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'daily_reports') {
          return dailyReportsTable;
        }
        if (table === 'daily_report_items') {
          return dailyReportItemsTable;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    ensureClinicAccessMock.mockResolvedValue({ supabase: client });

    const request = new NextRequest(
      `http://localhost/api/revenue?clinic_id=${clinicId}&start_date=2026-05-01&end_date=2026-05-08`
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/revenue',
      clinicId
    );
    expect(client.from).toHaveBeenCalledWith('daily_reports');
    expect(client.from).toHaveBeenCalledWith('daily_report_items');
    expect(client.from).not.toHaveBeenCalledWith('revenues');
    expect(currentReportsQuery.gte).toHaveBeenCalledWith(
      'report_date',
      '2026-05-01'
    );
    expect(currentReportsQuery.lte).toHaveBeenCalledWith(
      'report_date',
      '2026-05-08'
    );
    expect(json).toMatchObject({
      success: true,
      data: {
        dailyRevenue: 15000,
        weeklyRevenue: 35000,
        monthlyRevenue: 45000,
        insuranceRevenue: 25000,
        selfPayRevenue: 20000,
        growthRate: '50.0%',
        menuRanking: [
          {
            menu_id: 'menu-2',
            menu_name: '鍼灸',
            total_revenue: 12000,
            transaction_count: 1,
          },
          {
            menu_id: 'menu-1',
            menu_name: '整体',
            total_revenue: 10000,
            transaction_count: 2,
          },
        ],
        revenueTrends: [
          {
            date: '2026-05-01',
            total_revenue: 10000,
            insurance_revenue: 7000,
            private_revenue: 3000,
            transaction_count: 2,
          },
          {
            date: '2026-05-07',
            total_revenue: 20000,
            insurance_revenue: 10000,
            private_revenue: 10000,
            transaction_count: 4,
          },
          {
            date: '2026-05-08',
            total_revenue: 15000,
            insurance_revenue: 8000,
            private_revenue: 7000,
            transaction_count: 3,
          },
        ],
      },
    });
  });

  it('returns 400 when clinic_id is missing', async () => {
    const response = await GET(new NextRequest('http://localhost/api/revenue'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'clinic_id is required' });
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});

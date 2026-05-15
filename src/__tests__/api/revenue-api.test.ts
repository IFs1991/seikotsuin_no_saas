import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/revenue/route';
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
    const revenueContextSummaryQuery = createResolvedRangeQuery([
      {
        revenue_context_code: 'traffic_accident',
        revenue_context_name: '交通事故',
        rollup_category: 'traffic_accident',
        total_revenue: 9000,
        item_count: 2,
        needs_review_count: 1,
        blocked_count: 0,
      },
      {
        revenue_context_code: 'workers_comp',
        revenue_context_name: '労災',
        rollup_category: 'workers_comp',
        total_revenue: 4000,
        item_count: 1,
        needs_review_count: 1,
        blocked_count: 1,
      },
      {
        revenue_context_code: 'product',
        revenue_context_name: '物販',
        rollup_category: 'product',
        total_revenue: 3000,
        item_count: 1,
        needs_review_count: 0,
        blocked_count: 0,
      },
      {
        revenue_context_code: 'ticket',
        revenue_context_name: '回数券',
        rollup_category: 'ticket',
        total_revenue: 12000,
        item_count: 1,
        needs_review_count: 0,
        blocked_count: 0,
      },
    ]);
    const dailyReportQueries = [currentReportsQuery, lastYearReportsQuery];
    const dailyReportsTable = {
      select: jest.fn(() => dailyReportQueries.shift() ?? lastYearReportsQuery),
    };
    const dailyReportItemsTable = {
      select: jest.fn(() => reportItemsQuery),
    };
    const revenueContextSummaryView = {
      select: jest.fn(() => revenueContextSummaryQuery),
    };
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'daily_reports') {
          return dailyReportsTable;
        }
        if (table === 'daily_report_items') {
          return dailyReportItemsTable;
        }
        if (table === 'daily_report_revenue_context_summary') {
          return revenueContextSummaryView;
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
    expect(client.from).toHaveBeenCalledWith(
      'daily_report_revenue_context_summary'
    );
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
        revenueContextSummary: [
          {
            code: 'traffic_accident',
            name: '交通事故',
            rollupCategory: 'traffic_accident',
            totalRevenue: 9000,
            itemCount: 2,
            needsReviewCount: 1,
            blockedCount: 0,
          },
          {
            code: 'workers_comp',
            name: '労災',
            rollupCategory: 'workers_comp',
            totalRevenue: 4000,
            itemCount: 1,
            needsReviewCount: 1,
            blockedCount: 1,
          },
          {
            code: 'product',
            name: '物販',
            rollupCategory: 'product',
            totalRevenue: 3000,
            itemCount: 1,
            needsReviewCount: 0,
            blockedCount: 0,
          },
          {
            code: 'ticket',
            name: '回数券',
            rollupCategory: 'ticket',
            totalRevenue: 12000,
            itemCount: 1,
            needsReviewCount: 0,
            blockedCount: 0,
          },
        ],
        trafficAccidentRevenue: 9000,
        workersCompRevenue: 4000,
        productRevenue: 3000,
        ticketRevenue: 12000,
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

  it('returns 410 for deprecated revenue POST without touching the revenues table', async () => {
    const request = new NextRequest('http://localhost/api/revenue', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        amount: 1000,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(410);
    expect(json).toEqual({
      error:
        'POST /api/revenue is deprecated. Use /api/daily-reports/items instead.',
    });
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});

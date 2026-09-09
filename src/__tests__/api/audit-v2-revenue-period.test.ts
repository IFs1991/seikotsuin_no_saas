import { NextRequest } from 'next/server';
import { GET } from '@/app/api/revenue/route';
import {
  auditClinicId,
  auditRevenueUrl,
  periodRevenueSources,
  revenuePeriodResponse,
  revenueQueryClient,
} from '../fixtures/audit-v2-revenue';

let mockClient = revenueQueryClient({});
const mockAccess = jest.fn();
jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => {
    mockAccess(...args);
    return Promise.resolve({ supabase: mockClient });
  },
}));

async function getPeriod() {
  const response = await GET(new NextRequest(auditRevenueUrl));
  expect(response.status).toBe(200);
  return revenuePeriodResponse.parse(await response.json()).data;
}

describe('AUDIT-V2 F06 period totals in the real revenue route', () => {
  beforeEach(() => {
    mockAccess.mockReset();
    mockClient = revenueQueryClient(periodRevenueSources());
  });

  it('returns one row per role/code, adding 100 + 200 and both counts', async () => {
    const data = await getPeriod();
    expect(data.revenueBreakdownSummary).toEqual([
      {
        amountRole: 'private_revenue_estimated',
        estimatedAmount: 300,
        lineCount: 2,
      },
    ]);
    expect(data.privateRevenueEstimated).toBe(300);
    expect(data.revenueContextSummary).toEqual([
      {
        code: 'private',
        name: '自費',
        rollupCategory: 'private',
        totalRevenue: 300,
        itemCount: 2,
        needsReviewCount: 1,
        blockedCount: 1,
      },
    ]);
    expect(mockAccess).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET' }),
      '/api/revenue',
      auditClinicId
    );
  });

  it('keeps separate roles, signed adjustments, zeros and context counters', async () => {
    const sources = periodRevenueSources();
    const scope = { clinic_id: auditClinicId, report_date: '2026-09-01' };
    sources.daily_report_revenue_breakdown_summary.push(
      {
        ...scope,
        amount_role: 'adjustment',
        estimated_amount: -40,
        line_count: 1,
      },
      {
        ...scope,
        amount_role: 'adjustment',
        estimated_amount: 10,
        line_count: 1,
      },
      {
        ...scope,
        amount_role: 'patient_copay_estimated',
        estimated_amount: 0,
        line_count: 0,
      },
      { ...scope, amount_role: null, estimated_amount: 999, line_count: 1 }
    );
    sources.daily_report_revenue_context_summary.push(
      {
        ...scope,
        revenue_context_code: 'product',
        total_revenue: 0,
        item_count: 0,
        needs_review_count: 0,
        blocked_count: 0,
      },
      {
        ...scope,
        revenue_context_code: 'product',
        total_revenue: -30,
        item_count: 2,
        needs_review_count: 1,
        blocked_count: 2,
      },
      { ...scope, revenue_context_code: 'unknown', total_revenue: 999 },
      { ...scope, revenue_context_code: null, total_revenue: 999 }
    );
    mockClient = revenueQueryClient(sources);
    const data = await getPeriod();
    expect(data.revenueBreakdownSummary).toHaveLength(3);
    expect(data.revenueBreakdownSummary).toContainEqual({
      amountRole: 'adjustment',
      estimatedAmount: -30,
      lineCount: 2,
    });
    expect(data.revenueBreakdownSummary).toContainEqual({
      amountRole: 'patient_copay_estimated',
      estimatedAmount: 0,
      lineCount: 0,
    });
    expect(data.privateRevenueEstimated).toBe(300);
    expect(data.revenueContextSummary).toHaveLength(2);
    expect(data.revenueContextSummary).toContainEqual({
      code: 'product',
      name: 'product',
      rollupCategory: 'other',
      totalRevenue: -30,
      itemCount: 2,
      needsReviewCount: 1,
      blockedCount: 2,
    });
  });

  it('excludes other clinics and days outside the requested period', async () => {
    const sources = periodRevenueSources();
    for (const rows of Object.values(sources)) {
      const first = rows[0];
      if (!first) throw new Error('fixture missing');
      rows.push(
        { ...first, clinic_id: 'other-clinic' },
        { ...first, report_date: '2026-08-31' },
        { ...first, report_date: '2026-09-03' }
      );
    }
    mockClient = revenueQueryClient(sources);
    const data = await getPeriod();
    expect(data.revenueBreakdownSummary).toEqual([
      {
        amountRole: 'private_revenue_estimated',
        estimatedAmount: 300,
        lineCount: 2,
      },
    ]);
    expect(data.revenueContextSummary[0]?.totalRevenue).toBe(300);
  });

  it('aggregates all 1001 supplied rows (not a transport pagination assertion)', async () => {
    const sources = periodRevenueSources();
    for (const [table, rows] of Object.entries(sources)) {
      const first = rows[0];
      if (!first) throw new Error('fixture missing');
      sources[table] = Array.from({ length: 1001 }, () => ({ ...first }));
    }
    mockClient = revenueQueryClient(sources);
    const data = await getPeriod();
    expect(data.revenueBreakdownSummary).toEqual([
      {
        amountRole: 'private_revenue_estimated',
        estimatedAmount: 100100,
        lineCount: 1001,
      },
    ]);
    expect(data.revenueContextSummary[0]).toMatchObject({
      totalRevenue: 100100,
      itemCount: 1001,
      blockedCount: 1001,
    });
  });

  it('returns empty summaries for an empty period', async () => {
    mockClient = revenueQueryClient({});
    expect(await getPeriod()).toEqual({
      privateRevenueEstimated: 0,
      revenueContextSummary: [],
      revenueBreakdownSummary: [],
    });
  });

  it.each([
    'daily_report_revenue_context_summary',
    'daily_report_revenue_breakdown_summary',
  ])(
    'fails rather than returning partial totals when %s fails',
    async table => {
      mockClient = revenueQueryClient(periodRevenueSources(), table);
      const response = await GET(new NextRequest(auditRevenueUrl));
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty('data');
    }
  );

  it('does not query when authority resolution rejects', async () => {
    mockAccess.mockImplementation(() => {
      throw new Error('authority unavailable');
    });
    const response = await GET(new NextRequest(auditRevenueUrl));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockClient.from).not.toHaveBeenCalled();
  });
});

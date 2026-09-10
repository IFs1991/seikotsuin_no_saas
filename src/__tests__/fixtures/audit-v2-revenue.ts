import { z } from 'zod';

export const auditClinicId = '123e4567-e89b-12d3-a456-426614174000';
export const auditRevenueUrl = `http://localhost/api/revenue?clinic_id=${auditClinicId}&start_date=2026-09-01&end_date=2026-09-02`;

type SourceRow = Record<string, string | number | null>;
export type RevenueSources = Record<string, SourceRow[]>;

export function periodRevenueSources(): RevenueSources {
  return {
    daily_report_revenue_context_summary: [100, 200].map((amount, index) => ({
      clinic_id: auditClinicId,
      report_date: `2026-09-0${index + 1}`,
      revenue_context_code: 'private',
      revenue_context_name: '自費',
      rollup_category: 'private',
      total_revenue: amount,
      item_count: 1,
      needs_review_count: index,
      blocked_count: 1 - index,
    })),
    daily_report_revenue_breakdown_summary: [100, 200].map((amount, index) => ({
      clinic_id: auditClinicId,
      report_date: `2026-09-0${index + 1}`,
      amount_role: 'private_revenue_estimated',
      estimated_amount: amount,
      line_count: 1,
    })),
  };
}

// Query-boundary fixture: actually applies the requested clinic/date predicates.
// Also models order/range boundaries. This is not evidence of PostgreSQL RLS.
export function revenueQueryClient(
  sources: RevenueSources,
  failedTable?: string,
  failedPageFrom = 0
) {
  const rangeRequests: { table: string; from: number; to: number }[] = [];
  return {
    rangeRequests,
    from: jest.fn((table: string) => ({
      select: jest.fn(() => {
        let rows = sources[table] ?? [];
        const orderColumns: string[] = [];
        const query = {
          eq: jest.fn((column: string, value: string) => {
            rows = rows.filter(row => row[column] === value);
            return query;
          }),
          gte: jest.fn((column: string, value: string) => {
            rows = rows.filter(row => String(row[column]) >= value);
            return query;
          }),
          lte: jest.fn((column: string, value: string) => {
            rows = rows.filter(row => String(row[column]) <= value);
            return query;
          }),
          order: jest.fn((column: string) => {
            orderColumns.push(column);
            return query;
          }),
          range: jest.fn(async (from: number, to: number) => {
            rangeRequests.push({ table, from, to });
            const failed = table === failedTable && from >= failedPageFrom;
            const ordered = [...rows].sort((left, right) => {
              for (const column of orderColumns) {
                const result = String(left[column]).localeCompare(
                  String(right[column])
                );
                if (result !== 0) return result;
              }
              return 0;
            });
            return {
              data: failed ? null : ordered.slice(from, to + 1),
              error: failed ? new Error('read failed') : null,
            };
          }),
        };
        return query;
      }),
    })),
  };
}

export const revenuePeriodResponse = z.object({
  success: z.literal(true),
  data: z.object({
    privateRevenueEstimated: z.number(),
    revenueContextSummary: z.array(
      z.object({
        code: z.enum([
          'insurance',
          'private',
          'traffic_accident',
          'workers_comp',
          'product',
          'ticket',
          'other',
        ]),
        name: z.string(),
        rollupCategory: z.string(),
        totalRevenue: z.number(),
        itemCount: z.number(),
        needsReviewCount: z.number(),
        blockedCount: z.number(),
      })
    ),
    revenueBreakdownSummary: z.array(
      z.object({
        amountRole: z.string(),
        lineCount: z.number(),
        estimatedAmount: z.number(),
      })
    ),
  }),
});

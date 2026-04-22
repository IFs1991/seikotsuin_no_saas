/**
 * AnalyticsReadService unit tests (TDD Red → Green)
 *
 * Tests the shared service for reading from summary tables:
 * daily_revenue_summary, staff_performance_summary, patient_visit_summary
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-07)
 */

import {
  AnalyticsReadService,
  type DateRange,
} from '@/lib/services/analytics-read-service';
import type { SupabaseServerClient } from '@/lib/supabase';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';

type QueryResult = {
  data?: unknown;
  error?: unknown;
};
type QueryChain = Record<
  | 'select'
  | 'eq'
  | 'gte'
  | 'lte'
  | 'lt'
  | 'gt'
  | 'or'
  | 'order'
  | 'limit'
  | 'in',
  jest.Mock
> & {
  single?: jest.Mock;
  then?: jest.Mock;
};
type TableFactory = QueryChain | (() => QueryChain);

function mockChain(
  result: QueryResult,
  terminal: 'single' | 'list' = 'list'
): QueryChain {
  const chain: QueryChain = {
    select: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    lt: jest.fn(),
    gt: jest.fn(),
    or: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    in: jest.fn(),
  };
  // All methods chain
  Object.keys(chain).forEach(key => {
    if (key !== 'single') {
      chain[key].mockReturnValue(chain);
    }
  });
  if (terminal === 'single') {
    chain.single = jest.fn().mockResolvedValue(result);
  } else {
    // list terminal: the chain itself resolves (thenable)
    chain.then = jest.fn((resolve: (v: unknown) => void) => resolve(result));
    Object.defineProperty(chain, 'data', { get: () => result.data });
    Object.defineProperty(chain, 'error', { get: () => result.error });
  }
  return chain;
}

function buildClient(tableMap: Record<string, TableFactory>) {
  return {
    from: jest.fn((table: string) => {
      const factory = tableMap[table];
      if (!factory) throw new Error(`Unexpected table: ${table}`);
      return typeof factory === 'function' ? factory() : factory;
    }),
  } as unknown as SupabaseServerClient;
}

// ──────────────────────────────────────────────
// Tests: single-clinic reads
// ──────────────────────────────────────────────

describe('AnalyticsReadService', () => {
  describe('fetchDailyRevenue', () => {
    it('日付範囲で daily_revenue_summary を取得する', async () => {
      const rows = [
        { revenue_date: '2026-03-01', total_revenue: 50000 },
        { revenue_date: '2026-03-02', total_revenue: 60000 },
      ];
      const chain = mockChain({ data: rows, error: null });
      const client = buildClient({ daily_revenue_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchDailyRevenue(CLINIC_ID, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(result).toEqual(rows);
      expect(chain.eq).toHaveBeenCalledWith('clinic_id', CLINIC_ID);
      expect(chain.gte).toHaveBeenCalledWith('revenue_date', '2026-03-01');
      expect(chain.lte).toHaveBeenCalledWith('revenue_date', '2026-03-31');
    });

    it('日付範囲なしで全期間を取得する', async () => {
      const rows = [{ revenue_date: '2026-01-01', total_revenue: 100000 }];
      const chain = mockChain({ data: rows, error: null });
      const client = buildClient({ daily_revenue_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchDailyRevenue(CLINIC_ID);

      expect(result).toEqual(rows);
      expect(chain.gte).not.toHaveBeenCalled();
      expect(chain.lte).not.toHaveBeenCalled();
    });

    it('エラー時は例外を投げる', async () => {
      const chain = mockChain({ data: null, error: { message: 'db error' } });
      const client = buildClient({ daily_revenue_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      await expect(svc.fetchDailyRevenue(CLINIC_ID)).rejects.toThrow(
        'daily_revenue_summary'
      );
    });
  });

  describe('fetchStaffPerformance', () => {
    it('スタッフパフォーマンスを取得する', async () => {
      const rows = [
        {
          staff_name: '田中',
          total_revenue_generated: 200000,
          total_visits: 50,
        },
      ];
      const chain = mockChain({ data: rows, error: null });
      const client = buildClient({ staff_performance_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchStaffPerformance(CLINIC_ID, {
        columns: 'staff_name,total_revenue_generated,total_visits',
        orderBy: 'total_revenue_generated',
        limit: 30,
      });

      expect(result).toEqual(rows);
      expect(chain.select).toHaveBeenCalledWith(
        'staff_name,total_revenue_generated,total_visits'
      );
      expect(chain.order).toHaveBeenCalledWith('total_revenue_generated', {
        ascending: false,
      });
      expect(chain.limit).toHaveBeenCalledWith(30);
    });

    it('デフォルトでは全カラム、順序なし、制限なし', async () => {
      const rows = [{ staff_name: '佐藤' }];
      const chain = mockChain({ data: rows, error: null });
      const client = buildClient({ staff_performance_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchStaffPerformance(CLINIC_ID);

      expect(result).toEqual(rows);
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.order).not.toHaveBeenCalled();
      expect(chain.limit).not.toHaveBeenCalled();
    });
  });

  describe('fetchPatientVisitSummary', () => {
    it('日付フィルタ付きで patient_visit_summary を取得する', async () => {
      const rows = [
        {
          first_visit_date: '2026-03-01',
          last_visit_date: '2026-03-15',
          visit_count: 3,
        },
      ];
      const chain = mockChain({ data: rows, error: null });
      const client = buildClient({ patient_visit_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchPatientVisitSummary(CLINIC_ID, {
        columns: 'first_visit_date,last_visit_date,visit_count',
        dateFilter: {
          startDate: '2026-03-01',
        },
      });

      expect(result).toEqual(rows);
      expect(chain.or).toHaveBeenCalled();
    });

    it('フィルタなしで全患者データを取得する', async () => {
      const rows = [{ patient_id: 'p-1', clinic_id: CLINIC_ID }];
      const chain = mockChain({ data: rows, error: null });
      const client = buildClient({ patient_visit_summary: () => chain });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchPatientVisitSummary(CLINIC_ID, {
        columns: 'patient_id,clinic_id',
      });

      expect(result).toEqual(rows);
      expect(chain.or).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // Multi-clinic KPI aggregation
  // ──────────────────────────────────────────────

  describe('fetchMultiClinicKPI', () => {
    it('複数クリニックのKPIを集約する', async () => {
      const revenueRows = [
        { clinic_id: 'c-1', total_revenue: 500000 },
        { clinic_id: 'c-1', total_revenue: 100000 },
        { clinic_id: 'c-2', total_revenue: 300000 },
      ];
      const patientRows = [
        { clinic_id: 'c-1', patient_id: 'p-1' },
        { clinic_id: 'c-1', patient_id: 'p-2' },
        { clinic_id: 'c-2', patient_id: 'p-3' },
      ];
      const staffRows = [
        {
          clinic_id: 'c-1',
          total_revenue_generated: 500000,
          total_visits: 100,
        },
        { clinic_id: 'c-2', total_revenue_generated: 300000, total_visits: 80 },
      ];

      const revenueChain = mockChain({ data: revenueRows, error: null });
      const patientChain = mockChain({ data: patientRows, error: null });
      const staffChain = mockChain({ data: staffRows, error: null });
      const clinicIds = ['c-1', 'c-2'];
      const client = buildClient({
        daily_revenue_summary: revenueChain,
        patient_visit_summary: patientChain,
        staff_performance_summary: staffChain,
      });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchMultiClinicKPI(clinicIds);

      expect(result.get('c-1')).toEqual({
        revenue: 600000,
        patients: 2,
        staff_performance_score: expect.any(Number),
      });
      expect(result.get('c-2')).toEqual({
        revenue: 300000,
        patients: 1,
        staff_performance_score: expect.any(Number),
      });
      expect(revenueChain.in).toHaveBeenCalledWith('clinic_id', clinicIds);
      expect(patientChain.in).toHaveBeenCalledWith('clinic_id', clinicIds);
      expect(staffChain.in).toHaveBeenCalledWith('clinic_id', clinicIds);
    });

    it('データがないクリニックは0/nullで返す', async () => {
      const client = buildClient({
        daily_revenue_summary: () => mockChain({ data: [], error: null }),
        patient_visit_summary: () => mockChain({ data: [], error: null }),
        staff_performance_summary: () => mockChain({ data: [], error: null }),
      });
      const svc = new AnalyticsReadService(client);

      const result = await svc.fetchMultiClinicKPI(['c-1']);

      expect(result.get('c-1')).toEqual({
        revenue: 0,
        patients: 0,
        staff_performance_score: null,
      });
    });
  });
});

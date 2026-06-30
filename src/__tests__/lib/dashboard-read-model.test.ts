import {
  fetchDashboardReadModel,
  type DashboardReadModelClient,
} from '@/lib/dashboard/read-model';

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const now = new Date('2026-06-12T00:00:00.000Z');

type QueryError = {
  code?: string;
  message?: string;
};

type QueryResult<Result = unknown> = {
  data: Result | null;
  error: QueryError | null;
};

type QueryCall = {
  table: string;
  method: string;
  params?: unknown;
  value?: unknown;
};

type MockDashboardClientConfig = {
  dailyRevenueSummary: QueryResult[];
  dailyReports: QueryResult[];
  aiComments?: QueryResult[];
  heatmap?: QueryResult;
};

function createMockDashboardClient(config: MockDashboardClientConfig): {
  client: DashboardReadModelClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const queues = new Map<string, QueryResult[]>([
    ['daily_revenue_summary', [...config.dailyRevenueSummary]],
    ['daily_reports', [...config.dailyReports]],
    ['ai_comments', [...(config.aiComments ?? [])]],
  ]);

  const client: DashboardReadModelClient = {
    dailyRevenue(params) {
      calls.push({
        table: 'daily_revenue_summary',
        method: 'dailyRevenue',
        params,
      });
      const queue = queues.get('daily_revenue_summary') ?? [];
      const result = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(result);
    },
    previousRevenue(params) {
      calls.push({
        table: 'daily_revenue_summary',
        method: 'previousRevenue',
        params,
      });
      const queue = queues.get('daily_revenue_summary') ?? [];
      const result = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(result);
    },
    dailyReportPatients(params) {
      calls.push({
        table: 'daily_reports',
        method: 'dailyReportPatients',
        params,
      });
      const queue = queues.get('daily_reports') ?? [];
      const result = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(result);
    },
    aiComment(params) {
      calls.push({
        table: 'ai_comments',
        method: 'aiComment',
        params,
      });
      const queue = queues.get('ai_comments') ?? [];
      const result = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(result);
    },
    revenueChartRows(params) {
      calls.push({
        table: 'daily_revenue_summary',
        method: 'revenueChartRows',
        params,
      });
      const queue = queues.get('daily_revenue_summary') ?? [];
      const result = queue.shift() ?? { data: [], error: null };
      return Promise.resolve(result);
    },
    heatmap(params) {
      calls.push({
        table: 'get_hourly_visit_pattern',
        method: 'heatmap',
        value: params,
      });
      return Promise.resolve(config.heatmap ?? { data: [], error: null });
    },
  };

  return { client, calls };
}

function hasPatientAlert(alerts: readonly string[]): boolean {
  return alerts.some(alert => alert.includes('患者数'));
}

describe('dashboard read model', () => {
  it('uses daily_reports.total_patients for today patients without querying visits', async () => {
    const { client, calls } = createMockDashboardClient({
      dailyRevenueSummary: [
        {
          data: {
            total_revenue: 120000,
            insurance_revenue: 40000,
            private_revenue: 80000,
          },
          error: null,
        },
        {
          data: [
            {
              revenue_date: '2026-06-12',
              total_revenue: 120000,
              insurance_revenue: 40000,
              private_revenue: 80000,
            },
          ],
          error: null,
        },
        {
          data: {
            total_revenue: 100000,
          },
          error: null,
        },
      ],
      dailyReports: [
        { data: { total_patients: 18 }, error: null },
        { data: { total_patients: 15 }, error: null },
      ],
    });

    const result = await fetchDashboardReadModel({
      supabase: client,
      clinicId,
      now,
    });

    expect(result.dailyData).toEqual({
      revenue: 120000,
      patients: 18,
      insuranceRevenue: 40000,
      privateRevenue: 80000,
    });
    expect(result.revenueChartData).toEqual([
      {
        name: '2026-06-12',
        総売上: 120000,
        保険診療: 40000,
        自費診療: 80000,
      },
    ]);
    expect(calls.some(call => call.table === 'visits')).toBe(false);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'daily_reports',
          method: 'dailyReportPatients',
          params: {
            clinicId,
            reportDate: '2026-06-12',
          },
        }),
      ])
    );
  });

  it('returns zero patients and no patient alert when today daily report is missing', async () => {
    const { client } = createMockDashboardClient({
      dailyRevenueSummary: [
        {
          data: {
            total_revenue: 100000,
            insurance_revenue: 20000,
            private_revenue: 80000,
          },
          error: null,
        },
        { data: [], error: null },
        { data: null, error: null },
      ],
      dailyReports: [
        { data: null, error: null },
        { data: { total_patients: 20 }, error: null },
      ],
    });

    const result = await fetchDashboardReadModel({
      supabase: client,
      clinicId,
      now,
    });

    expect(result.dailyData.patients).toBe(0);
    expect(hasPatientAlert(result.alerts)).toBe(false);
  });

  it('does not emit a patient alert when yesterday daily report is missing', async () => {
    const { client } = createMockDashboardClient({
      dailyRevenueSummary: [
        {
          data: {
            total_revenue: 100000,
            insurance_revenue: 20000,
            private_revenue: 80000,
          },
          error: null,
        },
        { data: [], error: null },
        { data: null, error: null },
      ],
      dailyReports: [
        { data: { total_patients: 3 }, error: null },
        { data: null, error: null },
      ],
    });

    const result = await fetchDashboardReadModel({
      supabase: client,
      clinicId,
      now,
    });

    expect(result.dailyData.patients).toBe(3);
    expect(hasPatientAlert(result.alerts)).toBe(false);
  });
});

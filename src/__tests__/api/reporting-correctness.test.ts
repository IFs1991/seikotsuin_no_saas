import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { GET as getDailyReports } from '@/app/api/daily-reports/route';
import { GET as getRevenue } from '@/app/api/revenue/route';
import type {
  ensureClinicAccess,
  ClinicAccessContext,
} from '@/lib/supabase/guards';
import type { Database, Json } from '@/types/supabase';

jest.unmock('@supabase/supabase-js');
const mockEnsureClinicAccess = jest.fn<
  Promise<Pick<ClinicAccessContext, 'supabase'>>,
  Parameters<typeof ensureClinicAccess>
>();
jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: Parameters<typeof ensureClinicAccess>) =>
    mockEnsureClinicAccess(...args),
}));

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
type FixtureRow = Record<string, Json>;
type Tables = Record<string, FixtureRow[]>;

function report(index: number, clinicId = clinicA): FixtureRow {
  return {
    id: `report-${String(index).padStart(5, '0')}`,
    clinic_id: clinicId,
    report_date: new Date(Date.UTC(2025, 11, 31 + index))
      .toISOString()
      .slice(0, 10),
    staff_id: null,
    staff: null,
    total_patients: index === 0 ? 10 : 1,
    new_patients: 0,
    total_revenue: index === 0 ? 10000 : 1000,
    insurance_revenue: 0,
    private_revenue: index === 0 ? 10000 : 1000,
    report_text: null,
    created_at: null,
  };
}

// 実Supabaseクライアントが送るfilter/order/offset/limitを評価し、
// DBの1,000行上限を再現する。認可/RLSの実DB検証の代わりにはしない。
function installDatabase(
  tables: Tables,
  failTable?: string,
  failAggregate = false
) {
  const requests: URL[] = [];
  const client = createClient<Database>('http://127.0.0.1:54331', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async input => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        );
        requests.push(url);
        const table = url.pathname.split('/').at(-1) ?? '';
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const selection = url.searchParams.get('select') ?? '';
        if (failAggregate && selection.includes('.sum()')) {
          return new Response(
            JSON.stringify({
              code: 'PGRST123',
              message: 'aggregates disabled',
            }),
            { status: 400 }
          );
        }
        if (table === failTable && offset > 0) {
          return new Response(JSON.stringify({ message: 'page unavailable' }), {
            status: 500,
          });
        }
        let rows = [...(tables[table] ?? [])];
        for (const [column, filter] of url.searchParams) {
          const match = /^(eq|gte|lte)\.(.*)$/.exec(filter);
          if (!match) continue;
          const [, operator, value] = match;
          rows = rows.filter(row => {
            const actual = String(row[column]);
            return operator === 'eq'
              ? actual === value
              : operator === 'gte'
                ? actual >= value
                : actual <= value;
          });
        }
        if (selection.includes('.sum()') || selection.includes('.count()')) {
          const aggregate: FixtureRow = {};
          for (const selected of selection.split(',')) {
            const match = /^(\w+):(\w+)\.(sum|count)\(\)$/.exec(
              selected.trim()
            );
            if (!match) throw new Error(`Unsupported aggregate: ${selected}`);
            const [, alias, column, operation] = match;
            aggregate[alias] =
              operation === 'count'
                ? rows.filter(row => row[column] !== null).length
                : rows.reduce((sum, row) => sum + Number(row[column] ?? 0), 0);
          }
          rows = [aggregate];
        } else {
          const order = (url.searchParams.get('order') ?? '')
            .split(',')
            .filter(Boolean);
          rows.sort((left, right) => {
            for (const part of order) {
              const [column, direction] = part.split('.');
              const compared = String(left[column]).localeCompare(
                String(right[column])
              );
              if (compared) return direction === 'desc' ? -compared : compared;
            }
            return 0;
          });
        }
        const limit = Math.min(
          Number(url.searchParams.get('limit') ?? 1000),
          1000
        );
        return new Response(
          JSON.stringify(rows.slice(offset, offset + limit)),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    },
  });
  // guard自体は既存認可回帰と実DB E2Eの責務とし、返却clientだけ差し替える。
  mockEnsureClinicAccess.mockResolvedValue({ supabase: client });
  return requests;
}

function request(path: string, range = '') {
  return new NextRequest(
    `http://localhost/api/${path}?clinic_id=${clinicA}${range}`
  );
}

describe('日報・収益の正確性', () => {
  beforeEach(() => jest.clearAllMocks());

  it('31件の集計と別月トレンドを最新30件の一覧から独立させる', async () => {
    installDatabase({
      daily_reports: Array.from({ length: 31 }, (_, index) => report(index)),
    });
    const response = await getDailyReports(request('daily-reports'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.reports).toHaveLength(30);
    expect(body.data.summary).toEqual({
      totalReports: 31,
      totalRevenue: 40000,
      averageRevenue: 40000 / 31,
      averagePatients: 40 / 31,
    });
    expect(body.data.monthlyTrends).toEqual(
      expect.arrayContaining([
        {
          month: '2025-12',
          reports: 1,
          totalPatients: 10,
          totalRevenue: 10000,
        },
        {
          month: '2026-01',
          reports: 30,
          totalPatients: 30,
          totalRevenue: 30000,
        },
      ])
    );
  });

  it('1,001件でも日報集計・月別トレンドが上限で切れず他院を除外する', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => report(index));
    const requests = installDatabase({
      daily_reports: [...rows, report(0, clinicB)],
    });
    const response = await getDailyReports(request('daily-reports'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.summary.totalReports).toBe(1001);
    expect(body.data.summary.totalRevenue).toBe(1010000);
    expect(
      body.data.monthlyTrends.reduce(
        (sum: number, row: { reports: number }) => sum + row.reports,
        0
      )
    ).toBe(1001);
    expect(
      requests.every(
        url => url.searchParams.get('clinic_id') === `eq.${clinicA}`
      )
    ).toBe(true);
  });

  it('一覧・集計・トレンドへ同じ日付範囲を適用する', async () => {
    installDatabase({
      daily_reports: Array.from({ length: 35 }, (_, index) => report(index)),
    });
    const response = await getDailyReports(
      request('daily-reports', '&start_date=2026-01-01&end_date=2026-01-31')
    );
    const body = await response.json();
    expect(body.data.summary).toEqual({
      totalReports: 31,
      totalRevenue: 31000,
      averagePatients: 1,
      averageRevenue: 1000,
    });
    expect(body.data.monthlyTrends).toEqual([
      { month: '2026-01', reports: 31, totalPatients: 31, totalRevenue: 31000 },
    ]);
  });

  it('空の日報は0件・空トレンドで返す', async () => {
    installDatabase({});
    const response = await getDailyReports(request('daily-reports'));
    expect(await response.json()).toMatchObject({
      data: {
        reports: [],
        summary: {
          totalReports: 0,
          totalRevenue: 0,
          averagePatients: 0,
          averageRevenue: 0,
        },
        monthlyTrends: [],
      },
    });
  });

  it('予測・人件費率・前年データのない成長率を捏造しない', async () => {
    installDatabase({ daily_reports: [report(1)] });
    const response = await getRevenue(
      request('revenue', '&start_date=2026-01-01&end_date=2026-01-31')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        monthlyRevenue: 1000,
        lastYearRevenue: null,
        growthRate: null,
        revenueForecast: null,
        costAnalysis: null,
      },
    });
  });

  it('前年の実額を丸めた成長率から逆算せず返す', async () => {
    installDatabase({
      daily_reports: [
        report(1),
        {
          ...report(1),
          id: 'previous',
          report_date: '2025-01-01',
          total_revenue: 333,
        },
      ],
    });
    const response = await getRevenue(
      request('revenue', '&start_date=2026-01-01&end_date=2026-01-31')
    );
    expect(await response.json()).toMatchObject({
      data: { lastYearRevenue: 333, growthRate: '200.3%' },
    });
  });

  it('前年に0円の日報がある場合は実額0円を維持し成長率だけ未算出にする', async () => {
    installDatabase({
      daily_reports: [
        report(1),
        {
          ...report(1),
          id: 'previous',
          report_date: '2025-01-01',
          total_revenue: 0,
        },
      ],
    });
    const response = await getRevenue(
      request('revenue', '&start_date=2026-01-01&end_date=2026-01-31')
    );
    expect(await response.json()).toMatchObject({
      data: { lastYearRevenue: 0, growthRate: null },
    });
  });

  it('収益APIの全データソースを1,001件目まで集計しclinic/date scopeを保持する', async () => {
    const reports = Array.from({ length: 1001 }, (_, index) => report(index));
    const baseRows = reports.map(row => ({
      id: row.id,
      clinic_id: clinicA,
      report_date: row.report_date,
    }));
    const tables: Tables = {
      daily_reports: [...reports, report(0, clinicB)],
      daily_report_items: baseRows.map(row => ({
        ...row,
        menu_id: 'menu',
        treatment_name: '施術',
        fee: 100,
        care_episode_id: row.id,
        visit_ordinal_in_episode: 1,
        visit_stage_code: 'first_visit',
      })),
      daily_report_revenue_context_summary: baseRows.map(row => ({
        ...row,
        revenue_context_code: 'product',
        revenue_context_name: '物販',
        rollup_category: 'other',
        total_revenue: 10,
        item_count: 1,
        needs_review_count: 0,
        blocked_count: 0,
      })),
      daily_report_revenue_estimate_summary: baseRows.map(row => ({
        ...row,
        estimated_total: 20,
        estimate_count: 1,
        calculated_count: 1,
        needs_review_count: 0,
        blocked_count: 0,
        overridden_count: 0,
        warning_count: 0,
        disclaimer: '概算',
      })),
      daily_report_revenue_breakdown_summary: baseRows.map(row => ({
        ...row,
        amount_role: 'private_revenue_estimated',
        line_count: 1,
        estimated_amount: 30,
      })),
    };
    for (const rows of Object.values(tables)) {
      rows.push({ ...rows[0], id: 'other-clinic', clinic_id: clinicB });
      rows.push({
        ...rows[0],
        id: 'outside-period',
        report_date: '1900-01-01',
      });
    }
    const requests = installDatabase(tables);
    const response = await getRevenue(
      request('revenue', '&start_date=2024-12-31&end_date=2030-01-01')
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.monthlyRevenue).toBe(1010000);
    expect(body.data.lastYearRevenue).toBe(1010000);
    expect(body.data.menuRanking[0]).toMatchObject({
      total_revenue: 100100,
      transaction_count: 1001,
    });
    expect(body.data.careEpisodeMetrics.totalEpisodes).toBe(1001);
    expect(body.data.productRevenue).toBe(10010);
    expect(body.data.revenueEstimateSummary.estimatedTotal).toBe(20020);
    expect(body.data.privateRevenueEstimated).toBe(30030);
    expect(
      requests.every(
        url => url.searchParams.get('clinic_id') === `eq.${clinicA}`
      )
    ).toBe(true);
    const laterPages = requests.filter(
      url => Number(url.searchParams.get('offset')) > 0
    );
    expect(laterPages.length).toBe(6);
    expect(
      laterPages.every(
        url =>
          url.searchParams.has('order') && url.searchParams.has('report_date')
      )
    ).toBe(true);
  });

  it('2ページ目に失敗したら部分集計を成功扱いしない', async () => {
    installDatabase(
      {
        daily_reports: Array.from({ length: 1001 }, (_, index) =>
          report(index)
        ),
      },
      'daily_reports'
    );
    const response = await getDailyReports(request('daily-reports'));
    expect(response.status).toBe(500);
  });

  it('DB集計が無効なら一覧30件の数字へフォールバックしない', async () => {
    installDatabase({ daily_reports: [report(0)] }, undefined, true);
    const response = await getDailyReports(request('daily-reports'));
    expect(response.status).toBe(500);
  });

  it('収益の明細2ページ目が失敗したら部分的なメニュー順位を返さない', async () => {
    installDatabase(
      {
        daily_report_items: Array.from({ length: 1001 }, (_, index) => ({
          id: String(index).padStart(5, '0'),
          clinic_id: clinicA,
          report_date: '2026-01-01',
          treatment_name: '施術',
          fee: 100,
        })),
      },
      'daily_report_items'
    );
    const response = await getRevenue(
      request('revenue', '&start_date=2026-01-01&end_date=2026-01-31')
    );
    expect(response.status).toBe(500);
  });
});

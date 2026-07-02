import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import type { MobileUiuxScreenResource } from '@/lib/mobile-uiux/bridge-manifest';
import {
  patchMobileUiuxDcScript,
  patchMobileUiuxDcScriptSource,
} from '@/lib/mobile-uiux/dc-script-patch';

const FIXTURE_ROOT = path.join(process.cwd(), 'private-assets', 'mobile-uiux');

const SCREEN_RESOURCES = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
  'settings-detail',
] as const satisfies readonly MobileUiuxScreenResource[];

type ApplyReadData = (screen: string, payload: unknown) => boolean;

type EvaluatedWindow = {
  __MOBILE_UIUX_APPLY_READ_DATA__?: ApplyReadData & {
    __mobileUiuxHydrationOwner?: unknown;
  };
};

type EvaluatedComponent = {
  state: Record<string, unknown>;
  props: Record<string, unknown>;
  calls?: string[];
  renderVals: () => Record<string, unknown>;
  componentDidMount: () => void;
  componentWillUnmount: () => void;
};

type EvaluatedSandbox = {
  window: EvaluatedWindow;
  __Component?: new () => EvaluatedComponent;
  Date: DateConstructor;
};

function wrapDcScript(source: string): string {
  return `<script type="text/x-dc" data-dc-script>${source}</script>`;
}

function countRenderValsMethods(source: string): number {
  return source.match(/renderVals\(/g)?.length ?? 0;
}

function evaluatePatchedComponent(source: string): {
  component: EvaluatedComponent;
  window: EvaluatedWindow;
} {
  const sandbox: EvaluatedSandbox = {
    window: {},
    Date,
  };
  vm.runInNewContext(
    `
class DCLogic {
  constructor() {
    this.state = {};
    this.props = {};
  }
  setState(update) {
    this.state = { ...this.state, ...update };
  }
  forceUpdate() {
    this.forceUpdated = true;
  }
}
${source}
globalThis.__Component = Component;
`,
    sandbox
  );

  if (!sandbox.__Component) {
    throw new Error('Component was not evaluated');
  }

  return {
    component: new sandbox.__Component(),
    window: sandbox.window,
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected record value');
  }
  return value as Record<string, unknown>;
}

describe('patchMobileUiuxDcScript', () => {
  it.each(SCREEN_RESOURCES)(
    'renames and delegates renderVals for the real %s fixture',
    async resource => {
      const html = await readFile(
        path.join(FIXTURE_ROOT, `${resource}.dc.html`),
        'utf-8'
      );
      const patched = patchMobileUiuxDcScript(html, {
        screen: 'reservations',
      });

      expect(patched).toContain('class Component extends DCLogic');
      expect(patched).toContain('__mobileUiuxOriginalRenderVals');
      expect(patched).toContain('__mobileUiuxOriginalComponentDidMount');
      expect(patched).toContain('window.__MOBILE_UIUX_APPLY_READ_DATA__');
      expect(countRenderValsMethods(patched)).toBe(1);
    }
  );

  it('fails when renderVals is missing', () => {
    expect(() =>
      patchMobileUiuxDcScriptSource('class Component extends DCLogic {}', {
        screen: 'reservations',
      })
    ).toThrow('Expected exactly one renderVals(');
  });

  it('fails when renderVals appears more than once', () => {
    expect(() =>
      patchMobileUiuxDcScriptSource(
        `class Component extends DCLogic {
  renderVals() { return {}; }
  renderVals() { return {}; }
}`,
        { screen: 'reservations' }
      )
    ).toThrow('Expected exactly one renderVals(');
  });

  it('skips braces in strings, template literals, template expressions, and comments', () => {
    const source = `class Component extends DCLogic {
  renderVals() {
    const single = '}';
    const double = "{";
    const template = \`prefix \${(() => { return '}'; })()} suffix\`;
    // }
    /* { */
    return { single, double, template };
  }
}`;

    const patched = patchMobileUiuxDcScriptSource(source, {
      screen: 'reservations',
    });
    const { component } = evaluatePatchedComponent(patched);
    const vals = component.renderVals();

    expect(vals.single).toBe('}');
    expect(vals.double).toBe('{');
    expect(vals.template).toBe('prefix } suffix');
    expect(patched).toContain('__mobileUiuxOriginalRenderVals');
  });

  it('delegates lifecycle methods and unregisters the hydration bridge', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  constructor() {
    super();
    this.calls = [];
  }
  componentDidMount() {
    this.calls.push('mount');
  }
  componentWillUnmount() {
    this.calls.push('unmount');
  }
  renderVals() {
    return { sample: true };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();

    expect(component.calls).toEqual(['mount']);
    expect(typeof window.__MOBILE_UIUX_APPLY_READ_DATA__).toBe('function');

    component.componentWillUnmount();

    expect(component.calls).toEqual(['mount', 'unmount']);
    expect(window.__MOBILE_UIUX_APPLY_READ_DATA__).toBeUndefined();
  });

  it('merges reservations hydration overrides after the original renderVals result', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  initial(name) {
    return name.trim().charAt(0);
  }
  renderVals() {
    return {
      dateLabel: 'sample-date',
      sumTotal: 99,
      sumConf: 99,
      sumUnc: 99,
      sumCancel: 99,
      rows: [{ patient: 'sample-patient' }]
    };
  }
}`),
      {
        screen: 'reservations',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        date: '2026-04-27',
        reservations: [
          {
            customerName: 'BFF 患者A',
            menuName: 'BFF メニューA',
            staffName: 'BFF 先生A',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'confirmed',
          },
          {
            customerName: 'BFF 患者B',
            menuName: 'BFF メニューB',
            staffName: 'BFF 先生B',
            startTime: '2026-04-27T02:00:00.000Z',
            endTime: '2026-04-27T02:30:00.000Z',
            status: 'unconfirmed',
          },
          {
            customerName: 'BFF 患者C',
            menuName: 'BFF メニューC',
            staffName: 'BFF 先生C',
            startTime: '2026-04-27T03:00:00.000Z',
            endTime: '2026-04-27T03:30:00.000Z',
            status: 'cancelled',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const rows = Array.isArray(vals.rows) ? vals.rows : [];
    const firstRow = getRecord(rows[0]);

    expect(applied).toBe(true);
    expect(vals.dateLabel).toBe('4/27（月）');
    expect(vals.sumTotal).toBe(2);
    expect(vals.sumConf).toBe(1);
    expect(vals.sumUnc).toBe(1);
    expect(vals.sumCancel).toBe(1);
    expect(firstRow.patient).toBe('BFF 患者A');
    expect(firstRow.menu).toBe('BFF メニューA');
    expect(firstRow.ther).toBe('BFF 先生A');
    expect(firstRow.startT).toBe('10:00');
    expect(firstRow.endT).toBe('10:30');
    expect(firstRow.statusLabel).toBe('確定');
    expect(vals.rows).not.toEqual([{ patient: 'sample-patient' }]);
  });

  it('merges daily-reports hydration overrides after the original renderVals result', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  STATUS_DR = {
    submitted: { label: '提出済み', c: 'submitted-c', b: 'submitted-b' },
    confirmed: { label: '確認済み', c: 'confirmed-c', b: 'confirmed-b' },
    unsubmitted: { label: '未提出', c: 'missing-c', b: 'missing-b' },
    needscheck: { label: '要確認', c: 'needs-c', b: 'needs-b' }
  };
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  renderVals() {
    return {
      todayLabel: 'sample-date',
      todayUnsubmitted: true,
      todaySubmittedFlag: false,
      todayCount: 0,
      sumRevenue: '¥0',
      sumPatients: '0名',
      sumHoken: '¥0',
      sumJihi: '¥0',
      listRows: [{ date: 'sample-row' }],
      kpiBoxes: [{ label: 'sample-kpi', value: 'sample' }],
      trendCards: [{ date: 'sample-trend' }],
      statusRows: [{ date: 'sample-status' }]
    };
  }
}`),
      {
        screen: 'daily-reports',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        startDate: '2026-06-30',
        endDate: '2026-06-30',
        dailyReports: {
          reports: [
            {
              id: 'report-1',
              reportDate: '2026-06-30',
              staffName: 'BFF 先生A',
              totalPatients: 18,
              newPatients: 3,
              totalRevenue: 120000,
              insuranceRevenue: 40000,
              privateRevenue: 80000,
              reportText: 'free text should not be rendered',
              createdAt: '2026-06-30T10:00:00.000Z',
            },
          ],
          summary: {
            totalReports: 1,
            averagePatients: 18,
            averageRevenue: 120000,
            totalRevenue: 120000,
          },
          monthlyTrends: [],
        },
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const listRows = Array.isArray(vals.listRows) ? vals.listRows : [];
    const firstRow = getRecord(listRows[0]);
    const kpiBoxes = Array.isArray(vals.kpiBoxes) ? vals.kpiBoxes : [];
    const firstKpi = getRecord(kpiBoxes[0]);

    expect(applied).toBe(true);
    expect(vals.todayLabel).toBe('6/30（火）');
    expect(vals.todayUnsubmitted).toBe(false);
    expect(vals.todaySubmittedFlag).toBe(true);
    expect(vals.todayCount).toBe(18);
    expect(vals.sumRevenue).toBe('¥120,000');
    expect(vals.sumPatients).toBe('18名');
    expect(vals.sumHoken).toBe('¥40,000');
    expect(vals.sumJihi).toBe('¥80,000');
    expect(firstRow.date).toBe('6/30（火）');
    expect(firstRow.statusLabel).toBe('提出済み');
    expect(firstRow.patients).toBe('18名');
    expect(firstRow.revenue).toBe('¥120,000');
    expect(firstKpi.label).toBe('累計売上');
    expect(firstKpi.value).toBe('¥120,000');
    expect(JSON.stringify(vals)).not.toContain(
      'free text should not be rendered'
    );
    expect(vals.listRows).not.toEqual([{ date: 'sample-row' }]);
  });

  it('merges home hydration overrides after the original renderVals result', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  SEV = {
    critical: { label: '要対応', c: 'critical-c', b: 'critical-b' },
    warning: { label: '注意', c: 'warning-c', b: 'warning-b' },
    info: { label: '情報', c: 'info-c', b: 'info-b' }
  };
  link(message) {
    return () => message;
  }
  renderVals() {
    return {
      dateLabel: 'sample-date',
      kpis: [{ label: 'sample-kpi', value: 'sample' }],
      attentions: [{ title: 'sample-attention' }],
      attCount: '1件',
      agTotal: 99,
      agUnc: 99,
      agCancel: 99,
      drDone: 0,
      drReview: 0,
      drMissing: 0,
      reportRows: [{ name: 'sample-report' }]
    };
  }
}`),
      {
        screen: 'home',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('home', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-06-30',
        timezone: 'Asia/Tokyo',
        clinicName: 'BFF 本町院',
        dashboard: {
          dailyData: {
            revenue: 245600,
            patients: 32,
            insuranceRevenue: 80600,
            privateRevenue: 165000,
          },
          alerts: ['fallback alert should not win'],
        },
        reservationSummary: {
          total: 41,
          unconfirmed: 7,
          cancelled: 3,
        },
        dailyReportStatus: {
          done: 2,
          review: 1,
          missing: 4,
          rows: [
            {
              name: 'BFF 本町院',
              status: 'submitted',
              reportText: 'free text should not be rendered',
            },
            {
              name: 'BFF 緑が丘院',
              status: 'needs_check',
              notes: 'raw notes should not be rendered',
            },
            { name: 'BFF 駅前院', status: 'missing' },
          ],
        },
        attentions: [
          {
            severity: 'critical',
            title: 'BFF 未確定予約 7件',
            body: 'BFF summary only',
          },
          {
            severity: 'warning',
            title: 'BFF 日報要確認 1院',
            body: 'BFF status summary',
          },
        ],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const kpis = Array.isArray(vals.kpis) ? vals.kpis : [];
    const firstKpi = getRecord(kpis[0]);
    const reservationKpi = getRecord(kpis[2]);
    const unconfirmedKpi = getRecord(kpis[3]);
    const attentions = Array.isArray(vals.attentions) ? vals.attentions : [];
    const firstAttention = getRecord(attentions[0]);
    const reportRows = Array.isArray(vals.reportRows) ? vals.reportRows : [];
    const reviewReport = getRecord(reportRows[1]);

    expect(applied).toBe(true);
    expect(vals.dateLabel).toBe('6/30（火）');
    expect(firstKpi.label).toBe('本日の売上');
    expect(firstKpi.value).toBe('¥245,600');
    expect(reservationKpi.value).toBe('41');
    expect(unconfirmedKpi.value).toBe('7');
    expect(vals.agTotal).toBe(41);
    expect(vals.agUnc).toBe(7);
    expect(vals.agCancel).toBe(3);
    expect(vals.attCount).toBe('2件');
    expect(firstAttention.title).toBe('BFF 未確定予約 7件');
    expect(firstAttention.sevLabel).toBe('要対応');
    expect(vals.drDone).toBe(2);
    expect(vals.drReview).toBe(1);
    expect(vals.drMissing).toBe(4);
    expect(reviewReport.name).toBe('BFF 緑が丘院');
    expect(reviewReport.statusLabel).toBe('要確認');
    expect(JSON.stringify(vals)).not.toContain(
      'free text should not be rendered'
    );
    expect(JSON.stringify(vals)).not.toContain(
      'raw notes should not be rendered'
    );
    expect(vals.kpis).not.toEqual([{ label: 'sample-kpi', value: 'sample' }]);
  });

  it('uses an explicit daily-reports missing fallback for valid empty BFF payloads', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  STATUS_DR = {
    submitted: { label: '提出済み', c: 'submitted-c', b: 'submitted-b' },
    unsubmitted: { label: '未提出', c: 'missing-c', b: 'missing-b' },
    needscheck: { label: '要確認', c: 'needs-c', b: 'needs-b' }
  };
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  renderVals() {
    return { todayLabel: 'sample-date', todayUnsubmitted: false, listRows: [{ date: 'sample-row' }] };
  }
}`,
      { screen: 'daily-reports' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
        dailyReports: {
          reports: [],
          summary: {
            totalReports: 0,
            averagePatients: 0,
            averageRevenue: 0,
            totalRevenue: 0,
          },
          monthlyTrends: [],
        },
      },
      generatedAt: '2026-07-01T00:00:00.000Z',
    });
    const vals = component.renderVals();

    expect(applied).toBe(true);
    expect(vals.todayLabel).toBe('7/1（水）');
    expect(vals.todayUnsubmitted).toBe(true);
    expect(vals.todaySubmittedFlag).toBe(false);
    expect(vals.sumRevenue).toBe('¥0');
    expect(vals.sumPatients).toBe('0名');
    expect(vals.listRows).toEqual([]);
  });

  it('keeps sample values when the payload is invalid', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  renderVals() {
    return { dateLabel: 'sample-date', rows: [{ patient: 'sample-patient' }] };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        reservations: [],
      },
    });
    const vals = component.renderVals();

    expect(applied).toBe(false);
    expect(vals.dateLabel).toBe('sample-date');
    expect(vals.rows).toEqual([{ patient: 'sample-patient' }]);
  });

  it('keeps daily-reports sample values when the payload is invalid', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  renderVals() {
    return { todayLabel: 'sample-date', listRows: [{ date: 'sample-row' }] };
  }
}`,
      { screen: 'daily-reports' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
      success: true,
      data: {
        dailyReports: {
          reports: 'invalid',
        },
      },
    });
    const vals = component.renderVals();

    expect(applied).toBe(false);
    expect(vals.todayLabel).toBe('sample-date');
    expect(vals.listRows).toEqual([{ date: 'sample-row' }]);
  });

  it('keeps home sample values when the payload is invalid', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  renderVals() {
    return { kpis: [{ label: 'sample-kpi', value: 'sample' }], agTotal: 99 };
  }
}`,
      { screen: 'home' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('home', {
      success: true,
      data: {
        dashboard: {
          alerts: [],
        },
      },
    });
    const vals = component.renderVals();

    expect(applied).toBe(false);
    expect(vals.kpis).toEqual([{ label: 'sample-kpi', value: 'sample' }]);
    expect(vals.agTotal).toBe(99);
  });

  it('keeps daily-reports sample values when a report row is invalid', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  renderVals() {
    return { todayLabel: 'sample-date', listRows: [{ date: 'sample-row' }] };
  }
}`,
      { screen: 'daily-reports' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
      success: true,
      data: {
        startDate: '2026-07-01',
        endDate: '2026-07-01',
        dailyReports: {
          reports: [{ totalRevenue: 1000 }],
        },
      },
      generatedAt: '2026-07-01T00:00:00.000Z',
    });
    const vals = component.renderVals();

    expect(applied).toBe(false);
    expect(vals.todayLabel).toBe('sample-date');
    expect(vals.listRows).toEqual([{ date: 'sample-row' }]);
  });
});

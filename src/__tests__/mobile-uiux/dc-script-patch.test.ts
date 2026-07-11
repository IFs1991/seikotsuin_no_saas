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
  MobileUiuxBridge?: {
    createReservation?: jest.Mock<Promise<boolean>, [unknown]>;
    submitDailyReport?: jest.Mock<Promise<boolean>, [unknown]>;
    updateReservation?: jest.Mock<Promise<boolean>, [unknown]>;
    updateSettings?: jest.Mock<Promise<boolean>, [unknown]>;
    refreshReadData?: jest.Mock<
      Promise<boolean>,
      [{ date?: string; clinicId?: string }]
    >;
  };
};

type EvaluatedComponent = {
  state: Record<string, unknown>;
  props: Record<string, unknown>;
  calls?: string[];
  renderVals: () => Record<string, unknown>;
  saveReport?: () => Promise<boolean>;
  componentDidMount: () => void;
  componentWillUnmount: () => void;
};

type EvaluatedSandbox = {
  window: EvaluatedWindow;
  __Component?: new () => EvaluatedComponent;
  Date: DateConstructor;
  Intl: typeof Intl;
  setTimeout: (callback: () => void, timeout: number) => number;
  clearTimeout: (timeout: number | undefined) => void;
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
    Intl,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
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

  it('refreshes reservations when the date navigation changes', async () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  HOME = 'c1';
  DAYS = ['4/26（日）', '4/27（月）', '4/28（火）'];
  STATUS = {
    confirmed: { label: '確定', c: 'confirmed-c', b: 'confirmed-b' },
    unconfirmed: { label: '未確定', c: 'unconfirmed-c', b: 'unconfirmed-b' },
    cancelled: { label: 'キャンセル', c: 'cancelled-c', b: 'cancelled-b' },
    noshow: { label: '無断', c: 'noshow-c', b: 'noshow-b' },
    arrived: { label: '来院済み', c: 'arrived-c', b: 'arrived-b' }
  };
  state = { dateIndex: 1, appts: [], loading: false, role: 'staff', clinic: 'c1' };
  initial(name) {
    return name.trim().charAt(0);
  }
  openDetail = (id) => () => this.setState({ detailId: id });
  renderVals() {
    return {
      dateLabel: this.DAYS[this.state.dateIndex],
      nextDate: this.nextDate,
      rows: this.state.appts.map(appt => ({ patient: appt.patient, menu: appt.menu })),
      isLoading: this.state.loading
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
    const nextPayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-28',
        timezone: 'Asia/Tokyo',
        reservations: [
          {
            id: 'reservation-next',
            clinicId: '11111111-1111-4111-8111-111111111111',
            customerName: 'BFF 翌日患者',
            menuName: 'BFF 翌日メニュー',
            staffId: 'staff-next',
            staffName: 'BFF 翌日先生',
            startTime: '2026-04-28T01:00:00.000Z',
            endTime: '2026-04-28T01:30:00.000Z',
            status: 'confirmed',
          },
        ],
      },
      generatedAt: '2026-04-28T00:00:00.000Z',
    };
    const refreshReadData = jest.fn<
      Promise<boolean>,
      [{ date?: string; clinicId?: string }]
    >(async () => {
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', nextPayload);
      return true;
    });
    window.MobileUiuxBridge = { refreshReadData };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-27',
        timezone: 'Asia/Tokyo',
        reservations: [
          {
            id: 'reservation-current',
            clinicId: '11111111-1111-4111-8111-111111111111',
            customerName: 'BFF 当日患者',
            menuName: 'BFF 当日メニュー',
            staffId: 'staff-current',
            staffName: 'BFF 当日先生',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'confirmed',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const initialVals = component.renderVals();
    const nextDate = initialVals.nextDate;
    if (typeof nextDate !== 'function') {
      throw new Error('Expected nextDate function');
    }

    await nextDate();
    const vals = component.renderVals();
    const rows = Array.isArray(vals.rows) ? vals.rows : [];
    const firstRow = getRecord(rows[0]);

    expect(refreshReadData).toHaveBeenCalledWith({ date: '2026-04-28' });
    expect(vals.dateLabel).toBe('4/28（火）');
    expect(firstRow.patient).toBe('BFF 翌日患者');
    expect(firstRow.menu).toBe('BFF 翌日メニュー');
    expect(JSON.stringify(vals)).not.toContain('BFF 当日患者');
  });

  it('does not render previous reservations as the target date when refresh fails', async () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  HOME = 'c1';
  DAYS = ['4/26（日）', '4/27（月）', '4/28（火）'];
  STATUS = {
    confirmed: { label: '確定', c: 'confirmed-c', b: 'confirmed-b' },
    unconfirmed: { label: '未確定', c: 'unconfirmed-c', b: 'unconfirmed-b' },
    cancelled: { label: 'キャンセル', c: 'cancelled-c', b: 'cancelled-b' },
    noshow: { label: '無断', c: 'noshow-c', b: 'noshow-b' },
    arrived: { label: '来院済み', c: 'arrived-c', b: 'arrived-b' }
  };
  state = { dateIndex: 1, appts: [], loading: false, role: 'staff', clinic: 'c1' };
  initial(name) {
    return name.trim().charAt(0);
  }
  openDetail = (id) => () => this.setState({ detailId: id });
  renderVals() {
    return {
      dateLabel: this.DAYS[this.state.dateIndex],
      nextDate: this.nextDate,
      rows: this.state.appts.map(appt => ({ patient: appt.patient, menu: appt.menu })),
      isLoading: this.state.loading
    };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);
    const refreshReadData = jest.fn<
      Promise<boolean>,
      [{ date?: string; clinicId?: string }]
    >(async () => false);
    window.MobileUiuxBridge = { refreshReadData };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-27',
        timezone: 'Asia/Tokyo',
        reservations: [
          {
            id: 'reservation-current',
            clinicId: '11111111-1111-4111-8111-111111111111',
            customerName: 'BFF 当日患者',
            menuName: 'BFF 当日メニュー',
            staffId: 'staff-current',
            staffName: 'BFF 当日先生',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'confirmed',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const nextDate = component.renderVals().nextDate;
    if (typeof nextDate !== 'function') {
      throw new Error('Expected nextDate function');
    }

    await nextDate();
    const vals = component.renderVals();

    expect(refreshReadData).toHaveBeenCalledWith({ date: '2026-04-28' });
    expect(vals.dateLabel).toBe('4/28（火）');
    expect(vals.rows).toEqual([]);
    expect(vals.isLoading).toBe(false);
    expect(JSON.stringify(vals)).not.toContain('BFF 当日患者');
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

  function buildHomeDashboardPayload(
    dashboardOverrides: Record<string, unknown>
  ) {
    return {
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
          alerts: [],
          ...dashboardOverrides,
        },
        reservationSummary: { total: 41, unconfirmed: 7, cancelled: 3 },
        dailyReportStatus: { done: 2, review: 1, missing: 4, rows: [] },
        attentions: [],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };
  }

  function buildHomeComponentSource(): string {
    return `class Component extends DCLogic {
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
      showAiCard: true,
      aiSummary: 'mock ai summary should not survive',
      aiPoints: ['mock ai point should not survive'],
      showRevCard: true,
      revBars: [{ h: '10%', fill: 'x', label: 'mock', labelC: 'x', labelW: '500' }],
      revDelta: 'mock delta should not survive',
      showHeatCard: true,
      heatCells: [{ bg: 'mock-bg', label: 'mock-label' }]
    };
  }
}`;
  }

  it('maps dashboard.aiComment to aiSummary/aiPoints and hides mock text', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(buildHomeComponentSource()),
      { screen: 'home' }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    component.componentDidMount();

    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({
        aiComment: {
          id: 'ai-1',
          summary: 'real ai summary',
          highlights: ['real highlight'],
          improvements: ['real improvement'],
          suggestions: ['real suggestion'],
          created_at: '2026-06-30T00:00:00.000Z',
        },
      })
    );
    const vals = component.renderVals();

    expect(applied).toBe(true);
    expect(vals.showAiCard).toBe(true);
    expect(vals.aiSummary).toBe('real ai summary');
    expect(vals.aiPoints).toEqual([
      'real highlight',
      'real improvement',
      'real suggestion',
    ]);
    expect(vals.aiSummary).not.toContain('should not survive');
    expect(JSON.stringify(vals.aiPoints)).not.toContain('should not survive');
  });

  it('hides the AI card when dashboard.aiComment is null', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(buildHomeComponentSource()),
      { screen: 'home' }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    component.componentDidMount();

    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({ aiComment: null })
    );
    const vals = component.renderVals();

    expect(applied).toBe(true);
    expect(vals.showAiCard).toBe(false);
  });

  it('maps dashboard.revenueChartData to revVals/revBars and hides when empty', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(buildHomeComponentSource()),
      { screen: 'home' }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    component.componentDidMount();

    const appliedWithData = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({
        revenueChartData: [
          { name: '6/24', 総売上: 100000, 保険診療: 40000, 自費診療: 60000 },
          { name: '6/25', 総売上: 120000, 保険診療: 50000, 自費診療: 70000 },
        ],
      })
    );
    const valsWithData = component.renderVals();

    expect(appliedWithData).toBe(true);
    expect(valsWithData.showRevCard).toBe(true);
    expect(valsWithData.revVals).toEqual([100000, 120000]);
    expect(Array.isArray(valsWithData.revBars)).toBe(true);
    expect((valsWithData.revBars as unknown[]).length).toBe(2);
    expect(JSON.stringify(valsWithData.revBars)).not.toContain(
      'should not survive'
    );
    expect(valsWithData.revDelta).not.toContain('should not survive');

    const appliedEmpty = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({ revenueChartData: [] })
    );
    const valsEmpty = component.renderVals();

    expect(appliedEmpty).toBe(true);
    expect(valsEmpty.showRevCard).toBe(false);
  });

  it('maps dashboard.heatmapData to heatCells and hides when empty', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(buildHomeComponentSource()),
      { screen: 'home' }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    component.componentDidMount();

    const appliedWithData = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({
        heatmapData: [
          { hour_of_day: 10, day_of_week: 1, visit_count: 2, avg_revenue: 1000 },
          { hour_of_day: 11, day_of_week: 1, visit_count: 8, avg_revenue: 2000 },
        ],
      })
    );
    const valsWithData = component.renderVals();

    expect(appliedWithData).toBe(true);
    expect(valsWithData.showHeatCard).toBe(true);
    expect(Array.isArray(valsWithData.heatCells)).toBe(true);
    expect((valsWithData.heatCells as unknown[]).length).toBe(2);
    expect(JSON.stringify(valsWithData.heatCells)).not.toContain(
      'should not survive'
    );

    const appliedEmpty = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({ heatmapData: [] })
    );
    const valsEmpty = component.renderVals();

    expect(appliedEmpty).toBe(true);
    expect(valsEmpty.showHeatCard).toBe(false);
  });

  it('suppresses unbacked mock blocks (clinicCards/events/signals/perfRows) on primary home hydration', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(buildHomeComponentSource()),
      { screen: 'home' }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    component.componentDidMount();

    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      buildHomeDashboardPayload({})
    );
    const vals = component.renderVals();

    expect(applied).toBe(true);
    expect(vals.showClinicCards).toBe(false);
    expect(vals.showEvents).toBe(false);
    expect(vals.showSignals).toBe(false);
    expect(vals.showPerfRows).toBe(false);
  });

  it('keeps sample show flags true when the home payload is invalid (fallback contract)', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(buildHomeComponentSource()),
      { screen: 'home' }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    component.componentDidMount();

    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('home', {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });
    const vals = component.renderVals();

    expect(applied).toBe(false);
    expect(vals.showAiCard).toBe(true);
    expect(vals.showRevCard).toBe(true);
    expect(vals.showHeatCard).toBe(true);
  });

  it('replaces fake APPTS-derived agenda rows with real reservations data on home', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  SEV = {
    critical: { label: '要対応', c: 'critical-c', b: 'critical-b' },
    warning: { label: '注意', c: 'warning-c', b: 'warning-b' },
    info: { label: '情報', c: 'info-c', b: 'info-b' }
  };
  STATUS = {
    unconfirmed: { label: '未確認', c: 'uc-c', b: 'uc-b' },
    confirmed: { label: '確定', c: 'cf-c', b: 'cf-b' },
    arrived: { label: '来院済み', c: 'cf-c', b: 'cf-b' },
    cancelled: { label: 'キャンセル', c: 'fg3-c', b: 'cn-b' },
    noshow: { label: '来院なし', c: 'ns-c', b: 'ns-b' }
  };
  link(message) {
    return () => message;
  }
  renderVals() {
    return {
      dateLabel: 'sample-date',
      kpis: [{ label: 'sample-kpi', value: 'sample' }],
      attentions: [],
      attCount: '0件',
      agTotal: 99,
      agUnc: 99,
      agCancel: 99,
      drDone: 0,
      drReview: 0,
      drMissing: 0,
      reportRows: [],
      agendaRows: [
        { isAppt: true, patient: '渡辺 結衣', menu: '産後骨盤矯正', ther: '田中 健太' },
        { isAppt: true, patient: '伊藤 春香', menu: '鍼灸施術', ther: '佐藤 美咲' }
      ]
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
        reservations: [
          {
            customerName: 'E2Eテスト患者',
            menuName: '産後骨盤矯正',
            staffName: 'BFF 先生',
            startTime: '2026-06-30T01:00:00.000Z',
            endTime: '2026-06-30T01:30:00.000Z',
            status: 'confirmed',
          },
          {
            customerName: 'E2Eテスト患者2',
            menuName: '鍼灸施術',
            staffName: 'BFF 先生2',
            startTime: '2026-06-30T02:00:00.000Z',
            endTime: '2026-06-30T02:40:00.000Z',
            status: 'arrived',
          },
        ],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const agendaRows = Array.isArray(vals.agendaRows) ? vals.agendaRows : [];
    const serialized = JSON.stringify(agendaRows);

    expect(applied).toBe(true);
    expect(serialized).toContain('E2Eテスト患者');
    expect(serialized).toContain('E2Eテスト患者2');
    expect(serialized).not.toContain('渡辺 結衣');
    expect(serialized).not.toContain('伊藤 春香');
    expect(serialized).not.toContain('田中 健太');
    expect(serialized).not.toContain('佐藤 美咲');
  });

  it('applies a home payload before or after a reservations-shaped payload without losing context overrides', () => {
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
      attentions: [],
      attCount: '0件',
      agTotal: 0,
      agUnc: 0,
      agCancel: 0,
      drDone: 0,
      drReview: 0,
      drMissing: 0,
      reportRows: [],
      agendaRows: []
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
    const reservationsApplied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'home',
      {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [
            {
              customerName: 'E2Eテスト患者',
              menuName: '産後骨盤矯正',
              staffName: 'BFF 先生',
              startTime: '2026-06-30T01:00:00.000Z',
              endTime: '2026-06-30T01:30:00.000Z',
              status: 'confirmed',
            },
          ],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }
    );
    const homeApplied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('home', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-06-30',
        timezone: 'Asia/Tokyo',
        dashboard: {
          dailyData: {
            revenue: 100000,
            patients: 10,
            insuranceRevenue: 40000,
            privateRevenue: 60000,
          },
          alerts: [],
        },
        reservationSummary: { total: 5, unconfirmed: 1, cancelled: 0 },
        dailyReportStatus: { done: 1, review: 0, missing: 0, rows: [] },
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const agendaRows = Array.isArray(vals.agendaRows) ? vals.agendaRows : [];

    expect(reservationsApplied).toBe(true);
    expect(homeApplied).toBe(true);
    expect(JSON.stringify(agendaRows)).toContain('E2Eテスト患者');
    expect(vals.agTotal).toBe(5);
  });

  it('hydrates patients KPI, patient lists, and detail values from BFF payload', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  state = { pClinic: 'all', mClinic: 'all', mPeriod: 'month', detailClinic: null };
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  man(n) {
    return '¥' + (Math.round(n / 1000) / 10).toFixed(1) + '万';
  }
  initial(name) {
    return name.trim().charAt(0);
  }
  openDetail = (id) => () => this.setState({ detailClinic: id });
  renderVals() {
    return {
      scopeLabel: '本町ケア整骨院',
      scSummary: [{ label: '来院患者数', value: '312名' }],
      funnel: [{ label: '新患', value: '48名' }],
      trendBars: [{ label: '6月', newH: '48px', repH: '264px' }],
      segments: [{ label: 'VIP', value: '24名' }],
      riskList: [{ name: '木村 美穂' }],
      followList: [{ name: '三浦 彩' }],
      ltvList: [{ name: '渡辺 結衣' }],
      riskHighCount: 3,
      pClinic: this.state.pClinic,
      clinicSelOpts: [{ v: 'all', l: '全院（担当院すべて）' }],
      periodLabel: '今月',
      kpiBoxes: [{ label: '総売上', value: '¥184.0万' }],
      chartBars: [{ short: '本町', value: 312 }],
      clinicCards: [{ name: '本町ケア整骨院' }],
      detailOpen: false,
      dName: '本町ケア整骨院',
      dKpi: [{ label: '来院患者数', value: '312名' }],
      dRisk: [{ name: '井上 健' }],
      dFollow: [{ name: '高橋 涼介' }]
    };
  }
}`),
      {
        screen: 'patients',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);

    component.componentDidMount();
    const beforeHydrationVals = component.renderVals();
    expect(beforeHydrationVals.scopeLabel).toBe('実データ読み込み中');
    expect(beforeHydrationVals.riskList).toEqual([]);
    expect(JSON.stringify(beforeHydrationVals)).not.toContain('木村 美穂');
    expect(JSON.stringify(beforeHydrationVals)).not.toContain('三浦 彩');
    expect(JSON.stringify(beforeHydrationVals)).not.toContain('渡辺 結衣');

    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('patients', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        clinicName: 'BFF 本町院',
        analysis: {
          totalPatients: 2,
          activePatients: 1,
          conversionData: {
            newPatients: 1,
            returnPatients: 1,
            conversionRate: 50,
            stages: [
              { name: '初回来院', value: 2 },
              { name: '2回目来院', value: 1 },
            ],
          },
          visitCounts: { average: 2, monthlyChange: 0 },
          riskScores: [],
          ltvRanking: [],
          segmentData: {
            visit: [
              { label: '中度リピート', value: 1 },
              { label: '初診のみ', value: 1 },
            ],
          },
          followUpList: [
            {
              name: 'BFF 患者A',
              reason: '80%の離脱リスク',
              lastVisit: '2026-06-01',
              action: '電話フォロー推奨',
            },
          ],
        },
        rows: [
          {
            name: 'BFF 患者A',
            lastVisit: '2026-06-01',
            visitCount: 3,
            totalRevenue: 30000,
            ltv: 30000,
            riskScore: 80,
            riskCategory: 'high',
          },
          {
            name: 'BFF 患者B',
            lastVisit: '2026-06-10',
            visitCount: 1,
            totalRevenue: 8000,
            ltv: 8000,
            riskScore: 20,
            riskCategory: 'low',
          },
        ],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const summary = Array.isArray(vals.scSummary) ? vals.scSummary : [];
    const firstSummary = getRecord(summary[0]);
    const riskList = Array.isArray(vals.riskList) ? vals.riskList : [];
    const firstRisk = getRecord(riskList[0]);
    const followList = Array.isArray(vals.followList) ? vals.followList : [];
    const firstFollow = getRecord(followList[0]);
    const ltvList = Array.isArray(vals.ltvList) ? vals.ltvList : [];
    const firstLtv = getRecord(ltvList[0]);
    const clinicCards = Array.isArray(vals.clinicCards) ? vals.clinicCards : [];
    const firstClinic = getRecord(clinicCards[0]);
    const onTap = firstClinic.onTap;
    if (typeof onTap !== 'function') {
      throw new Error('Expected patients clinic card onTap to be a function');
    }
    onTap();
    const detailVals = component.renderVals();
    const detailKpis = Array.isArray(detailVals.dKpi) ? detailVals.dKpi : [];
    const firstDetailKpi = getRecord(detailKpis[0]);
    const serialized = JSON.stringify(vals);

    expect(applied).toBe(true);
    expect(vals.scopeLabel).toBe('BFF 本町院');
    expect(firstSummary).toEqual({
      label: '来院患者数',
      value: '2名',
      color: 'var(--fg)',
    });
    expect(vals.riskHighCount).toBe(1);
    expect(firstRisk.name).toBe('BFF 患者A');
    expect(firstRisk.level).toBe('高');
    expect(firstFollow.name).toBe('BFF 患者A');
    expect(firstLtv.name).toBe('BFF 患者A');
    expect(firstClinic.name).toBe('BFF 本町院');
    expect(detailVals.detailOpen).toBe(true);
    expect(detailVals.dName).toBe('BFF 本町院');
    expect(firstDetailKpi.value).toBe('2名');
    expect(serialized).not.toContain('木村 美穂');
    expect(serialized).not.toContain('三浦 彩');
    expect(serialized).not.toContain('渡辺 結衣');
    expect(serialized).not.toContain('本町ケア整骨院');
  });

  it('builds clinic_hours settings payloads from the settings-detail save bar', async () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  state = {
    nav: [{ scr: 'clinic' }],
    clinicTab: 'hours',
    saving: false,
    hours: [
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '10:00', end: '18:00' }] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] }
    ],
    special: [
      { date: '2026-07-20', type: '休診', label: '海の日' },
      { date: '2026-08-13', type: '短縮営業', label: '夏季短縮' }
    ],
    toast: ''
  };
  toast(message) {
    this.setState({ toast: message });
  }
  renderVals() {
    return {
      onSave: () => false,
      saveLabel: 'sample'
    };
  }
}`),
      {
        screen: 'settings-detail',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);
    const updateSettings = jest.fn<Promise<boolean>, [unknown]>(
      async () => true
    );
    window.MobileUiuxBridge = { updateSettings };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('settings-detail', {
      success: true,
      data: {
        category: 'clinic_hours',
        settings: {
          hoursByDay: {
            monday: {
              open: true,
              slots: [{ start: '09:00', end: '13:00' }],
            },
            tuesday: {
              open: true,
              slots: [{ start: '10:00', end: '18:00' }],
            },
          },
          specialClosures: [
            { date: '2026-07-20', type: '休診', label: '海の日' },
            { date: '2026-08-13', type: '短縮営業', label: '夏季短縮' },
          ],
        },
      },
      generatedAt: '2026-07-01T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const onSave = vals.onSave;
    if (typeof onSave !== 'function') {
      throw new Error('Expected settings-detail onSave to be a function');
    }
    await expect(onSave()).resolves.toBe(true);

    expect(updateSettings).toHaveBeenCalledWith({
      category: 'clinic_hours',
      settings: {
        hoursByDay: {
          monday: { open: true, slots: [{ start: '09:00', end: '13:00' }] },
          tuesday: { open: true, slots: [{ start: '10:00', end: '18:00' }] },
          wednesday: { open: false, slots: [] },
          thursday: { open: false, slots: [] },
          friday: { open: false, slots: [] },
          saturday: { open: false, slots: [] },
          sunday: { open: false, slots: [] },
        },
        holidays: ['2026-07-20'],
        specialClosures: [
          { date: '2026-07-20', type: '休診', label: '海の日' },
          { date: '2026-08-13', type: '短縮営業', label: '夏季短縮' },
        ],
      },
    });
    expect(component.state.toast).toBe('設定を保存しました');
  });

  it('applies returned clinic_hours read models to the settings-detail UI state', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  state = {
    nav: [{ scr: 'clinic' }],
    clinicTab: 'hours',
    hours: [
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '09:00', end: '13:00' }] },
      { open: true, slots: [{ start: '09:00', end: '13:00' }] }
    ],
    special: []
  };
  renderVals() {
    return { onSave: () => false };
  }
}`),
      {
        screen: 'settings-detail',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'settings-detail',
      {
        success: true,
        data: {
          category: 'clinic_hours',
          settings: {
            hoursByDay: {
              monday: { open: false, slots: [] },
              tuesday: {
                open: true,
                slots: [{ start: '11:00', end: '19:00' }],
              },
            },
            holidays: ['2026-09-21'],
          },
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }
    );
    const hours = Array.isArray(component.state.hours)
      ? component.state.hours
      : [];
    const monday = getRecord(hours[0]);
    const tuesday = getRecord(hours[1]);
    const tuesdaySlots = Array.isArray(tuesday.slots) ? tuesday.slots : [];
    const special = Array.isArray(component.state.special)
      ? component.state.special
      : [];
    const firstSpecial = getRecord(special[0]);

    expect(applied).toBe(true);
    expect(monday.open).toBe(false);
    expect(tuesday.open).toBe(true);
    expect(tuesdaySlots).toEqual([{ start: '11:00', end: '19:00' }]);
    expect(firstSpecial).toEqual({
      date: '2026-09-21',
      type: '休診',
      label: '',
    });
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

  it('hydrates reservations write options from settings-detail without sample menu or staff labels', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  CLINICS = [{ id: 'c1', name: '本町ケア整骨院' }];
  MENUS = [{ name: '産後骨盤矯正', dur: 45 }];
  THER = [{ id: 'sample-staff', name: '田中 健太', role: '柔整師', clinic: 'c1' }];
  state = {
    fMenu: '産後骨盤矯正',
    fDur: 45,
    fRes: 'sample-staff',
    timelineRes: 'sample-staff'
  };
  renderVals() {
    return {
      fMenu: this.state.fMenu,
      fRes: this.state.fRes,
      menuOpts: this.MENUS.map(menu => ({ v: menu.name, l: menu.name + '（' + menu.dur + '分）' })),
      resOpts: this.THER.map(resource => ({ v: resource.id, l: resource.name + ' / ' + resource.role })),
      clinicOpts: this.CLINICS.map(clinic => clinic.name),
      historyItems: this.historyFor({ patient: '渡辺 結衣', res: 'sample-staff' })
    };
  }
  historyFor() {
    return [{ date: '6/6（金）', menu: '産後骨盤矯正', ther: '田中 健太' }];
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'settings-detail',
      {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          clinic: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'BFF 実院',
          },
          menus: [
            {
              id: 'menu-bff',
              name: 'BFF 実メニュー',
              durationMinutes: 35,
              price: 5200,
              isActive: true,
            },
          ],
          resources: [
            {
              id: 'staff-bff',
              name: 'BFF 実担当',
              type: 'staff',
              isActive: true,
              isBookable: true,
            },
          ],
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }
    );
    const vals = component.renderVals();
    const serialized = JSON.stringify(vals);

    expect(applied).toBe(true);
    expect(vals.fMenu).toBe('BFF 実メニュー');
    expect(vals.fRes).toBe('staff-bff');
    expect(serialized).toContain('BFF 実メニュー');
    expect(serialized).toContain('BFF 実担当');
    expect(serialized).toContain('BFF 実院');
    expect(serialized).not.toContain('産後骨盤矯正');
    expect(serialized).not.toContain('田中 健太');
    expect(serialized).not.toContain('本町ケア整骨院');
    expect(vals.historyItems).toEqual([]);
  });

  it('clears daily-reports sample line items and hydrates write options from settings-detail', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  THER = [{ id: 'sample-therapist', name: '佐藤 美咲' }];
  MENUS_DR = [{ name: '美容鍼', price: 5500, type: '自費' }];
  state = {
    formOpen: false,
    editKey: null,
    formTher: 'sample-therapist',
    items: [],
    itemSeq: 10,
    todayItems: [{ id: 1, patient: '渡辺 結衣', menu: '美容鍼', type: '自費', ratio: 3 }]
  };
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  openInput = (key) => () => {
    const items = key === 'd0' ? this.state.todayItems.map(item => ({ ...item })) : [];
    this.setState({ formOpen: true, editKey: key, items });
  };
  inputToday = this.openInput('d0');
  addItem = () => this.setState(state => {
    const menu = this.MENUS_DR[0];
    return {
      items: [...state.items, { id: state.itemSeq, patient: '', menu: menu ? menu.name : '', type: menu ? menu.type : '自費', ratio: 3 }],
      itemSeq: state.itemSeq + 1
    };
  });
  renderVals() {
    return {
      inputToday: this.inputToday,
      addItem: this.addItem,
      formDate: this.state.formDate,
      formTher: this.state.formTher,
      menuOpts: this.MENUS_DR.map(menu => ({ v: menu.name, l: menu.name })),
      therOpts: this.THER.map(therapist => ({ v: therapist.id, l: therapist.name })),
      itemRows: this.state.items.map(item => ({ patient: item.patient, menuVal: item.menu }))
    };
  }
}`,
      { screen: 'daily-reports' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
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
    const settingsApplied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'settings-detail',
      {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          clinic: null,
          menus: [
            {
              id: 'menu-bff',
              name: 'BFF 実メニュー',
              durationMinutes: 30,
              price: 4100,
              isInsuranceApplicable: false,
              isActive: true,
            },
          ],
          resources: [
            {
              id: 'therapist-bff',
              name: 'BFF 実記入者',
              isActive: true,
            },
          ],
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }
    );
    const initialVals = component.renderVals();
    const inputToday = initialVals.inputToday;
    if (typeof inputToday !== 'function') {
      throw new Error('Expected inputToday function');
    }
    inputToday();
    const addItem = component.renderVals().addItem;
    if (typeof addItem !== 'function') {
      throw new Error('Expected addItem function');
    }
    addItem();
    const vals = component.renderVals();
    const serialized = JSON.stringify(vals);

    expect(settingsApplied).toBe(true);
    expect(vals.formDate).toBe('7/1（水）');
    expect(vals.formTher).toBe('therapist-bff');
    expect(serialized).toContain('BFF 実メニュー');
    expect(serialized).toContain('BFF 実記入者');
    expect(serialized).not.toContain('渡辺 結衣');
    expect(serialized).not.toContain('美容鍼');
    expect(serialized).not.toContain('佐藤 美咲');
  });

  it('hydrates settings-detail clinic and menu values while hiding unsupported save bars', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  CLINICS = [{ id: 'sample-clinic', name: '本町ケア整骨院' }];
  state = {
    nav: [{ scr: 'clinic' }],
    clinicTab: 'basic',
    menuSheet: false,
    clinicSheet: false,
    saving: false,
    clinic: 'sample-clinic',
    basic: { name: '本町ケア整骨院', tel: '06-0000-0000', zip: '', fax: '', addr: '大阪市サンプル', email: '', site: '' },
    menus: [{ id: 'sample-menu', name: '産後骨盤矯正', cat: '骨盤矯正', kind: 'self', dur: '45', price: '6600', active: true }]
  };
  renderVals() {
    return {
      showSaveBar: true,
      clinicName: this.state.basic.name,
      basicFields: [{ label: '院名', value: this.state.basic.name }],
      menuCards: this.state.menus.map(menu => ({ name: menu.name, category: menu.cat }))
    };
  }
}`,
      { screen: 'settings-detail' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
      'settings-detail',
      {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          clinic: {
            id: 'clinic-bff',
            name: 'BFF 実クリニック',
            address: 'BFF 実住所',
            phoneNumber: '03-1111-2222',
          },
          menus: [
            {
              id: 'menu-bff',
              name: 'BFF 実メニュー',
              category: '実カテゴリ',
              durationMinutes: 40,
              price: 7700,
              isInsuranceApplicable: false,
              isActive: true,
            },
          ],
          resources: [],
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }
    );
    const basicVals = component.renderVals();
    component.state = {
      ...component.state,
      nav: [{ scr: 'clinic' }],
      clinicTab: 'hours',
    };
    const hoursVals = component.renderVals();
    const serialized = JSON.stringify(basicVals);

    expect(applied).toBe(true);
    expect(basicVals.showSaveBar).toBe(false);
    expect(hoursVals.showSaveBar).toBe(true);
    expect(serialized).toContain('BFF 実クリニック');
    expect(serialized).toContain('BFF 実メニュー');
    expect(serialized).not.toContain('本町ケア整骨院');
    expect(serialized).not.toContain('産後骨盤矯正');
    expect(serialized).not.toContain('大阪市サンプル');
  });

  it('wires daily report save to the mobile bridge without sending patient names', async () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  MENUS_DR = [
    { name: '保険施術（健康保険）', price: 5000, type: '保険' },
    { name: '産後骨盤矯正', price: 4400, type: '自費' }
  ];
  state = {
    role: 'therapist',
    editKey: 'd0',
    formOpen: true,
    confirmDel: null,
    toast: '',
    items: [
      { id: 1, patient: '患者名は送らない', menu: '保険施術（健康保険）', type: '保険', ratio: 3 },
      { id: 2, patient: '自由記述も送らない', menu: '産後骨盤矯正', type: '自費', ratio: 3 }
    ]
  };
  toast(message) {
    this.setState({ toast: message });
  }
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  amt(it) {
    const menu = this.MENUS_DR.find(item => item.name === it.menu) || { price: 0 };
    return it.type === '保険' ? Math.round(menu.price * it.ratio / 10) : menu.price;
  }
  renderVals() {
    return {
      saveReport: this.saveReport,
      formOpen: this.state.formOpen
    };
  }
}`,
      { screen: 'daily-reports' }
    );
    const { component, window } = evaluatePatchedComponent(patched);
    const submitDailyReport = jest.fn(async () => true);
    window.MobileUiuxBridge = { submitDailyReport };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        startDate: '2026-06-30',
        endDate: '2026-06-30',
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
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('settings-detail', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        clinic: null,
        menus: [
          {
            id: 'menu-insurance',
            name: 'BFF 保険施術',
            price: 5000,
            durationMinutes: 30,
            isInsuranceApplicable: true,
            isActive: true,
          },
          {
            id: 'menu-private',
            name: 'BFF 自費施術',
            price: 4400,
            durationMinutes: 40,
            isInsuranceApplicable: false,
            isActive: true,
          },
        ],
        resources: [],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    component.state = {
      ...component.state,
      role: 'therapist',
      editKey: 'd0',
      formOpen: true,
      items: [
        {
          id: 1,
          patient: '患者名は送らない',
          menu: 'BFF 保険施術',
          type: '保険',
          ratio: 3,
        },
        {
          id: 2,
          patient: '自由記述も送らない',
          menu: 'BFF 自費施術',
          type: '自費',
          ratio: 3,
        },
      ],
    };
    const saveReport = component.renderVals().saveReport;
    if (typeof saveReport !== 'function') {
      throw new Error('Expected patched saveReport');
    }

    await saveReport();

    expect(submitDailyReport).toHaveBeenCalledWith({
      report_date: '2026-06-30',
      total_patients: 2,
      new_patients: 0,
      total_revenue: 5900,
      insurance_revenue: 1500,
      private_revenue: 4400,
      report_text: null,
    });
    expect(component.state.formOpen).toBe(false);
    expect(component.state.toast).toBe('日報を保存しました');
    expect(JSON.stringify(submitDailyReport.mock.calls)).not.toContain(
      '患者名は送らない'
    );
  });

  it('keeps the daily report form open when write flags make bridge save fail', async () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  MENUS_DR = [{ name: '産後骨盤矯正', price: 4400, type: '自費' }];
  state = {
    role: 'therapist',
    editKey: 'd0',
    formOpen: true,
    confirmDel: null,
    toast: '',
    items: [{ id: 1, patient: '患者A', menu: '産後骨盤矯正', type: '自費', ratio: 3 }]
  };
  toast(message) {
    this.setState({ toast: message });
  }
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  amt(it) {
    const menu = this.MENUS_DR.find(item => item.name === it.menu) || { price: 0 };
    return menu.price;
  }
  renderVals() {
    return { saveReport: this.saveReport, formOpen: this.state.formOpen };
  }
}`,
      { screen: 'daily-reports' }
    );
    const { component, window } = evaluatePatchedComponent(patched);
    const submitDailyReport = jest.fn(async () => false);
    window.MobileUiuxBridge = { submitDailyReport };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('daily-reports', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        startDate: '2026-06-30',
        endDate: '2026-06-30',
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
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const saveReport = component.renderVals().saveReport;
    if (typeof saveReport !== 'function') {
      throw new Error('Expected patched saveReport');
    }

    await saveReport();

    expect(submitDailyReport).toHaveBeenCalledTimes(1);
    expect(component.state.formOpen).toBe(true);
    expect(component.state.toast).toBe('日報は保存されていません');
  });

  it('wires reservation form creation to the mobile bridge with hydrated IDs and applies the returned row', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const reservationId = '22222222-2222-4222-8222-222222222222';
    const menuId = '33333333-3333-4333-8333-333333333333';
    const staffId = '44444444-4444-4444-8444-444444444444';
    const customerId = '55555555-5555-4555-8555-555555555555';
    const createdReservationId = '66666666-6666-4666-8666-666666666666';
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  CLINICS = [{ id: 'c1', name: '本町ケア整骨院' }];
  MENUS = [{ id: 'sample-menu', name: '産後骨盤矯正', dur: 45 }];
  THER = [{ id: 'sample-staff', name: '田中 健太', role: '柔整師', clinic: 'c1' }];
  state = {
    appts: [],
    formOpen: true,
    fStart: 660,
    fDur: 45,
    fMenu: '産後骨盤矯正',
    fRes: 'sample-staff',
    fPatient: 'BFF 患者A',
    fNote: '  施術メモ  ',
    fNominated: true,
    toast: ''
  };
  toast(message) {
    this.setState({ toast: message });
  }
  initial(name) {
    return (name || '？').trim().charAt(0);
  }
  renderVals() {
    return {
      rows: this.state.appts.map(appt => ({ patient: appt.patient, menu: appt.menu, statusLabel: appt.status })),
      submitForm: this.submitForm,
      formOpen: this.state.formOpen,
      fMenu: this.state.fMenu,
      fRes: this.state.fRes
    };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);
    const createReservation = jest.fn(async () => {
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
        success: true,
        data: {
          clinicId,
          reservation: {
            id: createdReservationId,
            clinicId,
            customerId,
            customerName: 'BFF 患者A',
            menuId,
            menuName: 'BFF 実メニュー',
            staffId,
            staffName: 'BFF 実担当',
            startTime: '2026-04-27T02:00:00.000Z',
            endTime: '2026-04-27T02:35:00.000Z',
            status: 'unconfirmed',
          },
        },
        generatedAt: '2026-04-27T00:00:00.000Z',
      });
      return true;
    });
    window.MobileUiuxBridge = { createReservation };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        clinicId,
        date: '2026-04-27',
        timezone: 'Asia/Tokyo',
        reservations: [
          {
            id: reservationId,
            clinicId,
            customerId,
            customerName: 'BFF 患者A',
            menuId,
            menuName: 'BFF 実メニュー',
            staffId,
            staffName: 'BFF 実担当',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:35:00.000Z',
            status: 'confirmed',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('settings-detail', {
      success: true,
      data: {
        clinicId,
        clinic: {
          id: clinicId,
          name: 'BFF 実院',
        },
        menus: [
          {
            id: menuId,
            name: 'BFF 実メニュー',
            durationMinutes: 35,
            price: 5200,
            isActive: true,
          },
        ],
        resources: [
          {
            id: staffId,
            name: 'BFF 実担当',
            type: 'staff',
            isActive: true,
            isBookable: true,
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });

    const submitForm = component.renderVals().submitForm;
    if (typeof submitForm !== 'function') {
      throw new Error('Expected patched submitForm');
    }

    await submitForm();
    const updatedRows = component.renderVals().rows;
    if (!Array.isArray(updatedRows)) {
      throw new Error('Expected updated reservation rows');
    }
    const serializedCalls = JSON.stringify(createReservation.mock.calls);

    expect(createReservation).toHaveBeenCalledWith({
      customerId,
      menuId,
      staffId,
      startTime: '2026-04-27T02:00:00.000Z',
      endTime: '2026-04-27T02:35:00.000Z',
      channel: 'walk_in',
      isStaffRequested: true,
      notes: '施術メモ',
    });
    expect(serializedCalls).not.toContain('sample-menu');
    expect(serializedCalls).not.toContain('sample-staff');
    expect(serializedCalls).not.toContain('BFF 患者A');
    expect(updatedRows).toHaveLength(2);
    expect(component.state.formOpen).toBe(false);
    expect(component.state.toast).toBe('予約を登録しました');
  });

  it('wires reservation status updates to the mobile bridge and applies the returned read model', async () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  THER = [];
  state = {
    appts: [],
    detailId: null,
    toast: ''
  };
  openDetail = (id) => () => this.setState({ detailId: id });
  toast(message) {
    this.setState({ toast: message });
  }
  initial(name) {
    return (name || '？').trim().charAt(0);
  }
  renderVals() {
    const rows = this.state.appts.map(appt => ({
      patient: appt.patient,
      statusLabel: appt.status,
      onTap: this.openDetail(appt.id)
    }));
    return {
      rows,
      confirmAppt: this.confirmAppt,
      arrivalOpts: [{ label: '来院済み', onTap: this.setArrival('arrived') }]
    };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);
    const updateReservation = jest.fn(async (payload: unknown) => {
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          reservation: {
            id: '22222222-2222-4222-8222-222222222222',
            clinicId: '11111111-1111-4111-8111-111111111111',
            customerName: 'BFF 患者A',
            menuName: 'BFF メニューA',
            staffId: '33333333-3333-4333-8333-333333333333',
            staffName: 'BFF 先生A',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'confirmed',
          },
        },
        generatedAt: '2026-04-27T00:00:00.000Z',
      });
      return true;
    });
    window.MobileUiuxBridge = { updateReservation };

    component.componentDidMount();
    window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-27',
        timezone: 'Asia/Tokyo',
        reservations: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            clinicId: '11111111-1111-4111-8111-111111111111',
            customerName: 'BFF 患者A',
            menuName: 'BFF メニューA',
            staffId: '33333333-3333-4333-8333-333333333333',
            staffName: 'BFF 先生A',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'unconfirmed',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const rows = component.renderVals().rows;
    if (!Array.isArray(rows)) {
      throw new Error('Expected reservation rows');
    }
    const row = getRecord(rows[0]);
    const onTap = row.onTap;
    if (typeof onTap !== 'function') {
      throw new Error('Expected reservation row onTap');
    }
    onTap();
    const confirmAppt = component.renderVals().confirmAppt;
    if (typeof confirmAppt !== 'function') {
      throw new Error('Expected patched confirmAppt');
    }

    await confirmAppt();
    const updatedRows = component.renderVals().rows;
    if (!Array.isArray(updatedRows)) {
      throw new Error('Expected updated reservation rows');
    }
    const updatedRow = getRecord(updatedRows[0]);

    expect(updateReservation).toHaveBeenCalledWith({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      id: '22222222-2222-4222-8222-222222222222',
      status: 'confirmed',
    });
    expect(JSON.stringify(updateReservation.mock.calls)).not.toContain(
      'BFF 患者A'
    );
    expect(updatedRow.statusLabel).toBe('確定');
    expect(component.state.toast).toBe('予約を確定しました');
  });

  it('does not call reservation PATCH for pilot-outside reservation statuses', async () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  THER = [];
  state = {
    appts: [{
      id: '22222222-2222-4222-8222-222222222222',
      patient: '患者名',
      menu: 'メニュー',
      status: 'unconfirmed',
      mobileUiuxClinicId: '11111111-1111-4111-8111-111111111111'
    }],
    detailId: '22222222-2222-4222-8222-222222222222',
    toast: ''
  };
  toast(message) {
    this.setState({ toast: message });
  }
  renderVals() {
    return { arrivalOpts: [{ label: '遅刻', onTap: this.setArrival('late') }] };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);
    const updateReservation = jest.fn(async () => true);
    window.MobileUiuxBridge = { updateReservation };

    component.componentDidMount();
    const arrivalOpts = component.renderVals().arrivalOpts;
    if (!Array.isArray(arrivalOpts)) {
      throw new Error('Expected arrival options');
    }
    const option = getRecord(arrivalOpts[0]);
    const onTap = option.onTap;
    if (typeof onTap !== 'function') {
      throw new Error('Expected arrival option onTap');
    }
    await onTap();

    expect(updateReservation).not.toHaveBeenCalled();
    expect(component.state.toast).toBe('この操作はまだ保存できません');
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

  it('clears the daily-reports fake patient suggestion source on mount', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  PATIENTS = ['渡辺 結衣', '小林 誠一', '加藤 さくら'];
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  genItems = (r) => [{ id: 1000, patient: this.PATIENTS[0] || '', menu: '', type: '自費', ratio: 3 }];
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
        clinicId: '11111111-1111-4111-8111-111111111111',
        startDate: '2026-06-30',
        endDate: '2026-06-30',
        dailyReports: {
          reports: [
            {
              id: 'report-1',
              reportDate: '2026-06-30',
              totalPatients: 18,
              totalRevenue: 120000,
              insuranceRevenue: 40000,
              privateRevenue: 80000,
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
    const generated = component.genItems({ patients: 18 });

    expect(applied).toBe(true);
    expect(component.PATIENTS).toEqual([]);
    expect(JSON.stringify(vals)).not.toContain('渡辺 結衣');
    expect(JSON.stringify(generated)).not.toContain('渡辺 結衣');
  });

  it('hides the reservations self-only filter once real data hydrates', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  SELF = 't1';
  state = { selfOnly: true, role: 'therapist', clinic: 'c1', appts: [] };
  initial(name) {
    return name.trim().charAt(0);
  }
  renderVals() {
    return {
      dateLabel: 'sample-date',
      showSelf: true,
      rows: [{ patient: 'sample-patient' }]
    };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-27',
        reservations: [
          {
            id: 'reservation-1',
            customerName: 'BFF 患者A',
            menuName: 'BFF メニューA',
            staffId: 'staff-real-1',
            staffName: 'BFF 先生A',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'confirmed',
          },
          {
            id: 'reservation-2',
            customerName: 'BFF 患者B',
            menuName: 'BFF メニューB',
            staffId: 'staff-real-2',
            staffName: 'BFF 先生B',
            startTime: '2026-04-27T02:00:00.000Z',
            endTime: '2026-04-27T02:30:00.000Z',
            status: 'unconfirmed',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const rows = Array.isArray(vals.rows) ? vals.rows : [];

    expect(applied).toBe(true);
    // 実データにはSELF('t1')に一致するstaff idが存在しないが、全行が描画される
    expect(rows).toHaveLength(2);
    // 本人IDを解決できないため「自分のみ」トグルはハイドレーション後に非表示。
    // state.selfOnly は元のrenderVals（破棄される）のみが参照するため変更しない
    expect(vals.showSelf).toBe(false);
    expect(component.state.selfOnly).toBe(true);
  });

  describe('context payload hydration', () => {
    const contextPayload = {
      success: true,
      data: {
        role: { canonical: 'therapist', label: '施術者' },
        displayName: 'BFF 表示名',
        accessibleClinics: [{ id: 'c1', name: 'BFF 本町院' }],
        defaultClinicId: 'c1',
        accessibleClinicIds: ['c1'],
        displayMode: 'mobile',
        flags: {
          enabled: true,
          realDataEnabled: true,
          writeEnabled: false,
          reservationWriteEnabled: false,
          dailyReportWriteEnabled: false,
          settingsWriteEnabled: false,
        },
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };

    it('merges greeting and scopeName overrides from context into home rendered overrides', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  NOW = 480;
  renderVals() {
    return { greeting: 'おはようございます、田中さん', scopeName: '本町ケア整骨院', dateLabel: 'sample-date', kpis: [{ label: 'sample-kpi', value: 'sample' }], attentions: [], attCount: '0件' };
  }
}`),
        { screen: 'home' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      const beforeVals = component.renderVals();
      const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
        'context',
        contextPayload
      );
      const afterVals = component.renderVals();

      expect(applied).toBe(false);
      expect((component as unknown as { __mobileUiuxContext?: unknown }).__mobileUiuxContext).toEqual(
        contextPayload.data
      );
      expect(afterVals.dateLabel).toBe(beforeVals.dateLabel);
      expect(afterVals.kpis).toEqual(beforeVals.kpis);
      expect(afterVals.greeting).toBe('おはようございます、BFF 表示名さん');
      expect(afterVals.greeting).not.toContain('田中');
      expect(afterVals.greeting).not.toContain('佐藤');
      expect(afterVals.scopeName).toBe('BFF 本町院');
    });

    it('fails closed to an empty scopeName when defaultClinicId has no matching accessible clinic', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  NOW = 480;
  renderVals() {
    return { greeting: 'おはようございます、田中さん', scopeName: '本町ケア整骨院' };
  }
}`),
        { screen: 'home' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          accessibleClinics: [{ id: 'c2', name: '第二整骨院' }],
          defaultClinicId: 'c1',
        },
      });
      const afterVals = component.renderVals();

      expect(afterVals.scopeName).toBe('');
      expect(JSON.stringify(afterVals)).not.toContain('本町ケア整骨院');
    });

    it('clears the sample scope switcher when context has no valid accessible clinics', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  NOW = 480;
  CLINICS = [
    { id: 'sample-1', name: '本町ケア整骨院' },
    { id: 'sample-2', name: '駅前ケア整骨院' },
  ];
  renderVals() {
    return {
      scopeName: '本町ケア整骨院',
      scopeOpts: this.CLINICS.map(c => ({ name: c.name }))
    };
  }
}`),
        { screen: 'home' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', {
        ...contextPayload,
        data: { ...contextPayload.data, accessibleClinics: [] },
      });
      const vals = component.renderVals();
      const serialized = JSON.stringify(vals);

      expect(vals.scopeName).toBe('');
      expect(vals.scopeOpts).toEqual([]);
      expect(serialized).not.toContain('本町ケア整骨院');
      expect(serialized).not.toContain('駅前ケア整骨院');
    });

    it('falls back to a generic greeting when displayName is null', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  NOW = 480;
  renderVals() {
    return { greeting: 'おはようございます、田中さん', scopeName: '本町ケア整骨院' };
  }
}`),
        { screen: 'home' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', {
        ...contextPayload,
        data: { ...contextPayload.data, displayName: null },
      });
      const afterVals = component.renderVals();

      expect(afterVals.greeting).toBe('おはようございます');
      expect(afterVals.greeting).not.toContain('田中');
      expect(afterVals.greeting).not.toContain('さん');
    });

    it('applies screen payload hydration after context hydration on home without losing context overrides', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  state = { role: 'store' };
  NOW = 480;
  renderVals() {
    return { greeting: 'おはようございます、田中さん', scopeName: '本町ケア整骨院', dateLabel: 'sample-date' };
  }
}`),
        { screen: 'home' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', contextPayload);
      const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('home', {
        success: true,
        data: {
          date: '2026-07-01',
          dashboard: {
            dailyData: { revenue: 1000, patients: 3, insuranceRevenue: 500, privateRevenue: 500 },
            alerts: [],
          },
          reservationSummary: { total: 1, unconfirmed: 0, cancelled: 0 },
          dailyReportStatus: { done: 1, review: 0, missing: 0, rows: [] },
          attentions: [],
        },
      });
      const afterVals = component.renderVals();

      expect(applied).toBe(true);
      expect(afterVals.greeting).toBe('おはようございます、BFF 表示名さん');
      expect(afterVals.scopeName).toBe('BFF 本町院');
      expect(afterVals.dateLabel).not.toBe('sample-date');
    });

    it('stores the context payload on reservations without altering rendered overrides', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  renderVals() {
    return { dateLabel: 'sample-date', sumTotal: 1, rows: [] };
  }
}`),
        { screen: 'reservations' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      const beforeVals = component.renderVals();
      const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
        'context',
        contextPayload
      );
      const afterVals = component.renderVals();

      expect(applied).toBe(false);
      expect((component as unknown as { __mobileUiuxContext?: unknown }).__mobileUiuxContext).toEqual(
        contextPayload.data
      );
      expect(afterVals).toEqual(beforeVals);
    });

    it('stores the context payload on patients and still hydrates a subsequent patients payload', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  state = { pClinic: 'all', mClinic: 'all', mPeriod: 'month', detailClinic: null };
  renderVals() {
    return { scopeLabel: 'sample-scope', riskList: [] };
  }
}`),
        { screen: 'patients' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      const beforeVals = component.renderVals();
      const contextApplied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
        'context',
        contextPayload
      );
      const afterContextVals = component.renderVals();

      expect(contextApplied).toBe(false);
      expect((component as unknown as { __mobileUiuxContext?: unknown }).__mobileUiuxContext).toEqual(
        contextPayload.data
      );
      expect(afterContextVals.scopeLabel).toBe(beforeVals.scopeLabel);

      const patientsApplied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('patients', {
        success: true,
        data: {
          clinicId: 'c1',
          analysis: {
            totalPatients: 10,
            activePatients: 5,
            conversionData: { newPatients: 1, returnPatients: 4, conversionRate: 0.5 },
          },
          rows: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      });

      expect(patientsApplied).toBe(true);
    });

    it('stores the context payload on daily-reports without altering rendered overrides', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  renderVals() {
    return { todayLabel: 'sample-date', listRows: [] };
  }
}`),
        { screen: 'daily-reports' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      const beforeVals = component.renderVals();
      const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
        'context',
        contextPayload
      );
      const afterVals = component.renderVals();

      expect(applied).toBe(false);
      expect((component as unknown as { __mobileUiuxContext?: unknown }).__mobileUiuxContext).toEqual(
        contextPayload.data
      );
      expect(afterVals).toEqual(beforeVals);
    });

    it('merges account name/initial/clinic overrides from context on settings and never renders a fake email', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  ROLE_LABEL = { therapist: 'セラピスト' };
  state = { role: 'therapist' };
  renderVals() {
    return { sampleField: 'sample-value', acctName: '佐藤 美咲', acctInitial: '美', acctClinic: '本町ケア整骨院' };
  }
}`),
        { screen: 'settings' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      const beforeVals = component.renderVals();
      const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
        'context',
        contextPayload
      );
      const afterVals = component.renderVals();

      expect(applied).toBe(false);
      expect((component as unknown as { __mobileUiuxContext?: unknown }).__mobileUiuxContext).toEqual(
        contextPayload.data
      );
      expect(afterVals.sampleField).toBe(beforeVals.sampleField);
      expect(afterVals.acctName).toBe('BFF 表示名');
      expect(afterVals.acctInitial).toBe('B');
      expect(afterVals.acctClinic).toBe('BFF 本町院');
      expect(afterVals).not.toHaveProperty('acctEmail');
      expect(JSON.stringify(afterVals)).not.toContain('@example.jp');
    });

    it('falls back to a role label and generic initial when displayName is null on settings', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  ROLE_LABEL = { therapist: 'セラピスト' };
  state = { role: 'therapist' };
  renderVals() {
    return { acctName: '佐藤 美咲', acctInitial: '美' };
  }
}`),
        { screen: 'settings' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', {
        ...contextPayload,
        data: { ...contextPayload.data, displayName: null },
      });
      const afterVals = component.renderVals();

      expect(afterVals.acctName).toBe('セラピスト');
      expect(afterVals.acctInitial).toBe('・');
    });

    it('stores the context payload on settings-detail without altering rendered overrides', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  state = { nav: [{ scr: 'clinic' }], clinicTab: 'menu' };
  renderVals() {
    return { sampleField: 'sample-value' };
  }
}`),
        { screen: 'settings-detail' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      const beforeVals = component.renderVals();
      const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.(
        'context',
        contextPayload
      );
      const afterVals = component.renderVals();

      expect(applied).toBe(false);
      expect((component as unknown as { __mobileUiuxContext?: unknown }).__mobileUiuxContext).toEqual(
        contextPayload.data
      );
      expect(afterVals).toEqual(beforeVals);
    });

    const twoClinicContextPayload = {
      success: true,
      data: {
        role: { canonical: 'therapist', label: '施術者' },
        displayName: 'BFF 表示名',
        accessibleClinics: [
          { id: 'c1', name: '第一整骨院' },
          { id: 'c2', name: '第二整骨院' },
        ],
        defaultClinicId: 'c1',
        accessibleClinicIds: ['c1', 'c2'],
        displayMode: 'mobile',
        flags: {
          enabled: true,
          realDataEnabled: true,
          writeEnabled: false,
          reservationWriteEnabled: false,
          dailyReportWriteEnabled: false,
          settingsWriteEnabled: false,
        },
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };

    it('replaces the home scope switcher with real accessible clinics', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  NOW = 480;
  CLINICS = [
    { id: 'sample-1', name: '本町ケア整骨院' },
    { id: 'sample-2', name: '駅前ケア整骨院' },
  ];
  renderVals() {
    return {
      greeting: 'おはようございます、田中さん',
      scopeName: '本町ケア整骨院',
      scopeOpts: this.CLINICS.map(c => ({ name: c.name }))
    };
  }
}`),
        { screen: 'home' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', twoClinicContextPayload);
      const vals = component.renderVals();
      const scopeOpts = Array.isArray(vals.scopeOpts) ? vals.scopeOpts : [];
      const serialized = JSON.stringify(vals);

      expect(scopeOpts.map((opt) => getRecord(opt).name)).toEqual([
        '第一整骨院',
        '第二整骨院',
      ]);
      expect(serialized).not.toContain('本町ケア整骨院');
      expect(serialized).not.toContain('駅前ケア整骨院');
    });

    it('replaces the reservations clinic switcher with real accessible clinics', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  CLINICS = [
    { id: 'sample-1', name: '本町ケア整骨院' },
    { id: 'sample-2', name: '駅前ケア整骨院' },
  ];
  renderVals() {
    return {
      dateLabel: 'sample-date',
      sumTotal: 0,
      rows: [],
      clinicOpts: this.CLINICS.map(c => ({ name: c.name }))
    };
  }
}`),
        { screen: 'reservations' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', twoClinicContextPayload);
      const vals = component.renderVals();
      const clinicOpts = Array.isArray(vals.clinicOpts) ? vals.clinicOpts : [];
      const serialized = JSON.stringify(vals);

      expect(clinicOpts.map((opt) => getRecord(opt).name)).toEqual([
        '第一整骨院',
        '第二整骨院',
      ]);
      expect(serialized).not.toContain('本町ケア整骨院');
      expect(serialized).not.toContain('駅前ケア整骨院');
    });

    it('replaces the patients clinic switcher with real accessible clinics while keeping selected-clinic stats real', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  state = { pClinic: 'all', mClinic: 'all', mPeriod: 'month', detailClinic: null };
  renderVals() {
    return { scopeLabel: 'sample-scope', riskList: [] };
  }
}`),
        { screen: 'patients' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', twoClinicContextPayload);
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('patients', {
        success: true,
        data: {
          clinicId: 'c1',
          clinicName: '第一整骨院',
          analysis: {
            totalPatients: 10,
            activePatients: 5,
            conversionData: { newPatients: 1, returnPatients: 4, conversionRate: 50 },
          },
          rows: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      });
      const vals = component.renderVals();
      const clinicSelOpts = Array.isArray(vals.clinicSelOpts) ? vals.clinicSelOpts : [];
      const serialized = JSON.stringify(vals);

      expect(clinicSelOpts.map((opt) => getRecord(opt).l)).toEqual([
        '第一整骨院',
        '第二整骨院',
      ]);
      expect(clinicSelOpts.map((opt) => getRecord(opt).v)).toEqual(['c1', 'c2']);
      expect(vals.scopeLabel).toBe('第一整骨院');
      expect(serialized).not.toContain('本町ケア整骨院');
      expect(serialized).not.toContain('木村 美穂');
    });

    it('replaces the settings-detail clinic switcher with real accessible clinics', () => {
      const patched = patchMobileUiuxDcScript(
        wrapDcScript(`class Component extends DCLogic {
  CLINICS = [{ id: 'sample-clinic', name: '本町ケア整骨院' }];
  state = { nav: [{ scr: 'clinic' }], clinicTab: 'basic' };
  renderVals() {
    return {
      clinicOpts: this.CLINICS.map(c => ({ name: c.name }))
    };
  }
}`),
        { screen: 'settings-detail' }
      );
      const script = patched.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const { component, window } = evaluatePatchedComponent(script);

      component.componentDidMount();
      window.__MOBILE_UIUX_APPLY_READ_DATA__?.('context', twoClinicContextPayload);
      const vals = component.renderVals();
      const clinicOpts = Array.isArray(vals.clinicOpts) ? vals.clinicOpts : [];
      const serialized = JSON.stringify(vals);

      expect(clinicOpts.map((opt) => getRecord(opt).name)).toEqual([
        '第一整骨院',
        '第二整骨院',
      ]);
      expect(serialized).not.toContain('本町ケア整骨院');
    });
  });
});

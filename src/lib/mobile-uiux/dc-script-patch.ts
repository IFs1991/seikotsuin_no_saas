import type { MobileUiuxScreenResource } from './bridge-manifest';

type DcScriptPatchOptions = {
  screen: Extract<MobileUiuxScreenResource, 'reservations' | 'daily-reports'>;
};

type ScriptBlock = {
  content: string;
  contentStart: number;
  contentEnd: number;
};

type ClassBounds = {
  openBrace: number;
  closeBrace: number;
};

type Replacement = {
  start: number;
  end: number;
  text: string;
};

const COMPONENT_CLASS_SIGNATURE = 'class Component extends DCLogic';
const RENDER_VALS_METHOD = 'renderVals';
const ORIGINAL_RENDER_VALS_METHOD = '__mobileUiuxOriginalRenderVals';
const COMPONENT_DID_MOUNT_METHOD = 'componentDidMount';
const ORIGINAL_COMPONENT_DID_MOUNT_METHOD =
  '__mobileUiuxOriginalComponentDidMount';
const COMPONENT_WILL_UNMOUNT_METHOD = 'componentWillUnmount';
const ORIGINAL_COMPONENT_WILL_UNMOUNT_METHOD =
  '__mobileUiuxOriginalComponentWillUnmount';

export function patchMobileUiuxDcScript(
  html: string,
  options: DcScriptPatchOptions
): string {
  const script = extractSingleDcScript(html);
  const patchedScript = patchMobileUiuxDcScriptSource(script.content, options);

  return `${html.slice(0, script.contentStart)}${patchedScript}${html.slice(
    script.contentEnd
  )}`;
}

export function patchMobileUiuxDcScriptSource(
  source: string,
  options: DcScriptPatchOptions
): string {
  if (source.includes(ORIGINAL_RENDER_VALS_METHOD)) {
    throw new Error('Mobile UIUX DC script is already patched');
  }

  const classBounds = findComponentClassBounds(source);
  const renderValsOccurrences = findMethodOccurrences(
    source,
    classBounds,
    RENDER_VALS_METHOD
  );

  if (renderValsOccurrences.length !== 1) {
    throw new Error(
      `Expected exactly one renderVals( method in Mobile UIUX DC script, found ${renderValsOccurrences.length}`
    );
  }

  const componentDidMountOccurrences = findMethodOccurrences(
    source,
    classBounds,
    COMPONENT_DID_MOUNT_METHOD
  );
  if (componentDidMountOccurrences.length > 1) {
    throw new Error(
      `Expected at most one componentDidMount( method in Mobile UIUX DC script, found ${componentDidMountOccurrences.length}`
    );
  }

  const componentWillUnmountOccurrences = findMethodOccurrences(
    source,
    classBounds,
    COMPONENT_WILL_UNMOUNT_METHOD
  );
  if (componentWillUnmountOccurrences.length > 1) {
    throw new Error(
      `Expected at most one componentWillUnmount( method in Mobile UIUX DC script, found ${componentWillUnmountOccurrences.length}`
    );
  }

  const replacements: Replacement[] = [
    {
      start: renderValsOccurrences[0],
      end: renderValsOccurrences[0] + RENDER_VALS_METHOD.length,
      text: ORIGINAL_RENDER_VALS_METHOD,
    },
    {
      start: classBounds.closeBrace,
      end: classBounds.closeBrace,
      text: buildHydrationAdapterSource(options.screen),
    },
  ];

  if (componentDidMountOccurrences.length === 1) {
    replacements.push({
      start: componentDidMountOccurrences[0],
      end: componentDidMountOccurrences[0] + COMPONENT_DID_MOUNT_METHOD.length,
      text: ORIGINAL_COMPONENT_DID_MOUNT_METHOD,
    });
  }

  if (componentWillUnmountOccurrences.length === 1) {
    replacements.push({
      start: componentWillUnmountOccurrences[0],
      end:
        componentWillUnmountOccurrences[0] +
        COMPONENT_WILL_UNMOUNT_METHOD.length,
      text: ORIGINAL_COMPONENT_WILL_UNMOUNT_METHOD,
    });
  }

  return applyReplacements(source, replacements);
}

function extractSingleDcScript(html: string): ScriptBlock {
  const matches = [
    ...html.matchAll(
      /<script\b(?=[^>]*\bdata-dc-script\b)[^>]*>[\s\S]*?<\/script>/gi
    ),
  ];

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one script[data-dc-script], found ${matches.length}`
    );
  }

  const match = matches[0];
  const block = match[0];
  const start = match.index ?? 0;
  const openingTagMatch = block.match(/^<script\b[^>]*>/i);
  if (!openingTagMatch) {
    throw new Error('Mobile UIUX DC script opening tag not found');
  }

  const contentStart = start + openingTagMatch[0].length;
  const contentEnd = start + block.length - '</script>'.length;

  return {
    content: html.slice(contentStart, contentEnd),
    contentStart,
    contentEnd,
  };
}

function findComponentClassBounds(source: string): ClassBounds {
  const classIndex = findUnmaskedText(source, COMPONENT_CLASS_SIGNATURE, 0);
  if (classIndex < 0) {
    throw new Error('Mobile UIUX DC script is missing Component DCLogic class');
  }

  const nextClassIndex = findUnmaskedText(
    source,
    COMPONENT_CLASS_SIGNATURE,
    classIndex + COMPONENT_CLASS_SIGNATURE.length
  );
  if (nextClassIndex >= 0) {
    throw new Error(
      'Mobile UIUX DC script contains multiple Component classes'
    );
  }

  const openBrace = findUnmaskedChar(
    source,
    '{',
    classIndex + COMPONENT_CLASS_SIGNATURE.length
  );
  if (openBrace < 0) {
    throw new Error('Mobile UIUX Component class opening brace not found');
  }

  return {
    openBrace,
    closeBrace: findMatchingBrace(source, openBrace),
  };
}

function findMethodOccurrences(
  source: string,
  bounds: ClassBounds,
  methodName: string
): number[] {
  const occurrences: number[] = [];
  const needle = `${methodName}(`;
  let index = bounds.openBrace + 1;

  while (index < bounds.closeBrace) {
    const skippedIndex = skipJsLiteralOrComment(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    if (
      source.startsWith(needle, index) &&
      !isIdentifierChar(source[index - 1] ?? '') &&
      !isIdentifierChar(source[index + methodName.length] ?? '')
    ) {
      occurrences.push(index);
      index += needle.length;
      continue;
    }

    index += 1;
  }

  return occurrences;
}

function findUnmaskedText(
  source: string,
  text: string,
  startIndex: number
): number {
  let index = startIndex;

  while (index < source.length) {
    const skippedIndex = skipJsLiteralOrComment(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    if (source.startsWith(text, index)) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function findUnmaskedChar(
  source: string,
  char: string,
  startIndex: number
): number {
  let index = startIndex;

  while (index < source.length) {
    const skippedIndex = skipJsLiteralOrComment(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    if (source[index] === char) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function findMatchingBrace(source: string, openBrace: number): number {
  let depth = 1;
  let index = openBrace + 1;

  while (index < source.length) {
    const skippedIndex = skipJsLiteralOrComment(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  throw new Error('Mobile UIUX Component class closing brace not found');
}

function skipJsLiteralOrComment(source: string, index: number): number {
  const char = source[index];
  const nextChar = source[index + 1];

  if (char === "'" || char === '"') {
    return skipQuotedString(source, index, char);
  }

  if (char === '`') {
    return skipTemplateLiteral(source, index);
  }

  if (char === '/' && nextChar === '/') {
    return skipLineComment(source, index);
  }

  if (char === '/' && nextChar === '*') {
    return skipBlockComment(source, index);
  }

  return index;
}

function skipQuotedString(
  source: string,
  startIndex: number,
  quote: "'" | '"'
): number {
  let index = startIndex + 1;

  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function skipLineComment(source: string, startIndex: number): number {
  const newlineIndex = source.indexOf('\n', startIndex + 2);
  return newlineIndex < 0 ? source.length : newlineIndex + 1;
}

function skipBlockComment(source: string, startIndex: number): number {
  const endIndex = source.indexOf('*/', startIndex + 2);
  return endIndex < 0 ? source.length : endIndex + 2;
}

function skipTemplateLiteral(source: string, startIndex: number): number {
  let index = startIndex + 1;

  while (index < source.length) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === '`') {
      return index + 1;
    }

    if (char === '$' && nextChar === '{') {
      index = skipTemplateExpression(source, index + 2);
      continue;
    }

    index += 1;
  }

  return source.length;
}

function skipTemplateExpression(source: string, startIndex: number): number {
  let depth = 1;
  let index = startIndex;

  while (index < source.length) {
    const skippedIndex = skipJsLiteralOrComment(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }

    index += 1;
  }

  return source.length;
}

function isIdentifierChar(value: string): boolean {
  return /^[A-Za-z0-9_$]$/.test(value);
}

function applyReplacements(
  source: string,
  replacements: readonly Replacement[]
): string {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, replacement) =>
        `${current.slice(0, replacement.start)}${replacement.text}${current.slice(
          replacement.end
        )}`,
      source
    );
}

function buildHydrationAdapterSource(
  screen: DcScriptPatchOptions['screen']
): string {
  if (screen === 'reservations') {
    return buildReservationsHydrationAdapterSource();
  }

  if (screen === 'daily-reports') {
    return buildDailyReportsHydrationAdapterSource();
  }

  throw new Error(`Unsupported Mobile UIUX hydration screen: ${screen}`);
}

function buildReservationsHydrationAdapterSource(): string {
  return `

  renderVals() {
    const originalResult = typeof this.${ORIGINAL_RENDER_VALS_METHOD} === 'function'
      ? this.${ORIGINAL_RENDER_VALS_METHOD}()
      : {};
    const originalVals = originalResult && typeof originalResult === 'object' ? originalResult : {};
    const hydratedVals = this.__mobileUiuxHydratedVals && typeof this.__mobileUiuxHydratedVals === 'object'
      ? this.__mobileUiuxHydratedVals
      : null;
    return hydratedVals ? { ...originalVals, ...hydratedVals } : originalVals;
  }

  componentDidMount() {
    this.__mobileUiuxRegisterReadHydration();
    if (typeof this.${ORIGINAL_COMPONENT_DID_MOUNT_METHOD} === 'function') {
      return this.${ORIGINAL_COMPONENT_DID_MOUNT_METHOD}();
    }
  }

  componentWillUnmount() {
    this.__mobileUiuxUnregisterReadHydration();
    if (typeof this.${ORIGINAL_COMPONENT_WILL_UNMOUNT_METHOD} === 'function') {
      return this.${ORIGINAL_COMPONENT_WILL_UNMOUNT_METHOD}();
    }
  }

  __mobileUiuxRegisterReadHydration() {
    if (typeof window === 'undefined') return;
    const owner = {};
    this.__mobileUiuxHydrationOwner = owner;
    const component = this;
    const applyReadData = function(screen, payload) {
      if (component.__mobileUiuxHydrationOwner !== owner) return false;
      const hydratedVals = component.__mobileUiuxBuildHydratedOverrides(screen, payload);
      if (!hydratedVals) return false;
      component.__mobileUiuxHydratedVals = hydratedVals;
      if (typeof component.setState === 'function') {
        component.setState({ __mobileUiuxHydratedAt: Date.now() });
      } else if (typeof component.forceUpdate === 'function') {
        component.forceUpdate();
      }
      return true;
    };
    applyReadData.__mobileUiuxHydrationOwner = owner;
    window.__MOBILE_UIUX_APPLY_READ_DATA__ = applyReadData;
  }

  __mobileUiuxUnregisterReadHydration() {
    if (typeof window === 'undefined') return;
    if (
      window.__MOBILE_UIUX_APPLY_READ_DATA__ &&
      window.__MOBILE_UIUX_APPLY_READ_DATA__.__mobileUiuxHydrationOwner === this.__mobileUiuxHydrationOwner
    ) {
      delete window.__MOBILE_UIUX_APPLY_READ_DATA__;
    }
    this.__mobileUiuxHydrationOwner = null;
  }

  __mobileUiuxBuildHydratedOverrides(screen, payload) {
    if (screen !== 'reservations' || !this.__mobileUiuxIsRecord(payload) || payload.success !== true) {
      return null;
    }
    const data = payload.data;
    if (!this.__mobileUiuxIsRecord(data) || typeof data.date !== 'string' || !Array.isArray(data.reservations)) {
      return null;
    }

    const rows = data.reservations
      .map((reservation) => this.__mobileUiuxReservationToRow(reservation))
      .filter((row) => row !== null);
    const counts = this.__mobileUiuxCountReservations(data.reservations);

    return {
      dateLabel: this.__mobileUiuxFormatDateLabel(data.date),
      sumTotal: counts.total,
      sumConf: counts.confirmed,
      sumUnc: counts.unconfirmed,
      sumCancel: counts.cancelled,
      rows,
      isLoading: false,
      isEmpty: rows.length === 0,
      showAgenda: rows.length > 0,
      showTimeline: false
    };
  }

  __mobileUiuxReservationToRow(reservation) {
    if (!this.__mobileUiuxIsRecord(reservation)) return null;
    const status = this.__mobileUiuxStatusMeta(reservation.status);
    const staffName = this.__mobileUiuxDisplayText(reservation.staffName, '担当未設定');
    const startTime = this.__mobileUiuxFormatTime(reservation.startTime);
    const endTime = this.__mobileUiuxFormatTime(reservation.endTime);
    if (!startTime || !endTime) return null;

    return {
      isAppt: true,
      isGap: false,
      startT: startTime,
      endT: endTime,
      patient: this.__mobileUiuxDisplayText(reservation.customerName || reservation.patientName, '患者名未設定'),
      menu: this.__mobileUiuxDisplayText(reservation.menuName, 'メニュー未設定'),
      ther: staffName,
      initial: typeof this.initial === 'function' ? this.initial(staffName) : staffName.trim().charAt(0),
      showTher: true,
      statusLabel: status.label,
      c: status.c,
      b: status.b,
      dim: status.dim,
      onTap: () => {}
    };
  }

  __mobileUiuxCountReservations(reservations) {
    const counts = { total: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 };
    reservations.forEach((reservation) => {
      if (!this.__mobileUiuxIsRecord(reservation)) return;
      const status = this.__mobileUiuxNormalizeStatus(reservation.status);
      if (status === 'cancelled' || status === 'no_show' || status === 'noshow') {
        counts.cancelled += 1;
        return;
      }
      counts.total += 1;
      if (status === 'confirmed' || status === 'arrived' || status === 'completed') {
        counts.confirmed += 1;
      } else if (status === 'unconfirmed' || status === 'tentative' || status === 'trial') {
        counts.unconfirmed += 1;
      }
    });
    return counts;
  }

  __mobileUiuxStatusMeta(value) {
    const status = this.__mobileUiuxNormalizeStatus(value);
    if (status === 'confirmed') return { label: '確定', c: 'var(--s-cf)', b: 'var(--s-cf-bg)', dim: 1 };
    if (status === 'arrived' || status === 'completed') return { label: '来院済み', c: 'var(--s-cf)', b: 'var(--s-cf-bg)', dim: 1 };
    if (status === 'cancelled') return { label: 'キャンセル', c: 'var(--fg-3)', b: 'var(--s-cn-bg)', dim: 0.55 };
    if (status === 'no_show' || status === 'noshow') return { label: '来院なし', c: 'var(--s-ns)', b: 'var(--s-ns-bg)', dim: 0.55 };
    return { label: '未確認', c: 'var(--s-uc)', b: 'var(--s-uc-bg)', dim: 1 };
  }

  __mobileUiuxNormalizeStatus(value) {
    return typeof value === 'string' ? value : '';
  }

  __mobileUiuxDisplayText(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }

  __mobileUiuxFormatDateLabel(value) {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);
    if (!match) return value;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return value;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return month + '/' + day + '（' + weekdays[date.getUTCDay()] + '）';
  }

  __mobileUiuxFormatTime(value) {
    if (typeof value !== 'string' || value.length === 0) return '';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + 9 * 60;
      const normalized = ((totalMinutes % 1440) + 1440) % 1440;
      const hours = Math.floor(normalized / 60);
      const minutes = normalized % 60;
      return hours + ':' + String(minutes).padStart(2, '0');
    }
    const timeMatch = /T(\\d{2}):(\\d{2})/.exec(value);
    return timeMatch ? Number(timeMatch[1]) + ':' + timeMatch[2] : '';
  }

  __mobileUiuxIsRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
`;
}

function buildDailyReportsHydrationAdapterSource(): string {
  return `

  renderVals() {
    const originalResult = typeof this.${ORIGINAL_RENDER_VALS_METHOD} === 'function'
      ? this.${ORIGINAL_RENDER_VALS_METHOD}()
      : {};
    const originalVals = originalResult && typeof originalResult === 'object' ? originalResult : {};
    const hydratedVals = this.__mobileUiuxHydratedVals && typeof this.__mobileUiuxHydratedVals === 'object'
      ? this.__mobileUiuxHydratedVals
      : null;
    return hydratedVals ? { ...originalVals, ...hydratedVals } : originalVals;
  }

  componentDidMount() {
    this.__mobileUiuxRegisterReadHydration();
    if (typeof this.${ORIGINAL_COMPONENT_DID_MOUNT_METHOD} === 'function') {
      return this.${ORIGINAL_COMPONENT_DID_MOUNT_METHOD}();
    }
  }

  componentWillUnmount() {
    this.__mobileUiuxUnregisterReadHydration();
    if (typeof this.${ORIGINAL_COMPONENT_WILL_UNMOUNT_METHOD} === 'function') {
      return this.${ORIGINAL_COMPONENT_WILL_UNMOUNT_METHOD}();
    }
  }

  __mobileUiuxRegisterReadHydration() {
    if (typeof window === 'undefined') return;
    const owner = {};
    this.__mobileUiuxHydrationOwner = owner;
    const component = this;
    const applyReadData = function(screen, payload) {
      if (component.__mobileUiuxHydrationOwner !== owner) return false;
      const hydratedVals = component.__mobileUiuxBuildHydratedOverrides(screen, payload);
      if (!hydratedVals) return false;
      component.__mobileUiuxHydratedVals = hydratedVals;
      if (typeof component.setState === 'function') {
        component.setState({ __mobileUiuxHydratedAt: Date.now() });
      } else if (typeof component.forceUpdate === 'function') {
        component.forceUpdate();
      }
      return true;
    };
    applyReadData.__mobileUiuxHydrationOwner = owner;
    window.__MOBILE_UIUX_APPLY_READ_DATA__ = applyReadData;
  }

  __mobileUiuxUnregisterReadHydration() {
    if (typeof window === 'undefined') return;
    if (
      window.__MOBILE_UIUX_APPLY_READ_DATA__ &&
      window.__MOBILE_UIUX_APPLY_READ_DATA__.__mobileUiuxHydrationOwner === this.__mobileUiuxHydrationOwner
    ) {
      delete window.__MOBILE_UIUX_APPLY_READ_DATA__;
    }
    this.__mobileUiuxHydrationOwner = null;
  }

  __mobileUiuxBuildHydratedOverrides(screen, payload) {
    if (screen !== 'daily-reports' || !this.__mobileUiuxIsRecord(payload) || payload.success !== true) {
      return null;
    }
    const data = payload.data;
    if (!this.__mobileUiuxIsRecord(data) || !this.__mobileUiuxIsRecord(data.dailyReports) || !Array.isArray(data.dailyReports.reports)) {
      return null;
    }

    const reports = [];
    for (const report of data.dailyReports.reports) {
      const mappedReport = this.__mobileUiuxReportToRecord(report);
      if (mappedReport === null) return null;
      reports.push(mappedReport);
    }
    const reportDate = this.__mobileUiuxResolveReportDate(data, reports, payload.generatedAt);
    if (!reportDate) {
      return null;
    }

    const todayReport = reports.length > 0 ? reports[0] : null;
    const todaySubmitted = todayReport !== null;
    const todayRevenue = todayReport ? todayReport.revenue : 0;
    const todayHoken = todayReport ? todayReport.hoken : 0;
    const todayJihi = todayReport ? todayReport.jihi : 0;
    const todayPatients = todayReport ? todayReport.patients : 0;
    const viewRows = this.__mobileUiuxBuildDailyReportViewRows(reports);
    const summary = this.__mobileUiuxBuildDailyReportSummary(data.dailyReports.summary, viewRows);

    return {
      todayLabel: this.__mobileUiuxFormatDateLabel(reportDate),
      todayUnsubmitted: !todaySubmitted,
      todaySubmittedFlag: todaySubmitted,
      todayCount: todayPatients,
      sumRevenue: this.yen(todayRevenue),
      sumPatients: todayPatients + '名',
      sumHoken: this.yen(todayHoken),
      sumJihi: this.yen(todayJihi),
      listRows: viewRows.listRows,
      kpiBoxes: this.__mobileUiuxBuildDailyReportKpiBoxes(summary, viewRows),
      trendCards: viewRows.trendCards,
      statusRows: viewRows.statusRows
    };
  }

  __mobileUiuxReportToRecord(report) {
    if (!this.__mobileUiuxIsRecord(report) || typeof report.reportDate !== 'string') return null;
    const dateParts = this.__mobileUiuxDateParts(report.reportDate);
    if (!dateParts) return null;
    const totalRevenue = this.__mobileUiuxNumber(report.totalRevenue);
    const insuranceRevenue = this.__mobileUiuxNumber(report.insuranceRevenue);
    const privateRevenue = this.__mobileUiuxNumber(report.privateRevenue);
    const patients = this.__mobileUiuxNumber(report.totalPatients);
    const status = typeof report.status === 'string' ? report.status : 'submitted';
    return {
      key: typeof report.id === 'string' && report.id.length > 0 ? report.id : report.reportDate,
      dateKey: report.reportDate,
      date: dateParts.month + '/' + dateParts.day,
      wd: dateParts.weekday,
      revenue: totalRevenue,
      hoken: insuranceRevenue,
      jihi: privateRevenue,
      patients,
      status: this.__mobileUiuxNormalizeDailyReportStatus(status)
    };
  }

  __mobileUiuxBuildDailyReportViewRows(reports) {
    const listRows = [];
    const trendCards = [];
    const statusRows = [];
    let needs = 0;
    let totalRevenue = 0;
    let totalPatients = 0;

    for (const report of reports) {
      if (report.status === 'needscheck') needs += 1;
      totalRevenue += report.revenue;
      totalPatients += report.patients;
      listRows.push(this.__mobileUiuxBuildDailyReportListRow(report));
      trendCards.push(this.__mobileUiuxBuildDailyReportTrendCard(report));
      statusRows.push(this.__mobileUiuxBuildDailyReportStatusRow(report));
    }

    return { listRows, trendCards, statusRows, needs, totalRevenue, totalPatients };
  }

  __mobileUiuxBuildDailyReportListRow(report) {
    const st = this.__mobileUiuxDailyReportStatusMeta(report.status);
    return {
      date: report.date + '（' + report.wd + '）',
      statusLabel: st.label,
      c: st.c,
      b: st.b,
      patients: report.patients + '名',
      revenue: this.yen(report.revenue),
      onEdit: () => {},
      editLabel: '編集'
    };
  }

  __mobileUiuxBuildDailyReportTrendCard(report) {
    const st = this.__mobileUiuxDailyReportStatusMeta(report.status);
    return {
      date: report.date + '（' + report.wd + '）',
      statusLabel: st.label,
      c: st.c,
      b: st.b,
      revenue: this.yen(report.revenue),
      hoken: this.yen(report.hoken),
      jihi: this.yen(report.jihi),
      patients: report.patients + '名',
      unit: this.yen(report.patients ? Math.round(report.revenue / report.patients) : 0)
    };
  }

  __mobileUiuxBuildDailyReportStatusRow(report) {
    const st = this.__mobileUiuxDailyReportStatusMeta(report.status);
    return {
      date: report.date + '（' + report.wd + '）',
      statusLabel: st.label,
      c: st.c,
      b: st.b,
      sub: report.patients + '名 ・ ' + this.yen(report.revenue)
    };
  }

  __mobileUiuxBuildDailyReportSummary(summary, viewRows) {
    if (this.__mobileUiuxIsRecord(summary)) {
      return {
        totalRevenue: this.__mobileUiuxNumber(summary.totalRevenue),
        averageRevenue: this.__mobileUiuxNumber(summary.averageRevenue),
        totalPatients: viewRows.totalPatients,
        averagePatients: this.__mobileUiuxNumber(summary.averagePatients),
        totalReports: this.__mobileUiuxNumber(summary.totalReports)
      };
    }
    const reportCount = viewRows.listRows.length;
    return {
      totalRevenue: viewRows.totalRevenue,
      averageRevenue: reportCount ? Math.round(viewRows.totalRevenue / reportCount) : 0,
      totalPatients: viewRows.totalPatients,
      averagePatients: reportCount ? Math.round(viewRows.totalPatients / reportCount) : 0,
      totalReports: reportCount
    };
  }

  __mobileUiuxBuildDailyReportKpiBoxes(summary, viewRows) {
    const totalRevenue = summary.totalRevenue;
    const averageRevenue = summary.averageRevenue;
    const totalPatients = summary.totalPatients;
    const unit = totalPatients ? Math.round(totalRevenue / totalPatients) : 0;
    const missing = viewRows.listRows.length === 0 ? 1 : 0;
    const needs = viewRows.needs;
    return [
      { label: '累計売上', value: this.yen(totalRevenue), color: 'var(--fg)' },
      { label: '平均売上 / 日', value: this.yen(averageRevenue), color: 'var(--fg)' },
      { label: '患者数', value: totalPatients + '名', color: 'var(--fg)' },
      { label: '客単価', value: this.yen(unit), color: 'var(--fg)' },
      { label: '未提出日', value: missing + '日', color: 'var(--s-uc)' },
      { label: '要確認日', value: needs + '日', color: 'var(--s-ns)' }
    ];
  }

  __mobileUiuxResolveReportDate(data, reports, generatedAt) {
    if (reports.length > 0) return reports[0].dateKey;
    if (typeof data.endDate === 'string') return data.endDate;
    if (typeof data.startDate === 'string') return data.startDate;
    if (typeof generatedAt === 'string') return this.__mobileUiuxIsoToJstDateKey(generatedAt);
    return '';
  }

  __mobileUiuxNormalizeDailyReportStatus(value) {
    if (value === 'confirmed') return 'confirmed';
    if (value === 'needscheck' || value === 'needs_check') return 'needscheck';
    if (value === 'unsubmitted' || value === 'missing') return 'unsubmitted';
    return 'submitted';
  }

  __mobileUiuxDailyReportStatusMeta(value) {
    const status = this.__mobileUiuxNormalizeDailyReportStatus(value);
    if (this.STATUS_DR && this.STATUS_DR[status]) return this.STATUS_DR[status];
    if (status === 'confirmed') return { label: '確認済み', c: 'var(--on-primary-soft)', b: 'var(--primary-soft)' };
    if (status === 'unsubmitted') return { label: '未提出', c: 'var(--s-uc)', b: 'var(--s-uc-bg)' };
    if (status === 'needscheck') return { label: '要確認', c: 'var(--s-ns)', b: 'var(--s-ns-bg)' };
    return { label: '提出済み', c: 'var(--s-cf)', b: 'var(--s-cf-bg)' };
  }

  __mobileUiuxNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  __mobileUiuxFormatDateLabel(value) {
    const parts = this.__mobileUiuxDateParts(value);
    if (!parts) return value;
    return parts.month + '/' + parts.day + '（' + parts.weekday + '）';
  }

  __mobileUiuxDateParts(value) {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return { month, day, weekday: weekdays[date.getUTCDay()] };
  }

  __mobileUiuxIsoToJstDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + 9 * 60;
    const dayOffset = Math.floor(totalMinutes / 1440);
    const jstDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + dayOffset));
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  __mobileUiuxIsRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
`;
}

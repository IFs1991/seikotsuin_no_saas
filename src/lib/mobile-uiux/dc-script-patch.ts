import type { MobileUiuxScreenResource } from './bridge-manifest';

type DcScriptPatchOptions = {
  screen: Extract<
    MobileUiuxScreenResource,
    'home' | 'reservations' | 'daily-reports' | 'settings' | 'settings-detail'
  >;
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
  if (screen === 'home') {
    return buildHomeHydrationAdapterSource();
  }

  if (screen === 'reservations') {
    return buildReservationsHydrationAdapterSource();
  }

  if (screen === 'daily-reports') {
    return buildDailyReportsHydrationAdapterSource();
  }

  if (screen === 'settings') {
    return buildSettingsHydrationAdapterSource();
  }

  if (screen === 'settings-detail') {
    return buildSettingsDetailHydrationAdapterSource();
  }

  throw new Error(`Unsupported Mobile UIUX hydration screen: ${screen}`);
}

function buildHomeHydrationAdapterSource(): string {
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
    if (screen !== 'home' || !this.__mobileUiuxIsRecord(payload) || payload.success !== true) {
      return null;
    }
    const data = payload.data;
    if (!this.__mobileUiuxIsRecord(data) || typeof data.date !== 'string' || !this.__mobileUiuxIsRecord(data.dashboard)) {
      return null;
    }
    const dashboard = data.dashboard;
    if (!this.__mobileUiuxIsRecord(dashboard.dailyData)) {
      return null;
    }
    const dailyData = {
      revenue: this.__mobileUiuxNumber(dashboard.dailyData.revenue),
      patients: this.__mobileUiuxNumber(dashboard.dailyData.patients),
      insuranceRevenue: this.__mobileUiuxNumber(dashboard.dailyData.insuranceRevenue),
      privateRevenue: this.__mobileUiuxNumber(dashboard.dailyData.privateRevenue)
    };
    const reservationSummary = this.__mobileUiuxReservationSummary(data.reservationSummary);
    const reportStatus = this.__mobileUiuxDailyReportStatus(data.dailyReportStatus);
    const attentions = this.__mobileUiuxBuildHomeAttentions(data.attentions, dashboard.alerts);
    const role = this.state && typeof this.state.role === 'string' ? this.state.role : 'store';
    const overrides = {
      dateLabel: this.__mobileUiuxFormatDateLabel(data.date),
      kpiTitle: role === 'admin' ? '全社サマリ' : role === 'manager' ? 'エリアサマリ' : '本日の数値',
      kpiSub: this.__mobileUiuxBuildHomeKpiSub(data, role),
      kpis: this.__mobileUiuxBuildHomeKpis(dailyData, reservationSummary, reportStatus, attentions.length, role),
      showAttention: role !== 'admin',
      attTitle: role === 'manager' ? '今日の要確認' : '今日の要対応',
      attCount: attentions.length + '件',
      attentions
    };

    if (reservationSummary) {
      overrides.agTotal = reservationSummary.total;
      overrides.agUnc = reservationSummary.unconfirmed;
      overrides.agCancel = reservationSummary.cancelled;
    }

    if (reportStatus) {
      overrides.drDone = reportStatus.done;
      overrides.drReview = reportStatus.review;
      overrides.drMissing = reportStatus.missing;
      overrides.reportRows = reportStatus.rows;
    }

    return overrides;
  }

  __mobileUiuxBuildHomeKpis(dailyData, reservationSummary, reportStatus, attentionCount, role) {
    const up = 'var(--s-cf)';
    const down = 'var(--s-ns)';
    const flat = 'var(--fg-3)';
    const dot = (color) => 'width:6px;height:6px;border-radius:50%;background:' + color + ';flex:none;';
    const reservationTotal = reservationSummary ? reservationSummary.total : 0;
    const unconfirmed = reservationSummary ? reservationSummary.unconfirmed : 0;
    const reportDone = reportStatus ? reportStatus.done : 0;
    const reportTotal = reportStatus ? reportStatus.done + reportStatus.review + reportStatus.missing : 0;
    const reportMissing = reportStatus ? reportStatus.missing : 0;

    if (role === 'manager') {
      return [
        { label: '本日の売上', value: this.__mobileUiuxYen(dailyData.revenue), unit: '', delta: '保険 ' + this.__mobileUiuxYen(dailyData.insuranceRevenue), deltaColor: flat, deltaDot: dot(flat) },
        { label: '本日の来院', value: String(dailyData.patients), unit: '名', delta: '予約 ' + reservationTotal + ' 中', deltaColor: flat, deltaDot: dot(flat) },
        { label: '日報提出', value: reportDone + ' / ' + reportTotal, unit: '院', delta: '未提出 ' + reportMissing + '院', deltaColor: reportMissing > 0 ? down : up, deltaDot: dot(reportMissing > 0 ? down : up) },
        { label: '要確認', value: String(attentionCount), unit: '件', delta: reportStatus ? '日報要確認 ' + reportStatus.review : 'BFF payload', deltaColor: attentionCount > 0 ? down : flat, deltaDot: dot(attentionCount > 0 ? down : flat) }
      ];
    }

    if (role === 'admin') {
      return [
        { label: '本日の売上', value: this.__mobileUiuxYen(dailyData.revenue), unit: '', delta: '保険 ' + this.__mobileUiuxYen(dailyData.insuranceRevenue), deltaColor: flat, deltaDot: dot(flat) },
        { label: '本日の来院', value: String(dailyData.patients), unit: '名', delta: '予約 ' + reservationTotal + ' 中', deltaColor: flat, deltaDot: dot(flat) },
        { label: '日報提出', value: reportDone + ' / ' + reportTotal, unit: '院', delta: '未提出 ' + reportMissing + '院', deltaColor: reportMissing > 0 ? down : up, deltaDot: dot(reportMissing > 0 ? down : up) },
        { label: '要注意院', value: String(attentionCount), unit: '院', delta: 'BFF payload', deltaColor: attentionCount > 0 ? down : flat, deltaDot: dot(attentionCount > 0 ? down : flat) }
      ];
    }

    return [
      { label: '本日の売上', value: this.__mobileUiuxYen(dailyData.revenue), unit: '', delta: '保険 ' + this.__mobileUiuxYen(dailyData.insuranceRevenue), deltaColor: flat, deltaDot: dot(flat) },
      { label: '来院数', value: String(dailyData.patients), unit: '名', delta: '予約 ' + reservationTotal + ' 中', deltaColor: flat, deltaDot: dot(flat) },
      { label: '本日の予約', value: String(reservationTotal), unit: '件', delta: 'BFF payload', deltaColor: flat, deltaDot: dot(flat) },
      { label: '未確定予約', value: String(unconfirmed), unit: '件', delta: unconfirmed > 0 ? '要確認' : '確認済み', deltaColor: unconfirmed > 0 ? down : up, deltaDot: dot(unconfirmed > 0 ? down : up) }
    ];
  }

  __mobileUiuxBuildHomeKpiSub(data, role) {
    const scopeName = this.__mobileUiuxDisplayText(data.scopeName || data.clinicName, '');
    const suffix = role === 'admin' ? '本日' : 'リアルタイム';
    return scopeName ? scopeName + ' · ' + suffix : suffix;
  }

  __mobileUiuxBuildHomeAttentions(attentionPayload, alerts) {
    const rows = [];
    if (Array.isArray(attentionPayload)) {
      for (const item of attentionPayload) {
        const row = this.__mobileUiuxAttentionRow(item);
        if (row) rows.push(row);
      }
    } else if (Array.isArray(alerts)) {
      alerts.forEach((alert, index) => {
        if (typeof alert !== 'string' || alert.trim().length === 0) return;
        const sev = index === 0 ? 'warning' : 'info';
        rows.push(this.__mobileUiuxBuildAttentionRow(sev, alert.trim(), 'PC dashboard read model のアラートです。'));
      });
    }
    return rows;
  }

  __mobileUiuxAttentionRow(item) {
    if (!this.__mobileUiuxIsRecord(item)) return null;
    const severity = this.__mobileUiuxNormalizeSeverity(item.severity || item.sev);
    const title = this.__mobileUiuxDisplayText(item.title, '');
    if (!title) return null;
    const body = this.__mobileUiuxDisplayText(item.body || item.message, '');
    return this.__mobileUiuxBuildAttentionRow(severity, title, body);
  }

  __mobileUiuxBuildAttentionRow(severity, title, body) {
    const meta = this.__mobileUiuxSeverityMeta(severity);
    return {
      icon: severity === 'critical' ? '!' : severity === 'warning' ? '?' : 'i',
      sev: severity,
      sevLabel: meta.label,
      title,
      body,
      c: meta.c,
      b: meta.b,
      onTap: typeof this.link === 'function' ? this.link(title) : () => {}
    };
  }

  __mobileUiuxReservationSummary(value) {
    if (!this.__mobileUiuxIsRecord(value)) return null;
    return {
      total: this.__mobileUiuxNumber(value.total),
      unconfirmed: this.__mobileUiuxNumber(value.unconfirmed),
      cancelled: this.__mobileUiuxNumber(value.cancelled)
    };
  }

  __mobileUiuxDailyReportStatus(value) {
    if (!this.__mobileUiuxIsRecord(value)) return null;
    const done = this.__mobileUiuxNumber(value.done);
    const review = this.__mobileUiuxNumber(value.review);
    const missing = this.__mobileUiuxNumber(value.missing);
    const rows = [];
    if (Array.isArray(value.rows)) {
      for (const row of value.rows) {
        const mapped = this.__mobileUiuxDailyReportStatusRow(row);
        if (mapped) rows.push(mapped);
      }
    }
    return { done, review, missing, rows };
  }

  __mobileUiuxDailyReportStatusRow(row) {
    if (!this.__mobileUiuxIsRecord(row)) return null;
    const name = this.__mobileUiuxDisplayText(row.name || row.clinicName, '');
    if (!name) return null;
    const status = this.__mobileUiuxNormalizeReportStatus(row.status);
    const meta = this.__mobileUiuxReportStatusMeta(status);
    return {
      name,
      statusLabel: meta.label,
      c: meta.c,
      b: meta.b,
      onTap: typeof this.link === 'function' ? this.link(name + 'の日報を開きます') : () => {}
    };
  }

  __mobileUiuxNormalizeReportStatus(value) {
    if (value === 'done' || value === 'submitted' || value === 'confirmed') return 'done';
    if (value === 'review' || value === 'needscheck' || value === 'needs_check') return 'review';
    return 'missing';
  }

  __mobileUiuxReportStatusMeta(value) {
    if (value === 'done') return { label: '提出済', c: 'var(--s-cf)', b: 'var(--s-cf-bg)' };
    if (value === 'review') return { label: '要確認', c: 'var(--s-uc)', b: 'var(--s-uc-bg)' };
    return { label: '未提出', c: 'var(--s-ns)', b: 'var(--s-ns-bg)' };
  }

  __mobileUiuxNormalizeSeverity(value) {
    if (value === 'critical' || value === 'error') return 'critical';
    if (value === 'warning' || value === 'warn') return 'warning';
    return 'info';
  }

  __mobileUiuxSeverityMeta(value) {
    const severity = this.__mobileUiuxNormalizeSeverity(value);
    if (this.SEV && this.SEV[severity]) return this.SEV[severity];
    if (severity === 'critical') return { label: '要対応', c: 'var(--s-ns)', b: 'var(--s-ns-bg)' };
    if (severity === 'warning') return { label: '注意', c: 'var(--s-uc)', b: 'var(--s-uc-bg)' };
    return { label: '情報', c: 'var(--fg-2)', b: 'var(--surface-3)' };
  }

  __mobileUiuxNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  __mobileUiuxDisplayText(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }

  __mobileUiuxYen(value) {
    return '¥' + Math.round(this.__mobileUiuxNumber(value)).toLocaleString('ja-JP');
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

  __mobileUiuxIsRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
`;
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
    return hydratedVals
      ? { ...originalVals, confirmAppt: this.__mobileUiuxConfirmReservation, cancelAppt: this.__mobileUiuxCancelReservation, ...hydratedVals }
      : { ...originalVals, confirmAppt: this.__mobileUiuxConfirmReservation, cancelAppt: this.__mobileUiuxCancelReservation };
  }

  componentDidMount() {
    this.__mobileUiuxPrimeReservationWriteSources();
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
      const currentVals = component.__mobileUiuxHydratedVals && typeof component.__mobileUiuxHydratedVals === 'object'
        ? component.__mobileUiuxHydratedVals
        : {};
      component.__mobileUiuxHydratedVals = { ...currentVals, ...hydratedVals };
      if (typeof component.setState === 'function') {
        const statePatch = { __mobileUiuxHydratedAt: Date.now() };
        if (Array.isArray(hydratedVals.__mobileUiuxAppts)) {
          statePatch.appts = hydratedVals.__mobileUiuxAppts;
          statePatch.loading = false;
        }
        if (typeof hydratedVals.__mobileUiuxFirstMenuName === 'string') {
          statePatch.fMenu = hydratedVals.__mobileUiuxFirstMenuName;
          statePatch.fDur = hydratedVals.__mobileUiuxFirstMenuDuration;
        }
        if (typeof hydratedVals.__mobileUiuxFirstResourceId === 'string') {
          statePatch.fRes = hydratedVals.__mobileUiuxFirstResourceId;
          statePatch.timelineRes = hydratedVals.__mobileUiuxFirstResourceId;
        }
        component.setState(statePatch);
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
    if (screen === 'settings-detail') {
      return this.__mobileUiuxBuildReservationSettingsDetailOverrides(payload);
    }

    if (screen !== 'reservations' || !this.__mobileUiuxIsRecord(payload) || payload.success !== true) {
      return null;
    }
    let data = payload.data;
    if (!this.__mobileUiuxIsRecord(data)) {
      return null;
    }

    if (this.__mobileUiuxIsRecord(data.reservation)) {
      data = this.__mobileUiuxMergeReservationMutation(data);
    }

    if (!this.__mobileUiuxIsRecord(data) || typeof data.date !== 'string' || !Array.isArray(data.reservations)) {
      return null;
    }

    this.__mobileUiuxCurrentReservationData = data;
    this.__mobileUiuxCurrentClinicId = typeof data.clinicId === 'string' ? data.clinicId : this.__mobileUiuxCurrentClinicId;

    const viewModels = this.__mobileUiuxBuildReservationViewModels(data.reservations);

    return {
      dateLabel: this.__mobileUiuxFormatDateLabel(data.date),
      sumTotal: viewModels.counts.total,
      sumConf: viewModels.counts.confirmed,
      sumUnc: viewModels.counts.unconfirmed,
      sumCancel: viewModels.counts.cancelled,
      rows: viewModels.rows,
      isLoading: false,
      isEmpty: viewModels.rows.length === 0,
      showAgenda: viewModels.rows.length > 0,
      showTimeline: false,
      __mobileUiuxAppts: viewModels.appts
    };
  }

  __mobileUiuxPrimeReservationWriteSources() {
    if (Array.isArray(this.CLINICS)) {
      this.CLINICS = [];
    }
    if (Array.isArray(this.MENUS)) {
      this.MENUS = [];
    }
    if (Array.isArray(this.THER)) {
      this.THER = [];
      this.__mobileUiuxStaffResourceSource = null;
      this.__mobileUiuxStaffResourceMap = null;
    }
    this.historyFor = () => [];
    if (this.state && typeof this.state === 'object' && typeof this.setState === 'function') {
      this.setState({
        fMenu: '',
        fRes: '',
        timelineRes: ''
      });
    }
  }

  __mobileUiuxBuildReservationSettingsDetailOverrides(payload) {
    if (!this.__mobileUiuxIsRecord(payload) || payload.success !== true || !this.__mobileUiuxIsRecord(payload.data)) {
      return null;
    }
    const data = payload.data;
    const menus = this.__mobileUiuxBuildReservationMenus(data.menus);
    const resources = this.__mobileUiuxBuildReservationResources(data.resources);
    const clinic = this.__mobileUiuxBuildReservationClinic(data.clinic);
    this.MENUS = menus;
    this.THER = resources;
    this.CLINICS = clinic ? [clinic] : [];
    this.__mobileUiuxStaffResourceSource = null;
    this.__mobileUiuxStaffResourceMap = null;
    return {
      __mobileUiuxFirstMenuName: menus.length > 0 ? menus[0].name : '',
      __mobileUiuxFirstMenuDuration: menus.length > 0 ? menus[0].dur : 0,
      __mobileUiuxFirstResourceId: resources.length > 0 ? resources[0].id : ''
    };
  }

  __mobileUiuxBuildReservationMenus(value) {
    const rows = [];
    if (!Array.isArray(value)) return rows;
    for (const item of value) {
      if (!this.__mobileUiuxIsRecord(item)) continue;
      const name = this.__mobileUiuxDisplayText(item.name, '');
      if (!name) continue;
      const duration = this.__mobileUiuxPositiveNumber(item.durationMinutes, 30);
      rows.push({
        id: typeof item.id === 'string' ? item.id : name,
        name,
        dur: duration,
        price: this.__mobileUiuxNonNegativeNumber(item.price),
        active: item.isActive !== false
      });
    }
    return rows;
  }

  __mobileUiuxBuildReservationClinic(value) {
    if (!this.__mobileUiuxIsRecord(value)) return null;
    const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : this.__mobileUiuxCurrentClinicId;
    const name = this.__mobileUiuxDisplayText(value.name, '');
    if (!id || !name) return null;
    return { id, name };
  }

  __mobileUiuxBuildReservationResources(value) {
    const rows = [];
    if (!Array.isArray(value)) return rows;
    for (const item of value) {
      if (!this.__mobileUiuxIsRecord(item)) continue;
      const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : '';
      const name = this.__mobileUiuxDisplayText(item.name, '');
      if (!id || !name || item.isActive === false || item.isBookable === false) continue;
      rows.push({
        id,
        name,
        role: this.__mobileUiuxDisplayText(item.type, '担当'),
        clinic: 'c1',
        nominationFee: this.__mobileUiuxNonNegativeNumber(item.nominationFee)
      });
    }
    return rows;
  }

  __mobileUiuxBuildReservationViewModels(reservations) {
    const rows = [];
    const appts = [];
    const counts = { total: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 };

    for (const reservation of reservations) {
      if (!this.__mobileUiuxIsRecord(reservation)) continue;
      this.__mobileUiuxIncrementReservationCounts(counts, reservation.status);
      const viewModel = this.__mobileUiuxReservationToViewModel(reservation);
      if (!viewModel) continue;
      rows.push(viewModel.row);
      if (viewModel.appt) {
        appts.push(viewModel.appt);
      }
    }

    return { rows, appts, counts };
  }

  __mobileUiuxReservationToViewModel(reservation) {
    if (!this.__mobileUiuxIsRecord(reservation)) return null;
    const times = this.__mobileUiuxReservationTimes(reservation.startTime, reservation.endTime);
    if (!times) return null;
    const status = this.__mobileUiuxStatusMeta(reservation.status);
    const staffName = this.__mobileUiuxDisplayText(reservation.staffName, '担当未設定');
    const resourceId = this.__mobileUiuxEnsureStaffResource(reservation.staffId, staffName);
    const normalizedStatus = this.__mobileUiuxNormalizeStatus(reservation.status) || 'unconfirmed';
    const patient = this.__mobileUiuxDisplayText(reservation.customerName || reservation.patientName, '患者名未設定');
    const menu = this.__mobileUiuxDisplayText(reservation.menuName, 'メニュー未設定');

    return {
      row: {
        isAppt: true,
        isGap: false,
        startT: times.startLabel,
        endT: times.endLabel,
        patient,
        menu,
        ther: staffName,
        initial: typeof this.initial === 'function' ? this.initial(staffName) : staffName.trim().charAt(0),
        showTher: true,
        statusLabel: status.label,
        c: status.c,
        b: status.b,
        dim: status.dim,
        onTap: typeof reservation.id === 'string' && typeof this.openDetail === 'function'
          ? this.openDetail(reservation.id)
          : () => {}
      },
      appt: typeof reservation.id === 'string' ? {
        id: reservation.id,
        res: resourceId,
        start: times.startMinutes,
        dur: times.endMinutes - times.startMinutes,
        patient,
        menu,
        status: normalizedStatus,
        clinic: 'c1',
        mobileUiuxClinicId: typeof reservation.clinicId === 'string' ? reservation.clinicId : this.__mobileUiuxCurrentClinicId,
        mobileUiuxStaffId: typeof reservation.staffId === 'string' ? reservation.staffId : null,
        mobileUiuxStartTime: reservation.startTime,
        mobileUiuxEndTime: reservation.endTime
      } : null
    };
  }

  __mobileUiuxMergeReservationMutation(data) {
    const current = this.__mobileUiuxCurrentReservationData;
    if (!this.__mobileUiuxIsRecord(current) || typeof current.date !== 'string' || !Array.isArray(current.reservations)) {
      return null;
    }
    const reservation = data.reservation;
    if (!this.__mobileUiuxIsRecord(reservation) || typeof reservation.id !== 'string') {
      return null;
    }
    let replaced = false;
    const reservations = current.reservations.map((item) => {
      if (this.__mobileUiuxIsRecord(item) && item.id === reservation.id) {
        replaced = true;
        return reservation;
      }
      return item;
    });
    if (!replaced) {
      reservations.push(reservation);
    }
    return {
      ...current,
      clinicId: typeof data.clinicId === 'string' ? data.clinicId : current.clinicId,
      reservations
    };
  }

  __mobileUiuxEnsureStaffResource(staffId, staffName) {
    const fallback = 'mobile-uiux-staff';
    const resourceId = typeof staffId === 'string' && staffId.length > 0 ? staffId : fallback;
    if (!Array.isArray(this.THER)) return resourceId;
    const resourceIndex = this.__mobileUiuxStaffResourceIndex();
    const existing = resourceIndex.get(resourceId);
    if (existing) {
      if (!existing.name && staffName) existing.name = staffName;
      return resourceId;
    }
    const nextResource = { id: resourceId, name: staffName, role: '担当', clinic: 'c1' };
    this.THER = this.THER.concat([nextResource]);
    this.__mobileUiuxStaffResourceSource = null;
    this.__mobileUiuxStaffResourceMap = null;
    return resourceId;
  }

  __mobileUiuxStaffResourceIndex() {
    if (this.__mobileUiuxStaffResourceSource === this.THER && this.__mobileUiuxStaffResourceMap instanceof Map) {
      return this.__mobileUiuxStaffResourceMap;
    }
    const map = new Map();
    if (Array.isArray(this.THER)) {
      for (const resource of this.THER) {
        if (this.__mobileUiuxIsRecord(resource) && typeof resource.id === 'string') {
          map.set(resource.id, resource);
        }
      }
    }
    this.__mobileUiuxStaffResourceSource = this.THER;
    this.__mobileUiuxStaffResourceMap = map;
    return map;
  }

  __mobileUiuxReservationTimes(startValue, endValue) {
    const start = this.__mobileUiuxReservationTimeParts(startValue);
    const end = this.__mobileUiuxReservationTimeParts(endValue);
    if (!start || !end || end.minutes <= start.minutes) return null;
    return {
      startLabel: start.label,
      endLabel: end.label,
      startMinutes: start.minutes,
      endMinutes: end.minutes
    };
  }

  __mobileUiuxReservationTimeParts(value) {
    if (typeof value !== 'string' || value.length === 0) return null;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + 9 * 60;
      const minutes = ((totalMinutes % 1440) + 1440) % 1440;
      const hours = Math.floor(minutes / 60);
      return {
        label: hours + ':' + String(minutes % 60).padStart(2, '0'),
        minutes
      };
    }
    const match = /T(\\d{2}):(\\d{2})/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const totalMinutes = hours * 60 + minutes;
    return {
      label: hours + ':' + String(minutes).padStart(2, '0'),
      minutes: totalMinutes
    };
  }

  setArrival = (status) => () => this.__mobileUiuxUpdateReservationStatus(status);
  confirmAppt = () => this.__mobileUiuxUpdateReservationStatus('confirmed');
  cancelAppt = () => this.__mobileUiuxUpdateReservationStatus('cancelled');
  __mobileUiuxConfirmReservation = () => this.__mobileUiuxUpdateReservationStatus('confirmed');
  __mobileUiuxCancelReservation = () => this.__mobileUiuxUpdateReservationStatus('cancelled');

  async __mobileUiuxUpdateReservationStatus(status) {
    if (status !== 'confirmed' && status !== 'arrived' && status !== 'cancelled') {
      this.__mobileUiuxShowReservationToast('この操作はまだ保存できません');
      return false;
    }

    if (this.__mobileUiuxReservationSaving === true) {
      this.__mobileUiuxShowReservationToast('予約を保存中です');
      return false;
    }

    const state = this.state && typeof this.state === 'object' ? this.state : {};
    const reservation = Array.isArray(state.appts)
      ? state.appts.find((item) => this.__mobileUiuxIsRecord(item) && item.id === state.detailId)
      : null;
    if (!this.__mobileUiuxIsRecord(reservation)) {
      this.__mobileUiuxShowReservationToast('予約を選択してください');
      return false;
    }

    const payload = this.__mobileUiuxBuildReservationUpdatePayload(reservation, status);
    if (!payload) {
      this.__mobileUiuxShowReservationToast('予約を保存できません');
      return false;
    }

    const bridge = typeof window !== 'undefined' && window.MobileUiuxBridge
      ? window.MobileUiuxBridge
      : null;
    if (!bridge || typeof bridge.updateReservation !== 'function') {
      this.__mobileUiuxShowReservationToast('予約保存は現在利用できません');
      return false;
    }

    this.__mobileUiuxReservationSaving = true;
    let ok = false;
    try {
      ok = await bridge.updateReservation(payload);
    } catch {
      ok = false;
    } finally {
      this.__mobileUiuxReservationSaving = false;
    }

    if (ok === true) {
      this.__mobileUiuxShowReservationToast(this.__mobileUiuxReservationStatusToast(status));
      return true;
    }

    this.__mobileUiuxShowReservationToast('予約は保存されていません');
    return false;
  }

  __mobileUiuxBuildReservationUpdatePayload(reservation, status) {
    const clinicId = typeof reservation.mobileUiuxClinicId === 'string' && reservation.mobileUiuxClinicId.length > 0
      ? reservation.mobileUiuxClinicId
      : this.__mobileUiuxCurrentClinicId;
    if (typeof clinicId !== 'string' || clinicId.length === 0 || typeof reservation.id !== 'string') {
      return null;
    }

    return {
      clinic_id: clinicId,
      id: reservation.id,
      status
    };
  }

  __mobileUiuxReservationStatusToast(status) {
    if (status === 'confirmed') return '予約を確定しました';
    if (status === 'arrived') return '来院済みにしました';
    if (status === 'cancelled') return '予約をキャンセルしました';
    return '予約を保存しました';
  }

  __mobileUiuxShowReservationToast(message) {
    if (typeof this.toast === 'function') {
      this.toast(message);
    } else if (typeof this.setState === 'function') {
      this.setState({ toast: message });
    }
  }

  __mobileUiuxCountReservations(reservations) {
    const counts = { total: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 };
    reservations.forEach((reservation) => {
      if (!this.__mobileUiuxIsRecord(reservation)) return;
      this.__mobileUiuxIncrementReservationCounts(counts, reservation.status);
    });
    return counts;
  }

  __mobileUiuxIncrementReservationCounts(counts, value) {
    const status = this.__mobileUiuxNormalizeStatus(value);
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

  __mobileUiuxNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  __mobileUiuxPositiveNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
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

function buildSettingsHydrationAdapterSource(): string {
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
    if (screen !== 'settings' || !this.__mobileUiuxIsRecord(payload) || payload.success !== true) {
      return null;
    }
    const data = payload.data;
    if (!this.__mobileUiuxIsRecord(data)) {
      return null;
    }
    return {
      __mobileUiuxSettingsCategory: typeof data.category === 'string' ? data.category : 'settings'
    };
  }

  __mobileUiuxIsRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
`;
}

function buildSettingsDetailHydrationAdapterSource(): string {
  return `

  renderVals() {
    const originalResult = typeof this.${ORIGINAL_RENDER_VALS_METHOD} === 'function'
      ? this.${ORIGINAL_RENDER_VALS_METHOD}()
      : {};
    const originalVals = originalResult && typeof originalResult === 'object' ? originalResult : {};
    const state = this.state && typeof this.state === 'object' ? this.state : {};
    const nav = Array.isArray(state.nav) ? state.nav : [];
    const current = nav.length > 0 ? nav[nav.length - 1] : null;
    const showSaveBar = this.__mobileUiuxIsRecord(current) &&
      current.scr === 'clinic' &&
      state.clinicTab === 'hours' &&
      !state.menuSheet &&
      !state.clinicSheet;
    return {
      ...originalVals,
      showSaveBar,
      onSave: this.__mobileUiuxSaveSettings,
      saveLabel: this.state && this.state.saving ? '保存中…' : '保存'
    };
  }

  componentDidMount() {
    this.__mobileUiuxPrimeSettingsDetailWriteSources();
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
      const statePatch = component.__mobileUiuxBuildSettingsStatePatch(screen, payload);
      if (statePatch === false) return false;
      if (typeof component.setState === 'function') {
        const nextState = { __mobileUiuxHydratedAt: Date.now() };
        if (component.__mobileUiuxIsRecord(statePatch)) {
          Object.assign(nextState, statePatch);
        }
        component.setState(nextState);
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

  __mobileUiuxBuildSettingsStatePatch(screen, payload) {
    if (screen !== 'settings-detail' || !this.__mobileUiuxIsRecord(payload) || payload.success !== true) {
      return false;
    }
    const data = payload.data;
    if (!this.__mobileUiuxIsRecord(data)) {
      return false;
    }

    if (data.category === 'clinic_hours' && this.__mobileUiuxIsRecord(data.settings)) {
      return this.__mobileUiuxBuildClinicHoursStatePatch(data.settings);
    }

    if (typeof data.category === 'string' && this.__mobileUiuxIsRecord(data.settings)) {
      return {};
    }

    if (Array.isArray(data.menus) || Array.isArray(data.resources) || this.__mobileUiuxIsRecord(data.clinic)) {
      return this.__mobileUiuxBuildSettingsDetailStatePatch(data);
    }

    return false;
  }

  __mobileUiuxPrimeSettingsDetailWriteSources() {
    if (Array.isArray(this.CLINICS)) {
      this.CLINICS = [{ id: '', name: '' }];
    }
    if (this.state && typeof this.state === 'object' && typeof this.setState === 'function') {
      this.setState({
        clinic: '',
        basic: this.__mobileUiuxBlankClinicBasic(),
        intro: '',
        hours: this.__mobileUiuxClosedClinicHours(),
        special: [],
        insurance: [],
        medCode: '',
        receiptFooter: '',
        recToggles: { kohi: false, stamp: false },
        closingDay: 'eom',
        pay: { cash: false, credit: false, qr: false, emoney: false, transfer: false, insurance: false },
        autoReconcile: false,
        reminderDays: '',
        menus: []
      });
    }
  }

  __mobileUiuxBuildSettingsDetailStatePatch(data) {
    const patch = {};
    if (this.__mobileUiuxIsRecord(data.clinic)) {
      const clinic = this.__mobileUiuxNormalizeClinic(data.clinic);
      if (clinic) {
        this.CLINICS = [{ id: clinic.id, name: clinic.name }];
        patch.clinic = clinic.id;
        patch.basic = {
          name: clinic.name,
          tel: clinic.phoneNumber,
          zip: '',
          fax: '',
          addr: clinic.address,
          email: '',
          site: ''
        };
        patch.intro = '';
      }
    }
    if (Array.isArray(data.menus)) {
      patch.menus = this.__mobileUiuxBuildSettingsDetailMenus(data.menus);
    }
    return patch;
  }

  __mobileUiuxNormalizeClinic(value) {
    if (!this.__mobileUiuxIsRecord(value)) return null;
    const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : '';
    const name = this.__mobileUiuxDisplayText(value.name, '');
    if (!id || !name) return null;
    return {
      id,
      name,
      address: this.__mobileUiuxDisplayText(value.address, ''),
      phoneNumber: this.__mobileUiuxDisplayText(value.phoneNumber, '')
    };
  }

  __mobileUiuxBuildSettingsDetailMenus(value) {
    const rows = [];
    for (const item of value) {
      if (!this.__mobileUiuxIsRecord(item)) continue;
      const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : '';
      const name = this.__mobileUiuxDisplayText(item.name, '');
      if (!id || !name) continue;
      rows.push({
        id,
        name,
        cat: this.__mobileUiuxDisplayText(item.category, 'その他'),
        kind: item.isInsuranceApplicable === true ? 'ins' : 'self',
        dur: String(this.__mobileUiuxPositiveNumber(item.durationMinutes, 30)),
        price: String(this.__mobileUiuxNonNegativeNumber(item.price)),
        active: item.isActive !== false
      });
    }
    return rows;
  }

  __mobileUiuxBlankClinicBasic() {
    return { name: '', tel: '', zip: '', fax: '', addr: '', email: '', site: '' };
  }

  __mobileUiuxClosedClinicHours() {
    return [
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] },
      { open: false, slots: [] }
    ];
  }

  __mobileUiuxSaveSettings = async () => {
    if (this.state && this.state.saving) {
      this.__mobileUiuxShowSettingsToast('設定を保存中です');
      return false;
    }

    const bridge = typeof window !== 'undefined' && window.MobileUiuxBridge
      ? window.MobileUiuxBridge
      : null;
    if (!bridge || typeof bridge.updateSettings !== 'function') {
      this.__mobileUiuxShowSettingsToast('設定保存は現在利用できません');
      return false;
    }

    const payload = this.__mobileUiuxBuildSettingsPayload();
    if (!payload) {
      this.__mobileUiuxShowSettingsToast('この設定カテゴリはモバイル保存の対象外です');
      return false;
    }

    if (typeof this.setState === 'function') {
      this.setState({ saving: true });
    }

    let ok = false;
    try {
      ok = await bridge.updateSettings(payload);
    } catch {
      ok = false;
    } finally {
      if (typeof this.setState === 'function') {
        this.setState({ saving: false });
      }
    }

    if (ok === true) {
      this.__mobileUiuxShowSettingsToast('設定を保存しました');
      return true;
    }

    this.__mobileUiuxShowSettingsToast('設定は保存されていません');
    return false;
  }

  __mobileUiuxBuildSettingsPayload() {
    const state = this.state && typeof this.state === 'object' ? this.state : {};
    const nav = Array.isArray(state.nav) ? state.nav : [];
    const current = nav.length > 0 ? nav[nav.length - 1] : null;
    if (!this.__mobileUiuxIsRecord(current) || current.scr !== 'clinic' || state.clinicTab !== 'hours') {
      return null;
    }

    return {
      category: 'clinic_hours',
      settings: this.__mobileUiuxBuildClinicHoursSettings()
    };
  }

  __mobileUiuxBuildClinicHoursSettings() {
    const state = this.state && typeof this.state === 'object' ? this.state : {};
    const hoursByDay = {};
    const dayKeys = this.__mobileUiuxClinicHoursDayKeys();
    const hours = Array.isArray(state.hours) ? state.hours : [];
    for (let index = 0; index < dayKeys.length; index += 1) {
      const key = dayKeys[index];
      const day = this.__mobileUiuxIsRecord(hours[index]) ? hours[index] : {};
      const slots = [];
      if (Array.isArray(day.slots)) {
        for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex += 1) {
          const slot = day.slots[slotIndex];
          if (!this.__mobileUiuxIsRecord(slot)) continue;
          const start = typeof slot.start === 'string' ? slot.start : '';
          const end = typeof slot.end === 'string' ? slot.end : '';
          if (this.__mobileUiuxIsTime(start) && this.__mobileUiuxIsTime(end)) {
            slots.push({ start, end });
          }
        }
      }
      hoursByDay[key] = {
        open: day.open === true,
        slots
      };
    }

    const special = Array.isArray(state.special) ? state.special : [];
    const holidays = [];
    const specialClosures = [];
    for (let index = 0; index < special.length; index += 1) {
      const item = special[index];
      if (!this.__mobileUiuxIsRecord(item) || typeof item.date !== 'string' || item.date.length === 0) continue;
      const type = typeof item.type === 'string' && item.type.length > 0 ? item.type : '休診';
      const label = typeof item.label === 'string' ? item.label : '';
      if (type === '休診') {
        holidays.push(item.date);
      }
      specialClosures.push({
        date: item.date,
        type,
        label
      });
    }

    return {
      hoursByDay,
      holidays,
      specialClosures
    };
  }

  __mobileUiuxBuildClinicHoursStatePatch(settings) {
    const dayKeys = this.__mobileUiuxClinicHoursDayKeys();
    const hoursByDay = this.__mobileUiuxIsRecord(settings.hoursByDay) ? settings.hoursByDay : {};
    const currentHours = this.state && Array.isArray(this.state.hours) ? this.state.hours : [];
    const hours = [];
    for (let index = 0; index < dayKeys.length; index += 1) {
      const key = dayKeys[index];
      hours.push(this.__mobileUiuxNormalizeHourDay(hoursByDay[key], currentHours[index]));
    }
    const special = this.__mobileUiuxNormalizeSpecialClosures(settings);
    return {
      hours,
      special
    };
  }

  __mobileUiuxNormalizeHourDay(day, fallback) {
    const source = this.__mobileUiuxIsRecord(day) ? day : fallback;
    const record = this.__mobileUiuxIsRecord(source) ? source : {};
    const slots = [];
    if (Array.isArray(record.slots)) {
      for (let index = 0; index < record.slots.length; index += 1) {
        const slot = record.slots[index];
        if (!this.__mobileUiuxIsRecord(slot)) continue;
        const start = typeof slot.start === 'string' ? slot.start : '';
        const end = typeof slot.end === 'string' ? slot.end : '';
        if (this.__mobileUiuxIsTime(start) && this.__mobileUiuxIsTime(end)) {
          slots.push({ start, end });
        }
      }
    }
    return {
      open: record.open === true,
      slots
    };
  }

  __mobileUiuxNormalizeSpecialClosures(settings) {
    const rows = [];
    if (Array.isArray(settings.specialClosures)) {
      for (let index = 0; index < settings.specialClosures.length; index += 1) {
        const item = settings.specialClosures[index];
        if (!this.__mobileUiuxIsRecord(item) || typeof item.date !== 'string' || item.date.length === 0) continue;
        rows.push({
          date: item.date,
          type: this.__mobileUiuxNormalizeSpecialType(item.type),
          label: typeof item.label === 'string' ? item.label : ''
        });
      }
    }
    if (rows.length > 0) {
      return rows;
    }
    if (Array.isArray(settings.holidays)) {
      for (let index = 0; index < settings.holidays.length; index += 1) {
        const date = settings.holidays[index];
        if (typeof date === 'string' && date.length > 0) {
          rows.push({ date, type: '休診', label: '' });
        }
      }
    }
    return rows;
  }

  __mobileUiuxNormalizeSpecialType(value) {
    if (value === '休診' || value === '短縮営業' || value === '臨時営業') {
      return value;
    }
    return '休診';
  }

  __mobileUiuxClinicHoursDayKeys() {
    if (!this.__mobileUiuxClinicHoursDayKeyList) {
      this.__mobileUiuxClinicHoursDayKeyList = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    }
    return this.__mobileUiuxClinicHoursDayKeyList;
  }

  __mobileUiuxIsTime(value) {
    return /^\\d{2}:\\d{2}$/.test(value);
  }

  __mobileUiuxDisplayText(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }

  __mobileUiuxNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  __mobileUiuxPositiveNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  __mobileUiuxShowSettingsToast(message) {
    if (typeof this.toast === 'function') {
      this.toast(message);
    } else if (typeof this.setState === 'function') {
      this.setState({ toast: message });
    }
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
    return hydratedVals
      ? { ...originalVals, saveReport: this.__mobileUiuxSubmitDailyReport, inputToday: this.__mobileUiuxOpenTodayReport, ...hydratedVals }
      : { ...originalVals, saveReport: this.__mobileUiuxSubmitDailyReport, inputToday: this.__mobileUiuxOpenTodayReport };
  }

  componentDidMount() {
    this.__mobileUiuxPrimeDailyReportWriteSources();
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
      const currentVals = component.__mobileUiuxHydratedVals && typeof component.__mobileUiuxHydratedVals === 'object'
        ? component.__mobileUiuxHydratedVals
        : {};
      component.__mobileUiuxHydratedVals = { ...currentVals, ...hydratedVals };
      if (typeof component.setState === 'function') {
        const statePatch = { __mobileUiuxHydratedAt: Date.now() };
        if (Array.isArray(hydratedVals.__mobileUiuxTodayItems)) {
          statePatch.todayItems = hydratedVals.__mobileUiuxTodayItems;
          statePatch.items = hydratedVals.__mobileUiuxTodayItems;
        }
        if (typeof hydratedVals.__mobileUiuxFirstTherapistId === 'string') {
          statePatch.formTher = hydratedVals.__mobileUiuxFirstTherapistId;
        }
        component.setState(statePatch);
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
    if (screen === 'settings-detail') {
      return this.__mobileUiuxBuildDailyReportSettingsDetailOverrides(payload);
    }

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
    this.__mobileUiuxCurrentReportDateKey = reportDate;

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
      statusRows: viewRows.statusRows,
      __mobileUiuxTodayItems: []
    };
  }

  __mobileUiuxPrimeDailyReportWriteSources() {
    if (Array.isArray(this.MENUS_DR)) {
      this.MENUS_DR = [];
    }
    if (Array.isArray(this.THER)) {
      this.THER = [];
    }
    if (this.state && typeof this.state === 'object' && typeof this.setState === 'function') {
      this.setState({
        todayItems: [],
        items: [],
        formTher: ''
      });
    }
  }

  __mobileUiuxOpenTodayReport = () => {
    const hydratedVals = this.__mobileUiuxHydratedVals && typeof this.__mobileUiuxHydratedVals === 'object'
      ? this.__mobileUiuxHydratedVals
      : {};
    const formDate = typeof hydratedVals.todayLabel === 'string' ? hydratedVals.todayLabel : '';
    const sourceItems = this.state && Array.isArray(this.state.todayItems) ? this.state.todayItems : [];
    const items = sourceItems.map((item) => ({ ...item }));
    if (typeof this.setState === 'function') {
      this.setState({ formOpen: true, editKey: 'd0', formDate, items, confirmDel: null });
    }
  };

  __mobileUiuxBuildDailyReportSettingsDetailOverrides(payload) {
    if (!this.__mobileUiuxIsRecord(payload) || payload.success !== true || !this.__mobileUiuxIsRecord(payload.data)) {
      return null;
    }
    const data = payload.data;
    const menus = this.__mobileUiuxBuildDailyReportMenus(data.menus);
    const therapists = this.__mobileUiuxBuildDailyReportTherapists(data.resources);
    this.MENUS_DR = menus;
    this.THER = therapists;
    return {
      menuOpts: menus.map((menu) => ({ v: menu.name, l: menu.name })),
      therOpts: therapists.map((therapist) => ({ v: therapist.id, l: therapist.name })),
      __mobileUiuxFirstTherapistId: therapists.length > 0 ? therapists[0].id : ''
    };
  }

  __mobileUiuxBuildDailyReportMenus(value) {
    const rows = [];
    if (!Array.isArray(value)) return rows;
    for (const item of value) {
      if (!this.__mobileUiuxIsRecord(item)) continue;
      const name = this.__mobileUiuxDisplayText(item.name, '');
      if (!name || item.isActive === false) continue;
      rows.push({
        name,
        price: this.__mobileUiuxNumber(item.price),
        type: item.isInsuranceApplicable === true ? '保険' : '自費'
      });
    }
    return rows;
  }

  __mobileUiuxBuildDailyReportTherapists(value) {
    const rows = [];
    if (!Array.isArray(value)) return rows;
    for (const item of value) {
      if (!this.__mobileUiuxIsRecord(item)) continue;
      const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : '';
      const name = this.__mobileUiuxDisplayText(item.name, '');
      if (!id || !name || item.isActive === false) continue;
      rows.push({ id, name });
    }
    return rows;
  }

  __mobileUiuxSubmitDailyReport = async () => {
    if (this.__mobileUiuxDailyReportSaving === true) {
      this.__mobileUiuxShowWriteToast('日報を保存中です');
      return false;
    }

    const bridge = typeof window !== 'undefined' && window.MobileUiuxBridge
      ? window.MobileUiuxBridge
      : null;
    if (!bridge || typeof bridge.submitDailyReport !== 'function') {
      this.__mobileUiuxShowWriteToast('日報保存は現在利用できません');
      return false;
    }

    const payload = this.__mobileUiuxBuildDailyReportPayload();
    if (!payload) {
      this.__mobileUiuxShowWriteToast('日報を保存できません。入力内容を確認してください');
      return false;
    }

    this.__mobileUiuxDailyReportSaving = true;
    let ok = false;
    try {
      ok = await bridge.submitDailyReport(payload);
    } catch {
      ok = false;
    } finally {
      this.__mobileUiuxDailyReportSaving = false;
    }

    if (ok === true) {
      if (typeof this.setState === 'function') {
        this.setState({ formOpen: false, confirmDel: null });
      }
      this.__mobileUiuxShowWriteToast('日報を保存しました');
      return true;
    }

    this.__mobileUiuxShowWriteToast('日報は保存されていません');
    return false;
  }

  __mobileUiuxBuildDailyReportPayload() {
    const state = this.state && typeof this.state === 'object' ? this.state : {};
    if (state.role === 'manager' || state.editKey !== 'd0' || !Array.isArray(state.items)) {
      return null;
    }

    const reportDate = typeof this.__mobileUiuxCurrentReportDateKey === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(this.__mobileUiuxCurrentReportDateKey)
      ? this.__mobileUiuxCurrentReportDateKey
      : this.__mobileUiuxTodayJstDateKey();
    if (!reportDate) return null;

    let totalRevenue = 0;
    let insuranceRevenue = 0;
    const menuAmountByName = this.__mobileUiuxBuildDailyReportMenuAmountMap();
    for (const item of state.items) {
      const amount = this.__mobileUiuxDailyReportItemAmount(item, menuAmountByName);
      if (amount === null) return null;
      totalRevenue += amount;
      if (this.__mobileUiuxIsRecord(item) && item.type === '保険') {
        insuranceRevenue += amount;
      }
    }

    return {
      report_date: reportDate,
      total_patients: state.items.length,
      new_patients: 0,
      total_revenue: Math.round(totalRevenue),
      insurance_revenue: Math.round(insuranceRevenue),
      private_revenue: Math.round(totalRevenue - insuranceRevenue),
      report_text: null
    };
  }

  __mobileUiuxBuildDailyReportMenuAmountMap() {
    const source = Array.isArray(this.MENUS_DR) ? this.MENUS_DR : [];
    if (this.__mobileUiuxDailyReportMenuSource === source && this.__mobileUiuxDailyReportMenuAmountMap) {
      return this.__mobileUiuxDailyReportMenuAmountMap;
    }

    const amountByName = new Map();
    for (const menu of source) {
      if (!this.__mobileUiuxIsRecord(menu) || typeof menu.name !== 'string') continue;
      amountByName.set(menu.name, this.__mobileUiuxNumber(menu.price));
    }

    this.__mobileUiuxDailyReportMenuSource = source;
    this.__mobileUiuxDailyReportMenuAmountMap = amountByName;
    return amountByName;
  }

  __mobileUiuxDailyReportItemAmount(item, menuAmountByName) {
    if (!this.__mobileUiuxIsRecord(item)) return null;
    const baseAmount = typeof item.menu === 'string'
      ? menuAmountByName.get(item.menu) || 0
      : 0;
    const ratio = Number(item.ratio);
    const amount = item.type === '保険'
      ? Math.round(baseAmount * (Number.isFinite(ratio) ? ratio : 0) / 10)
      : baseAmount;
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  __mobileUiuxTodayJstDateKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = {};
    for (const part of parts) {
      if (part.type !== 'literal') values[part.type] = part.value;
    }
    return values.year && values.month && values.day
      ? values.year + '-' + values.month + '-' + values.day
      : '';
  }

  __mobileUiuxShowWriteToast(message) {
    if (typeof this.toast === 'function') {
      this.toast(message);
    } else if (typeof this.setState === 'function') {
      this.setState({ toast: message });
    }
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

  __mobileUiuxDisplayText(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
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

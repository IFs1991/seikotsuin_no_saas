export type MobileUiuxScreenResource =
  | 'home'
  | 'reservations'
  | 'patients'
  | 'daily-reports'
  | 'settings'
  | 'settings-detail';

export type MobileUiuxStaticResource =
  | 'support.js'
  | 'clinic-shared.js'
  | 'mobile-bridge.js';

export type MobileUiuxScreenRouteResource =
  | MobileUiuxScreenResource
  | MobileUiuxStaticResource;

export type MobileUiuxScreenManifestEntry = {
  screen: MobileUiuxScreenResource;
  endpoint: `/api/mobile-uiux/${string}`;
  requiresClinicId: boolean;
  defaultParams?: Readonly<Record<string, string>>;
};

export const MOBILE_UIUX_SCREEN_MANIFEST = {
  home: {
    screen: 'home',
    endpoint: '/api/mobile-uiux/home',
    requiresClinicId: true,
  },
  reservations: {
    screen: 'reservations',
    endpoint: '/api/mobile-uiux/reservations',
    requiresClinicId: true,
  },
  patients: {
    screen: 'patients',
    endpoint: '/api/mobile-uiux/patient-analysis',
    requiresClinicId: true,
  },
  'daily-reports': {
    screen: 'daily-reports',
    endpoint: '/api/mobile-uiux/daily-reports',
    requiresClinicId: true,
  },
  settings: {
    screen: 'settings',
    endpoint: '/api/mobile-uiux/settings',
    requiresClinicId: true,
    defaultParams: {
      category: 'clinic_basic',
    },
  },
  'settings-detail': {
    screen: 'settings-detail',
    endpoint: '/api/mobile-uiux/settings-detail',
    requiresClinicId: true,
  },
} as const satisfies Record<
  MobileUiuxScreenResource,
  MobileUiuxScreenManifestEntry
>;

export type MobileUiuxBridgeManifest = typeof MOBILE_UIUX_SCREEN_MANIFEST;

export type MobileUiuxBridgeScriptOptions = {
  realDataEnabled: boolean;
  manifest: MobileUiuxBridgeManifest;
};

const BRIDGE_SCRIPT_TAG_BY_SCREEN: Record<MobileUiuxScreenResource, string> = {
  home: '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="home" defer></script>',
  reservations:
    '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="reservations" defer></script>',
  patients:
    '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="patients" defer></script>',
  'daily-reports':
    '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="daily-reports" defer></script>',
  settings:
    '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="settings" defer></script>',
  'settings-detail':
    '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="settings-detail" defer></script>',
};

export function isMobileUiuxScreenResource(
  resource: string
): resource is MobileUiuxScreenResource {
  return Object.prototype.hasOwnProperty.call(
    MOBILE_UIUX_SCREEN_MANIFEST,
    resource
  );
}

export function injectMobileUiuxBridgeScript(
  html: string,
  resource: MobileUiuxScreenRouteResource
): string {
  if (!isMobileUiuxScreenResource(resource)) {
    return html;
  }

  if (html.includes('data-mobile-uiux-bridge')) {
    return html;
  }

  const scriptTag = BRIDGE_SCRIPT_TAG_BY_SCREEN[resource];

  if (html.includes('</body>')) {
    return html.replace('</body>', `${scriptTag}</body>`);
  }

  if (html.includes('</html>')) {
    return html.replace('</html>', `${scriptTag}</html>`);
  }

  return `${html}${scriptTag}`;
}

export function buildMobileUiuxBridgeScript(
  options: MobileUiuxBridgeScriptOptions
): string {
  const manifestJson = JSON.stringify(options.manifest);
  const realDataEnabled = options.realDataEnabled ? 'true' : 'false';

  return `
(() => {
  "use strict";

  const MOBILE_UIUX_SCREEN_MANIFEST = ${manifestJson};
  const REAL_DATA_ENABLED = ${realDataEnabled};
  const NAV_PATH_BY_TARGET = {
    home: "/mobile-uiux/screens/home",
    reservations: "/mobile-uiux/screens/reservations",
    patients: "/mobile-uiux/screens/patients",
    "daily-reports": "/mobile-uiux/screens/daily-reports",
    settings: "/mobile-uiux/screens/settings"
  };
  const SUPPLEMENTAL_READS_BY_SCREEN = {
    reservations: [{ screen: "settings-detail" }],
    "daily-reports": [{ screen: "settings-detail" }],
    "settings-detail": [
      {
        screen: "settings",
        applyScreen: "settings-detail",
        params: { category: "clinic_hours" }
      }
    ]
  };
  const STATUS_MESSAGES = {
    disabled: "実データ参照は無効です",
    unauthorized: "ログインが必要です",
    forbidden: "この画面の実データは閲覧できません",
    invalid: "実データを表示できません",
    writeDisabled: "予約の書き込みは無効です",
    dailyReportWriteDisabled: "日報の書き込みは無効です",
    dailyReportSaved: "日報を保存しました",
    settingsWriteDisabled: "設定の書き込みは無効です",
    settingsSaved: "設定を保存しました",
    reservationSaved: "予約を保存しました",
    reservationConflict: "同時間帯に既存予約があります。予約時間または担当を確認してください",
    saving: "保存中です",
    unavailable: "実データを一時的に表示できません"
  };
  let currentContext = null;
  let currentScreen = null;
  let currentReadParams = {};
  const inFlightMutations = new Map();
  const inFlightReads = new Map();
  let fallbackStatusElement = null;
  let mutationStatusElement = null;

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isSuccessPayload(value) {
    return isRecord(value) &&
      value.success === true &&
      isRecord(value.data) &&
      typeof value.generatedAt === "string";
  }

  function setStatus(status) {
    document.documentElement.dataset.mobileUiuxBridge = status;
  }

  function showFallback(status, message) {
    setStatus("fallback");
    const fallback = fallbackStatusElement || document.createElement("div");
    if (!fallbackStatusElement) {
      fallback.setAttribute("role", "status");
      fallbackStatusElement = fallback;
    }
    fallback.dataset.mobileUiuxBridgeFallback = status;
    fallback.textContent = message;
    if (document.body && !fallback.dataset.mobileUiuxFallbackAttached) {
      fallback.dataset.mobileUiuxFallbackAttached = "true";
      document.body.appendChild(fallback);
    }
  }

  function showMutationStatus(status, message) {
    document.documentElement.dataset.mobileUiuxMutation = status;
    const indicator = mutationStatusElement || document.createElement("div");
    if (!mutationStatusElement) {
      indicator.setAttribute("role", "status");
      mutationStatusElement = indicator;
    }
    indicator.dataset.mobileUiuxMutationStatus = status;
    indicator.textContent = message;
    if (document.body && !indicator.dataset.mobileUiuxMutationAttached) {
      indicator.dataset.mobileUiuxMutationAttached = "true";
      document.body.appendChild(indicator);
    }
  }

  function getScreen() {
    if (currentScreen) {
      return currentScreen;
    }

    const script = document.currentScript;
    const fromDataset = script && script.dataset ? script.dataset.screen : "";
    const fromAttribute = script && script.getAttribute ? script.getAttribute("data-screen") : "";
    const screen = fromDataset || fromAttribute || location.pathname.split("/").filter(Boolean).pop() || "";
    currentScreen = Object.prototype.hasOwnProperty.call(MOBILE_UIUX_SCREEN_MANIFEST, screen)
      ? screen
      : null;
    return currentScreen;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });

    if (response.status === 401) {
      return { kind: "unauthorized" };
    }

    if (response.status === 403) {
      return { kind: "forbidden" };
    }

    if (response.status === 409) {
      return { kind: "conflict" };
    }

    if (!response.ok) {
      return { kind: "unavailable" };
    }

    const payload = await response.json();
    return { kind: "payload", payload };
  }

  async function mutateJson(url, method, payload) {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      return { kind: "unauthorized" };
    }

    if (response.status === 403) {
      return { kind: "forbidden" };
    }

    if (response.status === 409) {
      return { kind: "conflict" };
    }

    if (!response.ok) {
      return { kind: "unavailable" };
    }

    const responsePayload = await response.json();
    return { kind: "payload", payload: responsePayload };
  }

  function buildReadUrl(entry, contextData, overrideParams) {
    const params = [];
    if (entry.requiresClinicId) {
      if (typeof contextData.defaultClinicId !== "string" || contextData.defaultClinicId.length === 0) {
        return null;
      }
      params.push(["clinic_id", contextData.defaultClinicId]);
    }

    const defaultParams = isRecord(entry.defaultParams) ? entry.defaultParams : {};
    const mergedParams = isRecord(overrideParams)
      ? { ...defaultParams, ...overrideParams }
      : defaultParams;
    if (isRecord(mergedParams)) {
      for (const key of Object.keys(mergedParams)) {
        const value = mergedParams[key];
        if (typeof value === "string") {
          params.push([key, value]);
        }
      }
    }

    if (params.length === 0) {
      return entry.endpoint;
    }

    return entry.endpoint + "?" + params
      .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
      .join("&");
  }

  function isDateKey(value) {
    return typeof value === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
  }

  function summarizePayload(screen, payload) {
    if (!isSuccessPayload(payload)) {
      return null;
    }

    const data = payload.data;
    if (screen === "reservations" && Array.isArray(data.reservations)) {
      return "予約データを読み込みました（" + data.reservations.length + "件）";
    }

    if (screen === "home" && isRecord(data.dashboard) && isRecord(data.dashboard.dailyData)) {
      return "ホームデータを読み込みました";
    }

    if (screen === "patients" && Array.isArray(data.rows)) {
      return "患者分析データを読み込みました（" + data.rows.length + "件）";
    }

    if (screen === "daily-reports" && isRecord(data.dailyReports) && Array.isArray(data.dailyReports.reports)) {
      return "日報データを読み込みました（" + data.dailyReports.reports.length + "件）";
    }

    if (screen === "settings-detail") {
      const menuCount = Array.isArray(data.menus) ? data.menus.length : 0;
      const resourceCount = Array.isArray(data.resources) ? data.resources.length : 0;
      return "設定詳細データを読み込みました（メニュー" + menuCount + "件 / リソース" + resourceCount + "件）";
    }

    return "実データを読み込みました";
  }

  function hydrateContext(contextPayload) {
    if (!isSuccessPayload(contextPayload)) {
      return false;
    }

    const contextData = contextPayload.data;
    if (!isRecord(contextData.role) || typeof contextData.role.canonical !== "string") {
      return false;
    }

    document.documentElement.dataset.mobileUiuxCanonicalRole = contextData.role.canonical;
    document.documentElement.dataset.mobileUiuxClinicScope = "server";
    document.documentElement.dataset.mobileUiuxSampleState = "overridden";
    currentContext = contextData;
    return true;
  }

  function appendReadStatus(screen, summary) {
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.dataset.mobileUiuxHydrated = screen;
    status.textContent = summary;
    if (document.body) {
      document.body.appendChild(status);
    }
  }

  function applyReadData(screen, payload) {
    const apply = window.__MOBILE_UIUX_APPLY_READ_DATA__;
    return typeof apply === "function" && apply(screen, payload) === true;
  }

  function hydrateReadOnlyData(screen, payload, requireApplied) {
    const summary = summarizePayload(screen, payload);
    if (!summary) {
      return false;
    }

    const applied = applyReadData(screen, payload);
    appendReadStatus(screen, summary);
    if (applied === true) {
      setStatus("hydrated");
      return true;
    }

    setStatus("fallback");
    return requireApplied === true ? false : true;
  }

  function getSupplementalReadScreens(screen) {
    const screens = SUPPLEMENTAL_READS_BY_SCREEN[screen];
    return Array.isArray(screens) ? screens : [];
  }

  async function hydrateSupplementalReadData(screen, contextData) {
    const supplementalReads = getSupplementalReadScreens(screen);
    for (const read of supplementalReads) {
      if (!isRecord(read) || typeof read.screen !== "string") {
        continue;
      }

      const entry = MOBILE_UIUX_SCREEN_MANIFEST[read.screen];
      if (!entry) {
        continue;
      }

      const readUrl = buildReadUrl(entry, contextData, read.params);
      if (!readUrl) {
        continue;
      }

      const readResult = await fetchJson(readUrl);
      if (readResult.kind === "payload") {
        const applyScreen = typeof read.applyScreen === "string" ? read.applyScreen : read.screen;
        hydrateReadOnlyData(applyScreen, readResult.payload);
      }
    }
  }

  function getAccessibleClinicIds() {
    return isRecord(currentContext) && Array.isArray(currentContext.accessibleClinicIds)
      ? currentContext.accessibleClinicIds.filter(clinicId => typeof clinicId === "string")
      : [];
  }

  function canUseClinicId(clinicId) {
    return getAccessibleClinicIds().includes(clinicId);
  }

  function getDefaultClinicId() {
    return isRecord(currentContext) && typeof currentContext.defaultClinicId === "string"
      ? currentContext.defaultClinicId
      : "";
  }

  function buildRefreshReadRequest(params) {
    if (!REAL_DATA_ENABLED || !isRecord(currentContext)) {
      return null;
    }

    const screen = getScreen();
    if (!screen) {
      return null;
    }

    const entry = MOBILE_UIUX_SCREEN_MANIFEST[screen];
    if (!entry) {
      return null;
    }

    const sourceParams = isRecord(params) ? params : {};
    const currentClinicId = getDefaultClinicId();
    const requestedClinicId = typeof sourceParams.clinicId === "string" && sourceParams.clinicId.length > 0
      ? sourceParams.clinicId
      : currentClinicId;
    if (!requestedClinicId || (sourceParams.clinicId && !canUseClinicId(requestedClinicId))) {
      return null;
    }

    const nextReadParams = { ...currentReadParams };
    if (sourceParams.date !== undefined) {
      if (!isDateKey(sourceParams.date)) {
        return null;
      }
      nextReadParams.date = sourceParams.date;
    }

    const nextContext = {
      ...currentContext,
      defaultClinicId: requestedClinicId
    };
    const readUrl = buildReadUrl(entry, nextContext, nextReadParams);
    if (!readUrl) {
      return null;
    }

    return {
      screen,
      readUrl,
      contextData: nextContext,
      readParams: nextReadParams
    };
  }

  function getReadInFlightKey(request) {
    return request.screen + ":" + request.readUrl;
  }

  async function runRefreshReadData(request) {
    setStatus("loading");
    const readResult = await fetchJson(request.readUrl);
    if (readResult.kind === "unauthorized") {
      showFallback("unauthorized", STATUS_MESSAGES.unauthorized);
      location.assign("/login?redirectTo=" + encodeURIComponent(location.pathname));
      return false;
    }
    if (readResult.kind === "forbidden") {
      showFallback("forbidden", STATUS_MESSAGES.forbidden);
      return false;
    }
    if (readResult.kind === "unavailable") {
      showFallback("unavailable", STATUS_MESSAGES.unavailable);
      return false;
    }
    if (
      readResult.kind !== "payload" ||
      !hydrateReadOnlyData(request.screen, readResult.payload, true)
    ) {
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return false;
    }

    currentContext = request.contextData;
    currentReadParams = request.readParams;
    if (typeof window.__MOBILE_UIUX_APPLY_READ_DATA__ === "function") {
      await hydrateSupplementalReadData(request.screen, request.contextData);
    }
    return true;
  }

  function refreshReadData(params) {
    const request = buildRefreshReadRequest(params);
    if (!request) {
      return Promise.resolve(false);
    }

    const inFlightKey = getReadInFlightKey(request);
    const existingRead = inFlightReads.get(inFlightKey);
    if (existingRead) {
      setStatus("loading");
      return existingRead;
    }

    const read = runRefreshReadData(request).finally(() => {
      inFlightReads.delete(inFlightKey);
    });
    inFlightReads.set(inFlightKey, read);
    return read;
  }

  function getNormalizedPathname() {
    const normalized = location.pathname.replace(/\\/+$/, "");
    return normalized.length > 0 ? normalized : "/";
  }

  function getNavigationTarget(event) {
    const eventTarget = event && event.target;
    if (!eventTarget || typeof eventTarget.closest !== "function") {
      return null;
    }

    const navElement = eventTarget.closest("[data-mobile-uiux-nav-target]");
    if (!navElement || !navElement.dataset) {
      return null;
    }

    const target = navElement.dataset.mobileUiuxNavTarget ||
      (typeof navElement.getAttribute === "function"
        ? navElement.getAttribute("data-mobile-uiux-nav-target")
        : "");

    return Object.prototype.hasOwnProperty.call(NAV_PATH_BY_TARGET, target)
      ? target
      : null;
  }

  function navigateToTarget(target) {
    const nextPath = NAV_PATH_BY_TARGET[target];
    if (!nextPath || getNormalizedPathname() === nextPath) {
      return;
    }

    location.assign(nextPath);
  }

  function bindBottomNavNavigation() {
    if (!document || typeof document.addEventListener !== "function") {
      return;
    }

    document.addEventListener("click", event => {
      const target = getNavigationTarget(event);
      if (target) {
        navigateToTarget(target);
      }
    });

    document.addEventListener("keydown", event => {
      const key = event && event.key;
      if (key !== "Enter" && key !== " " && key !== "Spacebar") {
        return;
      }

      const target = getNavigationTarget(event);
      if (!target) {
        return;
      }

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      navigateToTarget(target);
    });
  }

  async function boot() {
    if (!REAL_DATA_ENABLED) {
      setStatus("disabled");
      return;
    }

    const screen = getScreen();
    if (!screen) {
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return;
    }

    const contextResult = await fetchJson("/api/mobile-uiux/context");
    if (contextResult.kind === "unauthorized") {
      showFallback("unauthorized", STATUS_MESSAGES.unauthorized);
      location.assign("/login?redirectTo=" + encodeURIComponent(location.pathname));
      return;
    }
    if (contextResult.kind === "forbidden") {
      showFallback("forbidden", STATUS_MESSAGES.forbidden);
      return;
    }
    if (contextResult.kind !== "payload" || !hydrateContext(contextResult.payload)) {
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return;
    }

    const entry = MOBILE_UIUX_SCREEN_MANIFEST[screen];
    const readUrl = buildReadUrl(entry, contextResult.payload.data);
    if (!readUrl) {
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return;
    }

    const readResult = await fetchJson(readUrl);
    if (readResult.kind === "unauthorized") {
      showFallback("unauthorized", STATUS_MESSAGES.unauthorized);
      location.assign("/login?redirectTo=" + encodeURIComponent(location.pathname));
      return;
    }
    if (readResult.kind === "forbidden") {
      showFallback("forbidden", STATUS_MESSAGES.forbidden);
      return;
    }
    if (readResult.kind !== "payload" || !hydrateReadOnlyData(screen, readResult.payload, false)) {
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return;
    }

    if (typeof window.__MOBILE_UIUX_APPLY_READ_DATA__ === "function") {
      await hydrateSupplementalReadData(screen, contextResult.payload.data);
    }
  }

  function canWriteReservations() {
    return isRecord(currentContext) &&
      isRecord(currentContext.flags) &&
      currentContext.flags.writeEnabled === true &&
      currentContext.flags.reservationWriteEnabled === true;
  }

  function canWriteDailyReports() {
    return isRecord(currentContext) &&
      isRecord(currentContext.flags) &&
      currentContext.flags.writeEnabled === true &&
      currentContext.flags.dailyReportWriteEnabled === true;
  }

  function canWriteSettings() {
    return isRecord(currentContext) &&
      isRecord(currentContext.flags) &&
      currentContext.flags.writeEnabled === true &&
      currentContext.flags.settingsWriteEnabled === true;
  }

  function getMutationInFlightKey(options) {
    return options.mutationKey + ":" + options.method + ":" + options.url;
  }

  function normalizeDailyReportPayload(payload) {
    if (!isRecord(payload)) {
      return payload;
    }

    if (typeof payload.clinic_id === "string" && payload.clinic_id.length > 0) {
      return payload;
    }

    const clinicId = getDefaultClinicId();
    if (!clinicId) {
      return payload;
    }

    return {
      ...payload,
      clinic_id: clinicId
    };
  }

  function normalizeSettingsPayload(payload) {
    if (!isRecord(payload)) {
      return payload;
    }

    if (typeof payload.clinic_id === "string" && payload.clinic_id.length > 0) {
      return payload;
    }

    const clinicId = getDefaultClinicId();
    if (!clinicId) {
      return payload;
    }

    return {
      ...payload,
      clinic_id: clinicId
    };
  }

  function getSettingsApplyReadScreen() {
    const screen = getScreen();
    return screen === "settings" || screen === "settings-detail" ? screen : null;
  }

  async function runMobileBffMutation(options) {
    showMutationStatus("pending", STATUS_MESSAGES.saving);
    const result = await mutateJson(options.url, options.method, options.payload);
    if (result.kind === "unauthorized") {
      showMutationStatus("failed", STATUS_MESSAGES.unauthorized);
      showFallback("unauthorized", STATUS_MESSAGES.unauthorized);
      location.assign("/login?redirectTo=" + encodeURIComponent(location.pathname));
      return false;
    }
    if (result.kind === "forbidden") {
      showMutationStatus("failed", STATUS_MESSAGES.forbidden);
      showFallback("forbidden", STATUS_MESSAGES.forbidden);
      return false;
    }
    if (result.kind === "conflict") {
      showMutationStatus("conflict", STATUS_MESSAGES.reservationConflict);
      showFallback("conflict", STATUS_MESSAGES.reservationConflict);
      return false;
    }
    if (result.kind === "unavailable") {
      showMutationStatus("failed", STATUS_MESSAGES.unavailable);
      showFallback("unavailable", STATUS_MESSAGES.unavailable);
      return false;
    }
    if (result.kind !== "payload" || !isSuccessPayload(result.payload)) {
      showMutationStatus("failed", STATUS_MESSAGES.invalid);
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return false;
    }

    if (options.applyReadScreen && typeof window.__MOBILE_UIUX_APPLY_READ_DATA__ === "function") {
      const applied = applyReadData(options.applyReadScreen, result.payload);
      if (applied !== true) {
        showMutationStatus("failed", STATUS_MESSAGES.invalid);
        showFallback("invalid", STATUS_MESSAGES.invalid);
        return false;
      }
    }

    showMutationStatus("success", options.successMessage);
    return true;
  }

  async function mutateMobileBff(options) {
    if (!REAL_DATA_ENABLED || options.canWrite() !== true) {
      showMutationStatus("disabled", options.disabledMessage);
      return false;
    }

    const inFlightKey = getMutationInFlightKey(options);
    const existingMutation = inFlightMutations.get(inFlightKey);
    if (existingMutation) {
      showMutationStatus("pending", STATUS_MESSAGES.saving);
      return existingMutation;
    }

    const mutation = runMobileBffMutation(options).finally(() => {
      inFlightMutations.delete(inFlightKey);
    });
    inFlightMutations.set(inFlightKey, mutation);
    return mutation;
  }

  function mutateReservation(method, payload) {
    return mutateMobileBff({
      url: "/api/mobile-uiux/reservations",
      method,
      payload,
      mutationKey: "reservations",
      canWrite: canWriteReservations,
      disabledMessage: STATUS_MESSAGES.writeDisabled,
      successMessage: STATUS_MESSAGES.reservationSaved,
      applyReadScreen: method === "PATCH" ? "reservations" : null
    });
  }

  function mutateDailyReport(payload) {
    return mutateMobileBff({
      url: "/api/mobile-uiux/daily-reports",
      method: "POST",
      payload: normalizeDailyReportPayload(payload),
      mutationKey: "daily-reports",
      canWrite: canWriteDailyReports,
      disabledMessage: STATUS_MESSAGES.dailyReportWriteDisabled,
      successMessage: STATUS_MESSAGES.dailyReportSaved,
      applyReadScreen: "daily-reports"
    });
  }

  function mutateSettings(payload) {
    return mutateMobileBff({
      url: "/api/mobile-uiux/settings",
      method: "PUT",
      payload: normalizeSettingsPayload(payload),
      mutationKey: "settings",
      canWrite: canWriteSettings,
      disabledMessage: STATUS_MESSAGES.settingsWriteDisabled,
      successMessage: STATUS_MESSAGES.settingsSaved,
      applyReadScreen: getSettingsApplyReadScreen()
    });
  }

  window.MobileUiuxBridge = {
    createReservation(payload) {
      return mutateReservation("POST", payload);
    },
    updateReservation(payload) {
      return mutateReservation("PATCH", payload);
    },
    submitDailyReport(payload) {
      return mutateDailyReport(payload);
    },
    updateSettings(payload) {
      return mutateSettings(payload);
    },
    refreshReadData(params) {
      return refreshReadData(params);
    }
  };

  bindBottomNavNavigation();

  const ready = boot().catch(() => {
    showFallback("unavailable", STATUS_MESSAGES.unavailable);
  });
  window.__MOBILE_UIUX_BRIDGE_READY__ = ready;
})();
`;
}

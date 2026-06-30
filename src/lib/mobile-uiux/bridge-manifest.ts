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
  const STATUS_MESSAGES = {
    disabled: "実データ参照は無効です",
    unauthorized: "ログインが必要です",
    forbidden: "この画面の実データは閲覧できません",
    invalid: "実データを表示できません",
    unavailable: "実データを一時的に表示できません"
  };

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
    const fallback = document.createElement("div");
    fallback.setAttribute("role", "status");
    fallback.dataset.mobileUiuxBridgeFallback = status;
    fallback.textContent = message;
    if (document.body) {
      document.body.appendChild(fallback);
    }
  }

  function getScreen() {
    const script = document.currentScript;
    const fromDataset = script && script.dataset ? script.dataset.screen : "";
    const fromAttribute = script && script.getAttribute ? script.getAttribute("data-screen") : "";
    const screen = fromDataset || fromAttribute || location.pathname.split("/").filter(Boolean).pop() || "";
    return Object.prototype.hasOwnProperty.call(MOBILE_UIUX_SCREEN_MANIFEST, screen)
      ? screen
      : null;
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

    if (!response.ok) {
      return { kind: "unavailable" };
    }

    const payload = await response.json();
    return { kind: "payload", payload };
  }

  function buildReadUrl(entry, contextData) {
    const params = [];
    if (entry.requiresClinicId) {
      if (typeof contextData.defaultClinicId !== "string" || contextData.defaultClinicId.length === 0) {
        return null;
      }
      params.push(["clinic_id", contextData.defaultClinicId]);
    }

    if (isRecord(entry.defaultParams)) {
      for (const key of Object.keys(entry.defaultParams)) {
        const value = entry.defaultParams[key];
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

  function summarizePayload(screen, payload) {
    if (!isSuccessPayload(payload)) {
      return null;
    }

    const data = payload.data;
    if (screen === "reservations" && Array.isArray(data.reservations)) {
      return "予約データを読み込みました（" + data.reservations.length + "件）";
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
    return true;
  }

  function hydrateReadOnlyData(screen, payload) {
    const summary = summarizePayload(screen, payload);
    if (!summary) {
      return false;
    }

    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.dataset.mobileUiuxHydrated = screen;
    status.textContent = summary;
    if (document.body) {
      document.body.appendChild(status);
    }
    setStatus("hydrated");
    return true;
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
    if (readResult.kind !== "payload" || !hydrateReadOnlyData(screen, readResult.payload)) {
      showFallback("invalid", STATUS_MESSAGES.invalid);
      return;
    }
  }

  const ready = boot().catch(() => {
    showFallback("unavailable", STATUS_MESSAGES.unavailable);
  });
  window.__MOBILE_UIUX_BRIDGE_READY__ = ready;
})();
`;
}

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';

import {
  buildMobileUiuxBridgeScript,
  injectMobileUiuxBridgeScript,
  MOBILE_UIUX_SCREEN_MANIFEST,
} from '@/lib/mobile-uiux/bridge-manifest';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
  resolveScopedClinicIds:
    jest.requireActual('@/lib/supabase').resolveScopedClinicIds,
}));

type BridgeFetchResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
};

type FetchCall = {
  url: string;
  method: string;
  body?: BodyInit | null;
};

type BridgeDocument = {
  currentScript: {
    dataset: { screen: string };
    getAttribute: (name: string) => string | null;
  };
  documentElement: {
    dataset: Record<string, string>;
  };
  body: {
    appendChild: (node: BridgeElement) => BridgeElement;
    textContent: string;
  };
  createElement: (tagName: string) => BridgeElement;
  addEventListener: (
    eventName: string,
    callback: (event: BridgeEvent) => void
  ) => void;
  readyState: string;
};

type BridgeNavElement = {
  dataset: Record<string, string>;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => BridgeNavElement | null;
};

type BridgeEvent = {
  target?: BridgeNavElement;
  key?: string;
  preventDefault?: jest.Mock<void, []>;
};

type BridgeElement = {
  tagName: string;
  dataset: Record<string, string>;
  textContent: string;
  setAttribute: (name: string, value: string) => void;
};

type BridgeWindow = {
  document: BridgeDocument;
  location: {
    pathname: string;
    search: string;
    assign: jest.Mock<void, [string]>;
  };
  fetch: jest.Mock<Promise<BridgeFetchResponse>, [string, RequestInit?]>;
  console: Pick<Console, 'warn' | 'log' | 'error'>;
  localStorage: {
    getItem: jest.Mock<string | null, [string]>;
  };
  CustomEvent: typeof CustomEvent;
  MobileUiuxBridge?: {
    createReservation: (payload: unknown) => Promise<boolean>;
    updateReservation: (payload: unknown) => Promise<boolean>;
    submitDailyReport: (payload: unknown) => Promise<boolean>;
    updateSettings: (payload: unknown) => Promise<boolean>;
  };
  __MOBILE_UIUX_APPLY_READ_DATA__?: (
    screen: string,
    payload: unknown
  ) => boolean;
  __MOBILE_UIUX_BRIDGE_READY__?: Promise<void>;
};

const createClientMock = createClient as jest.MockedFunction<
  typeof createClient
>;
const getCurrentUserMock = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const getUserAccessContextMock = getUserAccessContext as jest.MockedFunction<
  typeof getUserAccessContext
>;
const readFileMock = readFile as jest.MockedFunction<typeof readFile>;

function buildJsonResponse(status: number, body: unknown): BridgeFetchResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function buildNodeFileNotFoundError(): Error & { code: string } {
  const error = new Error('missing file') as Error & { code: string };
  error.code = 'ENOENT';
  return error;
}

function buildElementWithTextChange(
  tagName: string,
  onTextChange?: () => void
): BridgeElement {
  const attributes: Record<string, string> = {};
  let textContent = '';
  return {
    tagName,
    dataset: {},
    get textContent() {
      return textContent;
    },
    set textContent(value: string) {
      textContent = value;
      onTextChange?.();
    },
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
  };
}

function buildBridgeWindow(
  screen: string,
  responses: BridgeFetchResponse[],
  applyReadData?: (screen: string, payload: unknown) => boolean
): {
  window: BridgeWindow;
  calls: FetchCall[];
  bodyNodes: BridgeElement[];
  listeners: Record<string, Array<(event: BridgeEvent) => void>>;
} {
  const calls: FetchCall[] = [];
  const bodyNodes: BridgeElement[] = [];
  const listeners: Record<string, Array<(event: BridgeEvent) => void>> = {};
  function refreshBodyText(): void {
    document.body.textContent = bodyNodes
      .map(item => item.textContent)
      .join('\n');
  }
  const document: BridgeDocument = {
    currentScript: {
      dataset: { screen },
      getAttribute: name => (name === 'data-screen' ? screen : null),
    },
    documentElement: {
      dataset: {},
    },
    body: {
      appendChild(node) {
        bodyNodes.push(node);
        refreshBodyText();
        return node;
      },
      textContent: '',
    },
    createElement: tagName =>
      buildElementWithTextChange(tagName, refreshBodyText),
    addEventListener(eventName, callback) {
      listeners[eventName] = listeners[eventName] ?? [];
      listeners[eventName].push(callback);
    },
    readyState: 'complete',
  };
  const fetchMock = jest.fn(
    async (url: string, init?: RequestInit): Promise<BridgeFetchResponse> => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return responses.shift() ?? buildJsonResponse(500, {});
    }
  );
  const window: BridgeWindow = {
    document,
    location: {
      pathname: `/mobile-uiux/screens/${screen}`,
      search: '',
      assign: jest.fn(),
    },
    fetch: fetchMock,
    console: {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    },
    localStorage: {
      getItem: jest.fn(() => 'admin'),
    },
    CustomEvent,
  };
  if (applyReadData) {
    window.__MOBILE_UIUX_APPLY_READ_DATA__ = applyReadData;
  }
  return { window, calls, bodyNodes, listeners };
}

function buildNavElement(target: string): BridgeNavElement {
  const element: BridgeNavElement = {
    dataset: {
      mobileUiuxNavTarget: target,
    },
    getAttribute(name) {
      return name === 'data-mobile-uiux-nav-target' ? target : null;
    },
    closest(selector) {
      return selector === '[data-mobile-uiux-nav-target]' ? element : null;
    },
  };
  return element;
}

function dispatchBridgeEvent(
  listeners: Record<string, Array<(event: BridgeEvent) => void>>,
  eventName: string,
  event: BridgeEvent
): void {
  for (const listener of listeners[eventName] ?? []) {
    listener(event);
  }
}

async function runBridgeScript(
  script: string,
  bridgeWindow: BridgeWindow
): Promise<void> {
  const sandbox = {
    window: bridgeWindow,
    document: bridgeWindow.document,
    location: bridgeWindow.location,
    fetch: bridgeWindow.fetch,
    console: bridgeWindow.console,
    localStorage: bridgeWindow.localStorage,
    CustomEvent,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(script, sandbox);
  await bridgeWindow.__MOBILE_UIUX_BRIDGE_READY__;
}

describe('mobile-uiux bridge contract', () => {
  const contextPayload = {
    success: true,
    data: {
      role: { canonical: 'therapist', label: '施術者' },
      defaultClinicId: '11111111-1111-4111-8111-111111111111',
      accessibleClinicIds: ['11111111-1111-4111-8111-111111111111'],
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
  const settingsDetailReadPayload = {
    success: true,
    data: {
      clinicId: '11111111-1111-4111-8111-111111111111',
      clinic: null,
      menus: [],
      resources: [],
    },
    generatedAt: '2026-06-30T00:00:00.000Z',
  };

  it('does not fetch when MOBILE_UIUX_REAL_DATA_ENABLED=false', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: false,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, calls } = buildBridgeWindow('reservations', []);

    await runBridgeScript(script, window);

    expect(calls).toEqual([]);
    expect(window.document.documentElement.dataset.mobileUiuxBridge).toBe(
      'disabled'
    );
  });

  it('navigates Bottom Nav by click even when MOBILE_UIUX_REAL_DATA_ENABLED=false', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: false,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, calls, listeners } = buildBridgeWindow('reservations', []);

    await runBridgeScript(script, window);
    dispatchBridgeEvent(listeners, 'click', {
      target: buildNavElement('home'),
    });

    expect(calls).toEqual([]);
    expect(window.location.assign).toHaveBeenCalledWith(
      '/mobile-uiux/screens/home'
    );
  });

  it('navigates Bottom Nav by Enter and Space keys', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: false,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, listeners } = buildBridgeWindow('home', []);
    const enterPreventDefault = jest.fn();
    const spacePreventDefault = jest.fn();

    await runBridgeScript(script, window);
    dispatchBridgeEvent(listeners, 'keydown', {
      key: 'Enter',
      target: buildNavElement('patients'),
      preventDefault: enterPreventDefault,
    });
    dispatchBridgeEvent(listeners, 'keydown', {
      key: ' ',
      target: buildNavElement('settings'),
      preventDefault: spacePreventDefault,
    });

    expect(window.location.assign).toHaveBeenNthCalledWith(
      1,
      '/mobile-uiux/screens/patients'
    );
    expect(window.location.assign).toHaveBeenNthCalledWith(
      2,
      '/mobile-uiux/screens/settings'
    );
    expect(enterPreventDefault).toHaveBeenCalled();
    expect(spacePreventDefault).toHaveBeenCalled();
  });

  it('does not reload the current Bottom Nav path', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: false,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, listeners } = buildBridgeWindow('settings', []);

    await runBridgeScript(script, window);
    dispatchBridgeEvent(listeners, 'click', {
      target: buildNavElement('settings'),
    });

    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('ignores unknown Bottom Nav targets', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: false,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, listeners } = buildBridgeWindow('home', []);

    await runBridgeScript(script, window);
    dispatchBridgeEvent(listeners, 'click', {
      target: buildNavElement('unknown'),
    });

    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('uses UI fallback for 401 and redirects to login without logging PII', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('reservations', [
      buildJsonResponse(401, {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'patient@example.com 090-1111-2222',
        },
      }),
    ]);

    await runBridgeScript(script, window);

    expect(window.location.assign).toHaveBeenCalledWith(
      '/login?redirectTo=%2Fmobile-uiux%2Fscreens%2Freservations'
    );
    expect(window.document.body.textContent).toContain('ログインが必要です');
    expect(window.console.log).not.toHaveBeenCalled();
    expect(window.console.error).not.toHaveBeenCalled();
    expect(window.document.body.textContent).not.toContain(
      'patient@example.com'
    );
    expect(window.document.body.textContent).not.toContain('090-1111-2222');
  });

  it('uses disabled UI fallback for 403 without logging identifiers', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('patients', [
      buildJsonResponse(403, {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message:
            'clinic_id=clinic-secret user_id=user-secret staff_id=staff-secret',
        },
      }),
    ]);

    await runBridgeScript(script, window);

    expect(window.document.body.textContent).toContain('閲覧できません');
    expect(window.console.log).not.toHaveBeenCalled();
    expect(window.console.error).not.toHaveBeenCalled();
    expect(window.document.body.textContent).not.toContain('clinic-secret');
    expect(window.document.body.textContent).not.toContain('user-secret');
    expect(window.document.body.textContent).not.toContain('staff-secret');
  });

  it('calls only read-only mobile BFF GET endpoints', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, calls } = buildBridgeWindow('reservations', [
      buildJsonResponse(200, contextPayload),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);

    expect(calls).toEqual([
      { url: '/api/mobile-uiux/context', method: 'GET', body: undefined },
      {
        url: expect.stringMatching(
          /^\/api\/mobile-uiux\/reservations\?clinic_id=/
        ) as string,
        method: 'GET',
        body: undefined,
      },
    ]);
    expect(calls.some(call => call.method !== 'GET')).toBe(false);
  });

  it('loads supplemental settings-detail data when a write screen adapter is installed', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const readPayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-06-30',
        timezone: 'Asia/Tokyo',
        reservations: [],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => true);
    const { window, calls } = buildBridgeWindow(
      'reservations',
      [
        buildJsonResponse(200, contextPayload),
        buildJsonResponse(200, readPayload),
        buildJsonResponse(200, settingsDetailReadPayload),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);

    expect(calls).toContainEqual({
      url: expect.stringMatching(
        /^\/api\/mobile-uiux\/settings-detail\?clinic_id=/
      ) as string,
      method: 'GET',
      body: undefined,
    });
    expect(applyReadData).toHaveBeenCalledWith(
      'settings-detail',
      settingsDetailReadPayload
    );
  });

  it('calls the read hydration adapter after BFF success and marks hydrated when applied', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const readPayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-06-30',
        timezone: 'Asia/Tokyo',
        reservations: [
          {
            customerName: 'BFF 患者',
            menuName: 'BFF メニュー',
            staffName: 'BFF 先生',
            startTime: '2026-06-30T01:00:00.000Z',
            endTime: '2026-06-30T01:30:00.000Z',
            status: 'confirmed',
          },
        ],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => true);
    const { window } = buildBridgeWindow(
      'reservations',
      [
        buildJsonResponse(200, contextPayload),
        buildJsonResponse(200, readPayload),
        buildJsonResponse(200, settingsDetailReadPayload),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);

    expect(applyReadData).toHaveBeenCalledWith('reservations', readPayload);
    expect(window.document.documentElement.dataset.mobileUiuxBridge).toBe(
      'hydrated'
    );
    expect(window.document.body.textContent).toContain(
      '予約データを読み込みました（1件）'
    );
  });

  it('calls the home read hydration adapter after BFF success and marks hydrated when applied', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const readPayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-06-30',
        timezone: 'Asia/Tokyo',
        dashboard: {
          dailyData: {
            revenue: 245600,
            patients: 32,
            insuranceRevenue: 80600,
            privateRevenue: 165000,
          },
          aiComment: null,
          revenueChartData: [],
          heatmapData: [],
          alerts: ['BFF alert'],
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
          rows: [],
        },
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => true);
    const { window } = buildBridgeWindow(
      'home',
      [
        buildJsonResponse(200, contextPayload),
        buildJsonResponse(200, readPayload),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);

    expect(applyReadData).toHaveBeenCalledWith('home', readPayload);
    expect(window.document.documentElement.dataset.mobileUiuxBridge).toBe(
      'hydrated'
    );
    expect(window.document.body.textContent).toContain(
      'ホームデータを読み込みました'
    );
  });

  it('calls the daily-reports read hydration adapter after BFF success and marks hydrated when applied', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const readPayload = {
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
              staffName: 'BFF 先生',
              totalPatients: 18,
              newPatients: 3,
              totalRevenue: 120000,
              insuranceRevenue: 40000,
              privateRevenue: 80000,
              reportText: 'free text should stay inside payload',
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
    };
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => true);
    const { window } = buildBridgeWindow(
      'daily-reports',
      [
        buildJsonResponse(200, contextPayload),
        buildJsonResponse(200, readPayload),
        buildJsonResponse(200, settingsDetailReadPayload),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);

    expect(applyReadData).toHaveBeenCalledWith('daily-reports', readPayload);
    expect(window.document.documentElement.dataset.mobileUiuxBridge).toBe(
      'hydrated'
    );
    expect(window.document.body.textContent).toContain(
      '日報データを読み込みました（1件）'
    );
    expect(window.document.body.textContent).not.toContain(
      'free text should stay inside payload'
    );
  });

  it('does not mark hydrated when only the fallback status element is added', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const readPayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        date: '2026-06-30',
        timezone: 'Asia/Tokyo',
        reservations: [],
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => false);
    const { window } = buildBridgeWindow(
      'reservations',
      [
        buildJsonResponse(200, contextPayload),
        buildJsonResponse(200, readPayload),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);

    expect(applyReadData).toHaveBeenCalledWith('reservations', readPayload);
    expect(window.document.body.textContent).toContain(
      '予約データを読み込みました（0件）'
    );
    expect(window.document.documentElement.dataset.mobileUiuxBridge).toBe(
      'fallback'
    );
  });

  it('does not treat non-mobile-BFF payloads as business data', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('home', [
      buildJsonResponse(200, contextPayload),
      buildJsonResponse(200, {
        dashboard: {
          raw: 'not wrapped by MobileUiuxApiSuccess',
        },
      }),
    ]);

    await runBridgeScript(script, window);

    expect(window.document.documentElement.dataset.mobileUiuxBridge).toBe(
      'fallback'
    );
    expect(window.document.body.textContent).toContain('表示できません');
  });

  it('does not contain Supabase client or service role access paths', () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });

    expect(script).not.toMatch(/supabase/i);
    expect(script).not.toMatch(/service[_-]?role/i);
  });

  it('uses server context role instead of localStorage or screen role switch values', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('daily-reports', [
      buildJsonResponse(200, contextPayload),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          startDate: null,
          endDate: null,
          dailyReports: { reports: [] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);

    expect(window.localStorage.getItem).not.toHaveBeenCalled();
    expect(
      window.document.documentElement.dataset.mobileUiuxCanonicalRole
    ).toBe('therapist');
  });

  it('keeps reservation mutation disabled when server flags disable writes', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const disabledContext = {
      ...contextPayload,
      data: {
        ...contextPayload.data,
        flags: {
          ...contextPayload.data.flags,
          writeEnabled: false,
          reservationWriteEnabled: false,
        },
      },
    };
    const { window, calls } = buildBridgeWindow('reservations', [
      buildJsonResponse(200, disabledContext),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.createReservation({
      clinic_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(result).toBe(false);
    expect(calls.some(call => call.method === 'POST')).toBe(false);
    expect(window.document.body.textContent).toContain('書き込みは無効です');
  });

  it('posts reservation mutations only through the mobile BFF handler', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, calls } = buildBridgeWindow('reservations', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            reservationWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
      buildJsonResponse(201, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          reservation: {
            id: 'reservation-1',
          },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);
    const pending = window.MobileUiuxBridge?.createReservation({
      clinic_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'pending'
    );
    await expect(pending).resolves.toBe(true);
    expect(calls).toContainEqual({
      url: '/api/mobile-uiux/reservations',
      method: 'POST',
      body: JSON.stringify({
        clinic_id: '11111111-1111-4111-8111-111111111111',
      }),
    });
  });

  it('patches reservation updates through the mobile BFF and applies the returned read model', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => true);
    const mutationPayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        reservation: {
          id: 'reservation-1',
          status: 'confirmed',
        },
      },
      generatedAt: '2026-06-30T00:00:00.000Z',
    };
    const { window, calls } = buildBridgeWindow(
      'reservations',
      [
        buildJsonResponse(200, {
          ...contextPayload,
          data: {
            ...contextPayload.data,
            flags: {
              ...contextPayload.data.flags,
              writeEnabled: true,
              reservationWriteEnabled: true,
            },
          },
        }),
        buildJsonResponse(200, {
          success: true,
          data: {
            clinicId: '11111111-1111-4111-8111-111111111111',
            date: '2026-06-30',
            timezone: 'Asia/Tokyo',
            reservations: [],
          },
          generatedAt: '2026-06-30T00:00:00.000Z',
        }),
        buildJsonResponse(200, settingsDetailReadPayload),
        buildJsonResponse(200, mutationPayload),
      ],
      applyReadData
    );
    const payload = {
      clinic_id: '11111111-1111-4111-8111-111111111111',
      id: 'reservation-1',
      status: 'confirmed',
    };

    await runBridgeScript(script, window);
    const pending = window.MobileUiuxBridge?.updateReservation(payload);

    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'pending'
    );
    await expect(pending).resolves.toBe(true);
    expect(applyReadData).toHaveBeenCalledWith(
      'reservations',
      mutationPayload
    );
    expect(calls).toContainEqual({
      url: '/api/mobile-uiux/reservations',
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    expect(window.document.body.textContent).toContain('予約を保存しました');
  });

  it('shows a reservation conflict message for 409 PATCH responses without rendering details', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('reservations', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            reservationWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
      buildJsonResponse(409, {
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'clinic_id=clinic-secret patient@example.com',
        },
      }),
    ]);

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.updateReservation({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      id: 'reservation-1',
      startTime: '2026-06-30T01:00:00.000Z',
      endTime: '2026-06-30T01:30:00.000Z',
    });

    expect(result).toBe(false);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'conflict'
    );
    expect(window.document.body.textContent).toContain(
      '同時間帯に既存予約があります'
    );
    expect(window.document.body.textContent).not.toContain('clinic-secret');
    expect(window.document.body.textContent).not.toContain(
      'patient@example.com'
    );
  });

  it('prevents duplicate in-flight reservation mutations and reuses the status element', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, calls, bodyNodes } = buildBridgeWindow('reservations', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            reservationWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
      buildJsonResponse(201, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          reservation: {
            id: 'reservation-1',
          },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);
    const payload = {
      clinic_id: '11111111-1111-4111-8111-111111111111',
    };

    await runBridgeScript(script, window);
    const firstMutation = window.MobileUiuxBridge?.createReservation(payload);
    const secondMutation = window.MobileUiuxBridge?.createReservation(payload);

    await expect(firstMutation).resolves.toBe(true);
    await expect(secondMutation).resolves.toBe(true);
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
    expect(
      bodyNodes.filter(
        node => node.dataset.mobileUiuxMutationStatus !== undefined
      )
    ).toHaveLength(1);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'success'
    );
  });

  it('prevents duplicate in-flight reservation update mutations', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    let resolveMutation: ((value: BridgeFetchResponse) => void) | null = null;
    const mutationResponse = new Promise<BridgeFetchResponse>(resolve => {
      resolveMutation = resolve;
    });
    const { window, calls } = buildBridgeWindow('reservations', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            reservationWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);
    window.fetch.mockImplementationOnce(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            reservationWriteEnabled: true,
          },
        },
      });
    });
    window.fetch.mockImplementationOnce(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          date: '2026-06-30',
          timezone: 'Asia/Tokyo',
          reservations: [],
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      });
    });
    window.fetch.mockImplementationOnce(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return buildJsonResponse(200, settingsDetailReadPayload);
    });
    window.fetch.mockImplementation(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return mutationResponse;
    });
    const payload = {
      clinic_id: '11111111-1111-4111-8111-111111111111',
      id: 'reservation-1',
      status: 'arrived',
    };

    await runBridgeScript(script, window);
    const firstMutation = window.MobileUiuxBridge?.updateReservation(payload);
    const secondMutation = window.MobileUiuxBridge?.updateReservation(payload);

    expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(1);
    resolveMutation?.(
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          reservation: { id: 'reservation-1', status: 'arrived' },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      })
    );
    await expect(firstMutation).resolves.toBe(true);
    await expect(secondMutation).resolves.toBe(true);
  });

  it('keeps daily report mutation disabled when server flags disable writes', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const disabledContext = {
      ...contextPayload,
      data: {
        ...contextPayload.data,
        flags: {
          ...contextPayload.data.flags,
          writeEnabled: true,
          dailyReportWriteEnabled: false,
        },
      },
    };
    const { window, calls } = buildBridgeWindow('daily-reports', [
      buildJsonResponse(200, disabledContext),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          startDate: null,
          endDate: null,
          dailyReports: { reports: [] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.submitDailyReport({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      report_date: '2026-06-30',
    });

    expect(result).toBe(false);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'disabled'
    );
    expect(calls.some(call => call.method === 'POST')).toBe(false);
    expect(window.document.body.textContent).toContain(
      '日報の書き込みは無効です'
    );
  });

  it('posts daily report mutations only through the mobile BFF handler and marks success', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const payload = {
      clinic_id: '11111111-1111-4111-8111-111111111111',
      report_date: '2026-06-30',
      total_patients: 18,
      new_patients: 3,
      total_revenue: 120000,
      insurance_revenue: 40000,
      private_revenue: 80000,
    };
    const { window, calls } = buildBridgeWindow('daily-reports', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            dailyReportWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          startDate: null,
          endDate: null,
          dailyReports: { reports: [] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          reportDate: '2026-06-30',
          report: { id: 'report-1' },
          dailyReports: { reports: [{ id: 'report-1' }] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);
    const pending = window.MobileUiuxBridge?.submitDailyReport(payload);

    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'pending'
    );
    await expect(pending).resolves.toBe(true);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'success'
    );
    expect(window.document.body.textContent).toContain('日報を保存しました');
    expect(calls).toContainEqual({
      url: '/api/mobile-uiux/daily-reports',
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });

  it('fills scoped clinic id and applies returned daily report read model after write success', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const applyReadData = jest.fn(() => true);
    const { window, calls } = buildBridgeWindow(
      'daily-reports',
      [
        buildJsonResponse(200, {
          ...contextPayload,
          data: {
            ...contextPayload.data,
            flags: {
              ...contextPayload.data.flags,
              writeEnabled: true,
              dailyReportWriteEnabled: true,
            },
          },
        }),
        buildJsonResponse(200, {
          success: true,
          data: {
            clinicId: '11111111-1111-4111-8111-111111111111',
            startDate: null,
            endDate: null,
            dailyReports: { reports: [] },
          },
          generatedAt: '2026-06-30T00:00:00.000Z',
        }),
        buildJsonResponse(200, settingsDetailReadPayload),
        buildJsonResponse(200, {
          success: true,
          data: {
            clinicId: '11111111-1111-4111-8111-111111111111',
            reportDate: '2026-06-30',
            report: { id: 'report-1' },
            dailyReports: {
              reports: [
                {
                  id: 'report-1',
                  reportDate: '2026-06-30',
                  totalPatients: 2,
                  totalRevenue: 9000,
                  insuranceRevenue: 1500,
                  privateRevenue: 7500,
                  status: 'submitted',
                },
              ],
            },
          },
          generatedAt: '2026-06-30T00:00:00.000Z',
        }),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.submitDailyReport({
      report_date: '2026-06-30',
      total_patients: 2,
      new_patients: 0,
      total_revenue: 9000,
      insurance_revenue: 1500,
      private_revenue: 7500,
      report_text: null,
    });

    expect(result).toBe(true);
    expect(applyReadData).toHaveBeenCalledWith(
      'daily-reports',
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          reportDate: '2026-06-30',
        }),
      })
    );
    expect(calls).toContainEqual({
      url: '/api/mobile-uiux/daily-reports',
      method: 'POST',
      body: JSON.stringify({
        report_date: '2026-06-30',
        total_patients: 2,
        new_patients: 0,
        total_revenue: 9000,
        insurance_revenue: 1500,
        private_revenue: 7500,
        report_text: null,
        clinic_id: '11111111-1111-4111-8111-111111111111',
      }),
    });
  });

  it('prevents duplicate in-flight daily report mutations', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    let resolveMutation: ((value: BridgeFetchResponse) => void) | null = null;
    const mutationResponse = new Promise<BridgeFetchResponse>(resolve => {
      resolveMutation = resolve;
    });
    const applyReadData = jest.fn(() => true);
    const { window, calls } = buildBridgeWindow(
      'daily-reports',
      [
        buildJsonResponse(200, {
          ...contextPayload,
          data: {
            ...contextPayload.data,
            flags: {
              ...contextPayload.data.flags,
              writeEnabled: true,
              dailyReportWriteEnabled: true,
            },
          },
        }),
        buildJsonResponse(200, {
          success: true,
          data: {
            clinicId: '11111111-1111-4111-8111-111111111111',
            startDate: null,
            endDate: null,
            dailyReports: { reports: [] },
          },
          generatedAt: '2026-06-30T00:00:00.000Z',
        }),
      ],
      applyReadData
    );
    window.fetch.mockImplementationOnce(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            dailyReportWriteEnabled: true,
          },
        },
      });
    });
    window.fetch.mockImplementationOnce(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          startDate: null,
          endDate: null,
          dailyReports: { reports: [] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      });
    });
    window.fetch.mockImplementationOnce(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return buildJsonResponse(200, settingsDetailReadPayload);
    });
    window.fetch.mockImplementation(async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return mutationResponse;
    });
    const payload = {
      report_date: '2026-06-30',
      total_patients: 1,
      new_patients: 0,
      total_revenue: 3000,
      insurance_revenue: 0,
      private_revenue: 3000,
    };

    await runBridgeScript(script, window);
    const firstMutation = window.MobileUiuxBridge?.submitDailyReport(payload);
    const secondMutation = window.MobileUiuxBridge?.submitDailyReport(payload);

    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
    resolveMutation?.(
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          reportDate: '2026-06-30',
          report: { id: 'report-1' },
          dailyReports: { reports: [{ id: 'report-1' }] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      })
    );
    await expect(firstMutation).resolves.toBe(true);
    await expect(secondMutation).resolves.toBe(true);
  });

  it('marks daily report server errors as failed without logging identifiers', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('daily-reports', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            dailyReportWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          startDate: null,
          endDate: null,
          dailyReports: { reports: [] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
      buildJsonResponse(500, {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message:
            'clinic_id=clinic-secret user_id=user-secret staff_id=staff-secret',
        },
      }),
    ]);

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.submitDailyReport({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      report_date: '2026-06-30',
    });

    expect(result).toBe(false);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'failed'
    );
    expect(window.document.body.textContent).toContain(
      '実データを一時的に表示できません'
    );
    expect(window.console.log).not.toHaveBeenCalled();
    expect(window.console.error).not.toHaveBeenCalled();
    expect(window.document.body.textContent).not.toContain('clinic-secret');
    expect(window.document.body.textContent).not.toContain('user-secret');
    expect(window.document.body.textContent).not.toContain('staff-secret');
  });

  it('reuses fallback and mutation status elements on repeated daily report failures', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window, bodyNodes } = buildBridgeWindow('daily-reports', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            dailyReportWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          startDate: null,
          endDate: null,
          dailyReports: { reports: [] },
        },
        generatedAt: '2026-06-30T00:00:00.000Z',
      }),
      buildJsonResponse(500, { success: false }),
      buildJsonResponse(500, { success: false }),
    ]);
    const payload = {
      clinic_id: '11111111-1111-4111-8111-111111111111',
      report_date: '2026-06-30',
      total_patients: 1,
      new_patients: 0,
      total_revenue: 3000,
      insurance_revenue: 0,
      private_revenue: 3000,
    };

    await runBridgeScript(script, window);
    await expect(
      window.MobileUiuxBridge?.submitDailyReport(payload)
    ).resolves.toBe(false);
    await expect(
      window.MobileUiuxBridge?.submitDailyReport(payload)
    ).resolves.toBe(false);

    expect(
      bodyNodes.filter(
        node => node.dataset.mobileUiuxBridgeFallback !== undefined
      )
    ).toHaveLength(1);
    expect(
      bodyNodes.filter(
        node => node.dataset.mobileUiuxMutationStatus !== undefined
      )
    ).toHaveLength(1);
  });

  it('keeps settings mutation disabled when server flags disable writes', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const disabledContext = {
      ...contextPayload,
      data: {
        ...contextPayload.data,
        flags: {
          ...contextPayload.data.flags,
          writeEnabled: true,
          settingsWriteEnabled: false,
        },
      },
    };
    const { window, calls } = buildBridgeWindow('settings', [
      buildJsonResponse(200, disabledContext),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          category: 'clinic_hours',
          settings: {},
          updatedAt: null,
          updatedBy: null,
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.updateSettings({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      category: 'clinic_hours',
      settings: {},
    });

    expect(result).toBe(false);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'disabled'
    );
    expect(calls.some(call => call.method === 'PUT')).toBe(false);
    expect(window.document.body.textContent).toContain(
      '設定の書き込みは無効です'
    );
  });

  it('puts settings mutations only through the mobile BFF handler and marks success', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const payload = {
      clinic_id: '11111111-1111-4111-8111-111111111111',
      category: 'clinic_hours',
      settings: {
        holidays: ['2026-07-20'],
      },
    };
    const { window, calls } = buildBridgeWindow('settings', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            settingsWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          category: 'clinic_hours',
          settings: {},
          updatedAt: null,
          updatedBy: null,
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          category: 'clinic_hours',
          settings: {
            holidays: ['2026-07-20'],
          },
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ]);

    await runBridgeScript(script, window);
    const pending = window.MobileUiuxBridge?.updateSettings(payload);

    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'pending'
    );
    await expect(pending).resolves.toBe(true);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'success'
    );
    expect(window.document.body.textContent).toContain('設定を保存しました');
    expect(calls).toContainEqual({
      url: '/api/mobile-uiux/settings',
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  });

  it('adds default clinic scope and applies settings write responses back to settings-detail', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const mutationPayload = {
      category: 'clinic_hours',
      settings: {
        holidays: ['2026-07-20'],
      },
    };
    const responsePayload = {
      success: true,
      data: {
        clinicId: '11111111-1111-4111-8111-111111111111',
        category: 'clinic_hours',
        settings: {
          holidays: ['2026-07-20'],
        },
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      generatedAt: '2026-07-01T00:00:00.000Z',
    };
    const applyReadData = jest.fn<boolean, [string, unknown]>(() => true);
    const { window, calls } = buildBridgeWindow(
      'settings-detail',
      [
        buildJsonResponse(200, {
          ...contextPayload,
          data: {
            ...contextPayload.data,
            flags: {
              ...contextPayload.data.flags,
              writeEnabled: true,
              settingsWriteEnabled: true,
            },
          },
        }),
        buildJsonResponse(200, {
          success: true,
          data: {
            clinicId: '11111111-1111-4111-8111-111111111111',
            clinic: null,
            menus: [],
            resources: [],
          },
          generatedAt: '2026-07-01T00:00:00.000Z',
        }),
        buildJsonResponse(200, {
          success: true,
          data: {
            clinicId: '11111111-1111-4111-8111-111111111111',
            category: 'clinic_hours',
            settings: {
              hoursByDay: {},
              holidays: [],
            },
            updatedAt: null,
            updatedBy: null,
          },
          generatedAt: '2026-07-01T00:00:00.000Z',
        }),
        buildJsonResponse(200, responsePayload),
      ],
      applyReadData
    );

    await runBridgeScript(script, window);
    await expect(
      window.MobileUiuxBridge?.updateSettings(mutationPayload)
    ).resolves.toBe(true);

    expect(calls).toContainEqual({
      url: '/api/mobile-uiux/settings',
      method: 'PUT',
      body: JSON.stringify({
        ...mutationPayload,
        clinic_id: '11111111-1111-4111-8111-111111111111',
      }),
    });
    expect(applyReadData).toHaveBeenCalledWith(
      'settings-detail',
      responsePayload
    );
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'success'
    );
  });

  it('marks settings mutation failure without logging or rendering secrets', async () => {
    const script = buildMobileUiuxBridgeScript({
      realDataEnabled: true,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
    const { window } = buildBridgeWindow('settings', [
      buildJsonResponse(200, {
        ...contextPayload,
        data: {
          ...contextPayload.data,
          flags: {
            ...contextPayload.data.flags,
            writeEnabled: true,
            settingsWriteEnabled: true,
          },
        },
      }),
      buildJsonResponse(200, {
        success: true,
        data: {
          clinicId: '11111111-1111-4111-8111-111111111111',
          category: 'communication',
          settings: {},
          updatedAt: null,
          updatedBy: null,
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      }),
      buildJsonResponse(400, {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message:
            'smtp-password-secret api-key-secret webhook-secret token-secret credential-secret',
        },
      }),
    ]);

    await runBridgeScript(script, window);
    const result = await window.MobileUiuxBridge?.updateSettings({
      clinic_id: '11111111-1111-4111-8111-111111111111',
      category: 'communication',
      settings: {},
    });

    expect(result).toBe(false);
    expect(window.document.documentElement.dataset.mobileUiuxMutation).toBe(
      'failed'
    );
    expect(window.console.log).not.toHaveBeenCalled();
    expect(window.console.error).not.toHaveBeenCalled();
    expect(window.document.body.textContent).not.toContain(
      'smtp-password-secret'
    );
    expect(window.document.body.textContent).not.toContain('api-key-secret');
    expect(window.document.body.textContent).not.toContain('webhook-secret');
    expect(window.document.body.textContent).not.toContain('token-secret');
    expect(window.document.body.textContent).not.toContain('credential-secret');
  });

  it('documents mobile UIUX write flags as disabled by default in env example', () => {
    const envExample = readFileSync('.env.local.example', 'utf-8');

    expect(envExample).toContain('MOBILE_UIUX_WRITE_ENABLED=false');
    expect(envExample).toContain(
      'MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED=false'
    );
    expect(envExample).toContain(
      'MOBILE_UIUX_RESERVATION_WRITE_ENABLED=false'
    );
    expect(envExample).toContain('MOBILE_UIUX_SETTINGS_WRITE_ENABLED=false');
  });
});

describe('mobile-uiux bridge route and response-time injection', () => {
  const originalEnv = process.env;
  const user = { id: 'user-1', email: 'staff@example.com' };
  const supabase = { client: 'supabase' };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: 'clinic-1',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
    };
    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        throw buildNodeFileNotFoundError();
      }
      return '<!doctype html><html><body></body></html>';
    });
    createClientMock.mockResolvedValue(supabase);
    getCurrentUserMock.mockResolvedValue(user);
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('injects the bridge script only into real-data HTML responses', () => {
    const html = '<!doctype html><html><body><main></main></body></html>';

    expect(injectMobileUiuxBridgeScript(html, 'reservations')).toContain(
      '<script src="./mobile-bridge.js" data-mobile-uiux-bridge data-screen="reservations" defer></script>'
    );
    expect(injectMobileUiuxBridgeScript(html, 'support.js')).toBe(html);
  });

  it('serves mobile-bridge.js through the authenticated screen route', async () => {
    const { GET } =
      await import('@/app/(app)/mobile-uiux/screens/[resource]/route');
    const response = await GET(
      new NextRequest('http://localhost/mobile-uiux/screens/mobile-bridge.js'),
      {
        params: Promise.resolve({ resource: 'mobile-bridge.js' }),
      }
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/javascript; charset=utf-8'
    );
    expect(body).toContain('MOBILE_UIUX_SCREEN_MANIFEST');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('injects the bridge when MOBILE_UIUX_REAL_DATA_ENABLED=false for Bottom Nav navigation', async () => {
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'false';
    const rawHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="./support.js"></script></head>
<body><x-dc><helmet></helmet><div ref="{{ setRoot }}" style="min-height: 100vh; width: 100%;"><div style="width: 390px; height: 812px; border-radius: 56px;"><div data-screen-label="予約" style="height: 100%;"><div style="position: absolute; top: 13px; width: 108px; height: 30px; background: #000;"></div><div style="height: 50px; flex: none; justify-content: space-between;"></div><div style="display: flex;"><div><span>ホーム</span></div><div><span>予約</span></div><div><span>患者</span></div><div><span>レポート</span></div><div><span>設定</span></div></div></div></div></div></x-dc><script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{}}">class Component extends DCLogic {}</script></body>
</html>`;
    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        throw buildNodeFileNotFoundError();
      }
      return rawHtml;
    });
    const { GET } =
      await import('@/app/(app)/mobile-uiux/screens/[resource]/route');
    const response = await GET(
      new NextRequest('http://localhost/mobile-uiux/screens/reservations'),
      {
        params: Promise.resolve({ resource: 'reservations' }),
      }
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('mobile-bridge.js');
    expect(body).toContain('data-mobile-uiux-nav-target="reservations"');
  });
});

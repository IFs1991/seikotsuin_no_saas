import vm from 'node:vm';
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
  addEventListener: (eventName: string, callback: () => void) => void;
  readyState: string;
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
  };
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

function buildElement(tagName: string): BridgeElement {
  const attributes: Record<string, string> = {};
  return {
    tagName,
    dataset: {},
    textContent: '',
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
  };
}

function buildBridgeWindow(
  screen: string,
  responses: BridgeFetchResponse[]
): { window: BridgeWindow; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const bodyNodes: BridgeElement[] = [];
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
        this.textContent = bodyNodes.map(item => item.textContent).join('\n');
        return node;
      },
      textContent: '',
    },
    createElement: buildElement,
    addEventListener(_eventName, callback) {
      callback();
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
  return { window, calls };
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
    readFileMock.mockResolvedValue('<!doctype html><html><body></body></html>');
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

  it('does not inject the bridge when MOBILE_UIUX_REAL_DATA_ENABLED=false', async () => {
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'false';
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
    expect(body).not.toContain('mobile-bridge.js');
  });
});

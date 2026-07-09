import { waitFor } from '@testing-library/react';

const { getMobileUiuxBridgeScript } = jest.requireActual<
  typeof import('@/lib/mobile-uiux/bridge-manifest')
>('@/lib/mobile-uiux/bridge-manifest');

type MobileUiuxBridgeRuntime = {
  canNavigateToTarget: (target: string) => boolean;
  navigateToTarget: (target: string) => void;
  getCurrentCanonicalRole: () => string | null;
  disconnect: () => void;
};

type MobileUiuxBridgeWindow = Window &
  typeof globalThis & {
    __mobileUiuxBridge?: MobileUiuxBridgeRuntime;
  };

const originalFetch = global.fetch;

function setBridgeContext(role: string): jest.MockedFunction<typeof fetch> {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        role: { canonical: role },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  );
  global.fetch = fetchMock;
  return fetchMock;
}

function renderBottomNav(): void {
  document.body.innerHTML = `
    <div style="border-top: 1px solid #e5e7eb; padding: 8px 8px 24px;">
      <button type="button">Home</button>
      <button type="button">Reservations</button>
      <button type="button">Patients</button>
      <button type="button">Daily reports</button>
      <button type="button">Settings</button>
    </div>
  `;
}

function getBridgeRuntime(): MobileUiuxBridgeRuntime {
  const bridge = (window as MobileUiuxBridgeWindow).__mobileUiuxBridge;
  if (!bridge) {
    throw new Error('Mobile UIUX bridge was not initialized');
  }

  return bridge;
}

async function runBridgeForRole(role: string): Promise<MobileUiuxBridgeRuntime> {
  renderBottomNav();
  const fetchMock = setBridgeContext(role);
  const script = getMobileUiuxBridgeScript({
    MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
  });

  window.eval(script);
  document.dispatchEvent(new Event('DOMContentLoaded'));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/mobile-uiux/context', {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  const bridge = getBridgeRuntime();
  await waitFor(() => {
    expect(bridge.getCurrentCanonicalRole()).toBe(role);
  });

  return bridge;
}

describe('mobile-uiux bridge contract', () => {
  afterEach(() => {
    (window as MobileUiuxBridgeWindow).__mobileUiuxBridge?.disconnect();
    (window as MobileUiuxBridgeWindow).__mobileUiuxBridge = undefined;
    document.body.innerHTML = '';
    global.fetch = originalFetch;
  });

  it('embeds role-aware bottom nav targets for real data mode', () => {
    const script = getMobileUiuxBridgeScript({
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
    });

    expect(script).toContain('const REAL_DATA_ENABLED = true');
    expect(script).toContain(
      '"therapist":["reservations","patients","daily-reports","settings"]'
    );
    expect(script).toContain(
      '"staff":["reservations","patients","daily-reports","settings"]'
    );
    expect(script).toContain(
      '"admin":["home","reservations","patients","daily-reports","settings"]'
    );
    expect(script).toContain('function canNavigateToTarget(target)');
    expect(script).toContain('window.location.assign(nextPath)');
  });

  it('keeps preview and static fallback navigation permissive', () => {
    const script = getMobileUiuxBridgeScript({
      MOBILE_UIUX_REAL_DATA_ENABLED: 'false',
    });

    expect(script).toContain('const REAL_DATA_ENABLED = false');
    expect(script).toContain('if (!REAL_DATA_ENABLED) {');
    expect(script).toContain('return true;');
  });

  it.each(['therapist', 'staff'])(
    'blocks %s from bottom-nav home target in real data mode',
    async role => {
      const bridge = await runBridgeForRole(role);

      expect(bridge.canNavigateToTarget('home')).toBe(false);
      expect(() => bridge.navigateToTarget('home')).not.toThrow();
      expect(bridge.canNavigateToTarget('reservations')).toBe(true);
      expect(bridge.canNavigateToTarget('patients')).toBe(true);
      expect(bridge.canNavigateToTarget('daily-reports')).toBe(true);
      expect(bridge.canNavigateToTarget('settings')).toBe(true);
    }
  );

  it.each(['admin', 'clinic_admin', 'manager'])(
    'allows %s to use bottom-nav home target in real data mode',
    async role => {
      const bridge = await runBridgeForRole(role);

      expect(bridge.canNavigateToTarget('home')).toBe(true);
    }
  );
});

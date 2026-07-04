import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';

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

const readFileMock = readFile as jest.Mock;
const createClientMock = createClient as jest.Mock;
const getCurrentUserMock = getCurrentUser as jest.Mock;
const getUserAccessContextMock = getUserAccessContext as jest.Mock;

const user = { id: 'user-1', email: 'staff@example.com' };
const supabase = { client: 'supabase' };
type EntitlementRow = {
  clinic_id: string;
  mobile_uiux_enabled: boolean;
  mobile_uiux_real_data_enabled: boolean;
  mobile_uiux_write_enabled: boolean;
  mobile_uiux_reservation_write_enabled: boolean;
  mobile_uiux_daily_report_write_enabled: boolean;
  mobile_uiux_settings_write_enabled: boolean;
  rollout_phase: string;
  updated_at: string;
  updated_by: string | null;
};

type EntitlementBuilder = {
  select: jest.MockedFunction<(columns: string) => EntitlementBuilder>;
  in: jest.MockedFunction<
    (column: string, values: readonly string[]) => EntitlementBuilder
  >;
  returns: jest.MockedFunction<
    () => Promise<{ data: EntitlementRow[]; error: null }>
  >;
};

function buildEntitlementRow(
  clinicId: string,
  enabled: boolean
): EntitlementRow {
  return {
    clinic_id: clinicId,
    mobile_uiux_enabled: enabled,
    mobile_uiux_real_data_enabled: enabled,
    mobile_uiux_write_enabled: false,
    mobile_uiux_reservation_write_enabled: false,
    mobile_uiux_daily_report_write_enabled: false,
    mobile_uiux_settings_write_enabled: false,
    rollout_phase: enabled ? 'pilot' : 'off',
    updated_at: '2026-07-02T00:00:00.000Z',
    updated_by: null,
  };
}

function createEntitlementClient(rows: EntitlementRow[]) {
  let builder: EntitlementBuilder;
  builder = {
    select: jest.fn(() => builder),
    in: jest.fn(() => builder),
    returns: jest.fn(async () => ({ data: rows, error: null })),
  };

  return {
    from: jest.fn((tableName: string) => {
      if (tableName !== 'clinic_feature_flags') {
        throw new Error(`Unexpected table: ${tableName}`);
      }
      return builder;
    }),
  };
}

function buildNodeFileNotFoundError(): Error & { code: string } {
  const error = new Error('missing file') as Error & { code: string };
  error.code = 'ENOENT';
  return error;
}

function buildRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

async function callMobileScreen(resource: string) {
  const { GET } =
    await import('@/app/(app)/mobile-uiux/screens/[resource]/route');
  return GET(buildRequest(`/mobile-uiux/screens/${resource}`), {
    params: Promise.resolve({ resource }),
  });
}

async function callMobilePreviewScreen(resource: string) {
  const { GET } =
    await import('@/app/(app)/mobile-uiux/preview/screens/[resource]/route');
  return GET(buildRequest(`/mobile-uiux/preview/screens/${resource}`), {
    params: Promise.resolve({ resource }),
  });
}

function buildMobileUiuxDcHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet></helmet>
<div ref="{{ setRoot }}" style="min-height: 100vh; width: 100%;">
  <!-- STAGE CONTROLS -->
  <div>ロール</div>
  <!-- iPHONE -->
  <div style="width: 390px; height: 812px; border-radius: 56px;">
    <div data-screen-label="予約" style="height: 100%;">
      <div style="position: absolute; top: 13px; width: 108px; height: 30px; background: #000;"></div>
      <div style="height: 50px; flex: none; justify-content: space-between;"></div>
      <div>予約</div>
      <div style="display: flex;">
        <div><span>ホーム</span></div>
        <div><span>予約</span></div>
        <div><span>患者</span></div>
        <div><span>レポート</span></div>
        <div><span>設定</span></div>
      </div>
    </div>
  </div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{}}">class Component extends DCLogic {}</script>
</body>
</html>`;
}

describe('GET /mobile-uiux/screens/[resource] production gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.MOBILE_UIUX_ENABLED;
    delete process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS;
    delete process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;

    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        throw buildNodeFileNotFoundError();
      }
      return buildMobileUiuxDcHtml();
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

  it('returns 404 when MOBILE_UIUX_ENABLED is unset', async () => {
    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin roles when clinic allowlist is empty', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user role is outside the mobile role allowlist', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_ALLOWED_ROLES = 'admin,clinic_admin';

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 for customer even if the env role allowlist includes it', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_ALLOWED_ROLES = 'customer';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'customer',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the accessible clinic scope is outside the allowlist', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-2';

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('serves the screen when flag, role, and clinic allowlist permit access', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';

    const response = await callMobileScreen('reservations');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(readFileMock).toHaveBeenCalled();
  });

  it('serves the patients screen for therapist users when the clinic allowlist permits access', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'therapist',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });

    const response = await callMobileScreen('patients');

    expect(response.status).toBe(200);
    expect(readFileMock).toHaveBeenCalled();
  });

  it('returns 403 when DB entitlement is enabled and the clinic is not entitled', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    createClientMock.mockResolvedValue(
      createEntitlementClient([buildEntitlementRow('clinic-1', false)])
    );

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('does not read DB entitlements when the screen role denies first', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    const entitlementClient = createEntitlementClient([
      buildEntitlementRow('clinic-1', true),
    ]);
    createClientMock.mockResolvedValue(entitlementClient);
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });

    const response = await callMobileScreen('home');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(entitlementClient.from).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('serves the screen when DB entitlement and env rollout gate both permit access', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    createClientMock.mockResolvedValue(
      createEntitlementClient([buildEntitlementRow('clinic-1', true)])
    );

    const response = await callMobileScreen('reservations');

    expect(response.status).toBe(200);
    expect(readFileMock).toHaveBeenCalled();
  });

  it('returns a production shell for screen HTML with production-equivalent flags', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'false';
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'false';
    process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED = 'false';
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'false';

    const response = await callMobileScreen('reservations');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('data-mobile-uiux-production-root');
    expect(body).toContain('data-mobile-uiux-shell="production"');
    expect(body).toContain('mobile-bridge.js');
    expect(body).toContain('data-mobile-uiux-nav-target="reservations"');
    expect(body).not.toContain('STAGE CONTROLS');
    expect(body).not.toContain('width: 390px; height: 812px');
    expect(body).not.toContain('width: 108px; height: 30px');
  });

  it('prefers the generated reservations production asset without applying the shell transform again', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    const productionAsset = `<!DOCTYPE html>
<html>
<body data-mobile-uiux-shell="production">
<x-dc><helmet></helmet><div ref="{{ setRoot }}" data-mobile-uiux-production-root><div data-screen-label="予約">PRODUCTION_ASSET_ONLY</div></div></x-dc>
<script type="text/x-dc" data-dc-script>class Component extends DCLogic { __mobileUiuxOriginalRenderVals() { return {}; } renderVals() { return this.__mobileUiuxOriginalRenderVals(); } }</script>
</body>
</html>`;
    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        return productionAsset;
      }
      return buildMobileUiuxDcHtml().replace('予約</div>', 'SOURCE_ONLY</div>');
    });

    const response = await callMobileScreen('reservations');
    const body = await response.text();
    const readPaths = readFileMock.mock.calls.map(([filePath]) =>
      String(filePath)
    );

    expect(response.status).toBe(200);
    expect(body).toContain('PRODUCTION_ASSET_ONLY');
    expect(body).toContain('mobile-bridge.js');
    expect(body).not.toContain('SOURCE_ONLY');
    expect(body).not.toContain('width: 390px; height: 812px');
    expect(
      readPaths.some(
        filePath =>
          filePath.includes('private-assets') &&
          filePath.includes('mobile-uiux') &&
          !filePath.includes('mobile-uiux-production') &&
          filePath.endsWith('reservations.dc.html')
      )
    ).toBe(false);
  });

  it('prefers the generated home production asset for authorized manager access', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'manager',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });
    const productionAsset = `<!DOCTYPE html>
<html>
<body data-mobile-uiux-shell="production">
<x-dc><helmet></helmet><div ref="{{ setRoot }}" data-mobile-uiux-production-root><div data-screen-label="ホーム">HOME_PRODUCTION_ASSET_ONLY</div></div></x-dc>
<script type="text/x-dc" data-dc-script>class Component extends DCLogic { __mobileUiuxOriginalRenderVals() { return {}; } renderVals() { return this.__mobileUiuxOriginalRenderVals(); } }</script>
</body>
</html>`;
    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        return productionAsset;
      }
      return buildMobileUiuxDcHtml().replace(
        '予約</div>',
        'HOME_SOURCE_ONLY</div>'
      );
    });

    const response = await callMobileScreen('home');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('HOME_PRODUCTION_ASSET_ONLY');
    expect(body).toContain('mobile-bridge.js');
    expect(body).not.toContain('HOME_SOURCE_ONLY');
    expect(body).not.toContain('width: 390px; height: 812px');
  });

  it('prefers the generated patients production asset with the hydration adapter', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'manager',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });
    const productionAsset = `<!DOCTYPE html>
<html>
<body data-mobile-uiux-shell="production">
<x-dc><helmet></helmet><div ref="{{ setRoot }}" data-mobile-uiux-production-root><div data-screen-label="患者">PATIENTS_PRODUCTION_ASSET_ONLY</div></div></x-dc>
<script type="text/x-dc" data-dc-script>class Component extends DCLogic { __mobileUiuxOriginalRenderVals() { return {}; } renderVals() { return this.__mobileUiuxOriginalRenderVals(); } __mobileUiuxRegisterReadHydration() { window.__MOBILE_UIUX_APPLY_READ_DATA__ = () => true; } }</script>
</body>
</html>`;
    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        return productionAsset;
      }
      return buildMobileUiuxDcHtml().replace(
        '予約</div>',
        'PATIENTS_SOURCE_ONLY</div>'
      );
    });

    const response = await callMobileScreen('patients');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('PATIENTS_PRODUCTION_ASSET_ONLY');
    expect(body).toContain('mobile-bridge.js');
    expect(body).toContain('__mobileUiuxOriginalRenderVals');
    expect(body).toContain('window.__MOBILE_UIUX_APPLY_READ_DATA__');
    expect(body).not.toContain('PATIENTS_SOURCE_ONLY');
    expect(body).not.toContain('width: 390px; height: 812px');
  });

  it('returns the mock frame through the preview route', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';

    const response = await callMobilePreviewScreen('reservations');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('STAGE CONTROLS');
    expect(body).toContain('width: 390px; height: 812px');
    expect(body).not.toContain('data-mobile-uiux-production-root');
  });
});

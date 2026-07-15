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
  createAdminClient: jest.fn(),
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

const INLINE_CONTEXT_RE =
  /<script data-mobile-uiux-inline-context>window\.__MOBILE_UIUX_CONTEXT__ = (.*?);<\/script>/;

function buildNodeFileNotFoundError(): Error & { code: string } {
  const error = new Error('missing file') as Error & { code: string };
  error.code = 'ENOENT';
  return error;
}

function createContextDataClient(options?: { clinicName?: string }) {
  const clinicName = options?.clinicName ?? 'クリニック1';
  const fromMock = jest.fn((table: string) => {
    if (table === 'clinics') {
      const builder = {
        select: jest.fn(() => builder),
        in: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) =>
          Promise.resolve({
            data: [{ id: 'clinic-1', name: clinicName }],
            error: null,
          }).then(onFulfilled, onRejected),
      };
      return builder;
    }
    if (table === 'staff_profiles') {
      const builder = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        maybeSingle: jest.fn(async () => ({
          data: { display_name: 'スタッフ太郎', is_active: true },
          error: null,
        })),
      };
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from: fromMock };
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

async function callMobileScreen(
  resource: string,
  headers?: Record<string, string>
) {
  const { GET } =
    await import('@/app/(app)/mobile-uiux/screens/[resource]/route');
  return GET(
    new NextRequest(`http://localhost/mobile-uiux/screens/${resource}`, {
      headers,
    }),
    {
      params: Promise.resolve({ resource }),
    }
  );
}

async function callMobilePreviewScreen(resource: string) {
  const { GET } =
    await import('@/app/(app)/mobile-uiux/preview/screens/[resource]/route');
  return GET(
    new NextRequest(`http://localhost/mobile-uiux/preview/screens/${resource}`),
    {
      params: Promise.resolve({ resource }),
    }
  );
}

describe('GET /mobile-uiux/screens/[resource] inline context', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.MOBILE_UIUX_ENABLED;
    delete process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS;
    delete process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';

    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        throw buildNodeFileNotFoundError();
      }
      return buildMobileUiuxDcHtml();
    });
    createClientMock.mockResolvedValue(createContextDataClient());
    getCurrentUserMock.mockResolvedValue(user);
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
      isActive: true,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('embeds the context payload matching the /api/mobile-uiux/context contract', async () => {
    const response = await callMobileScreen('reservations');
    const body = await response.text();

    expect(response.status).toBe(200);
    const match = body.match(INLINE_CONTEXT_RE);
    expect(match).not.toBeNull();

    const payload = JSON.parse((match as RegExpMatchArray)[1]);
    expect(payload.success).toBe(true);
    expect(typeof payload.generatedAt).toBe('string');
    expect(payload.data.role).toEqual({
      canonical: 'staff',
      label: 'スタッフ',
    });
    expect(payload.data.defaultClinicId).toBe('clinic-1');
    expect(payload.data.accessibleClinicIds).toEqual(['clinic-1']);
    expect(payload.data.displayMode).toBe('system');
    expect(payload.data.flags.enabled).toBe(true);
    expect(payload.data.flags.realDataEnabled).toBe(true);
    expect(payload.data.displayName).toBe('スタッフ太郎');
    expect(payload.data.accessibleClinics).toEqual([
      { id: 'clinic-1', name: 'クリニック1' },
    ]);
  });

  it('places the inline context script before the bridge script', async () => {
    const response = await callMobileScreen('reservations');
    const body = await response.text();

    const contextIndex = body.indexOf('data-mobile-uiux-inline-context');
    const bridgeIndex = body.indexOf(
      '<script src="./mobile-bridge.js" data-mobile-uiux-bridge'
    );
    expect(contextIndex).toBeGreaterThan(-1);
    expect(bridgeIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeLessThan(bridgeIndex);
  });

  it('escapes closing tags inside the serialized payload', async () => {
    createClientMock.mockResolvedValue(
      createContextDataClient({ clinicName: '</script><script>alert(1)' })
    );

    const response = await callMobileScreen('reservations');
    const body = await response.text();

    const match = body.match(INLINE_CONTEXT_RE);
    expect(match).not.toBeNull();
    const rawJson = (match as RegExpMatchArray)[1];
    expect(rawJson).not.toContain('</script>');
    expect(rawJson).toContain('\\u003c/script\\u003e');

    const payload = JSON.parse(rawJson);
    expect(payload.data.accessibleClinics[0].name).toBe(
      '</script><script>alert(1)'
    );
  });

  it('reflects the display mode cookie in the inline payload', async () => {
    const response = await callMobileScreen('reservations', {
      cookie: 'mobile_uiux_display_mode=mobile',
    });
    const body = await response.text();

    const match = body.match(INLINE_CONTEXT_RE);
    const payload = JSON.parse((match as RegExpMatchArray)[1]);
    expect(payload.data.displayMode).toBe('mobile');
  });

  it('keeps the HTML ETag stable across responses despite generatedAt changing', async () => {
    const first = await callMobileScreen('reservations');
    const second = await callMobileScreen('reservations');

    const firstEtag = first.headers.get('etag');
    expect(firstEtag).not.toBeNull();
    expect(second.headers.get('etag')).toBe(firstEtag);

    const revalidated = await callMobileScreen('reservations', {
      'if-none-match': firstEtag as string,
    });
    expect(revalidated.status).toBe(304);
  });

  it('does not embed inline context when real data reads are disabled', async () => {
    delete process.env.MOBILE_UIUX_REAL_DATA_ENABLED;

    const response = await callMobileScreen('reservations');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('__MOBILE_UIUX_CONTEXT__');
  });

  it('does not embed inline context in preview mode', async () => {
    const response = await callMobilePreviewScreen('reservations');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('__MOBILE_UIUX_CONTEXT__');
  });

  it('does not embed inline context into JavaScript assets', async () => {
    readFileMock.mockImplementation(async filePath => {
      if (String(filePath).includes('mobile-uiux-production')) {
        throw buildNodeFileNotFoundError();
      }
      if (String(filePath).endsWith('support.js')) {
        return 'console.log("support");';
      }
      return buildMobileUiuxDcHtml();
    });

    const response = await callMobileScreen('support.js');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('__MOBILE_UIUX_CONTEXT__');
  });
});

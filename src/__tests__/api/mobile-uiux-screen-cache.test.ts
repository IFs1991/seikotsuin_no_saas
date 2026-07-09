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
const supabase = { client: 'supabase' };

function buildNodeFileNotFoundError(): Error & { code: string } {
  const error = new Error('missing file') as Error & { code: string };
  error.code = 'ENOENT';
  return error;
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

describe('GET /mobile-uiux/screens/[resource] cache headers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.MOBILE_UIUX_ENABLED;
    delete process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS;
    delete process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;
    process.env.MOBILE_UIUX_ENABLED = 'true';

    readFileMock.mockImplementation(async filePath => {
      const pathText = String(filePath);
      if (pathText.includes('mobile-uiux-production')) {
        throw buildNodeFileNotFoundError();
      }
      if (pathText.endsWith('support.js')) {
        return 'console.log("support");';
      }
      if (pathText.endsWith('clinic-shared.js')) {
        return 'console.log("clinic-shared");';
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

  it('serves JavaScript assets with a strong ETag and private max-age cache-control', async () => {
    const response = await callMobileScreen('support.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/javascript; charset=utf-8'
    );
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=3600, must-revalidate'
    );
  });

  it('returns 304 with an empty body when If-None-Match matches the JavaScript asset ETag', async () => {
    const first = await callMobileScreen('support.js');
    const etag = first.headers.get('etag');
    expect(etag).not.toBeNull();

    const second = await callMobileScreen('support.js', {
      'if-none-match': etag as string,
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('etag')).toBe(etag);
    expect(second.headers.get('cache-control')).toBe(
      'private, max-age=3600, must-revalidate'
    );
  });

  it('returns 200 when If-None-Match does not match the JavaScript asset ETag', async () => {
    const response = await callMobileScreen('support.js', {
      'if-none-match': '"0000000000000000000000000000000000000000000000000000000000000000"',
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log("support");');
  });

  it('serves the generated mobile-bridge.js with an ETag and private max-age cache-control', async () => {
    const response = await callMobileScreen('mobile-bridge.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=3600, must-revalidate'
    );
  });

  it('serves screen HTML with an ETag and private no-cache revalidation', async () => {
    const response = await callMobileScreen('reservations');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('returns 304 for screen HTML when If-None-Match matches', async () => {
    const first = await callMobileScreen('reservations');
    const etag = first.headers.get('etag');
    expect(etag).not.toBeNull();

    const second = await callMobileScreen('reservations', {
      'if-none-match': etag as string,
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('etag')).toBe(etag);
  });

  it('accepts a weak-prefixed If-None-Match validator', async () => {
    const first = await callMobileScreen('support.js');
    const etag = first.headers.get('etag') as string;

    const second = await callMobileScreen('support.js', {
      'if-none-match': `W/${etag}`,
    });

    expect(second.status).toBe(304);
  });

  it('keeps denied responses no-store even when If-None-Match is sent', async () => {
    delete process.env.MOBILE_UIUX_ENABLED;

    const response = await callMobileScreen('reservations', {
      'if-none-match': '"anything"',
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('etag')).toBeNull();
  });

  it('evaluates authorization before honoring If-None-Match', async () => {
    const first = await callMobileScreen('reservations');
    const etag = first.headers.get('etag') as string;

    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'customer',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });

    const response = await callMobileScreen('reservations', {
      'if-none-match': etag,
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

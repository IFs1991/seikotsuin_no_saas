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

async function requestScreen(resource: string) {
  const { GET } =
    await import('@/app/(app)/mobile-uiux/screens/[resource]/route');
  return GET(
    new NextRequest(`http://localhost/mobile-uiux/screens/${resource}`),
    { params: Promise.resolve({ resource }) }
  );
}

// アクセス判定（role / clinic scope / entitlement のマトリクス）は
// src/__tests__/api/mobile-uiux-access.test.ts が正。
// ここでは拒否時のレスポンス形（HTML エラーページ vs JSON エンベロープ）を検証する。

describe('/mobile-uiux/screens/[resource] error responses', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.MOBILE_UIUX_ENABLED = 'true';
    delete process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS;
    delete process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;

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

  it('returns user-facing HTML 401 for HTML resources when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await requestScreen('home');
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(body).toContain('data-mobile-uiux-error-page');
    expect(body).toContain('ログインが必要です');
    expect(body).toContain('認証が必要です');
    expect(body).not.toContain('"success":false');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns user-facing HTML 403 for HTML resources on principal denial', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      clinicId: null,
    });

    const response = await requestScreen('home');
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(body).toContain('data-mobile-uiux-error-page');
    expect(body).toContain('アクセス権限がありません');
    expect(body).toContain('このモバイル UI/UX へのアクセス権限がありません');
    expect(body).not.toContain('"success":false');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns user-facing HTML 404 for HTML resources when the flag is disabled', async () => {
    delete process.env.MOBILE_UIUX_ENABLED;

    const response = await requestScreen('home');
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(body).toContain('data-mobile-uiux-error-page');
    expect(body).toContain('ページを表示できません');
    expect(body).toContain('モバイル UI/UX は無効です');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns user-facing HTML 404 for unknown HTML screen resources', async () => {
    const response = await requestScreen('missing-screen');
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(body).toContain('data-mobile-uiux-error-page');
    expect(body).toContain('指定されたモバイル画面は存在しません');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('keeps JSON errors for JavaScript resources on unauthenticated access', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await requestScreen('mobile-bridge.js');
    const payload = (await response.json()) as {
      success: false;
      error: string;
    };

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('認証が必要です');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('keeps JSON errors for JavaScript resources on principal denial', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      clinicId: null,
    });

    const response = await requestScreen('mobile-bridge.js');
    const payload = (await response.json()) as {
      success: false;
      error: string;
    };

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(payload.success).toBe(false);
    expect(payload.error).toBe(
      'このモバイル UI/UX へのアクセス権限がありません'
    );
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('sets no-store cache headers on HTML error pages', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await requestScreen('home');

    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

import { NextRequest } from 'next/server';
import type { MobileUiuxAccessResult } from '@/lib/mobile-uiux/access';

const checkMobileUiuxAccessMock = jest.fn();
const loadMobileUiuxAssetMock = jest.fn();

jest.mock('@/lib/mobile-uiux/access', () => ({
  checkMobileUiuxAccess: (...args: unknown[]) =>
    checkMobileUiuxAccessMock(...args),
}));

jest.mock('@/lib/mobile-uiux/assets', () => ({
  loadMobileUiuxAsset: (...args: unknown[]) => loadMobileUiuxAssetMock(...args),
}));

const { GET } = jest.requireActual<
  typeof import('@/app/(app)/mobile-uiux/screens/[resource]/route')
>('@/app/(app)/mobile-uiux/screens/[resource]/route');

function deniedAccessResult(input: {
  status: 401 | 403 | 404;
  reasonCode:
    | 'unauthenticated'
    | 'feature_flag_disabled'
    | 'clinic_scope_not_allowed';
  message: string;
}): MobileUiuxAccessResult {
  return {
    allowed: false,
    status: input.status,
    reasonCode: input.reasonCode,
    message: input.message,
    logDetails: {
      reasonCode: input.reasonCode,
      role: input.status === 401 ? null : 'clinic_admin',
      scopedClinicCount: input.status === 401 ? 0 : 1,
      allowedClinicCount: input.status === 401 ? 0 : 1,
      featureFlagEnabled: input.reasonCode !== 'feature_flag_disabled',
      resource: 'home',
      status: input.status,
    },
  };
}

async function requestScreen(resource: string) {
  return await GET(
    new NextRequest(`http://localhost/mobile-uiux/screens/${resource}`),
    { params: Promise.resolve({ resource }) }
  );
}

describe('/mobile-uiux/screens/[resource] error responses', () => {
  beforeEach(() => {
    checkMobileUiuxAccessMock.mockReset();
    loadMobileUiuxAssetMock.mockReset();
  });

  it.each([
    {
      status: 401 as const,
      reasonCode: 'unauthenticated' as const,
      message: 'ログインが必要です',
    },
    {
      status: 403 as const,
      reasonCode: 'clinic_scope_not_allowed' as const,
      message: 'この店舗ではモバイル画面を利用できません',
    },
    {
      status: 404 as const,
      reasonCode: 'feature_flag_disabled' as const,
      message: 'モバイル画面は現在利用できません',
    },
  ])(
    'returns user-facing HTML for HTML resource status $status',
    async ({ status, reasonCode, message }) => {
      checkMobileUiuxAccessMock.mockResolvedValue(
        deniedAccessResult({ status, reasonCode, message })
      );

      const response = await requestScreen('home');
      const body = await response.text();

      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toBe(
        'text/html; charset=utf-8'
      );
      expect(body).toContain('data-mobile-uiux-error-page');
      expect(body).toContain(message);
      expect(body).not.toContain('"success":false');
      expect(loadMobileUiuxAssetMock).not.toHaveBeenCalled();
    }
  );

  it('keeps JSON errors for JavaScript resources', async () => {
    checkMobileUiuxAccessMock.mockResolvedValue(
      deniedAccessResult({
        status: 403,
        reasonCode: 'clinic_scope_not_allowed',
        message: 'この店舗ではモバイル画面を利用できません',
      })
    );

    const response = await requestScreen('mobile-bridge.js');
    const payload = (await response.json()) as {
      success: false;
      error: string;
      reasonCode: string;
    };

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(payload).toEqual({
      success: false,
      error: 'この店舗ではモバイル画面を利用できません',
      reasonCode: 'clinic_scope_not_allowed',
    });
    expect(loadMobileUiuxAssetMock).not.toHaveBeenCalled();
  });

  it('returns user-facing HTML 404 when an HTML screen resource is missing', async () => {
    checkMobileUiuxAccessMock.mockResolvedValue({
      allowed: true,
      role: 'admin',
      scopedClinicCount: 0,
      allowedClinicCount: 0,
      featureFlagEnabled: true,
    } satisfies MobileUiuxAccessResult);
    loadMobileUiuxAssetMock.mockResolvedValue(null);

    const response = await requestScreen('missing-screen');
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(body).toContain('指定されたモバイル画面が見つかりません');
  });
});

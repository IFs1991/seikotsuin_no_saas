/**
 * GET /api/clinics テスト
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task B
 *
 * TODOリスト:
 * [x] STAFF_ROLES のユーザーにアクティブクリニック一覧を返す
 * [x] processApiRequest に STAFF_ROLES を allowedRoles として渡す
 * [x] DB エラー時に 500 を返す
 * [x] 未認証の場合は 401 を返す
 */

import { processApiRequest } from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;

describe('GET /api/clinics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 🔴 Red: ファイルが存在しないためすべて失敗する

  it('STAFF_ROLES のユーザーにアクティブクリニック一覧を返す', async () => {
    const mockClinics = [
      { id: 'clinic-1', name: 'テスト院A' },
      { id: 'clinic-2', name: 'テスト院B' },
    ];

    const order = jest
      .fn()
      .mockResolvedValue({ data: mockClinics, error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase: { from },
      auth: { id: 'user-1' },
      permissions: { role: 'therapist', clinic_id: 'clinic-1' },
    });

    const { GET } = await import('@/app/api/clinics/route');
    const request = new Request('http://localhost/api/clinics');
    const response = await GET(request as any);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.items).toEqual(mockClinics);
  });

  // 三角測量: allowedRoles に STAFF_ROLES が渡される
  it('processApiRequest に STAFF_ROLES を allowedRoles として渡す', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401 }
      ),
    });

    const { GET } = await import('@/app/api/clinics/route');
    const request = new Request('http://localhost/api/clinics');
    await GET(request as any);

    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        allowedRoles: Array.from(STAFF_ROLES),
      })
    );
  });

  it('DB エラー時に 500 レスポンスを返す', async () => {
    const order = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase: { from },
      auth: { id: 'user-1' },
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
    });

    const { GET } = await import('@/app/api/clinics/route');
    const request = new Request('http://localhost/api/clinics');
    const response = await GET(request as any);

    expect(response.status).toBe(500);
  });

  it('未認証の場合 401 レスポンスをそのまま返す', async () => {
    const unauthorizedResponse = new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401 }
    );
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: unauthorizedResponse,
    });

    const { GET } = await import('@/app/api/clinics/route');
    const request = new Request('http://localhost/api/clinics');
    const response = await GET(request as any);

    expect(response.status).toBe(401);
  });
});

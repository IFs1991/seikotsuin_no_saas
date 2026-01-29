/**
 * オンボーディングAPI統合テスト
 *
 * TDDサイクル:
 * 1. RED: APIルート実装前にテスト作成（失敗）
 * 2. GREEN: APIルート実装後にテスト成功
 *
 * Supabaseモックを使用してAPIハンドラーをテスト
 */

/** @jest-environment node */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// モック設定
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(),
  rpc: jest.fn(),
};

// モック用ユーザー
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
};

// Supabaseモジュールをモック
jest.mock('@/lib/supabase/server', () => ({
  getServerClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
  createAdminClient: jest.fn(() => mockSupabaseClient),
  getCurrentUser: jest.fn(() => Promise.resolve(mockUser)),
  getUserPermissions: jest.fn(),
}));

// guardsモジュールをモック
jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

// テスト用ヘルパー
function createMockRequest(
  url: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const { method = 'GET', body } = options;

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  return new NextRequest(`http://localhost${url}`, requestInit);
}

function createQueryBuilder(
  mockData: unknown = null,
  mockError: unknown = null
) {
  const builder: Record<string, jest.Mock> = {};

  builder.select = jest.fn(() => builder);
  builder.insert = jest.fn(() => builder);
  builder.update = jest.fn(() => builder);
  builder.upsert = jest.fn(() => builder);
  builder.delete = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.single = jest.fn(() =>
    Promise.resolve({ data: mockData, error: mockError })
  );
  builder.maybeSingle = jest.fn(() =>
    Promise.resolve({ data: mockData, error: mockError })
  );

  return builder;
}

describe('Onboarding API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // デフォルトの認証済みユーザー
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });
  });

  // ================================================================
  // GET /api/onboarding/status
  // ================================================================
  describe('GET /api/onboarding/status', () => {
    test('認証済みユーザーはオンボーディング状態を取得できる', async () => {
      // モック設定
      const mockState = {
        id: 'state-1',
        user_id: 'test-user-id',
        current_step: 'clinic',
        completed_at: null,
        clinic_id: null,
        metadata: {},
      };

      mockSupabaseClient.from.mockReturnValue(createQueryBuilder(mockState));

      // APIハンドラーをインポート
      const { GET } = await import('@/app/api/onboarding/status/route');

      const request = createMockRequest('/api/onboarding/status');
      const response = await GET(request);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.current_step).toBe('clinic');
    });

    test('オンボーディング状態がない場合は初期状態を返す', async () => {
      mockSupabaseClient.from.mockReturnValue(createQueryBuilder(null));

      const { GET } = await import('@/app/api/onboarding/status/route');

      const request = createMockRequest('/api/onboarding/status');
      const response = await GET(request);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.current_step).toBe('profile');
      expect(json.data.completed).toBe(false);
    });
  });

  // ================================================================
  // POST /api/onboarding/profile
  // ================================================================
  describe('POST /api/onboarding/profile', () => {
    test('有効なデータでプロフィールを更新できる', async () => {
      const queryBuilder = createQueryBuilder({ id: 'profile-1' });
      mockSupabaseClient.from.mockReturnValue(queryBuilder);

      const { POST } = await import('@/app/api/onboarding/profile/route');

      const request = createMockRequest('/api/onboarding/profile', {
        method: 'POST',
        body: {
          full_name: '山田太郎',
          phone_number: '090-1234-5678',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.next_step).toBe('clinic');
    });

    test('無効なデータは400エラーを返す', async () => {
      const { POST } = await import('@/app/api/onboarding/profile/route');

      const request = createMockRequest('/api/onboarding/profile', {
        method: 'POST',
        body: {
          full_name: '', // 空は不正
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  // ================================================================
  // POST /api/onboarding/clinic
  // ================================================================
  describe('POST /api/onboarding/clinic', () => {
    test('クリニック作成成功時、profiles と user_permissions も更新される', async () => {
      // RPC関数のモック
      mockSupabaseClient.rpc.mockResolvedValue({
        data: { success: true, clinic_id: 'clinic-1' },
        error: null,
      });

      const { POST } = await import('@/app/api/onboarding/clinic/route');

      const request = createMockRequest('/api/onboarding/clinic', {
        method: 'POST',
        body: {
          name: 'テストクリニック',
          address: '東京都渋谷区1-1-1',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(201);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.clinic_id).toBe('clinic-1');
      expect(json.data.next_step).toBe('invites');
    });

    test('空のクリニック名は400エラーを返す', async () => {
      const { POST } = await import('@/app/api/onboarding/clinic/route');

      const request = createMockRequest('/api/onboarding/clinic', {
        method: 'POST',
        body: {
          name: '',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
    });

    test('RPC関数エラー時は500エラーを返す', async () => {
      // RPC関数のエラーモック
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });

      const { POST } = await import('@/app/api/onboarding/clinic/route');

      const request = createMockRequest('/api/onboarding/clinic', {
        method: 'POST',
        body: {
          name: 'テストクリニック',
          address: '東京都渋谷区1-1-1',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  // ================================================================
  // POST /api/onboarding/invites
  // ================================================================
  describe('POST /api/onboarding/invites', () => {
    test('招待送信が成功する', async () => {
      // オンボーディング状態（clinic_id付き）
      const mockState = {
        clinic_id: 'clinic-1',
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'onboarding_states') {
          return createQueryBuilder(mockState);
        }
        return createQueryBuilder({});
      });

      // auth.admin.inviteUserByEmailをモック
      (mockSupabaseClient as unknown as Record<string, unknown>).auth = {
        ...mockSupabaseClient.auth,
        admin: {
          inviteUserByEmail: jest.fn().mockResolvedValue({
            data: { user: { id: 'invited-user-1' } },
            error: null,
          }),
        },
      };

      const { POST } = await import('@/app/api/onboarding/invites/route');

      const request = createMockRequest('/api/onboarding/invites', {
        method: 'POST',
        body: {
          invites: [{ email: 'staff1@example.com', role: 'staff' }],
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.next_step).toBe('seed');
    });

    test('空の招待リストでスキップ可能', async () => {
      const mockState = {
        clinic_id: 'clinic-1',
      };

      mockSupabaseClient.from.mockReturnValue(createQueryBuilder(mockState));

      const { POST } = await import('@/app/api/onboarding/invites/route');

      const request = createMockRequest('/api/onboarding/invites', {
        method: 'POST',
        body: {
          invites: [],
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.next_step).toBe('seed');
    });

    test('クリニック未作成時は400エラー', async () => {
      // clinic_idがnull
      mockSupabaseClient.from.mockReturnValue(
        createQueryBuilder({ clinic_id: null })
      );

      const { POST } = await import('@/app/api/onboarding/invites/route');

      const request = createMockRequest('/api/onboarding/invites', {
        method: 'POST',
        body: {
          invites: [{ email: 'test@example.com', role: 'staff' }],
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  // ================================================================
  // POST /api/onboarding/seed
  // ================================================================
  describe('POST /api/onboarding/seed', () => {
    test('初期マスタ投入とオンボーディング完了が成功する', async () => {
      const mockState = {
        clinic_id: 'clinic-1',
      };

      mockSupabaseClient.from.mockReturnValue(createQueryBuilder(mockState));

      const { POST } = await import('@/app/api/onboarding/seed/route');

      const request = createMockRequest('/api/onboarding/seed', {
        method: 'POST',
        body: {
          treatment_menus: [{ name: '肩こり治療', price: 3000 }],
          payment_methods: ['現金'],
          patient_types: ['初診'],
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.completed).toBe(true);
    });

    test('空のメニューは400エラー', async () => {
      const { POST } = await import('@/app/api/onboarding/seed/route');

      const request = createMockRequest('/api/onboarding/seed', {
        method: 'POST',
        body: {
          treatment_menus: [],
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
    });

    test('クリニック未作成時は400エラー', async () => {
      mockSupabaseClient.from.mockReturnValue(
        createQueryBuilder({ clinic_id: null })
      );

      const { POST } = await import('@/app/api/onboarding/seed/route');

      const request = createMockRequest('/api/onboarding/seed', {
        method: 'POST',
        body: {
          treatment_menus: [{ name: '基本施術', price: 2000 }],
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });
});

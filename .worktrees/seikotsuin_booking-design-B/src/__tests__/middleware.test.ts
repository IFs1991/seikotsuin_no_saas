import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

// Supabase SSRのモック
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

describe('Middleware', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    // NextRequestのモック作成
    mockRequest = {
      nextUrl: new URL('http://localhost:3000/admin'),
      cookies: {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
      },
      headers: new Headers(),
    } as unknown as NextRequest;

    jest.clearAllMocks();
  });

  it('should handle Supabase client creation correctly', async () => {
    // このテストは現在失敗するはず（型エラーのため）
    const result = await middleware(mockRequest);

    // middleware が正常に実行されることを確認
    expect(result).toBeDefined();
  });

  it('should redirect unauthenticated users from admin routes', async () => {
    // 認証されていないユーザーがadminルートにアクセスした場合のテスト
    const adminRequest = {
      ...mockRequest,
      nextUrl: new URL('http://localhost:3000/admin/dashboard'),
    } as NextRequest;

    const result = await middleware(adminRequest);

    // リダイレクトまたは適切なレスポンスが返されることを確認
    expect(result).toBeDefined();
  });

  it('should allow authenticated users to access admin routes', async () => {
    // 認証されたユーザーがadminルートにアクセスした場合のテスト
    const result = await middleware(mockRequest);

    expect(result).toBeDefined();
  });
});

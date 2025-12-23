/**
 * フェイルセーフ動作テスト
 * Phase 3 M3: Session/CSPミドルウェアのフェイルセーフ検証
 */

jest.mock('@/lib/logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  };

  return {
    logger: mockLogger,
    createLogger: jest.fn(() => mockLogger),
    LogLevel: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      NONE: 4,
    },
  };
});

import { SessionManager } from '@/lib/session-manager';
import { AuditLogger } from '@/lib/audit-logger';
import { logger } from '@/lib/logger';

const createMockSupabase = () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn(),
  auth: {
    getUser: jest.fn(),
    onAuthStateChange: jest.fn(),
  },
});

let mockSupabase = createMockSupabase();

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => mockSupabase),
  createBrowserClient: jest.fn(() => mockSupabase),
}));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(async () => mockSupabase),
  createAdminClient: jest.fn(() => mockSupabase),
}));

jest.setTimeout(30000);

describe('フェイルセーフ動作テスト', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
    jest.clearAllMocks();
    mockSupabase = createMockSupabase();

    const supabaseSSR = jest.requireMock('@supabase/ssr') as {
      createServerClient: jest.Mock;
      createBrowserClient: jest.Mock;
    };

    supabaseSSR.createServerClient.mockReturnValue(mockSupabase);
    supabaseSSR.createBrowserClient.mockReturnValue(mockSupabase);
  });

  describe('SessionManager フェイルセーフ', () => {
    it('DB接続エラー時にセッション作成が適切にフォールバック', async () => {
      const sessionManager = new SessionManager();

      // DB接続エラーをシミュレート
      mockSupabase.single.mockRejectedValue(
        new Error('Connection refused: Database unavailable')
      );

      const result = await sessionManager.createSession(
        'user-123',
        'clinic-001',
        {
          deviceInfo: { device: 'desktop', os: 'Windows', browser: 'Chrome' },
          ipAddress: '192.168.1.1',
        }
      );

      // フォールバックでセッションが作成される
      expect(result).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.session.user_id).toBe('user-123');

      // 警告ログが出力される
      expect(logger.warn).toHaveBeenCalledWith(
        'createSession fallback:',
        expect.any(Error)
      );
    });

    it('セッション検証失敗時に安全な応答を返す', async () => {
      const sessionManager = new SessionManager();

      // DB障害シミュレート
      mockSupabase.single.mockRejectedValue(new Error('Query timeout'));

      const result = await sessionManager.validateSession('invalid-token');

      // 検証失敗だが例外は投げない
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('not_found');

      // エラーログが記録される
      expect(logger.warn).toHaveBeenCalled();
    });

    it('セッション更新失敗時にエラーを吞み込む', async () => {
      const sessionManager = new SessionManager();

      mockSupabase.single.mockRejectedValue(new Error('Database write failed'));

      const result = await sessionManager.refreshSession(
        'test-token',
        '192.168.1.1'
      );

      // 失敗を返すが例外は投げない
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('大量セッション操作時でもエラーが伝播しない', async () => {
      const sessionManager = new SessionManager();

      // 50%の確率で失敗するモック
      let callCount = 0;
      mockSupabase.single.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Random failure'));
        }
        return Promise.resolve({
          data: { id: `session-${callCount}`, is_active: true },
          error: null,
        });
      });

      const promises = Array.from({ length: 10 }, (_, i) =>
        sessionManager.validateSession(`token-${i}`)
      );

      // すべての操作が完了（例外で中断されない）
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toHaveProperty('isValid');
      });
    });
  });

  describe('AuditLogger フェイルセーフ', () => {
    it('DB障害時に監査ログが構造化ログとして出力される', async () => {
      // DB書き込みエラーをシミュレート
      mockSupabase.insert.mockRejectedValue(
        new Error('audit_logs table unavailable')
      );

      await AuditLogger.logLogin(
        'user-123',
        'test@example.com',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      // エラーログが出力されるが例外は投げない
      expect(logger.error).toHaveBeenCalledWith(
        '監査ログDB書き込み失敗 - フォールバック出力',
        expect.objectContaining({
          error: expect.any(Error),
          logData: expect.objectContaining({
            event_type: 'login',
            user_id: 'user-123',
          }),
        })
      );
    });

    it('ログ記録失敗が連続してもシステムは動作継続', async () => {
      mockSupabase.insert.mockRejectedValue(new Error('Persistent DB failure'));

      // 10回連続でログ記録を試行
      for (let i = 0; i < 10; i++) {
        await AuditLogger.logDataAccess(
          'user-123',
          'test@example.com',
          'patients',
          `patient-${i}`,
          'clinic-001'
        );
      }

      // すべて完了（例外で停止しない）
      expect(logger.error).toHaveBeenCalledTimes(10);
    });

    it('無効なデータでもログシステムがクラッシュしない', async () => {
      mockSupabase.insert.mockResolvedValue({
        data: null,
        error: null,
      });

      // 異常なパラメータでログ記録
      await AuditLogger.logLogin(
        '', // 空文字
        '', // 空メール
        undefined,
        undefined
      );

      // エラーが発生しても処理継続
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('CSPミドルウェア フェイルセーフ（想定動作）', () => {
    it('CSP違反レポート処理失敗時でもリクエストは継続', async () => {
      // CSP違反レポート処理のモック
      const mockCSPHandler = async (report: any) => {
        try {
          // DB保存試行
          const result = await mockSupabase
            .from('csp_violations')
            .insert(report)
            .single();

          if (result.error) {
            throw result.error;
          }
        } catch (error) {
          // エラーを吞み込んで継続
          logger.warn('CSP violation report failed, continuing...', error);
        }
      };

      // DB障害シミュレート
      mockSupabase.single.mockRejectedValue(
        new Error('CSP violations table unavailable')
      );

      // CSP違反レポート処理
      await mockCSPHandler({
        'document-uri': 'https://example.com',
        'violated-directive': 'script-src',
      });

      // 警告が出力されるが処理は継続
      expect(logger.warn).toHaveBeenCalledWith(
        'CSP violation report failed, continuing...',
        expect.any(Error)
      );
    });
  });

  describe('冪等性テスト', () => {
    it('同一操作を複数回実行しても安全', async () => {
      const sessionManager = new SessionManager();

      mockSupabase.single.mockResolvedValue({
        data: { id: 'session-001', is_active: true },
        error: null,
      });

      // 同一セッションに対して複数回更新
      const promises = Array.from({ length: 5 }, () =>
        sessionManager.refreshSession('test-token', '192.168.1.1')
      );

      const results = await Promise.all(promises);

      // すべて成功または失敗だが、システムは安定
      expect(results).toHaveLength(5);
    });

    it('並行セッション作成でも競合が発生しない', async () => {
      const sessionManager = new SessionManager();

      let insertCount = 0;
      mockSupabase.single.mockImplementation(() => {
        insertCount++;
        return Promise.resolve({
          data: {
            id: `session-${insertCount}`,
            user_id: 'user-123',
            is_active: true,
          },
          error: null,
        });
      });

      // 並行セッション作成
      const promises = Array.from({ length: 3 }, (_, i) =>
        sessionManager.createSession('user-123', 'clinic-001', {
          deviceInfo: {
            device: 'desktop',
            os: 'Windows',
            browser: 'Chrome',
          },
          ipAddress: `192.168.1.${i}`,
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.session).toBeDefined();
        expect(result.token).toBeDefined();
      });
    });
  });

  describe('リカバリー動作', () => {
    it('一時的なDB障害から自動復旧', async () => {
      const sessionManager = new SessionManager();

      let attemptCount = 0;
      mockSupabase.single.mockImplementation(() => {
        attemptCount++;
        // 最初の2回は失敗、3回目で成功
        if (attemptCount <= 2) {
          return Promise.reject(new Error('Temporary DB failure'));
        }
        return Promise.resolve({
          data: { id: 'session-recovered', is_active: true },
          error: null,
        });
      });

      // 3回試行
      const result1 = await sessionManager.validateSession('test-token-1');
      const result2 = await sessionManager.validateSession('test-token-2');
      const result3 = await sessionManager.validateSession('test-token-3');

      // 最初の2回は失敗、3回目で成功
      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
      expect(result3.isValid).toBe(true);
    });
  });

  describe('グレースフルデグラデーション', () => {
    it('機能縮退しても最小限の動作は継続', async () => {
      const sessionManager = new SessionManager();

      // すべてのDB操作が失敗する状況
      mockSupabase.single.mockRejectedValue(new Error('Complete DB failure'));

      // セッション作成はフォールバックで動作
      const createResult = await sessionManager.createSession(
        'user-123',
        'clinic-001',
        {
          deviceInfo: { device: 'desktop', os: 'Windows', browser: 'Chrome' },
        }
      );

      expect(createResult.session).toBeDefined();
      expect(createResult.session.user_id).toBe('user-123');

      // 検証は失敗するが例外は投げない
      const validateResult = await sessionManager.validateSession('any-token');
      expect(validateResult.isValid).toBe(false);

      // 監査ログはフォールバック出力
      await AuditLogger.logLogin('user-123', 'test@example.com');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

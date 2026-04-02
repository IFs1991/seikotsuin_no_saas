/**
 * セッション管理機能の単体テスト
 * Session Manager の包括的テストスイート
 */

import {
  createSupabaseMock,
  type SupabaseMock,
} from '../../../test-utils/supabaseMock';

let mockSupabase: SupabaseMock;

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => mockSupabase.client),
}));

jest.mock('@/lib/security-monitor');

import {
  SessionManager,
  parseUserAgent,
  getGeolocationFromIP,
} from '@/lib/session-manager';

const createSessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-123',
  user_id: 'user-123',
  clinic_id: 'clinic-456',
  session_token: 'valid-session-token-123',
  device_info: {
    browser: 'Chrome',
    os: 'Windows',
    device: 'desktop',
  },
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0',
  geolocation: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_activity: new Date().toISOString(),
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  idle_timeout_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  absolute_timeout_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  is_active: true,
  is_revoked: false,
  revoked_at: null,
  revoked_by: null,
  revoked_reason: null,
  max_idle_minutes: 30,
  max_session_hours: 8,
  remember_device: false,
  created_by: 'user-123',
  ...overrides,
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    mockSupabase = createSupabaseMock();
    sessionManager = new SessionManager();
    jest.clearAllMocks();
    mockSupabase.setDefaultResult({
      data: [],
      error: null,
    });
  });

  describe('createSession', () => {
    const mockUserId = 'test-user-123';
    const mockClinicId = 'test-clinic-456';
    const mockOptions = {
      deviceInfo: {
        browser: 'Chrome',
        os: 'Windows',
        device: 'desktop',
        isMobile: false,
      },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      rememberDevice: false,
    };

    it('正常なセッション作成ができる', async () => {
      // セッション作成のモック
      const mockSession = createSessionRow({
        user_id: mockUserId,
        clinic_id: mockClinicId,
        ip_address: mockOptions.ipAddress,
        device_info: mockOptions.deviceInfo,
      });

      mockSupabase.setResult(
        { table: 'user_sessions', op: 'insert' },
        { data: mockSession, error: null }
      );

      const result = await sessionManager.createSession(
        mockUserId,
        mockClinicId,
        mockOptions
      );

      expect(result.session).toBeDefined();
      expect(result.session.user_id).toBe(mockUserId);
      expect(result.session.clinic_id).toBe(mockClinicId);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
    });

    it('同一デバイスでの重複セッション時にフォールバックでセッションが作成される', async () => {
      // 既存セッションのモック
      const existingSession = {
        id: 'existing-session-123',
        user_id: mockUserId,
        clinic_id: mockClinicId,
        is_active: true,
      };

      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: existingSession, error: null }
      );

      // 実装はフォールバックでセッションを作成する（例外はスローしない）
      const result = await sessionManager.createSession(
        mockUserId,
        mockClinicId,
        mockOptions
      );

      // フォールバックでセッションが作成される
      expect(result.session).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('DB 障害時のフォールバックは isValid=false で返す', async () => {
      mockSupabase.setResult(
        { table: 'user_sessions' },
        { data: null, error: { message: 'db unavailable' } }
      );

      const result = await sessionManager.createSession(
        mockUserId,
        mockClinicId,
        mockOptions
      );

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_creation_failed');
      expect(result.session).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('無効なユーザーIDでエラーになる', async () => {
      await expect(
        sessionManager.createSession('', mockClinicId, mockOptions)
      ).rejects.toThrow('ユーザーIDは必須です');
    });

    it('必須デバイス情報なしでエラーになる', async () => {
      const invalidOptions = {
        ...mockOptions,
        deviceInfo: undefined,
      };

      await expect(
        sessionManager.createSession(
          mockUserId,
          mockClinicId,
          invalidOptions as any
        )
      ).rejects.toThrow('デバイス情報は必須です');
    });
  });

  describe('validateSession', () => {
    const mockToken = 'valid-session-token-123';

    it('有効なセッションの検証が成功する', async () => {
      const mockValidSession = createSessionRow();

      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: mockValidSession, error: null }
      );

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(true);
      expect(result.session).toMatchObject({
        id: mockValidSession.id,
        user_id: mockValidSession.user_id,
        clinic_id: mockValidSession.clinic_id,
        is_active: true,
      });
      expect(result.user).toBeDefined();
    });

    it('期限切れセッションが無効になる', async () => {
      const expiredSession = createSessionRow({
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // 1分前に期限切れ
        absolute_timeout_at: new Date(Date.now() - 60 * 1000).toISOString(),
      });

      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: expiredSession, error: null }
      );

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_expired');
    });

    it('無効化されたセッションが無効になる', async () => {
      const inactiveSession = createSessionRow({
        is_active: false, // セッションが無効
      });

      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: inactiveSession, error: null }
      );

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_revoked');
    });

    it('存在しないセッションが無効になる', async () => {
      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: null, error: null }
      );

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_not_found');
    });

    it('無効なトークンでisValid:falseを返す', async () => {
      // 空トークン
      const emptyResult = await sessionManager.validateSession('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.reason).toBe('invalid_token');

      // 存在しないトークン（モックでnullを返す）
      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: null, error: null }
      );
      const invalidResult =
        await sessionManager.validateSession('invalid-token');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.reason).toBe('session_not_found');
    });
  });

  describe('revokeSession', () => {
    const mockSessionId = 'session-123';
    const mockReason = 'manual_logout';

    it('セッション無効化が成功する', async () => {
      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: createSessionRow({ id: mockSessionId }), error: null }
      );

      await expect(
        sessionManager.revokeSession(mockSessionId, mockReason)
      ).resolves.not.toThrow();

      const builder = mockSupabase.getBuilder('user_sessions');
      expect(builder?.update).toHaveBeenCalledWith({
        is_active: false,
        is_revoked: true,
        revoked_at: expect.any(String),
        revoked_by: null,
        revoked_reason: mockReason,
      });
    });

    it('存在しないセッション無効化はfalseを返す', async () => {
      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: null, error: null }
      );

      const result = await sessionManager.revokeSession(
        mockSessionId,
        mockReason
      );
      expect(result).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    const mockUserId = 'user-123';
    const mockClinicId = 'clinic-456';

    it('ユーザーのセッション一覧を取得できる', async () => {
      const mockSessions = [
        createSessionRow({
          id: 'session-1',
          user_id: mockUserId,
          clinic_id: mockClinicId,
          session_token: 'token-1',
        }),
        createSessionRow({
          id: 'session-2',
          user_id: mockUserId,
          clinic_id: mockClinicId,
          session_token: 'token-2',
          device_info: { browser: 'Firefox', os: 'macOS', device: 'desktop' },
          ip_address: '192.168.1.2',
        }),
      ];

      mockSupabase.setResult(
        { table: 'user_sessions', op: 'select' },
        { data: mockSessions, error: null }
      );

      const result = await sessionManager.getUserSessions(
        mockUserId,
        mockClinicId
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });
});

describe('parseUserAgent', () => {
  it('Chrome User Agentを正しく解析する', () => {
    const chromeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

    const result = parseUserAgent(chromeUA);

    expect(result.browser).toBe('Chrome');
    expect(result.os).toBe('Windows');
    expect(result.device).toBe('desktop');
  });

  it('iPhone User Agentを正しく解析する', () => {
    const iPhoneUA =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    const result = parseUserAgent(iPhoneUA);

    expect(result.browser).toBe('Safari');
    expect(result.os).toBe('iOS');
    expect(result.device).toBe('mobile');
  });

  it('不明なUser Agentを処理する', () => {
    const unknownUA = 'Unknown/1.0';

    const result = parseUserAgent(unknownUA);

    expect(result.browser).toBe('Unknown');
    expect(result.os).toBe('Unknown');
    expect(result.device).toBe('Unknown');
  });
});

describe('getGeolocationFromIP', () => {
  it('ローカルIPアドレスの地理情報を取得する', async () => {
    // ローカルIPは実装で処理される
    const localIP = '192.168.1.1';

    const result = await getGeolocationFromIP(localIP);

    expect(result).toHaveProperty('country');
    expect(result).toHaveProperty('city');
    expect(result).toHaveProperty('region');
  });

  it('外部IPアドレスはnullを返す（GeoIP未実装）', async () => {
    const externalIP = '8.8.8.8';

    const result = await getGeolocationFromIP(externalIP);

    // 外部IPはGeoIP API未実装のためnull
    expect(result).toBeNull();
  });

  it('無効なIPアドレスはnullを返す', async () => {
    const invalidIP = 'invalid-ip';

    const result = await getGeolocationFromIP(invalidIP);

    // 無効なIPもnull
    expect(result).toBeNull();
  });
});

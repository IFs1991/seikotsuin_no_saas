/**
 * セッション管理機能の単体テスト
 * Session Manager の包括的テストスイート
 */

// jest.mock内で完全なモックを定義
jest.mock('@/lib/supabase', () => {
  const createMockBuilder = () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    const builder: Record<string, jest.Mock> = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      eq: jest.fn(),
      neq: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      or: jest.fn(),
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    };

    // 各メソッドがbuilderを返すように設定
    Object.keys(builder).forEach(key => {
      if (key !== 'single' && key !== 'maybeSingle') {
        builder[key].mockReturnValue(builder);
      }
    });

    return builder;
  };

  const mockBuilder = createMockBuilder();
  const mockFrom = jest.fn(() => mockBuilder);
  const mockGetUser = jest.fn().mockResolvedValue({ data: { user: null }, error: null });

  return {
    createClient: jest.fn().mockResolvedValue({
      from: mockFrom,
      auth: {
        getUser: mockGetUser,
      },
    }),
    __mockBuilder: mockBuilder,
    __mockFrom: mockFrom,
  };
});

jest.mock('@/lib/security-monitor');

import {
  SessionManager,
  parseUserAgent,
  getGeolocationFromIP,
} from '@/lib/session-manager';

// モックへのアクセスを取得
const supabaseMock = jest.requireMock('@/lib/supabase') as {
  createClient: jest.Mock;
  __mockBuilder: Record<string, jest.Mock>;
  __mockFrom: jest.Mock;
};

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const mockBuilder = supabaseMock.__mockBuilder;

  beforeEach(() => {
    sessionManager = new SessionManager();
    jest.clearAllMocks();

    // デフォルトのモックレスポンス設定
    mockBuilder.single.mockResolvedValue({
      data: null,
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
      const mockSession = {
        id: 'session-123',
        user_id: mockUserId,
        clinic_id: mockClinicId,
        ip_address: mockOptions.ipAddress,
        device_info: mockOptions.deviceInfo,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        is_active: true,
      };

      mockBuilder.single
        .mockResolvedValueOnce({ data: null, error: null }) // 既存セッション確認
        .mockResolvedValueOnce({ data: mockSession, error: null }); // セッション作成

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

    it('同一デバイスでの重複セッション制限が機能する', async () => {
      // 既存セッションのモック
      const existingSession = {
        id: 'existing-session-123',
        user_id: mockUserId,
        clinic_id: mockClinicId,
        is_active: true,
      };

      mockBuilder.single.mockResolvedValueOnce({
        data: existingSession,
        error: null,
      });

      await expect(
        sessionManager.createSession(mockUserId, mockClinicId, mockOptions)
      ).rejects.toThrow(
        '同一デバイスで複数のアクティブセッションは許可されていません'
      );
    });

    it('無効なユーザーIDでエラーになる', async () => {
      await expect(
        sessionManager.createSession('', mockClinicId, mockOptions)
      ).rejects.toThrow('ユーザーIDまたはクリニックIDが無効です');
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
      const mockValidSession = {
        id: 'session-123',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_active: true,
        ip_address: '192.168.1.1',
        last_activity: new Date().toISOString(),
      };

      mockBuilder.single.mockResolvedValue({
        data: mockValidSession,
        error: null,
      });

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(true);
      expect(result.session).toEqual(mockValidSession);
      expect(result.user).toBeDefined();
    });

    it('期限切れセッションが無効になる', async () => {
      const expiredSession = {
        id: 'session-123',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // 1分前に期限切れ
        is_active: true,
      };

      mockBuilder.single.mockResolvedValue({
        data: expiredSession,
        error: null,
      });

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_expired');
    });

    it('無効化されたセッションが無効になる', async () => {
      const inactiveSession = {
        id: 'session-123',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_active: false, // セッションが無効
      };

      mockBuilder.single.mockResolvedValue({
        data: inactiveSession,
        error: null,
      });

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_revoked');
    });

    it('存在しないセッションが無効になる', async () => {
      mockBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await sessionManager.validateSession(mockToken);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('session_not_found');
    });

    it('無効なトークンでエラーになる', async () => {
      await expect(sessionManager.validateSession('')).rejects.toThrow(
        'セッショントークンが無効です'
      );

      await expect(
        sessionManager.validateSession('invalid-token')
      ).rejects.toThrow('セッショントークンが無効です');
    });
  });

  describe('revokeSession', () => {
    const mockSessionId = 'session-123';
    const mockReason = 'manual_logout';

    it('セッション無効化が成功する', async () => {
      mockBuilder.single.mockResolvedValue({
        data: { id: mockSessionId },
        error: null,
      });

      await expect(
        sessionManager.revokeSession(mockSessionId, mockReason)
      ).resolves.not.toThrow();

      expect(mockBuilder.update).toHaveBeenCalledWith({
        is_active: false,
        is_revoked: true,
        revoked_at: expect.any(String),
        revoked_by: null,
        revoked_reason: mockReason,
      });
    });

    it('存在しないセッション無効化はfalseを返す', async () => {
      mockBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await sessionManager.revokeSession(mockSessionId, mockReason);
      expect(result).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    const mockUserId = 'user-123';
    const mockClinicId = 'clinic-456';

    it('ユーザーのセッション一覧を取得できる', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          user_id: mockUserId,
          clinic_id: mockClinicId,
          session_token: 'token-1',
          device_info: { browser: 'Chrome', os: 'Windows', device: 'desktop' },
          ip_address: '192.168.1.1',
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          is_active: true,
          is_revoked: false,
          max_idle_minutes: 30,
          max_session_hours: 8,
          remember_device: false,
        },
        {
          id: 'session-2',
          user_id: mockUserId,
          clinic_id: mockClinicId,
          session_token: 'token-2',
          device_info: { browser: 'Firefox', os: 'macOS', device: 'desktop' },
          ip_address: '192.168.1.2',
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          is_active: true,
          is_revoked: false,
          max_idle_minutes: 30,
          max_session_hours: 8,
          remember_device: false,
        },
      ];

      // orderメソッドの後にデータを返す
      mockBuilder.order.mockReturnValueOnce({
        then: (resolve: (result: { data: typeof mockSessions; error: null }) => void) =>
          Promise.resolve(resolve({ data: mockSessions, error: null })),
      });

      const result = await sessionManager.getUserSessions(mockUserId, mockClinicId);

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

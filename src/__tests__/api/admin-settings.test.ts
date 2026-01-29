/**
 * 管理設定永続化 APIテスト
 * 仕様書: docs/管理設定永続化_MVP仕様書.md
 *
 * テストケース:
 * - GET /api/admin/settings が未登録でもデフォルトを返す
 * - PUT /api/admin/settings が upsert される
 * - clinic_id 未指定は 400
 * - バリデーションエラー
 * - 監査ログ出力
 */

import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {},
}));

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const logAdminActionMock = AuditLogger.logAdminAction as jest.Mock;

// テスト用定数
const TEST_CLINIC_ID = '00000000-0000-0000-0000-0000000000a1';
const TEST_USER_ID = '00000000-0000-0000-0000-00000000a001';

const buildRequest = (body: Record<string, unknown> = {}) =>
  ({
    url: 'https://example.com/api/admin/settings',
    clone: () => ({
      json: async () => body,
    }),
  }) as any;

// デフォルト設定値
const DEFAULT_SETTINGS = {
  clinic_basic: {
    name: '',
    zipCode: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    website: '',
    description: '',
    logoUrl: null,
  },
  clinic_hours: {
    hoursByDay: {},
    holidays: [],
    specialClosures: [],
  },
  booking_calendar: {
    slotMinutes: 30,
    maxConcurrent: 3,
    weekStartDay: 1,
    allowOnlineBooking: false,
  },
  communication: {
    emailEnabled: false,
    smsEnabled: false,
    lineEnabled: false,
    pushEnabled: false,
    smtpSettings: {
      host: '',
      port: 587,
      user: '',
      password: '',
    },
    templates: [],
  },
  system_security: {
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSymbols: false,
    },
    twoFactorEnabled: false,
    sessionTimeout: 30,
    loginAttempts: 5,
    lockoutDuration: 15,
  },
  system_backup: {
    autoBackup: false,
    backupFrequency: 'daily',
    backupTime: '03:00',
    retentionDays: 30,
    cloudStorage: false,
    storageProvider: 'aws',
  },
  services_pricing: {
    menus: [],
    categories: [],
    insuranceOptions: [],
  },
  insurance_billing: {
    insuranceTypes: [],
    receiptSettings: {},
    billingCycle: 'monthly',
  },
  data_management: {
    importMode: 'update',
    exportFormat: 'csv',
    retentionDays: 365,
  },
};

describe('admin settings API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // jest.resetModules() を削除 - モックが再設定されなくなるのを防ぐ
  });

  describe('GET /api/admin/settings', () => {
    it('clinic_id未指定で400エラーを返す', async () => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase: {},
      });

      const { GET } = await import('@/app/api/admin/settings/route');

      const response = await GET({
        url: 'https://example.com/api/admin/settings?category=clinic_basic',
      } as any);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/clinic_id.*必須|clinic_id.*required/i);
    });

    it('category未指定で400エラーを返す', async () => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase: {},
      });

      const { GET } = await import('@/app/api/admin/settings/route');

      const response = await GET({
        url: `https://example.com/api/admin/settings?clinic_id=${TEST_CLINIC_ID}`,
      } as any);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/category.*必須|category.*required/i);
    });

    it('未登録の場合にデフォルト値を返す', async () => {
      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const supabase = {
        from: jest.fn().mockReturnValue({
          select: selectMock,
        }),
      };

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase,
      });

      const { GET } = await import('@/app/api/admin/settings/route');

      const response = await GET({
        url: `https://example.com/api/admin/settings?clinic_id=${TEST_CLINIC_ID}&category=clinic_basic`,
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.settings).toEqual(DEFAULT_SETTINGS.clinic_basic);
    });

    it('登録済みの場合に保存された値を返す', async () => {
      const savedSettings = {
        name: '保存済み整骨院',
        zipCode: '100-0001',
        address: '東京都千代田区',
        phone: '03-1234-5678',
        fax: '',
        email: 'test@test.com',
        website: '',
        description: '',
        logoUrl: null,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'setting-1',
            clinic_id: TEST_CLINIC_ID,
            category: 'clinic_basic',
            settings: savedSettings,
            updated_by: TEST_USER_ID,
            updated_at: new Date().toISOString(),
          },
          error: null,
        }),
      });

      const supabase = {
        from: jest.fn().mockReturnValue({
          select: selectMock,
        }),
      };

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase,
      });

      const { GET } = await import('@/app/api/admin/settings/route');

      const response = await GET({
        url: `https://example.com/api/admin/settings?clinic_id=${TEST_CLINIC_ID}&category=clinic_basic`,
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.settings.name).toBe('保存済み整骨院');
    });
  });

  describe('PUT /api/admin/settings', () => {
    it('upsertで新規作成される', async () => {
      const upsertMock = jest.fn().mockResolvedValue({ error: null });

      const supabase = {
        from: jest.fn().mockReturnValue({
          upsert: upsertMock,
        }),
      };

      const newSettings = {
        name: '新規整骨院',
        zipCode: '150-0001',
        address: '東京都渋谷区',
        phone: '03-9999-9999',
        fax: '',
        email: 'new@test.com',
        website: '',
        description: '',
        logoUrl: null,
      };

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase,
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: newSettings,
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      const response = await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: newSettings,
        })
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: newSettings,
          updated_by: TEST_USER_ID,
        }),
        { onConflict: 'clinic_id,category' }
      );
    });

    it('upsertで更新される', async () => {
      const upsertMock = jest.fn().mockResolvedValue({ error: null });

      const supabase = {
        from: jest.fn().mockReturnValue({
          upsert: upsertMock,
        }),
      };

      const updatedSettings = {
        name: '更新整骨院',
        zipCode: '150-0002',
        address: '東京都渋谷区更新',
        phone: '03-8888-8888',
        fax: '',
        email: 'updated@test.com',
        website: '',
        description: '',
        logoUrl: null,
      };

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase,
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: updatedSettings,
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      const response = await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: updatedSettings,
        })
      );

      expect(response.status).toBe(200);
      expect(upsertMock).toHaveBeenCalled();
    });

    it('監査ログが出力される', async () => {
      const upsertMock = jest.fn().mockResolvedValue({ error: null });

      const supabase = {
        from: jest.fn().mockReturnValue({
          upsert: upsertMock,
        }),
      };

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase,
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: { name: 'ログテスト' },
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: { name: 'ログテスト' },
        })
      );

      // logAdminAction の引数は: userId, userEmail, action, targetId, details, ipAddress
      expect(logAdminActionMock).toHaveBeenCalledWith(
        TEST_USER_ID,
        'admin@example.com',
        'update_settings',
        undefined,
        expect.objectContaining({
          category: 'clinic_basic',
          clinic_id: TEST_CLINIC_ID,
        })
      );
    });

    it('不正なcategoryでエラーを返す', async () => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase: {},
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'invalid_category',
          settings: {},
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      const response = await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'invalid_category',
          settings: {},
        })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/不正なcategory|invalid.*category/i);
    });

    it('権限がない場合に403エラーを返す', async () => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'staff@example.com', role: 'staff' },
        permissions: { role: 'staff', clinic_id: TEST_CLINIC_ID },
        supabase: {},
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: {},
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      const response = await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: {},
        })
      );

      expect(response.status).toBe(403);
    });
  });

  describe('バリデーション', () => {
    it('clinic_basic: 院名が空の場合にエラー', async () => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase: {
          from: jest.fn().mockReturnValue({
            upsert: jest.fn().mockResolvedValue({ error: null }),
          }),
        },
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: {
            name: '', // 必須フィールドが空
            phone: '03-1234-5678',
          },
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      const response = await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'clinic_basic',
          settings: {
            name: '',
            phone: '03-1234-5678',
          },
        })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/name.*必須|院名.*必須/i);
    });

    it('booking_calendar: slotMinutesが不正な値', async () => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: { id: TEST_USER_ID, email: 'admin@example.com', role: 'admin' },
        permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
        supabase: {
          from: jest.fn().mockReturnValue({
            upsert: jest.fn().mockResolvedValue({ error: null }),
          }),
        },
        body: {
          clinic_id: TEST_CLINIC_ID,
          category: 'booking_calendar',
          settings: {
            slotMinutes: -10, // 不正な値
            maxConcurrent: 3,
          },
        },
      });

      const { PUT } = await import('@/app/api/admin/settings/route');

      const response = await PUT(
        buildRequest({
          clinic_id: TEST_CLINIC_ID,
          category: 'booking_calendar',
          settings: {
            slotMinutes: -10,
            maxConcurrent: 3,
          },
        })
      );

      expect(response.status).toBe(400);
    });
  });
});

describe('settings default values', () => {
  it('すべてのカテゴリにデフォルト値がある', () => {
    const categories = [
      'clinic_basic',
      'clinic_hours',
      'booking_calendar',
      'communication',
      'system_security',
      'system_backup',
      'services_pricing',
      'insurance_billing',
      'data_management',
    ];

    categories.forEach(category => {
      expect(DEFAULT_SETTINGS).toHaveProperty(category);
      expect(
        DEFAULT_SETTINGS[category as keyof typeof DEFAULT_SETTINGS]
      ).toBeDefined();
    });
  });
});

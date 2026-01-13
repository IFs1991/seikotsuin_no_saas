/**
 * 管理設定永続化 API
 * 仕様書: docs/管理設定永続化_MVP仕様書.md
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 *
 * GET  /api/admin/settings - 設定取得（未登録時はデフォルト値）
 * PUT  /api/admin/settings - 設定保存（upsert）
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { CLINIC_ADMIN_ROLES, STAFF_ROLES, type Role } from '@/lib/constants/roles';

// カテゴリ一覧
const VALID_CATEGORIES = [
  'clinic_basic',
  'clinic_hours',
  'booking_calendar',
  'communication',
  'system_security',
  'system_backup',
  'services_pricing',
  'insurance_billing',
  'data_management',
] as const;

type SettingsCategory = (typeof VALID_CATEGORIES)[number];

// デフォルト設定値
const DEFAULT_SETTINGS: Record<SettingsCategory, Record<string, unknown>> = {
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
    maxAdvanceBookingDays: 30,
    minAdvanceBookingHours: 2,
    allowCancellation: true,
    cancellationDeadlineHours: 24,
    defaultCalendarView: 'week',
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

// カテゴリごとのバリデーションスキーマ
const ClinicBasicSchema = z.object({
  name: z.string().min(1, '院名は必須です'),
  zipCode: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email('有効なメールアドレスを入力してください').optional().or(z.literal('')),
  website: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  description: z.string().max(500, '紹介文は500文字以内で入力してください').optional(),
  logoUrl: z.string().nullable().optional(),
});

const ClinicHoursSchema = z.object({
  hoursByDay: z.record(z.unknown()).optional(),
  holidays: z.array(z.string()).optional(),
  specialClosures: z.array(z.unknown()).optional(),
});

const BookingCalendarSchema = z.object({
  slotMinutes: z.number().min(5, '予約枠は5分以上にしてください').max(180, '予約枠は180分以内にしてください').optional(),
  maxConcurrent: z.number().min(1, '同時予約数は1以上にしてください').max(100).optional(),
  weekStartDay: z.number().min(0).max(6).optional(),
  allowOnlineBooking: z.boolean().optional(),
  maxAdvanceBookingDays: z.number().min(1).max(365).optional(),
  minAdvanceBookingHours: z.number().min(0).max(48).optional(),
  allowCancellation: z.boolean().optional(),
  cancellationDeadlineHours: z.number().min(0).max(168).optional(),
  defaultCalendarView: z.enum(['day', 'week', 'month']).optional(),
});

const CommunicationSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  lineEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  smtpSettings: z.object({
    host: z.string().optional(),
    port: z.number().min(1).max(65535).optional(),
    user: z.string().optional(),
    password: z.string().optional(),
  }).optional(),
  templates: z.array(z.unknown()).optional(),
});

const SystemSecuritySchema = z.object({
  passwordPolicy: z.object({
    minLength: z.number().min(4).max(128).optional(),
    requireUppercase: z.boolean().optional(),
    requireNumbers: z.boolean().optional(),
    requireSymbols: z.boolean().optional(),
  }).optional(),
  twoFactorEnabled: z.boolean().optional(),
  sessionTimeout: z.number().min(5).max(480).optional(),
  loginAttempts: z.number().min(1).max(10).optional(),
  lockoutDuration: z.number().min(1).max(1440).optional(),
});

const SystemBackupSchema = z.object({
  autoBackup: z.boolean().optional(),
  backupFrequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  backupTime: z.string().optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  cloudStorage: z.boolean().optional(),
  storageProvider: z.enum(['aws', 'gcp', 'azure']).optional(),
});

const ServicesPricingSchema = z.object({
  menus: z.array(z.unknown()).optional(),
  categories: z.array(z.unknown()).optional(),
  insuranceOptions: z.array(z.unknown()).optional(),
});

const InsuranceBillingSchema = z.object({
  insuranceTypes: z.array(z.unknown()).optional(),
  receiptSettings: z.record(z.unknown()).optional(),
  billingCycle: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
});

const DataManagementSchema = z.object({
  importMode: z.enum(['update', 'replace', 'merge']).optional(),
  exportFormat: z.enum(['csv', 'excel', 'pdf', 'json']).optional(),
  retentionDays: z.number().min(30).max(3650).optional(),
});

// カテゴリとスキーマのマッピング
const CATEGORY_SCHEMAS: Record<SettingsCategory, z.ZodTypeAny> = {
  clinic_basic: ClinicBasicSchema,
  clinic_hours: ClinicHoursSchema,
  booking_calendar: BookingCalendarSchema,
  communication: CommunicationSchema,
  system_security: SystemSecuritySchema,
  system_backup: SystemBackupSchema,
  services_pricing: ServicesPricingSchema,
  insurance_billing: InsuranceBillingSchema,
  data_management: DataManagementSchema,
};

// 管理者権限チェック（クリニック設定管理が可能なロール）
const canManageSettings = (role: string) =>
  CLINIC_ADMIN_ROLES.has(role as Role);

/**
 * GET /api/admin/settings
 * 設定を取得（未登録時はデフォルト値を返す）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const category = searchParams.get('category');

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(STAFF_ROLES),
      clinicId,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth } = processResult;

    // バリデーション
    if (!clinicId) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    if (!category) {
      return createErrorResponse('categoryは必須です', 400);
    }

    if (!VALID_CATEGORIES.includes(category as SettingsCategory)) {
      return createErrorResponse(
        `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`,
        400
      );
    }

    // データベースから取得
    const { data, error } = await supabase
      .from('clinic_settings')
      .select('settings, updated_at, updated_by')
      .eq('clinic_id', clinicId)
      .eq('category', category)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116: No rows returned（これは正常なケース）
      logError(error, {
        endpoint: '/api/admin/settings',
        method: 'GET',
        userId: auth.id,
        params: { clinic_id: clinicId, category },
      });
      return createErrorResponse('設定の取得に失敗しました', 500);
    }

    // データがなければデフォルト値を返す
    const settings = data?.settings ?? DEFAULT_SETTINGS[category as SettingsCategory];

    return createSuccessResponse({
      settings,
      updated_at: data?.updated_at ?? null,
      updated_by: data?.updated_by ?? null,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/settings',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

/**
 * PUT /api/admin/settings
 * 設定を保存（upsert）
 */
export async function PUT(request: NextRequest) {
  try {
    let clinicIdForAuth: string | null = null;
    try {
      const previewBody = await request.clone().json();
      clinicIdForAuth =
        typeof previewBody?.clinic_id === 'string' ? previewBody.clinic_id : null;
    } catch {
      clinicIdForAuth = null;
    }

    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
      clinicId: clinicIdForAuth,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth, permissions, body } = processResult;

    // 管理者権限チェック
    if (!canManageSettings(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    // ボディのパース
    const { clinic_id, category, settings } = body as {
      clinic_id?: string;
      category?: string;
      settings?: Record<string, unknown>;
    };

    // バリデーション
    if (!clinic_id) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    if (!category) {
      return createErrorResponse('categoryは必須です', 400);
    }

    if (!VALID_CATEGORIES.includes(category as SettingsCategory)) {
      return createErrorResponse(
        `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`,
        400
      );
    }

    if (!settings || typeof settings !== 'object') {
      return createErrorResponse('settingsは必須です', 400);
    }

    // カテゴリ固有のバリデーション
    const schema = CATEGORY_SCHEMAS[category as SettingsCategory];
    const parseResult = schema.safeParse(settings);

    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      const firstError = Object.values(errors.fieldErrors)[0]?.[0] ?? 
                          errors.formErrors[0] ?? 
                          '入力値にエラーがあります';
      return createErrorResponse(firstError, 400, errors);
    }

    // upsert実行
    const { error } = await supabase.from('clinic_settings').upsert(
      {
        clinic_id,
        category,
        settings: parseResult.data,
        updated_by: auth.id,
      },
      { onConflict: 'clinic_id,category' }
    );

    if (error) {
      logError(error, {
        endpoint: '/api/admin/settings',
        method: 'PUT',
        userId: auth.id,
        params: { clinic_id, category },
      });
      return createErrorResponse('設定の保存に失敗しました', 500);
    }

    // 監査ログ出力
    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'update_settings',
      undefined,
      {
        category,
        clinic_id,
        settingsUpdated: true,
      }
    );

    return createSuccessResponse({
      message: '設定を保存しました',
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/settings',
      method: 'PUT',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

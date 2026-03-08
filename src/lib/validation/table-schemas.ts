import { z } from 'zod';
import { VALIDATION_LIMITS } from '../constants';

// 基本的なバリデーションスキーマ
const baseFields = {
  id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
};

// 治療メニューカテゴリー
export const menuCategoriesSchema = z.object({
  ...baseFields,
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.NAME_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.NAME_MAX_LENGTH}文字以内で入力してください`
    ),
  description: z
    .string()
    .max(
      VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH,
      `説明は${VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  color_code: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, '正しいカラーコードを入力してください')
    .default('#3B82F6'),
  icon_name: z
    .string()
    .max(
      VALIDATION_LIMITS.CODE_MAX_LENGTH,
      `アイコン名は${VALIDATION_LIMITS.CODE_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

// メニュー（現行スキーマ名: menus）
export const menusSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid().optional(),
  category_id: z.string().uuid('カテゴリーを選択してください'),
  code: z
    .string()
    .max(
      VALIDATION_LIMITS.CODE_MAX_LENGTH,
      `コードは${VALIDATION_LIMITS.CODE_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    ),
  description: z
    .string()
    .max(
      VALIDATION_LIMITS.TEXT_MAX_LENGTH,
      `説明は${VALIDATION_LIMITS.TEXT_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  price: z.number().positive('価格は正の数値で入力してください'),
  duration_minutes: z
    .number()
    .int()
    .positive('施術時間は正の整数で入力してください')
    .default(30),
  is_insurance_applicable: z.boolean().default(false),
  insurance_points: z.number().int().optional(),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

// スタッフ
export const staffSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    ),
  email: z
    .string()
    .email('正しいメールアドレスを入力してください')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `メールアドレスは${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    ),
  role: z.enum(['admin', 'clinic_admin', 'manager', 'staff', 'therapist'], {
    errorMap: () => ({ message: '正しい役割を選択してください' }),
  }),
  is_therapist: z.boolean().optional(),
  hire_date: z.string().date('正しい日付を入力してください').optional(),
});

// 患者
export const patientsSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    ),
  phone_number: z
    .string()
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
  date_of_birth: z.string().date('正しい日付を入力してください').optional(),
  gender: z
    .enum(['male', 'female', 'other'], {
      errorMap: () => ({ message: '性別を選択してください' }),
    })
    .optional(),
  address: z
    .string()
    .max(
      VALIDATION_LIMITS.TEXT_MAX_LENGTH,
      `住所は${VALIDATION_LIMITS.TEXT_MAX_LENGTH}文字以内で入力してください`
        )
        .optional(),
  registration_date: z
    .string()
    .date('正しい日付を入力してください')
    .optional(),
  last_visit_date: z
    .string()
    .date('正しい日付を入力してください')
    .optional(),
});

export const resourcesSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    ),
  type: z.enum(['staff', 'room', 'bed', 'device'], {
    errorMap: () => ({ message: '正しい種別を選択してください' }),
  }),
  working_hours: z.record(z.any()).optional(),
  supported_menus: z.array(z.string()).optional(),
  max_concurrent: z.number().int().positive().optional(),
  is_bookable: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const clinicSettingsSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid(),
  category: z
    .string()
    .min(1, 'カテゴリは必須です')
    .max(
      VALIDATION_LIMITS.CODE_MAX_LENGTH,
      `カテゴリは${VALIDATION_LIMITS.CODE_MAX_LENGTH}文字以内で入力してください`
    ),
  settings: z.record(z.any()).default({}),
});

// 予約
export const appointmentsSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid().optional(),
  patient_id: z.string().uuid('患者を選択してください'),
  staff_id: z.string().uuid('スタッフを選択してください'),
  treatment_menu_id: z.string().uuid('治療メニューを選択してください'),
  appointment_date: z.string().datetime('予約日時を入力してください'),
  duration_minutes: z
    .number()
    .int()
    .positive('施術時間は正の整数で入力してください'),
  status: z
    .enum(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'], {
      errorMap: () => ({ message: '正しいステータスを選択してください' }),
    })
    .default('scheduled'),
  notes: z
    .string()
    .max(
      VALIDATION_LIMITS.TEXT_MAX_LENGTH,
      `備考は${VALIDATION_LIMITS.TEXT_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  price: z.number().positive('料金は正の数値で入力してください').optional(),
});

// テーブルスキーママッピング（現行スキーマ名で定義）
export const tableSchemas = {
  menu_categories: menuCategoriesSchema,
  menus: menusSchema,
  staff: staffSchema,
  patients: patientsSchema,
  resources: resourcesSchema,
  clinic_settings: clinicSettingsSchema,
  appointments: appointmentsSchema,
} as const;

// バリデーション関数
export function validateTableData(tableName: string, data: unknown) {
  const schema = tableSchemas[tableName as keyof typeof tableSchemas];
  if (!schema) {
    throw new Error(`未対応のテーブルです: ${tableName}`);
  }
  return schema.parse(data);
}

// 安全なバリデーション関数
export function safeValidateTableData(tableName: string, data: unknown) {
  const schema = tableSchemas[tableName as keyof typeof tableSchemas];
  if (!schema) {
    return {
      success: false,
      error: { message: `未対応のテーブルです: ${tableName}` },
    } as const;
  }
  return schema.safeParse(data);
}

// サポートされているテーブル名の型
export type SupportedTableName = keyof typeof tableSchemas;

// 各テーブルのデータ型
export type MenuCategoryData = z.infer<typeof menuCategoriesSchema>;
export type MenuData = z.infer<typeof menusSchema>;
export type StaffData = z.infer<typeof staffSchema>;
export type PatientData = z.infer<typeof patientsSchema>;
export type ResourceData = z.infer<typeof resourcesSchema>;
export type ClinicSettingsData = z.infer<typeof clinicSettingsSchema>;
export type AppointmentData = z.infer<typeof appointmentsSchema>;

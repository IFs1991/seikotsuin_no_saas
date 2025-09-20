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

// 治療メニュー
export const treatmentMenusSchema = z.object({
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
  employee_id: z
    .string()
    .max(
      VALIDATION_LIMITS.CODE_MAX_LENGTH,
      `従業員IDは${VALIDATION_LIMITS.CODE_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  first_name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.NAME_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.NAME_MAX_LENGTH}文字以内で入力してください`
    ),
  last_name: z
    .string()
    .min(1, '姓は必須です')
    .max(
      VALIDATION_LIMITS.NAME_MAX_LENGTH,
      `姓は${VALIDATION_LIMITS.NAME_MAX_LENGTH}文字以内で入力してください`
    ),
  email: z
    .string()
    .email('正しいメールアドレスを入力してください')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `メールアドレスは${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    ),
  phone: z
    .string()
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
  role: z.enum(['admin', 'staff', 'therapist'], {
    errorMap: () => ({ message: '正しい役割を選択してください' }),
  }),
  specialization: z
    .string()
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `専門分野は${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  hire_date: z.string().date('正しい日付を入力してください').optional(),
  is_active: z.boolean().default(true),
});

// 患者
export const patientsSchema = z.object({
  ...baseFields,
  clinic_id: z.string().uuid().optional(),
  patient_number: z
    .string()
    .max(
      VALIDATION_LIMITS.CODE_MAX_LENGTH,
      `患者番号は${VALIDATION_LIMITS.CODE_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  first_name: z
    .string()
    .min(1, '名前は必須です')
    .max(
      VALIDATION_LIMITS.NAME_MAX_LENGTH,
      `名前は${VALIDATION_LIMITS.NAME_MAX_LENGTH}文字以内で入力してください`
    ),
  last_name: z
    .string()
    .min(1, '姓は必須です')
    .max(
      VALIDATION_LIMITS.NAME_MAX_LENGTH,
      `姓は${VALIDATION_LIMITS.NAME_MAX_LENGTH}文字以内で入力してください`
    ),
  email: z
    .string()
    .email('正しいメールアドレスを入力してください')
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `メールアドレスは${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  phone: z
    .string()
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
  birth_date: z.string().date('正しい日付を入力してください').optional(),
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
  emergency_contact: z
    .string()
    .max(
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
      `緊急連絡先は${VALIDATION_LIMITS.STRING_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  medical_history: z
    .string()
    .max(
      VALIDATION_LIMITS.TEXT_MAX_LENGTH,
      `既往歴は${VALIDATION_LIMITS.TEXT_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  notes: z
    .string()
    .max(
      VALIDATION_LIMITS.TEXT_MAX_LENGTH,
      `備考は${VALIDATION_LIMITS.TEXT_MAX_LENGTH}文字以内で入力してください`
    )
    .optional(),
  is_active: z.boolean().default(true),
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

// テーブルスキーママッピング
export const tableSchemas = {
  menu_categories: menuCategoriesSchema,
  treatment_menus: treatmentMenusSchema,
  staff: staffSchema,
  patients: patientsSchema,
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
export type TreatmentMenuData = z.infer<typeof treatmentMenusSchema>;
export type StaffData = z.infer<typeof staffSchema>;
export type PatientData = z.infer<typeof patientsSchema>;
export type AppointmentData = z.infer<typeof appointmentsSchema>;

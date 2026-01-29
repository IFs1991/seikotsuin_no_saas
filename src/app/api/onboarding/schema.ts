/**
 * オンボーディングAPI用Zodスキーマ
 *
 * 各ステップの入力値検証を定義
 */

import { z } from 'zod';

// ================================================================
// 共通定義
// ================================================================

/** オンボーディングステップ */
export const ONBOARDING_STEPS = [
  'profile',
  'clinic',
  'invites',
  'seed',
  'completed',
] as const;

/** ロール定義 */
export const ROLE_VALUES = [
  'admin',
  'clinic_admin',
  'therapist',
  'staff',
  'manager',
] as const;

// ================================================================
// Step 1: プロフィール更新スキーマ
// ================================================================

export const profileUpdateSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, '氏名は必須です')
    .max(255, '氏名は255文字以内で入力してください'),
  phone_number: z
    .string()
    .trim()
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
});

export type ProfileUpdateDTO = z.infer<typeof profileUpdateSchema>;

// ================================================================
// Step 2: クリニック作成スキーマ
// ================================================================

export const clinicCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'クリニック名は必須です')
    .max(255, 'クリニック名は255文字以内で入力してください'),
  address: z
    .string()
    .trim()
    .max(500, '住所は500文字以内で入力してください')
    .optional(),
  phone_number: z
    .string()
    .trim()
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
  opening_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で入力してください')
    .optional(),
  /**
   * Parent clinic ID for parent-child hierarchy (Option 2)
   * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
   */
  parent_id: z
    .string()
    .uuid('親クリニックIDは有効なUUIDである必要があります')
    .optional(),
});

export type ClinicCreateDTO = z.infer<typeof clinicCreateSchema>;

// ================================================================
// Step 3: スタッフ招待スキーマ
// ================================================================

const inviteItemSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  role: z.enum(ROLE_VALUES).default('staff'),
});

export const staffInviteSchema = z.object({
  invites: z
    .array(inviteItemSchema)
    .max(10, '一度に招待できるのは10名までです'),
});

export type StaffInviteDTO = z.infer<typeof staffInviteSchema>;

// ================================================================
// Step 4: 初期マスタ投入スキーマ
// ================================================================

const treatmentMenuItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'メニュー名は必須です')
    .max(255, 'メニュー名は255文字以内で入力してください'),
  price: z.number().min(0, '価格は0以上で入力してください'),
  description: z
    .string()
    .max(1000, '説明は1000文字以内で入力してください')
    .optional(),
});

export const seedMasterSchema = z.object({
  treatment_menus: z
    .array(treatmentMenuItemSchema)
    .min(1, '施術メニューは最低1件必要です'),
  payment_methods: z
    .array(z.string().trim().min(1).max(255))
    .default(['現金', 'クレジットカード']),
  patient_types: z
    .array(z.string().trim().min(1).max(255))
    .default(['初診', '再診']),
});

export type SeedMasterDTO = z.infer<typeof seedMasterSchema>;

// ================================================================
// 状態更新スキーマ
// ================================================================

export const stateUpdateSchema = z.object({
  current_step: z.enum(ONBOARDING_STEPS),
  metadata: z.record(z.unknown()).optional(),
});

export type StateUpdateDTO = z.infer<typeof stateUpdateSchema>;

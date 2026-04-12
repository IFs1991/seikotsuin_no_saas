/**
 * @file schema.ts
 * @description 初回オーナー登録専用スキーマ
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 6.2
 *
 * 注意: src/lib/schemas/auth.ts の signupSchema は変更しない。
 * 本スキーマは /register 専用で termsAccepted フィールドを追加している。
 * 理由: signupSchema は /invite でも利用されており互換破壊リスクがある。
 */

import { z } from 'zod';
import { emailSchema, passwordSchema } from '@/lib/schemas/auth';

/**
 * 初回オーナー登録用スキーマ（register配下専用）
 * - email: 既存 emailSchema を流用
 * - password: 既存 passwordSchema を流用（強力なパスワード要件）
 * - termsAccepted: boolean literal(true) - 同意必須
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: '利用規約への同意が必要です' }),
  }),
});

export type RegisterFormData = z.infer<typeof registerSchema>;

export type RegisterErrorResponse = {
  success: false;
  errors: {
    email?: string[];
    password?: string[];
    termsAccepted?: string[];
    _form?: string[];
  };
};

export type RegisterSuccessResponse = {
  success: true;
  message?: string;
};

export type RegisterResponse = RegisterErrorResponse | RegisterSuccessResponse;

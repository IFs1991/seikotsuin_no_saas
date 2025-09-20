/**
 * 認証関連のZodスキーマ定義
 * サーバーアクションとクライアント側で共通利用
 */

import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { PASSWORD_POLICY } from '../constants/security';

/**
 * メールアドレス検証スキーマ
 */
export const emailSchema = z
  .string({
    required_error: 'メールアドレスは必須です',
    invalid_type_error: 'メールアドレスの形式が正しくありません',
  })
  .email('正しいメールアドレスを入力してください')
  .min(5, 'メールアドレスが短すぎます')
  .max(254, 'メールアドレスが長すぎます（254文字以内）')
  .toLowerCase()
  .trim();

/**
 * パスワード検証スキーマ
 * セキュリティポリシーに準拠した強力なパスワード要件
 */
export const passwordSchema = z
  .string({
    required_error: 'パスワードは必須です',
    invalid_type_error: 'パスワードの形式が正しくありません',
  })
  .min(
    PASSWORD_POLICY.minLength,
    `パスワードは${PASSWORD_POLICY.minLength}文字以上で入力してください`
  )
  .max(
    PASSWORD_POLICY.maxLength,
    `パスワードは${PASSWORD_POLICY.maxLength}文字以内で入力してください`
  )
  .regex(/[a-z]/, 'パスワードには小文字を1文字以上含める必要があります')
  .regex(/[A-Z]/, 'パスワードには大文字を1文字以上含める必要があります')
  .regex(/[0-9]/, 'パスワードには数字を1文字以上含める必要があります')
  .regex(
    /[^a-zA-Z0-9]/,
    'パスワードには特殊文字（記号）を1文字以上含める必要があります'
  )
  .refine(
    password => {
      // よくある弱いパスワードパターンをチェック
      const weakPatterns = [
        /password/i,
        /123456/,
        /qwerty/i,
        /admin/i,
        /login/i,
      ];
      return !weakPatterns.some(pattern => pattern.test(password));
    },
    {
      message:
        'より安全なパスワードを設定してください（一般的な文字列は避けてください）',
    }
  );

/**
 * ログイン用スキーマ（基本）
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'パスワードを入力してください'),
});

/**
 * サインアップ用スキーマ（強力なパスワード要件）
 */
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * FormData用ログインスキーマ
 * サーバーアクションで使用
 */
export const loginFormDataSchema = zfd
  .formData({
    email: zfd.text(),
    password: zfd.text(),
  })
  .pipe(
    z.object({
      email: emailSchema,
      password: z.string().min(1, 'パスワードを入力してください'),
    })
  );

/**
 * FormData用サインアップスキーマ
 * サーバーアクションで使用
 */
export const signupFormDataSchema = zfd
  .formData({
    email: zfd.text(),
    password: zfd.text(),
  })
  .pipe(
    z.object({
      email: emailSchema,
      password: passwordSchema,
    })
  );

/**
 * パスワードリセット用スキーマ
 */
export const passwordResetSchema = z.object({
  email: emailSchema,
});

/**
 * パスワード変更用スキーマ
 */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: '新しいパスワードは現在のパスワードと異なる必要があります',
    path: ['newPassword'],
  });

/**
 * 認証エラーレスポンス用型定義
 */
export type AuthErrorResponse = {
  success: false;
  errors: {
    email?: string[];
    password?: string[];
    _form?: string[];
  };
};

/**
 * 認証成功レスポンス用型定義
 */
export type AuthSuccessResponse = {
  success: true;
  message?: string;
  redirectTo?: string;
};

/**
 * 認証レスポンス統合型
 */
export type AuthResponse = AuthErrorResponse | AuthSuccessResponse;

/**
 * TypeScript型の推論
 */
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type PasswordResetFormData = z.infer<typeof passwordResetSchema>;
export type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>;

/**
 * サーバーアクション用のFormData型
 */
export type LoginFormDataInput = z.infer<typeof loginFormDataSchema>;
export type SignupFormDataInput = z.infer<typeof signupFormDataSchema>;

/**
 * 入力値サニタイゼーション関数
 */
export function sanitizeAuthInput(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // 制御文字を除去
    .substring(0, 1000); // 最大1000文字に制限
}

/**
 * パスワード強度チェック関数
 */
export function getPasswordStrength(password: string): {
  score: number; // 0-4
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 8) score++;
  else feedback.push('8文字以上にしてください');

  if (/[a-z]/.test(password)) score++;
  else feedback.push('小文字を含めてください');

  if (/[A-Z]/.test(password)) score++;
  else feedback.push('大文字を含めてください');

  if (/[0-9]/.test(password)) score++;
  else feedback.push('数字を含めてください');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else feedback.push('特殊文字を含めてください');

  return { score, feedback };
}

'use server';

/**
 * @file actions.ts
 * @description 初回オーナー登録サーバーアクション
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 6.1
 *
 * AC-01: 成功時は /register/verify に遷移
 * AC-03: 既存メール有無に関係なく同一の安全文言を返す（非列挙型）
 * AC-07: NEXT_PUBLIC_APP_URL 未設定時は fail-fast
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { registerSchema, type RegisterResponse } from './schema';
import { sanitizeAuthInput } from '@/lib/schemas/auth';
import { assertEnv } from '@/lib/env';
import { getServerClient } from '@/lib/supabase';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';

/** AC-03: 既存メール有無を開示しない安全文言 */
const GENERIC_REGISTER_ERROR =
  '登録処理中にエラーが発生しました。しばらくしてから再度お試しください。';

function isRedirectError(error: unknown): boolean {
  if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const digest = (error as { digest?: string }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return true;
    }
  }
  return false;
}

function extractFormValues(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');
  const terms = formData.get('termsAccepted');
  return {
    email: typeof email === 'string' ? email : '',
    password: typeof password === 'string' ? password : '',
    // HTML checkbox は checked 時に "on" を送信する
    termsAccepted:
      terms === 'on' || terms === 'true'
        ? (true as const)
        : (false as unknown as true),
  };
}

/**
 * 初回オーナー登録アクション
 *
 * 設計原則:
 * - SUPABASE_SERVICE_ROLE_KEY をクライアントで使わない（Section 6.5）
 * - 既存メールかどうかを示す文言を返さない（AC-03）
 * - AuditLogger に成功/失敗を記録（Section 6.5）
 */
export async function registerOwner(
  _: RegisterResponse | null,
  formData: FormData
): Promise<RegisterResponse> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress, userAgent } = getRequestInfoFromHeaders(headerList);

  try {
    // Step 1: 入力検証
    const parsed = registerSchema.safeParse(extractFormValues(formData));
    if (!parsed.success) {
      const { fieldErrors } = parsed.error.flatten();
      return {
        success: false,
        errors: fieldErrors,
      };
    }

    // Step 2: サニタイズ
    const sanitizedEmail = sanitizeAuthInput(parsed.data.email).toLowerCase();
    const sanitizedPassword = sanitizeAuthInput(parsed.data.password);

    // Step 3: Supabase signUp
    // AC-07: assertEnv で NEXT_PUBLIC_APP_URL 未設定時に fail-fast
    const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');
    const { error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: sanitizedPassword,
      options: {
        emailRedirectTo: `${appUrl}/admin/callback`,
        // Section 6.4: 利用規約同意をメタデータに保存
        data: {
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          terms_version: 'v1',
        },
      },
    });

    if (error) {
      // AC-03: 非列挙型 - "already registered" も含め全エラーを同一文言で返す
      console.warn('[Register] signUp error (non-enumeration response):', {
        timestamp: new Date().toISOString(),
        ip: ipAddress,
      });

      await AuditLogger.logAdminAction(
        'anonymous',
        'register_anonymous',
        'owner_registration_failed',
        undefined,
        { ip: ipAddress },
        ipAddress
      );

      return {
        success: false,
        errors: { _form: [GENERIC_REGISTER_ERROR] },
      };
    }

    // Step 4: 成功ログ
    console.info('[Register] Owner signup initiated:', {
      timestamp: new Date().toISOString(),
    });

    await AuditLogger.logAdminAction(
      'register_pending',
      sanitizedEmail,
      'owner_registration_initiated',
      undefined,
      { ip: ipAddress, userAgent },
      ipAddress
    );

    revalidatePath('/', 'layout');

    // Step 5: verify 画面へリダイレクト（AC-01）
    redirect(`/register/verify?email=${encodeURIComponent(sanitizedEmail)}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error('[Register] Unexpected error:', error);
    return {
      success: false,
      errors: { _form: [GENERIC_REGISTER_ERROR] },
    };
  }
}

/**
 * メール確認再送アクション
 *
 * AC-03: Supabase のエラーレスポンスを問わず同一文言を返す
 * （存在確認を開示しない）
 */
export async function resendVerificationEmail(
  _: RegisterResponse | null,
  formData: FormData
): Promise<RegisterResponse> {
  const supabase = await getServerClient();

  const emailValue = formData.get('email');
  const email =
    typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';

  if (!email) {
    return {
      success: false,
      errors: { _form: ['メールアドレスが指定されていません'] },
    };
  }

  try {
    const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${appUrl}/admin/callback`,
      },
    });

    // AC-03: エラー有無にかかわらず同一の成功文言を返す
    return {
      success: true,
      message:
        '確認メールの再送を受け付けました。受信トレイと迷惑メールフォルダをご確認ください。',
    };
  } catch {
    // AC-03: 例外も同一文言で隠蔽
    return {
      success: true,
      message:
        '確認メールの再送を受け付けました。受信トレイと迷惑メールフォルダをご確認ください。',
    };
  }
}

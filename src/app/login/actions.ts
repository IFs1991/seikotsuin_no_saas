'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  loginSchema,
  sanitizeAuthInput,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { getServerClient, getUserPermissions } from '@/lib/supabase/server';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';
import { isHQRole } from '@/lib/constants/roles';

/**
 * @file actions.ts
 * @description 院向けログイン処理（Server Actions）
 * @spec docs/認証と権限制御_MVP仕様書.md
 */

const INACTIVE_ACCOUNT_MESSAGE =
  'アカウントが無効化されています。管理者にお問い合わせください';
const INVALID_CREDENTIALS_MESSAGE =
  'メールアドレスまたはパスワードが正しくありません';
const GENERIC_AUTH_ERROR_MESSAGE = 'システムエラーが発生しました';
const NO_CLINIC_ASSIGNED_MESSAGE =
  '所属クリニックが設定されていません。招待リンクから登録してください';

function isRedirectLikeError(error: unknown): error is Error {
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

type AuthErrorDetail = {
  message?: string | null | undefined;
  status?: number | null | undefined;
};

function mapAuthError(error?: AuthErrorDetail | null) {
  const status = error?.status ?? null;
  const message = (error?.message ?? '').toLowerCase();

  if (status === 403 || /inactive|ban|blocked/i.test(message)) {
    return INACTIVE_ACCOUNT_MESSAGE;
  }

  if (status === 400 || /invalid|wrong|mismatch/i.test(message)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  return GENERIC_AUTH_ERROR_MESSAGE;
}

function extractAuthFormValues(formData: FormData) {
  const emailValue = formData.get('email');
  const passwordValue = formData.get('password');

  return {
    email: typeof emailValue === 'string' ? emailValue : '',
    password: typeof passwordValue === 'string' ? passwordValue : '',
  };
}

/**
 * 院向けログイン処理
 * - 成功時に profiles.last_login_at を更新
 * - profiles.is_active=false は拒否
 * - /dashboard へリダイレクト
 */
export async function clinicLogin(
  _: AuthResponse,
  formData: FormData
): Promise<AuthResponse> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress, userAgent } = getRequestInfoFromHeaders(headerList);

  try {
    // 1. 入力値の検証とサニタイズ
    const parsed = loginSchema.safeParse(extractAuthFormValues(formData));
    if (!parsed.success) {
      const { fieldErrors } = parsed.error.flatten();
      if (!fieldErrors.password || fieldErrors.password.length === 0) {
        fieldErrors.password = ['パスワードを入力してください'];
      }
      console.warn('[Auth] Clinic login validation failed:', fieldErrors);
      return {
        success: false,
        errors: fieldErrors,
      };
    }

    const sanitizedEmail = sanitizeAuthInput(parsed.data.email).toLowerCase();
    const sanitizedPassword = sanitizeAuthInput(parsed.data.password);

    // 2. Supabase認証
    const { error, data } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password: sanitizedPassword,
    });

    if (error) {
      const errorMessage = mapAuthError(error);
      console.warn('[Security] Clinic login attempt failed:', {
        email: sanitizedEmail,
        error: errorMessage,
      });
      await AuditLogger.logFailedLogin(
        sanitizedEmail,
        ipAddress,
        userAgent,
        errorMessage
      );
      return {
        success: false,
        errors: {
          password: [errorMessage],
          _form: [errorMessage],
        },
      };
    }

    if (!data.user) {
      const fallbackMessage = '認証に失敗しました。再度お試しください';
      return {
        success: false,
        errors: {
          password: [fallbackMessage],
          _form: [fallbackMessage],
        },
      };
    }

    await AuditLogger.logLogin(
      data.user.id,
      sanitizedEmail,
      ipAddress,
      userAgent
    );

    // 3. ユーザー権限の確認（user_permissions を単一ソースとして使用）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const permissions = await getUserPermissions(data.user.id, supabase);

    // is_active は profiles テーブルから取得
    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('user_id', data.user.id)
      .single();

    const isActive = (profileData as { is_active?: boolean } | null)?.is_active ?? true;

    // is_active チェック
    if (!isActive) {
      await supabase.auth.signOut();
      return {
        success: false,
        errors: {
          password: [INACTIVE_ACCOUNT_MESSAGE],
          _form: [INACTIVE_ACCOUNT_MESSAGE],
        },
      };
    }

    // HQロール（admin）は clinic_id なしでもログイン許可
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    if (isHQRole(permissions?.role)) {
      // 4. last_login_at を更新
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', data.user.id);

      // 5. 成功ログ
      console.info('[Auth] Successful HQ admin login:', {
        email: sanitizedEmail,
        role: permissions?.role,
        clinic_id: permissions?.clinic_id,
        timestamp: new Date().toISOString(),
      });

      // 6. パス再検証とリダイレクト
      revalidatePath('/', 'layout');
      redirect('/admin');
    }

    // 非HQロール + clinic_id = null → /onboarding へリダイレクト
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    if (!permissions?.clinic_id) {
      // 4. last_login_at を更新
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', data.user.id);

      // 5. 成功ログ
      console.info('[Auth] Successful clinic login (no clinic assigned, redirecting to onboarding):', {
        email: sanitizedEmail,
        role: permissions?.role,
        timestamp: new Date().toISOString(),
      });

      // 6. パス再検証とリダイレクト
      revalidatePath('/', 'layout');
      redirect('/onboarding');
    }

    // 4. last_login_at を更新
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('user_id', data.user.id);

    // 5. 成功ログ
    console.info('[Auth] Successful clinic login:', {
      email: sanitizedEmail,
      role: permissions?.role,
      clinic_id: permissions?.clinic_id,
      timestamp: new Date().toISOString(),
    });

    // 6. パス再検証とリダイレクト
    revalidatePath('/', 'layout');
    redirect('/dashboard');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    console.error('[Auth] Clinic login error:', error);
    return {
      success: false,
      errors: {
        password: [GENERIC_AUTH_ERROR_MESSAGE],
        _form: [GENERIC_AUTH_ERROR_MESSAGE],
      },
    };
  }
}

/**
 * ログアウト処理
 */
export async function clinicLogout(): Promise<void> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress } = getRequestInfoFromHeaders(headerList);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[Auth] Clinic logout error:', error);
      redirect('/login?error=logout_failed');
    }

    if (user) {
      console.info('[Auth] Successful clinic logout:', {
        email: user.email,
        timestamp: new Date().toISOString(),
      });
      await AuditLogger.logLogout(
        user.id,
        user.email || '',
        ipAddress
      );
    }

    revalidatePath('/', 'layout');
    redirect('/login?message=ログアウトしました');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    console.error('[Auth] Clinic logout error:', error);
    redirect('/login?error=logout_failed');
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  loginSchema,
  sanitizeAuthInput,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { getServerClient, getUserAccessContext } from '@/lib/supabase';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';
import {
  createAuthLog,
  getEmailDomainLogData,
  getSafeAuthErrorLogData,
} from '@/lib/auth/safe-auth-logging';
import {
  isAreaManagerRole,
  isHQRole,
  isTherapistRole,
} from '@/lib/constants/roles';
import { clearRejectedAuthSession } from '@/lib/auth/session-cleanup';

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
const log = createAuthLog('ClinicAuthActions');

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
  let signedIn = false;

  try {
    // 1. 入力値の検証とサニタイズ
    const parsed = loginSchema.safeParse(extractAuthFormValues(formData));
    if (!parsed.success) {
      const { fieldErrors } = parsed.error.flatten();
      if (!fieldErrors.password || fieldErrors.password.length === 0) {
        fieldErrors.password = ['パスワードを入力してください'];
      }
      log.warn('Clinic login validation failed', {
        fields: Object.keys(fieldErrors).join(','),
      });
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
      log.warn('Clinic login attempt failed', {
        ...getEmailDomainLogData(sanitizedEmail),
        reason: errorMessage,
        ...getSafeAuthErrorLogData(error),
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

    signedIn = true;

    // 3. ユーザー権限の確認（user_permissions を単一ソースとして使用）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const accessContext = await getUserAccessContext(data.user.id, supabase, {
      user: data.user,
    });
    const permissions = accessContext.permissions;

    // Missing/inactive profile is intentionally classified as an inactive
    // account before the masked permission context is inspected.
    if (!accessContext.isActive) {
      const cleanup = await clearRejectedAuthSession(supabase);
      signedIn = !cleanup.complete;
      if (cleanup.signOutError) {
        log.error(
          'Clinic login session cleanup error',
          getSafeAuthErrorLogData(cleanup.signOutError)
        );
      }
      return {
        success: false,
        errors: {
          password: [INACTIVE_ACCOUNT_MESSAGE],
          _form: [INACTIVE_ACCOUNT_MESSAGE],
        },
      };
    }

    if (!permissions) {
      const cleanup = await clearRejectedAuthSession(supabase);
      signedIn = !cleanup.complete;
      if (cleanup.signOutError) {
        log.error(
          'Clinic login session cleanup error',
          getSafeAuthErrorLogData(cleanup.signOutError)
        );
      }
      return {
        success: false,
        errors: {
          password: [GENERIC_AUTH_ERROR_MESSAGE],
          _form: [GENERIC_AUTH_ERROR_MESSAGE],
        },
      };
    }

    const recordSuccessfulLogin = async () => {
      await AuditLogger.logLogin(
        data.user.id,
        sanitizedEmail,
        ipAddress,
        userAgent
      );
    };

    // HQロール（admin）は clinic_id なしでもログイン許可
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    if (isHQRole(permissions?.role)) {
      await recordSuccessfulLogin();
      // 4. last_login_at を更新
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', data.user.id);

      // 5. 成功ログ
      log.info('Successful HQ admin login', {
        role: permissions?.role,
        hasClinic: Boolean(permissions?.clinic_id),
      });

      // 6. パス再検証とリダイレクト
      revalidatePath('/', 'layout');
      redirect('/admin');
    }

    if (isAreaManagerRole(permissions?.role)) {
      await recordSuccessfulLogin();
      // 4. last_login_at を更新
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', data.user.id);

      // 5. 成功ログ
      log.info('Successful manager login', {
        role: permissions?.role,
      });

      // 6. パス再検証とリダイレクト
      revalidatePath('/', 'layout');
      redirect('/manager');
    }

    // 非HQロール + clinic_id = null → /onboarding へリダイレクト
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    if (!permissions?.clinic_id) {
      await recordSuccessfulLogin();
      // 4. last_login_at を更新
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', data.user.id);

      // 5. 成功ログ
      log.info('Successful clinic login without clinic assignment', {
        role: permissions?.role,
        redirectTarget: 'onboarding',
      });

      // 6. パス再検証とリダイレクト
      revalidatePath('/', 'layout');
      redirect('/onboarding');
    }

    await recordSuccessfulLogin();

    // 4. last_login_at を更新
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('user_id', data.user.id);

    // 5. 成功ログ
    log.info('Successful clinic login', {
      role: permissions?.role,
      hasClinic: Boolean(permissions?.clinic_id),
    });

    // 6. パス再検証とリダイレクト
    revalidatePath('/', 'layout');
    redirect(
      isTherapistRole(permissions?.role) ? '/reservations' : '/dashboard'
    );
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    if (signedIn) {
      const cleanup = await clearRejectedAuthSession(supabase);
      if (cleanup.signOutError) {
        log.error(
          'Clinic login session cleanup error',
          getSafeAuthErrorLogData(cleanup.signOutError)
        );
      }
      if (cleanup.cookieCleanupError) {
        log.error(
          'Clinic login auth cookie cleanup error',
          getSafeAuthErrorLogData(cleanup.cookieCleanupError)
        );
      }
      signedIn = !cleanup.complete;
    }
    log.error('Clinic login error', getSafeAuthErrorLogData(error));
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
      log.error('Clinic logout error', getSafeAuthErrorLogData(error));
      redirect('/login?error=logout_failed');
    }

    if (user) {
      log.info('Successful clinic logout', {
        hasUser: true,
      });
      await AuditLogger.logLogout(user.id, user.email || '', ipAddress);
    }

    revalidatePath('/', 'layout');
    redirect('/login?message=ログアウトしました');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    log.error('Clinic logout error', getSafeAuthErrorLogData(error));
    redirect('/login?error=logout_failed');
  }
}

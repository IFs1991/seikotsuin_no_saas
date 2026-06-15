'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  loginSchema,
  signupSchema,
  sanitizeAuthInput,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { assertEnv } from '@/lib/env';
import {
  createAdminClient,
  getServerClient,
  getUserAccessContext,
} from '@/lib/supabase';
import { canAccessAdminUIWithCompat } from '@/lib/constants/roles';
import { getSafeRedirectUrl, getDefaultRedirect } from '@/lib/url-validator';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';

const INACTIVE_ACCOUNT_MESSAGE =
  'アカウントが無効化されています。管理者にお問い合わせください';
const INVALID_CREDENTIALS_MESSAGE =
  'メールアドレスまたはパスワードが正しくありません';
const GENERIC_AUTH_ERROR_MESSAGE = 'システムエラーが発生しました';

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

/**
 * ログイン処理（入力値検証強化版）
 */
function extractAuthFormValues(formData: FormData) {
  const emailValue = formData.get('email');
  const passwordValue = formData.get('password');

  return {
    email: typeof emailValue === 'string' ? emailValue : '',
    password: typeof passwordValue === 'string' ? passwordValue : '',
  };
}

function resolveProfileName(
  email: string,
  metadata: Record<string, unknown> | null | undefined
) {
  const metadataName =
    typeof metadata?.full_name === 'string'
      ? metadata.full_name.trim()
      : typeof metadata?.name === 'string'
        ? metadata.name.trim()
        : '';

  if (metadataName) {
    return metadataName;
  }

  return email.split('@')[0] || '管理者';
}

async function ensureProfileExists(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const adminClient = createAdminClient();
  const profileEmail =
    user.email?.trim().toLowerCase() || `${user.id}@placeholder.local`;

  const { data: existingProfile, error: lookupError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) {
    console.error('[Auth] Profile bootstrap lookup error:', lookupError);
    return;
  }

  if (existingProfile) {
    return;
  }

  const { error: insertError } = await adminClient.from('profiles').insert({
    user_id: user.id,
    email: profileEmail,
    full_name: resolveProfileName(profileEmail, user.user_metadata),
  });

  if (insertError) {
    console.error('[Auth] Profile bootstrap insert error:', insertError);
  }
}

async function syncProfileAccess(
  userId: string,
  email: string,
  role: string | null,
  clinicId: string | null
) {
  if (!role && clinicId === null) {
    return;
  }

  const adminClient = createAdminClient();
  const profilePayload: {
    updated_at: string;
    email: string;
    role?: string;
    clinic_id?: string | null;
  } = {
    updated_at: new Date().toISOString(),
    email,
  };

  if (role) {
    profilePayload.role = role;
  }

  if (clinicId !== null) {
    profilePayload.clinic_id = clinicId;
  }

  const { error } = await adminClient
    .from('profiles')
    .update(profilePayload)
    .eq('user_id', userId);

  if (error) {
    console.error('[Auth] Profile access sync error:', error);
  }
}

export async function login(
  _: unknown,
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
      console.warn('[Auth] Login validation failed:', fieldErrors);
      return {
        success: false,
        errors: fieldErrors,
      };
    }

    const sanitizedEmail = sanitizeAuthInput(parsed.data.email).toLowerCase();
    const sanitizedPassword = sanitizeAuthInput(parsed.data.password);

    // 3. レート制限チェック（基本的なブルートフォース対策）
    // TODO: より詳細なレート制限実装

    // 4. Supabase認証
    const { error, data } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password: sanitizedPassword,
    });

    if (error) {
      const errorMessage = mapAuthError(error);
      const warningPayload: {
        email: string;
        error: string;
        status?: number | null;
        details?: string;
      } = {
        email: sanitizedEmail,
        error: errorMessage,
      };

      if (typeof error.status !== 'undefined') {
        warningPayload.status = error.status ?? null;
      }

      if (error.message && error.message !== errorMessage) {
        warningPayload.details = error.message;
      }

      console.warn('[Security] Login attempt failed:', warningPayload);
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

    await ensureProfileExists(data.user);

    // 5. 認可コンテキストを user_permissions/profile の整合済み導線で解決
    const accessContext = await getUserAccessContext(data.user.id, supabase);
    const effectiveRole = accessContext.normalizedRole ?? accessContext.role;

    if (!accessContext.isActive) {
      await supabase.auth.signOut();
      return {
        success: false,
        errors: {
          password: [INACTIVE_ACCOUNT_MESSAGE],
          _form: [INACTIVE_ACCOUNT_MESSAGE],
        },
      };
    }

    await syncProfileAccess(
      data.user.id,
      sanitizedEmail,
      effectiveRole,
      accessContext.clinicId
    );

    await AuditLogger.logLogin(
      data.user.id,
      sanitizedEmail,
      ipAddress,
      userAgent
    );

    // 6. 成功ログ
    console.info('[Auth] Successful login:', {
      email: sanitizedEmail,
      role: effectiveRole,
      clinic_id: accessContext.clinicId,
      timestamp: new Date().toISOString(),
    });

    // 7. パス再検証とリダイレクト
    revalidatePath('/', 'layout');
    let redirectPath = '/dashboard';
    if (effectiveRole === 'manager') {
      redirectPath = getDefaultRedirect(effectiveRole);
    } else if (canAccessAdminUIWithCompat(effectiveRole)) {
      redirectPath = getDefaultRedirect(effectiveRole ?? 'admin');
    } else if (accessContext.clinicId === null) {
      redirectPath = '/onboarding';
    }
    redirect(redirectPath);
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    console.error('[Auth] Login error:', error);
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
 * サインアップ処理（入力値検証強化版）
 */
export async function signup(
  _: any,
  formData: FormData
): Promise<AuthResponse> {
  const supabase = await getServerClient();

  // 1. 入力値の検証
  const parsed = signupSchema.safeParse(extractAuthFormValues(formData));
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    if (!fieldErrors.password || fieldErrors.password.length === 0) {
      fieldErrors.password = ['パスワードを入力してください'];
    }
    console.warn('[Auth] Signup validation failed:', fieldErrors);
    return {
      success: false,
      errors: fieldErrors,
    };
  }

  const sanitizedEmail = sanitizeAuthInput(parsed.data.email).toLowerCase();
  const sanitizedPassword = sanitizeAuthInput(parsed.data.password);

  try {
    const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');
    const { error, data } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: sanitizedPassword,
      options: {
        emailRedirectTo: `${appUrl}/admin/callback`,
      },
    });

    if (error) {
      console.warn('[Security] Signup attempt failed:', {
        email: sanitizedEmail,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      const errorMessage = error.message.includes('already registered')
        ? 'このメールアドレスは既に登録されています'
        : 'アカウントの作成に失敗しました。入力内容を確認してください';

      return {
        success: false,
        errors: {
          _form: [errorMessage],
        },
      };
    }

    console.info('[Auth] Successful signup:', {
      email: sanitizedEmail,
      userId: data.user?.id,
      timestamp: new Date().toISOString(),
    });

    revalidatePath('/', 'layout');

    return {
      success: true,
      message:
        '確認メールを送信しました。メールを確認してアカウントを有効化してください。',
    };
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    return {
      success: false,
      errors: {
        _form: [GENERIC_AUTH_ERROR_MESSAGE],
      },
    };
  }
}

/**
 * ログアウト処理
 */
export async function logout(): Promise<void> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress } = getRequestInfoFromHeaders(headerList);

  try {
    // 現在のユーザー情報を取得（ログ用）
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[Auth] Logout error:', error);
      redirect('/admin/login?error=logout_failed');
    }

    // ログアウトログ
    if (user) {
      console.info('[Auth] Successful logout:', {
        email: user.email,
        timestamp: new Date().toISOString(),
      });
      await AuditLogger.logLogout(user.id, user.email || '', ipAddress);
    }

    revalidatePath('/', 'layout');
    redirect('/admin/login?message=ログアウトしました');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    console.error('[Auth] Logout error:', error);
    redirect('/admin/login?error=logout_failed');
  }
}

/**
 * リダイレクト付きログアウト（URLパラメータからリダイレクト先を指定）
 */
export async function logoutWithRedirect(redirectTo?: string): Promise<void> {
  await logout();

  // 安全なリダイレクト先を検証
  const safeUrl = getSafeRedirectUrl(
    redirectTo,
    assertEnv('NEXT_PUBLIC_APP_URL')
  );
  const finalRedirect = safeUrl || '/admin/login';

  redirect(finalRedirect);
}

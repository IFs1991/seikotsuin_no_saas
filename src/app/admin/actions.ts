'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  loginSchema,
  signupSchema,
  sanitizeAuthInput,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { getServerClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl, getDefaultRedirect } from '@/lib/url-validator';

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
    if (digest === 'NEXT_REDIRECT') {
      return true;
    }
  }

  return false;
}

type AuthErrorDetail = {
  message?: string | null;
  status?: number | null;
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

export async function login(_: any, formData: FormData): Promise<AuthResponse> {
  const supabase = await getServerClient();

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

    // 5. ユーザー権限の確認
    const profileResult = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', data.user.id)
      .single();

    type ProfileData = { role: string; is_active: boolean } | null;
    const profile = profileResult?.data as ProfileData;

    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return {
        success: false,
        errors: {
          password: [INACTIVE_ACCOUNT_MESSAGE],
          _form: [INACTIVE_ACCOUNT_MESSAGE],
        },
      };
    }

    // 6. 成功ログ
    console.info('[Auth] Successful login:', {
      email: sanitizedEmail,
      role: profile!.role,
      timestamp: new Date().toISOString(),
    });

    // 7. パス再検証とリダイレクト
    revalidatePath('/', 'layout');
    const redirectPath = getDefaultRedirect(profile!.role);
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
    const { error, data } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: sanitizedPassword,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/callback`,
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
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  );
  const finalRedirect = safeUrl || '/admin/login';

  redirect(finalRedirect);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  loginFormDataSchema,
  signupFormDataSchema,
  sanitizeAuthInput,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { getSafeRedirectUrl, getDefaultRedirect } from '@/lib/url-validator';

/**
 * ログイン処理（入力値検証強化版）
 */
export async function login(_: any, formData: FormData): Promise<AuthResponse> {
  const supabase = await createClient();

  try {
    // 1. 入力値の検証とサニタイゼーション
    const result = loginFormDataSchema.safeParse(formData);

    if (!result.success) {
      console.warn(
        '[Auth] Login validation failed:',
        result.error.flatten().fieldErrors
      );
      return {
        success: false,
        errors: result.error.flatten().fieldErrors,
      };
    }

    const { email, password } = result.data;

    // 2. 追加のサニタイゼーション
    const sanitizedEmail = sanitizeAuthInput(String(email));
    const sanitizedPassword = sanitizeAuthInput(String(password));

    // 3. レート制限チェック（基本的なブルートフォース対策）
    // TODO: より詳細なレート制限実装

    // 4. Supabase認証
    const { error, data } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password: sanitizedPassword,
    });

    if (error) {
      // セキュリティログ
      console.warn('[Security] Login attempt failed:', {
        email: sanitizedEmail,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      // ユーザーには汎用的なエラーメッセージを返す
      return {
        success: false,
        errors: {
          _form: ['メールアドレスまたはパスワードが正しくありません'],
        },
      };
    }

    if (!data.user) {
      return {
        success: false,
        errors: {
          _form: ['認証に失敗しました。再度お試しください'],
        },
      };
    }

    // 5. ユーザー権限の確認
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', data.user.id)
      .single();

    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return {
        success: false,
        errors: {
          _form: [
            'アカウントが無効化されています。管理者にお問い合わせください',
          ],
        },
      };
    }

    // 6. 成功ログ
    console.info('[Auth] Successful login:', {
      email: sanitizedEmail,
      role: profile.role,
      timestamp: new Date().toISOString(),
    });

    // 7. パス再検証とリダイレクト
    revalidatePath('/', 'layout');
    const redirectPath = getDefaultRedirect(profile.role);
    redirect(redirectPath);
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return {
      success: false,
      errors: {
        _form: [
          'システムエラーが発生しました。しばらく経ってから再度お試しください',
        ],
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
  const supabase = await createClient();

  try {
    // 1. 入力値の検証
    const result = signupFormDataSchema.safeParse(formData);

    if (!result.success) {
      console.warn(
        '[Auth] Signup validation failed:',
        result.error.flatten().fieldErrors
      );
      return {
        success: false,
        errors: result.error.flatten().fieldErrors,
      };
    }

    const { email, password } = result.data;

    // 2. 追加のサニタイゼーション
    const sanitizedEmail = sanitizeAuthInput(String(email));
    const sanitizedPassword = sanitizeAuthInput(String(password));

    // 3. 既存ユーザーチェック（プライバシーを考慮した実装）
    // Note: 実際の運用では詳細なチェックは行わず、Supabaseに委ねる

    // 4. Supabase認証（メール確認付き）
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

      // ユーザーには汎用的なエラーメッセージを返す
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

    // 5. 成功ログ
    console.info('[Auth] Successful signup:', {
      email: sanitizedEmail,
      userId: data.user?.id,
      timestamp: new Date().toISOString(),
    });

    // 6. パス再検証
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
        _form: [
          'システムエラーが発生しました。しばらく経ってから再度お試しください',
        ],
      },
    };
  }
}

/**
 * ログアウト処理
 */
export async function logout(): Promise<void> {
  const supabase = await createClient();

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

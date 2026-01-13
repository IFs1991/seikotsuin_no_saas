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
import { getServerClient } from '@/lib/supabase/server';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';

/**
 * @file actions.ts
 * @description 招待受諾処理（Server Actions）
 * @spec docs/認証と権限制御_MVP仕様書.md
 */

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

function extractAuthFormValues(formData: FormData) {
  const emailValue = formData.get('email');
  const passwordValue = formData.get('password');
  const tokenValue = formData.get('token');

  return {
    email: typeof emailValue === 'string' ? emailValue : '',
    password: typeof passwordValue === 'string' ? passwordValue : '',
    token: typeof tokenValue === 'string' ? tokenValue : '',
  };
}

export type InviteInfo = {
  id: string;
  clinic_id: string;
  email: string;
  role: string;
  clinic_name: string;
  expires_at: string;
  accepted_at: string | null;
};

/**
 * 招待トークンで招待情報を取得
 */
export async function getInviteByToken(
  token: string
): Promise<{ success: boolean; invite?: InviteInfo; error?: string }> {
  const supabase = await getServerClient();

  try {
    const { data, error } = await supabase.rpc('get_invite_by_token', {
      invite_token: token,
    });

    if (error) {
      console.error('[Invite] get_invite_by_token error:', error);
      return { success: false, error: '招待情報の取得に失敗しました' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: '有効な招待が見つかりません' };
    }

    return { success: true, invite: data[0] as InviteInfo };
  } catch (error) {
    console.error('[Invite] getInviteByToken error:', error);
    return { success: false, error: GENERIC_AUTH_ERROR_MESSAGE };
  }
}

/**
 * 招待を受諾（既存ユーザー用）
 */
export async function acceptInvite(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getServerClient();

  try {
    // 現在のユーザーを確認
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'ログインが必要です' };
    }

    // accept_invite RPC を呼び出し
    const { data, error } = await supabase.rpc('accept_invite', {
      invite_token: token,
    });

    if (error) {
      console.error('[Invite] accept_invite error:', error);
      return { success: false, error: '招待の受諾に失敗しました' };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || '招待の受諾に失敗しました' };
    }

    console.info('[Auth] Invite accepted:', {
      userId: user.id,
      clinicId: data.clinic_id,
      timestamp: new Date().toISOString(),
    });

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('[Invite] acceptInvite error:', error);
    return { success: false, error: GENERIC_AUTH_ERROR_MESSAGE };
  }
}

/**
 * 招待受諾＋サインアップ（新規ユーザー用）
 */
export async function signupAndAcceptInvite(
  _: AuthResponse,
  formData: FormData
): Promise<AuthResponse> {
  const supabase = await getServerClient();

  try {
    const { email, password, token } = extractAuthFormValues(formData);

    // 1. バリデーション
    const parsed = signupSchema.safeParse({ email, password });
    if (!parsed.success) {
      const { fieldErrors } = parsed.error.flatten();
      return {
        success: false,
        errors: fieldErrors,
      };
    }

    if (!token) {
      return {
        success: false,
        errors: { _form: ['招待トークンが必要です'] },
      };
    }

    const sanitizedEmail = sanitizeAuthInput(parsed.data.email).toLowerCase();
    const sanitizedPassword = sanitizeAuthInput(parsed.data.password);

    // 2. サインアップ
    const { error: signupError, data: signupData } = await supabase.auth.signUp(
      {
        email: sanitizedEmail,
        password: sanitizedPassword,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite?token=${token}`,
        },
      }
    );

    if (signupError) {
      console.error('[Invite] Signup error:', signupError);
      const errorMessage = signupError.message.includes('already registered')
        ? 'このメールアドレスは既に登録されています。ログインしてください。'
        : 'アカウントの作成に失敗しました';

      return {
        success: false,
        errors: { _form: [errorMessage] },
      };
    }

    // 3. プロファイル作成を待つ（トリガーで自動作成される場合）
    // もしくは手動で作成
    if (signupData.user) {
      // profiles にレコードがない場合は作成
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', signupData.user.id)
        .single();

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          user_id: signupData.user.id,
          email: sanitizedEmail,
          full_name: sanitizedEmail.split('@')[0],
          role: 'staff',
          is_active: true,
        });
      }

      // 4. 招待を受諾
      const { data: acceptData, error: acceptError } = await supabase.rpc(
        'accept_invite',
        { invite_token: token }
      );

      if (acceptError || !acceptData?.success) {
        console.error('[Invite] Accept invite after signup error:', acceptError);
        // サインアップは成功しているので、後で招待を受諾できるようにメッセージを返す
        return {
          success: true,
          message:
            'アカウントを作成しました。メールを確認してから再度招待リンクにアクセスしてください。',
        };
      }

      console.info('[Auth] Signup and invite accepted:', {
        userId: signupData.user.id,
        email: sanitizedEmail,
        clinicId: acceptData.clinic_id,
        timestamp: new Date().toISOString(),
      });

      revalidatePath('/', 'layout');
      redirect('/dashboard');
    }

    return {
      success: true,
      message:
        '確認メールを送信しました。メールを確認してからログインしてください。',
    };
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    console.error('[Invite] signupAndAcceptInvite error:', error);
    return {
      success: false,
      errors: { _form: [GENERIC_AUTH_ERROR_MESSAGE] },
    };
  }
}

/**
 * 招待受諾＋ログイン（既存ユーザー用）
 */
export async function loginAndAcceptInvite(
  _: AuthResponse,
  formData: FormData
): Promise<AuthResponse> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress, userAgent } = getRequestInfoFromHeaders(headerList);

  try {
    const { email, password, token } = extractAuthFormValues(formData);

    // 1. バリデーション
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const { fieldErrors } = parsed.error.flatten();
      return {
        success: false,
        errors: fieldErrors,
      };
    }

    if (!token) {
      return {
        success: false,
        errors: { _form: ['招待トークンが必要です'] },
      };
    }

    const sanitizedEmail = sanitizeAuthInput(parsed.data.email).toLowerCase();
    const sanitizedPassword = sanitizeAuthInput(parsed.data.password);

    // 2. ログイン
    const { error: loginError, data: loginData } =
      await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password: sanitizedPassword,
      });

    if (loginError) {
      console.error('[Invite] Login error:', loginError);
      await AuditLogger.logFailedLogin(
        sanitizedEmail,
        ipAddress,
        userAgent,
        loginError.message
      );
      return {
        success: false,
        errors: {
          password: ['メールアドレスまたはパスワードが正しくありません'],
          _form: ['メールアドレスまたはパスワードが正しくありません'],
        },
      };
    }

    if (!loginData.user) {
      return {
        success: false,
        errors: { _form: ['ログインに失敗しました'] },
      };
    }

    await AuditLogger.logLogin(
      loginData.user.id,
      sanitizedEmail,
      ipAddress,
      userAgent
    );

    // 3. 招待を受諾
    const { data: acceptData, error: acceptError } = await supabase.rpc(
      'accept_invite',
      { invite_token: token }
    );

    if (acceptError || !acceptData?.success) {
      console.error('[Invite] Accept invite after login error:', acceptError);
      return {
        success: false,
        errors: { _form: [acceptData?.error || '招待の受諾に失敗しました'] },
      };
    }

    // 4. last_login_at を更新
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('user_id', loginData.user.id);

    console.info('[Auth] Login and invite accepted:', {
      userId: loginData.user.id,
      email: sanitizedEmail,
      clinicId: acceptData.clinic_id,
      timestamp: new Date().toISOString(),
    });

    revalidatePath('/', 'layout');
    redirect('/dashboard');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    console.error('[Invite] loginAndAcceptInvite error:', error);
    return {
      success: false,
      errors: { _form: [GENERIC_AUTH_ERROR_MESSAGE] },
    };
  }
}

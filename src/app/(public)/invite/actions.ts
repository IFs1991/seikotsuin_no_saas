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
import { createAdminClient, getServerClient } from '@/lib/supabase';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';
import type { Database } from '@/types/supabase';

/**
 * @file actions.ts
 * @description 招待受諾処理（Server Actions）
 * @spec docs/認証と権限制御_MVP仕様書.md
 */

const GENERIC_AUTH_ERROR_MESSAGE = 'システムエラーが発生しました';
const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;
type StaffInviteRow = Database['public']['Tables']['staff_invites']['Row'];

interface InviteAcceptanceResult {
  success: boolean;
  error?: string;
  clinicId?: string;
}

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

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function fetchOpenInvite(
  adminClient: AdminClient,
  token: string
): Promise<StaffInviteRow | null> {
  if (!isUuid(token)) {
    return null;
  }

  const { data, error } = await adminClient
    .from('staff_invites')
    .select(
      'accepted_at, accepted_by, clinic_id, created_at, created_by, email, expires_at, id, role, token, updated_at'
    )
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .is('accepted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[Invite] staff_invites lookup error:', error);
    throw new Error('招待情報の取得に失敗しました');
  }

  return data;
}

async function acceptInviteForUser(
  token: string,
  userId: string
): Promise<InviteAcceptanceResult> {
  const adminClient = createAdminClient();
  const invite = await fetchOpenInvite(adminClient, token);

  if (!invite) {
    return { success: false, error: '有効な招待が見つかりません' };
  }

  const now = new Date().toISOString();

  const { error: inviteUpdateError } = await adminClient
    .from('staff_invites')
    .update({
      accepted_at: now,
      accepted_by: userId,
      updated_at: now,
    })
    .eq('id', invite.id)
    .is('accepted_at', null);

  if (inviteUpdateError) {
    console.error(
      '[Invite] staff_invites accept update error:',
      inviteUpdateError
    );
    return { success: false, error: '招待の受諾に失敗しました' };
  }

  const { error: profileUpdateError } = await adminClient
    .from('profiles')
    .update({
      clinic_id: invite.clinic_id,
      role: invite.role,
      updated_at: now,
    })
    .eq('user_id', userId);

  if (profileUpdateError) {
    console.error('[Invite] profile assignment error:', profileUpdateError);
    return { success: false, error: '招待の受諾に失敗しました' };
  }

  const { error: permissionUpsertError } = await adminClient
    .from('user_permissions')
    .upsert(
      {
        staff_id: userId,
        clinic_id: invite.clinic_id,
        role: invite.role,
        username: invite.email,
        hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
      },
      { onConflict: 'staff_id' }
    );

  if (permissionUpsertError) {
    console.error(
      '[Invite] user_permissions upsert error:',
      permissionUpsertError
    );
    return { success: false, error: '招待の受諾に失敗しました' };
  }

  return {
    success: true,
    clinicId: invite.clinic_id,
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
  const adminClient = createAdminClient();

  try {
    const invite = await fetchOpenInvite(adminClient, token);
    if (!invite) {
      return { success: false, error: '有効な招待が見つかりません' };
    }

    const { data: clinic, error: clinicError } = await adminClient
      .from('clinics')
      .select('name')
      .eq('id', invite.clinic_id)
      .maybeSingle();

    if (clinicError) {
      console.error('[Invite] clinic lookup error:', clinicError);
      return { success: false, error: '招待情報の取得に失敗しました' };
    }

    return {
      success: true,
      invite: {
        id: invite.id,
        clinic_id: invite.clinic_id,
        email: invite.email,
        role: invite.role,
        clinic_name: clinic?.name ?? '',
        expires_at: invite.expires_at,
        accepted_at: invite.accepted_at,
      },
    };
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

    const result = await acceptInviteForUser(token, user.id);
    if (!result.success) {
      return {
        success: false,
        error: result.error || '招待の受諾に失敗しました',
      };
    }

    console.info('[Auth] Invite accepted:', {
      userId: user.id,
      clinicId: result.clinicId,
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
    const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');
    const { error: signupError, data: signupData } = await supabase.auth.signUp(
      {
        email: sanitizedEmail,
        password: sanitizedPassword,
        options: {
          emailRedirectTo: `${appUrl}/invite?token=${token}`,
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

      const acceptResult = await acceptInviteForUser(token, signupData.user.id);
      if (!acceptResult.success) {
        console.error('[Invite] Accept invite after signup error:', {
          error: acceptResult.error,
        });
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
        clinicId: acceptResult.clinicId,
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

    const acceptResult = await acceptInviteForUser(token, loginData.user.id);
    if (!acceptResult.success) {
      console.error('[Invite] Accept invite after login error:', {
        error: acceptResult.error,
      });
      return {
        success: false,
        errors: { _form: [acceptResult.error || '招待の受諾に失敗しました'] },
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
      clinicId: acceptResult.clinicId,
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

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
import {
  createAuthLog,
  getEmailDomainLogData,
  getSafeAuthErrorLogData,
} from '@/lib/auth/safe-auth-logging';
import {
  parseAtomicStaffInviteResult,
  validateStaffInviteAccount,
  type AtomicStaffInviteErrorCode,
  type StaffInviteAccountValidation,
} from '@/lib/auth/staff-invite';

/**
 * @file actions.ts
 * @description 招待受諾処理（Server Actions）
 * @spec docs/認証と権限制御_MVP仕様書.md
 */

const GENERIC_AUTH_ERROR_MESSAGE = 'システムエラーが発生しました';
const GENERIC_INVITE_ACCEPTANCE_ERROR = '招待の受諾に失敗しました';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const log = createAuthLog('InviteActions');

type AdminClient = ReturnType<typeof createAdminClient>;
type StaffInviteRow = Database['public']['Tables']['staff_invites']['Row'];

interface InviteAcceptanceResult {
  success: boolean;
  error?: string;
  clinicId?: string;
}

type ValidatedInvite = {
  invite: StaffInviteRow;
  validation: Extract<StaffInviteAccountValidation, { success: true }>;
};

type InviteValidationResult =
  | { success: true; value: ValidatedInvite }
  | { success: false; error: string };

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

function getInviteAcceptanceErrorMessage(
  errorCode: AtomicStaffInviteErrorCode
): string {
  switch (errorCode) {
    case 'INVITE_NOT_FOUND':
    case 'INVITE_EXPIRED':
      return '有効な招待が見つかりません';
    case 'INVITE_INVALID_ROLE':
      return 'この招待は無効です';
    case 'INVITE_EMAIL_MISMATCH':
    case 'INVITE_ACCOUNT_EMAIL_MISMATCH':
      return '招待先メールアドレスと現在のアカウントが一致しません';
    case 'INVITE_ALREADY_ACCEPTED':
      return 'この招待は既に受諾されています';
    case 'INVITE_ACCOUNT_NOT_FOUND':
    case 'INVITE_STATE_INVALID':
      return GENERIC_INVITE_ACCEPTANCE_ERROR;
  }
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
    log.error('Invite lookup error', getSafeAuthErrorLogData(error));
    throw new Error('招待情報の取得に失敗しました');
  }

  return data;
}

async function validateOpenInviteForAccount(
  adminClient: AdminClient,
  token: string,
  accountEmail: string | null | undefined
): Promise<InviteValidationResult> {
  const invite = await fetchOpenInvite(adminClient, token);
  if (!invite) {
    return { success: false, error: '有効な招待が見つかりません' };
  }

  const validation = validateStaffInviteAccount({
    inviteEmail: invite.email,
    inviteRole: invite.role,
    accountEmail,
  });

  if (validation.success === false) {
    if (validation.reason === 'invalid_role') {
      log.warn('Rejected invite with non-invitable role', {
        inviteId: invite.id,
      });
      return { success: false, error: 'この招待は無効です' };
    }

    return {
      success: false,
      error: '招待先メールアドレスと現在のアカウントが一致しません',
    };
  }

  return {
    success: true,
    value: { invite, validation },
  };
}

async function acceptInviteForUser(
  token: string,
  userId: string,
  accountEmail: string | null | undefined
): Promise<InviteAcceptanceResult> {
  if (!isUuid(token)) {
    return { success: false, error: '有効な招待が見つかりません' };
  }

  if (!isUuid(userId) || !accountEmail) {
    return { success: false, error: GENERIC_INVITE_ACCEPTANCE_ERROR };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('accept_staff_invite_atomic', {
    p_token: token,
    p_user_id: userId,
    p_account_email: accountEmail,
  });

  if (error) {
    log.error(
      'Atomic invite acceptance RPC failed',
      getSafeAuthErrorLogData(error)
    );
    return {
      success: false,
      error:
        error.code === 'PVI02'
          ? '有効な招待が見つかりません'
          : GENERIC_INVITE_ACCEPTANCE_ERROR,
    };
  }

  const result = parseAtomicStaffInviteResult(data);
  if (!result) {
    log.error('Atomic invite acceptance returned an invalid result', {
      hasResult: data !== null,
    });
    return { success: false, error: GENERIC_INVITE_ACCEPTANCE_ERROR };
  }

  if (result.success === false) {
    return {
      success: false,
      error: getInviteAcceptanceErrorMessage(result.errorCode),
    };
  }

  return {
    success: true,
    clinicId: result.clinicId,
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
      log.error(
        'Invite clinic lookup error',
        getSafeAuthErrorLogData(clinicError)
      );
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
    log.error('Get invite by token error', getSafeAuthErrorLogData(error));
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

    const result = await acceptInviteForUser(token, user.id, user.email);
    if (!result.success) {
      return {
        success: false,
        error: result.error || '招待の受諾に失敗しました',
      };
    }

    log.info('Invite accepted', {
      hasUser: true,
      hasClinic: Boolean(result.clinicId),
    });

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    log.error('Accept invite error', getSafeAuthErrorLogData(error));
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

    const invitePreflight = await validateOpenInviteForAccount(
      createAdminClient(),
      token,
      sanitizedEmail
    );
    if (invitePreflight.success === false) {
      return {
        success: false,
        errors: { _form: [invitePreflight.error] },
      };
    }

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
      log.warn('Invite signup failed', {
        ...getEmailDomainLogData(sanitizedEmail),
        ...getSafeAuthErrorLogData(signupError),
      });
      const errorMessage = signupError.message.includes('already registered')
        ? 'このメールアドレスは既に登録されています。ログインしてください。'
        : 'アカウントの作成に失敗しました';

      return {
        success: false,
        errors: { _form: [errorMessage] },
      };
    }

    if (!signupData.session) {
      return {
        success: true,
        message:
          '確認メールを送信しました。メールを確認してからログインしてください。',
      };
    }

    const {
      data: { user: verifiedUser },
      error: verifiedUserError,
    } = await supabase.auth.getUser();

    if (verifiedUserError || !verifiedUser?.email) {
      log.error(
        'Invite signup session verification failed',
        getSafeAuthErrorLogData(verifiedUserError)
      );
      return {
        success: false,
        errors: { _form: [GENERIC_INVITE_ACCEPTANCE_ERROR] },
      };
    }

    const acceptResult = await acceptInviteForUser(
      token,
      verifiedUser.id,
      verifiedUser.email
    );
    if (!acceptResult.success) {
      log.warn('Accept invite after signup failed', {
        reason: acceptResult.error,
      });
      return {
        success: false,
        errors: {
          _form: [acceptResult.error || GENERIC_INVITE_ACCEPTANCE_ERROR],
        },
      };
    }

    log.info('Signup and invite accepted', {
      hasUser: true,
      hasClinic: Boolean(acceptResult.clinicId),
    });

    revalidatePath('/', 'layout');
    redirect('/dashboard');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    log.error('Signup and accept invite error', getSafeAuthErrorLogData(error));
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

    const invitePreflight = await validateOpenInviteForAccount(
      createAdminClient(),
      token,
      sanitizedEmail
    );
    if (invitePreflight.success === false) {
      return {
        success: false,
        errors: { _form: [invitePreflight.error] },
      };
    }

    // 2. ログイン
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password: sanitizedPassword,
    });

    if (loginError) {
      log.warn('Invite login failed', {
        ...getEmailDomainLogData(sanitizedEmail),
        ...getSafeAuthErrorLogData(loginError),
      });
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

    const {
      data: { user: verifiedUser },
      error: verifiedUserError,
    } = await supabase.auth.getUser();

    if (verifiedUserError || !verifiedUser?.email) {
      log.error(
        'Invite login session verification failed',
        getSafeAuthErrorLogData(verifiedUserError)
      );
      return {
        success: false,
        errors: { _form: ['ログインに失敗しました'] },
      };
    }

    await AuditLogger.logLogin(
      verifiedUser.id,
      verifiedUser.email,
      ipAddress,
      userAgent
    );

    const acceptResult = await acceptInviteForUser(
      token,
      verifiedUser.id,
      verifiedUser.email
    );
    if (!acceptResult.success) {
      log.warn('Accept invite after login failed', {
        reason: acceptResult.error,
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
      .eq('user_id', verifiedUser.id);

    log.info('Login and invite accepted', {
      hasUser: true,
      hasClinic: Boolean(acceptResult.clinicId),
    });

    revalidatePath('/', 'layout');
    redirect('/dashboard');
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }
    log.error('Login and accept invite error', getSafeAuthErrorLogData(error));
    return {
      success: false,
      errors: { _form: [GENERIC_AUTH_ERROR_MESSAGE] },
    };
  }
}

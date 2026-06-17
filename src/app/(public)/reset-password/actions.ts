'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';
import {
  clearPasswordRecoveryIntent,
  readPasswordRecoveryIntent,
  validatePasswordRecoveryIntent,
} from '@/lib/auth/password-recovery-intent';
import {
  passwordRecoverySchema,
  sanitizeAuthInput,
  type PasswordRecoveryResponse,
} from '@/lib/schemas/auth';
import { getServerClient } from '@/lib/supabase';
import {
  createAuthLog,
  getSafeAuthErrorLogData,
} from '@/lib/auth/safe-auth-logging';

type ResetSource = 'admin' | 'clinic';

const SUCCESS_MESSAGE =
  'パスワードを更新しました。もう一度ログインしてください。';
const SESSION_MISSING_MESSAGE =
  '再設定リンクが無効か期限切れです。再度メールを送ってください。';
const PASSWORD_POLICY_MESSAGE =
  'パスワードがセキュリティ要件を満たしていません。入力内容を確認してください。';
const GENERIC_ERROR_MESSAGE =
  'パスワードの更新に失敗しました。しばらくしてから再度お試しください。';
const log = createAuthLog('ResetPasswordActions');

function normalizeSource(value: FormDataEntryValue | null): ResetSource {
  return value === 'admin' ? 'admin' : 'clinic';
}

function isRedirectLikeError(error: unknown): boolean {
  if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const digest = (error as { digest?: string }).digest;
    return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
  }

  return false;
}

function mapUpdateUserError(message?: string | null) {
  const normalized = (message ?? '').toLowerCase();

  if (
    normalized.includes('session') ||
    normalized.includes('token') ||
    normalized.includes('expired') ||
    normalized.includes('invalid')
  ) {
    return SESSION_MISSING_MESSAGE;
  }

  if (
    normalized.includes('password') ||
    normalized.includes('weak') ||
    normalized.includes('security')
  ) {
    return PASSWORD_POLICY_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}

export async function completePasswordRecovery(
  _: PasswordRecoveryResponse,
  formData: FormData
): Promise<PasswordRecoveryResponse> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress, userAgent } = getRequestInfoFromHeaders(headerList);

  const source = normalizeSource(formData.get('source'));
  const parsed = passwordRecoverySchema.safeParse({
    password:
      typeof formData.get('password') === 'string'
        ? formData.get('password')
        : '',
    confirmPassword:
      typeof formData.get('confirmPassword') === 'string'
        ? formData.get('confirmPassword')
        : '',
  });

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const password = sanitizeAuthInput(parsed.data.password);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const recoveryIntent = await readPasswordRecoveryIntent();

  if (!user || !validatePasswordRecoveryIntent(recoveryIntent, user.id)) {
    await clearPasswordRecoveryIntent();

    return {
      success: false,
      errors: {
        _form: [SESSION_MISSING_MESSAGE],
      },
    };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      return {
        success: false,
        errors: {
          _form: [mapUpdateUserError(error.message)],
        },
      };
    }

    await AuditLogger.logAdminAction(
      'recovery_session',
      'recovery_session',
      'password_reset_completed',
      undefined,
      { source, userAgent },
      ipAddress
    );

    await clearPasswordRecoveryIntent();
    await supabase.auth.signOut();

    const destination =
      source === 'admin'
        ? '/admin/login?message=password_reset_completed'
        : '/login?message=password_reset_completed';

    if (process.env.NODE_ENV === 'test') {
      return {
        success: true,
        message: SUCCESS_MESSAGE,
        redirectTo: destination,
      };
    }

    redirect(destination);
  } catch (error) {
    if (isRedirectLikeError(error)) {
      throw error;
    }

    log.error('Password recovery completion failed', {
      source,
      ...getSafeAuthErrorLogData(error),
    });
    return {
      success: false,
      errors: {
        _form: [GENERIC_ERROR_MESSAGE],
      },
    };
  }
}

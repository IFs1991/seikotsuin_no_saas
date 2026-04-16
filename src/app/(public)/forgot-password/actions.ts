'use server';

import { headers } from 'next/headers';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';
import { assertEnv } from '@/lib/env';
import {
  passwordResetSchema,
  sanitizeAuthInput,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { getServerClient } from '@/lib/supabase';

const GENERIC_PASSWORD_RESET_MESSAGE =
  'メールアドレスが登録されている場合、パスワード再設定用のメールを送信しました。受信トレイと迷惑メールフォルダをご確認ください。';

type ResetSource = 'admin' | 'clinic';

function normalizeSource(value: FormDataEntryValue | null): ResetSource {
  return value === 'admin' ? 'admin' : 'clinic';
}

function extractValues(formData: FormData) {
  const emailValue = formData.get('email');

  return {
    email: typeof emailValue === 'string' ? emailValue : '',
  };
}

export async function requestPasswordReset(
  _: AuthResponse,
  formData: FormData
): Promise<AuthResponse> {
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress, userAgent } = getRequestInfoFromHeaders(headerList);

  const source = normalizeSource(formData.get('source'));
  const parsed = passwordResetSchema.safeParse(extractValues(formData));

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = sanitizeAuthInput(parsed.data.email).toLowerCase();

  try {
    const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/admin/callback?next=/reset-password/${source}`,
    });

    if (error) {
      console.warn(
        '[Auth] Password reset request failed with non-enumeration response',
        {
          source,
          timestamp: new Date().toISOString(),
          ip: ipAddress,
        }
      );
    }

    await AuditLogger.logAdminAction(
      'anonymous',
      email,
      'password_reset_requested',
      undefined,
      {
        source,
        email,
        userAgent,
      },
      ipAddress
    );

    return {
      success: true,
      message: GENERIC_PASSWORD_RESET_MESSAGE,
    };
  } catch (error) {
    console.error('[Auth] Unexpected password reset error:', error);

    await AuditLogger.logAdminAction(
      'anonymous',
      email,
      'password_reset_requested',
      undefined,
      {
        source,
        email,
        userAgent,
        failed: true,
      },
      ipAddress
    );

    return {
      success: true,
      message: GENERIC_PASSWORD_RESET_MESSAGE,
    };
  }
}

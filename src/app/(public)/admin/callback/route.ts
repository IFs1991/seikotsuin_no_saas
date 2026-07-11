import { createClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { getSafeRedirectUrl, getDefaultRedirect } from '@/lib/url-validator';
import {
  createPasswordRecoveryIntent,
  getPasswordRecoveryIntentCookieOptions,
  PASSWORD_RECOVERY_INTENT_COOKIE,
} from '@/lib/auth/password-recovery-intent';
import {
  createAuthLog,
  getSafeAuthErrorLogData,
} from '@/lib/auth/safe-auth-logging';
import type { Database } from '@/types/supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
const log = createAuthLog('AdminCallbackRoute');

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');

  // セキュアなリダイレクト先を検証
  const safeRedirectUrl = getSafeRedirectUrl(nextParam, origin);
  const parsedSafeRedirectUrl = safeRedirectUrl
    ? new URL(safeRedirectUrl)
    : null;
  const safeRedirectPath = parsedSafeRedirectUrl?.pathname ?? null;
  const safeRedirectTarget = parsedSafeRedirectUrl
    ? `${parsedSafeRedirectUrl.pathname}${parsedSafeRedirectUrl.search}`
    : null;
  const isRecoveryRedirect = safeRedirectPath?.startsWith('/reset-password/');
  const isInviteRedirect = safeRedirectPath === '/invite';

  if (code) {
    const supabase = await createClient();

    try {
      const { error, data } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.user) {
        // ユーザー情報を取得して適切なリダイレクト先を決定
        const { data: profile } = await supabase
          .from('profiles')
          .select<
            'role, clinic_id',
            Pick<ProfileRow, 'role' | 'clinic_id'>
          >('role, clinic_id')
          .eq('user_id', data.user.id)
          .maybeSingle();

        const userRole = profile?.role ?? 'staff';
        const hasClinic = !!profile?.clinic_id;

        // recovery フローだけは clinic_id 未設定より優先して通す
        let finalRedirectPath: string;
        if ((isRecoveryRedirect || isInviteRedirect) && safeRedirectTarget) {
          finalRedirectPath = safeRedirectTarget;
        } else if (userRole === 'manager') {
          finalRedirectPath =
            safeRedirectTarget ?? getDefaultRedirect(userRole);
        } else if (!hasClinic) {
          finalRedirectPath = '/onboarding';
        } else if (safeRedirectTarget) {
          finalRedirectPath = safeRedirectTarget;
        } else {
          finalRedirectPath = getDefaultRedirect(userRole);
        }

        log.info('Authentication callback succeeded', {
          redirectPath: finalRedirectPath,
          isRecoveryRedirect,
        });

        const response = NextResponse.redirect(`${origin}${finalRedirectPath}`);

        if (isRecoveryRedirect && safeRedirectPath) {
          response.cookies.set(
            PASSWORD_RECOVERY_INTENT_COOKIE,
            createPasswordRecoveryIntent(data.user.id),
            getPasswordRecoveryIntentCookieOptions()
          );
        }

        return response;
      } else {
        log.warn('Authentication code exchange failed', {
          hasCode: true,
          ...getSafeAuthErrorLogData(error),
        });
      }
    } catch (error) {
      log.error(
        'Unexpected authentication callback error',
        getSafeAuthErrorLogData(error)
      );
    }
  } else {
    log.warn('No authorization code provided in callback');
  }

  // 認証失敗時は安全なエラーメッセージでリダイレクト
  const errorUrl = `${origin}/admin/login?error=auth_failed`;

  log.warn('Authentication callback failed', {
    hasCode: !!code,
    hasNextParam: nextParam !== null,
    hasSafeRedirect: safeRedirectUrl !== null,
    isRecoveryRedirect,
  });

  return NextResponse.redirect(errorUrl);
}

import { createClient, getUserAccessContext } from '@/lib/supabase';
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
import { clearRejectedAuthSession } from '@/lib/auth/session-cleanup';

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
    let sessionEstablished = false;

    try {
      const { error, data } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.user) {
        sessionEstablished = true;

        // Recovery/invite deliberately precede normal authorization because
        // those flows establish the profile/permission state themselves.
        let finalRedirectPath: string;
        if ((isRecoveryRedirect || isInviteRedirect) && safeRedirectTarget) {
          finalRedirectPath = safeRedirectTarget;
        } else {
          const accessContext = await getUserAccessContext(
            data.user.id,
            supabase,
            { user: data.user }
          );

          if (!accessContext.isActive || !accessContext.permissions) {
            const cleanup = await clearRejectedAuthSession(supabase);
            sessionEstablished = !cleanup.complete;
            if (cleanup.signOutError) {
              log.error(
                'Rejected callback session cleanup error',
                getSafeAuthErrorLogData(cleanup.signOutError)
              );
            }
            if (cleanup.cookieCleanupError) {
              log.error(
                'Rejected callback auth cookie cleanup error',
                getSafeAuthErrorLogData(cleanup.cookieCleanupError)
              );
            }
            throw new Error('Callback authorization rejected');
          }

          const userRole =
            accessContext.normalizedRole ?? accessContext.permissions.role;
          const hasClinic = accessContext.clinicId !== null;

          if (userRole === 'manager') {
            finalRedirectPath =
              safeRedirectTarget ?? getDefaultRedirect(userRole);
          } else if (!hasClinic) {
            finalRedirectPath = '/onboarding';
          } else if (safeRedirectTarget) {
            finalRedirectPath = safeRedirectTarget;
          } else {
            finalRedirectPath = getDefaultRedirect(userRole);
          }
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
      if (sessionEstablished) {
        const cleanup = await clearRejectedAuthSession(supabase);
        if (cleanup.signOutError) {
          log.error(
            'Callback session cleanup error',
            getSafeAuthErrorLogData(cleanup.signOutError)
          );
        }
        if (cleanup.cookieCleanupError) {
          log.error(
            'Callback auth cookie cleanup error',
            getSafeAuthErrorLogData(cleanup.cookieCleanupError)
          );
        }
      }
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

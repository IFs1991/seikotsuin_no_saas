import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { headers } from 'next/headers';
import { AuditLogger, getRequestInfoFromHeaders } from '@/lib/audit-logger';
import {
  readPasswordRecoveryIntent,
  validatePasswordRecoveryIntent,
} from '@/lib/auth/password-recovery-intent';
import { getServerClient } from '@/lib/supabase';
import { ResetPasswordForm } from './reset-password-form';

type ResetSource = 'admin' | 'clinic';

function normalizeSource(value: string): ResetSource {
  return value === 'admin' ? 'admin' : 'clinic';
}

function InvalidResetState({ source }: { source: ResetSource }) {
  const content =
    source === 'admin'
      ? {
          retryHref: '/forgot-password?source=admin',
          loginHref: '/admin/login',
          loginLabel: '管理者ログインへ戻る',
        }
      : {
          retryHref: '/forgot-password?source=clinic',
          loginHref: '/login',
          loginLabel: 'スタッフログインへ戻る',
        };

  return (
    <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl'>
      <div className='text-center'>
        <div className='w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-100'>
          <span className='text-red-600 text-2xl'>!</span>
        </div>
        <h1 className='text-2xl font-bold text-gray-900 mb-2'>
          リンクが無効です
        </h1>
        <p className='text-sm text-gray-500'>
          再設定リンクが無効か、すでに期限切れです。再度メールを送信してください。
        </p>
      </div>

      <div className='space-y-2 text-center'>
        <Link
          href={content.retryHref}
          className='text-sm font-medium text-slate-900 hover:text-slate-700 block'
        >
          再度メールを送る
        </Link>
        <Link
          href={content.loginHref}
          className='text-sm text-gray-600 hover:text-gray-500 block'
        >
          {content.loginLabel}
        </Link>
      </div>
    </Card>
  );
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source: rawSource } = await params;
  const source = normalizeSource(rawSource);
  const supabase = await getServerClient();
  const headerList = await headers();
  const { ipAddress, userAgent } = getRequestInfoFromHeaders(headerList);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const recoveryIntent = await readPasswordRecoveryIntent();
  const hasValidRecoveryIntent = user
    ? validatePasswordRecoveryIntent(recoveryIntent, user.id)
    : false;

  if (!user || !hasValidRecoveryIntent) {
    await AuditLogger.logAdminAction(
      'anonymous',
      'anonymous',
      'password_reset_invalid_link',
      undefined,
      {
        source,
        userAgent,
      },
      ipAddress
    );
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4'>
      {user && hasValidRecoveryIntent ? (
        <ResetPasswordForm source={source} />
      ) : (
        <InvalidResetState source={source} />
      )}
    </div>
  );
}

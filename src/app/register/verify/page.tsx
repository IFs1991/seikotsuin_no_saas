'use client';

/**
 * @file page.tsx
 * @description メール確認案内ページ（/register/verify）
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 5.2
 *
 * 再送仕様:
 * - クライアント側クールダウン: 60秒
 * - サーバー側: Supabase Auth レート制限に従う
 * - エラー文言は非列挙型（AC-03）
 */

import React, { Suspense, useState, useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { resendVerificationEmail } from '../actions';
import type { RegisterResponse } from '../schema';

const RESEND_COOLDOWN_SECONDS = 60;
const INITIAL_STATE: RegisterResponse = { success: true };

function VerifyContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [cooldown, setCooldown] = useState(0);

  const [resendState, resendAction, isResending] = useActionState<
    RegisterResponse,
    FormData
  >(resendVerificationEmail, INITIAL_STATE);

  // 再送後にクールダウン開始
  useEffect(() => {
    if (resendState !== INITIAL_STATE && resendState.success) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }, [resendState]);

  // カウントダウンタイマー
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const canResend = cooldown <= 0 && !isResending;

  const resendMessage =
    resendState !== INITIAL_STATE && 'message' in resendState
      ? resendState.message
      : null;

  const resendError =
    resendState !== INITIAL_STATE &&
    !resendState.success &&
    'errors' in resendState
      ? (resendState.errors as Record<string, string[]>)._form?.[0]
      : null;

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl text-center'>
        {/* アイコン */}
        <div className='w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto'>
          <span className='text-3xl'>✉️</span>
        </div>

        {/* 見出し */}
        <div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>
            確認メールを送信しました
          </h1>
          {email ? (
            <p className='text-gray-600 text-sm'>
              <span className='font-medium text-gray-800'>{email}</span>{' '}
              に確認メールを送信しました。
            </p>
          ) : (
            <p className='text-gray-600 text-sm'>
              ご登録のメールアドレスに確認メールを送信しました。
            </p>
          )}
          <p className='text-gray-500 text-sm mt-2'>
            メールが届かない場合は迷惑メールフォルダもご確認ください。
          </p>
        </div>

        {/* 再送フィードバック */}
        {resendMessage && (
          <div className='bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm'>
            {resendMessage}
          </div>
        )}
        {resendError && (
          <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm'>
            {resendError}
          </div>
        )}

        {/* 再送フォーム */}
        <form action={resendAction}>
          {email && <input type='hidden' name='email' value={email} />}
          <Button
            type='submit'
            disabled={!canResend}
            variant='outline'
            className='w-full'
          >
            {isResending
              ? '送信中...'
              : cooldown > 0
                ? `メールを再送する（${cooldown}秒後に再試行可能）`
                : 'メールを再送する'}
          </Button>
        </form>

        {/* ログインに戻る */}
        <div>
          <Link
            href='/admin/login'
            className='text-sm text-blue-600 hover:text-blue-500'
          >
            管理者ログインへ戻る
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600' />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

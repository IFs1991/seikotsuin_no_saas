'use client';

/**
 * @file page.tsx
 * @description 管理者ログインページ（ログイン専用）
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 4, AC-04
 *
 * 変更点 (v0.2):
 * - signup トグル削除（新規登録は /register 専用ページへ）
 * - /register への導線を追加
 */

import React, { Suspense, useState, useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { login } from '../actions';
import { loginSchema, type AuthResponse } from '@/lib/schemas/auth';

function AdminLoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const searchParams = useSearchParams();

  const [loginState, loginAction, isLoginPending] = useActionState<
    AuthResponse,
    FormData
  >(login, { success: true });

  // URL パラメータからメッセージを取得
  useEffect(() => {
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    if (error === 'auth_failed') {
      setClientErrors({ _form: '認証に失敗しました。再度お試しください。' });
    } else if (message) {
      setClientErrors({ _success: message });
    }
  }, [searchParams]);

  // サーバーエラー反映
  useEffect(() => {
    if (!loginState.success && 'errors' in loginState) {
      const normalized = Object.fromEntries(
        Object.entries(loginState.errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? (value[0] ?? '') : (value ?? ''),
        ])
      );
      setClientErrors(normalized);
    } else if (
      loginState.success &&
      'message' in loginState &&
      loginState.message
    ) {
      setClientErrors({ _success: loginState.message });
    }
  }, [loginState]);

  const handleSubmit = (e: React.FormEvent) => {
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      e.preventDefault();
      const errs: Record<string, string> = {};
      result.error.errors.forEach(err => {
        const field = err.path[0] as string;
        if (!errs[field]) errs[field] = err.message;
      });
      setClientErrors(errs);
    }
  };

  const serverFormErrors =
    !loginState.success && 'errors' in loginState ? loginState.errors : null;

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl'>
        <div className='text-center'>
          <div className='w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4'>
            <span className='text-white font-bold text-2xl'>骨</span>
          </div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>
            管理者ログイン
          </h1>
          <p className='text-gray-600'>システム管理画面にアクセス</p>
        </div>

        <form
          onSubmit={handleSubmit}
          action={loginAction}
          className='space-y-4'
        >
          {/* メールアドレス */}
          <div>
            <label
              htmlFor='login-email'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              メールアドレス <span className='text-red-500'>*</span>
            </label>
            <Input
              id='login-email'
              type='email'
              name='email'
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (clientErrors.email) {
                  try {
                    loginSchema.shape.email.parse(e.target.value);
                    setClientErrors(prev => ({ ...prev, email: '' }));
                  } catch {
                    // バリデーションエラーは無視
                  }
                }
              }}
              placeholder='admin@clinic.com'
              required
              autoComplete='email'
              className={clientErrors.email ? 'border-red-500' : ''}
            />
            {clientErrors.email && (
              <p className='text-red-500 text-sm mt-1'>{clientErrors.email}</p>
            )}
          </div>

          {/* パスワード */}
          <div>
            <label
              htmlFor='login-password'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              パスワード <span className='text-red-500'>*</span>
            </label>
            <div className='relative'>
              <Input
                id='login-password'
                type={showPassword ? 'text' : 'password'}
                name='password'
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (clientErrors.password) {
                    setClientErrors(prev => ({ ...prev, password: '' }));
                  }
                }}
                placeholder='パスワードを入力'
                required
                autoComplete='current-password'
                className={`pr-10 ${clientErrors.password ? 'border-red-500' : ''}`}
              />
              <button
                type='button'
                onClick={() => setShowPassword(s => !s)}
                className='absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600'
                aria-label={
                  showPassword ? 'パスワードを隠す' : 'パスワードを表示する'
                }
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {clientErrors.password && (
              <p className='text-red-500 text-sm mt-1'>
                {clientErrors.password}
              </p>
            )}
          </div>

          {/* フォームレベルのメッセージ */}
          {(clientErrors._form || clientErrors._success) && (
            <div
              className={`border px-4 py-3 rounded-md text-sm ${
                clientErrors._success
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {clientErrors._form || clientErrors._success}
            </div>
          )}

          {serverFormErrors?._form && (
            <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm'>
              {Array.isArray(serverFormErrors._form)
                ? serverFormErrors._form.join(', ')
                : serverFormErrors._form}
            </div>
          )}

          <Button
            type='submit'
            disabled={isLoginPending}
            className='w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2.5'
          >
            {isLoginPending ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        {/* /register への導線 (AC-04) */}
        <div className='text-center space-y-2'>
          <p className='text-sm text-gray-600'>
            アカウントをお持ちでない場合は{' '}
            <Link
              href='/register'
              className='text-blue-600 hover:text-blue-500 font-medium'
            >
              新規登録はこちら
            </Link>
          </p>
          <p className='text-xs text-gray-400'>
            スタッフの方は管理者からの招待メールをご確認ください
          </p>
        </div>

        <div className='text-center text-sm text-gray-500'>
          <p>🔒 エンタープライズグレードのセキュリティ</p>
        </div>
      </Card>
    </div>
  );
}

export default function AdminLogin() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600' />
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}

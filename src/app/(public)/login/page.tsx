'use client';

import React, { Suspense, useState, useActionState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { clinicLogin } from './actions';
import { loginSchema, type AuthResponse } from '@/lib/schemas/auth';

/**
 * @file page.tsx
 * @description 院向けログインページ
 * @spec docs/認証と権限制御_MVP仕様書.md
 */
function ClinicLoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const searchParams = useSearchParams();

  // Server Actions用のstate
  const [loginState, loginAction, isLoginPending] = useActionState<
    AuthResponse,
    FormData
  >(clinicLogin, { success: true });

  // URL パラメータからエラーメッセージを取得
  useEffect(() => {
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    if (error === 'auth_failed') {
      setClientErrors({ _form: '認証に失敗しました。再度お試しください。' });
    } else if (message) {
      setClientErrors({ _success: message });
    }
  }, [searchParams]);

  // クライアント側バリデーション
  const validateClientSide = () => {
    const errors: Record<string, string> = {};

    try {
      loginSchema.parse({ email, password });
      setClientErrors({});
      return true;
    } catch (error: any) {
      error.errors.forEach((err: any) => {
        errors[err.path[0]] = err.message;
      });
      setClientErrors(errors);
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (!validateClientSide()) {
      e.preventDefault();
    }
  };

  // Server Action の結果処理
  useEffect(() => {
    if (!loginState.success && 'errors' in loginState) {
      const normalizedErrors = Object.fromEntries(
        Object.entries(loginState.errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? (value[0] ?? '') : (value ?? ''),
        ])
      );
      setClientErrors(normalizedErrors);
    } else if (
      loginState.success &&
      'message' in loginState &&
      loginState.message
    ) {
      setClientErrors({ _success: loginState.message });
    }
  }, [loginState]);

  const serverFormErrors =
    !loginState.success && 'errors' in loginState ? loginState.errors : null;

  return (
    <div className='min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl'>
        <div className='text-center'>
          <div className='w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-4'>
            <span className='text-white font-bold text-2xl'>骨</span>
          </div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>
            スタッフログイン
          </h1>
          <p className='text-gray-600'>院スタッフ専用ログイン</p>
        </div>

        <form
          onSubmit={handleSubmit}
          action={loginAction}
          className='space-y-4'
        >
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              メールアドレス <span className='text-red-500'>*</span>
            </label>
            <Input
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
                    // Zod validation error intentionally ignored
                  }
                }
              }}
              placeholder='staff@clinic.com'
              required
              className={`w-full ${clientErrors.email ? 'border-red-500' : ''}`}
              autoComplete='email'
            />
            {clientErrors.email && (
              <p className='text-red-500 text-sm mt-1'>{clientErrors.email}</p>
            )}
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              パスワード <span className='text-red-500'>*</span>
            </label>
            <div className='relative'>
              <Input
                type={showPassword ? 'text' : 'password'}
                name='password'
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (clientErrors.password) {
                    try {
                      loginSchema.shape.password.parse(e.target.value);
                      setClientErrors(prev => ({ ...prev, password: '' }));
                    } catch {
                      // Zod validation error intentionally ignored
                    }
                  }
                }}
                placeholder='パスワードを入力'
                required
                className={`w-full pr-10 ${clientErrors.password ? 'border-red-500' : ''}`}
                autoComplete='current-password'
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                className='absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600'
                aria-label={
                  showPassword ? 'パスワードを隠す' : 'パスワードを表示'
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

          {/* エラーメッセージ表示 */}
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

          {/* サーバーサイドエラー表示 */}
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
            className='w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white py-2.5'
          >
            {isLoginPending ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        <div className='text-center space-y-2'>
          <p className='text-sm text-gray-500'>
            招待を受けた方は招待メールのリンクからご登録ください
          </p>
          <p className='text-sm text-gray-600'>
            初めてご利用の方は{' '}
            <Link
              href='/register'
              className='text-teal-600 hover:text-teal-500 font-medium'
            >
              新規登録はこちら
            </Link>
          </p>
          <Link
            href='/admin/login'
            className='text-sm text-teal-600 hover:text-teal-500 block'
          >
            管理者の方はこちら
          </Link>
        </div>

        <div className='text-center text-sm text-gray-500'>
          <p>整骨院管理システム</p>
        </div>
      </Card>
    </div>
  );
}

export default function ClinicLoginPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600' />
        </div>
      }
    >
      <ClinicLoginPageContent />
    </Suspense>
  );
}

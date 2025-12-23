'use client';

import React, { useState, useActionState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { login, signup } from '../actions';
import {
  loginSchema,
  signupSchema,
  getPasswordStrength,
} from '@/lib/schemas/auth';
import type { AuthResponse } from '@/lib/schemas/auth';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [isSignUp, setIsSignUp] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    feedback: string[];
  }>({
    score: 0,
    feedback: [],
  });
  const [showPassword, setShowPassword] = useState(false);

  const searchParams = useSearchParams();

  // Server Actions用のstate
  const [loginState, loginAction, isLoginPending] = useActionState<
    AuthResponse,
    FormData
  >(login, { success: true });
  const [signupState, signupAction, isSignupPending] = useActionState<
    AuthResponse,
    FormData
  >(signup, { success: true });

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

  // パスワード強度をリアルタイム計算
  useEffect(() => {
    if (isSignUp && password) {
      setPasswordStrength(getPasswordStrength(password));
    }
  }, [password, isSignUp]);

  // クライアント側バリデーション
  const validateClientSide = () => {
    const errors: Record<string, string> = {};

    try {
      const schema = isSignUp ? signupSchema : loginSchema;
      schema.parse({ email, password });
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
    // クライアント側検証
    if (!validateClientSide()) {
      e.preventDefault();
    }
  };

  // Server Action の結果処理
  useEffect(() => {
    const state = isSignUp ? signupState : loginState;

    if (!state.success && 'errors' in state) {
      const normalizedErrors = Object.fromEntries(
        Object.entries(state.errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? value[0] ?? '' : value ?? '',
        ])
      );
      setClientErrors(normalizedErrors);
    } else if (state.success && 'message' in state && state.message) {
      setClientErrors({ _success: state.message });
    }
  }, [loginState, signupState, isSignUp]);

  const isLoading = isLoginPending || isSignupPending;
  const activeActionState = isSignUp ? signupState : loginState;
  const serverFormErrors =
    !activeActionState.success && 'errors' in activeActionState
      ? activeActionState.errors
      : null;

  const getPasswordStrengthColor = (score: number) => {
    if (score < 2) return 'bg-red-500';
    if (score < 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getPasswordStrengthText = (score: number) => {
    if (score < 2) return '弱い';
    if (score < 4) return '普通';
    return '強い';
  };

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
          action={isSignUp ? signupAction : loginAction}
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
                // リアルタイム検証
                if (clientErrors.email) {
                  try {
                    const schema = isSignUp ? signupSchema : loginSchema;
                    schema.shape.email.parse(e.target.value);
                    setClientErrors(prev => ({ ...prev, email: '' }));
                  } catch {}
                }
              }}
              placeholder='admin@clinic.com'
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
                  // リアルタイム検証
                  if (clientErrors.password) {
                    try {
                      const schema = isSignUp ? signupSchema : loginSchema;
                      schema.shape.password.parse(e.target.value);
                      setClientErrors(prev => ({ ...prev, password: '' }));
                    } catch {}
                  }
                }}
                placeholder={
                  isSignUp
                    ? '8文字以上、大小文字・数字・記号を含む'
                    : 'パスワードを入力'
                }
                required
                className={`w-full pr-10 ${clientErrors.password ? 'border-red-500' : ''}`}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                className='absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600'
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {clientErrors.password && (
              <p className='text-red-500 text-sm mt-1'>
                {clientErrors.password}
              </p>
            )}

            {/* パスワード強度インジケーター（サインアップ時のみ） */}
            {isSignUp && password && (
              <div className='mt-2'>
                <div className='flex items-center space-x-2'>
                  <div className='flex-1 bg-gray-200 rounded-full h-2'>
                    <div
                      className={`h-2 rounded-full transition-all ${getPasswordStrengthColor(passwordStrength.score)}`}
                      style={{
                        width: `${(passwordStrength.score / 4) * 100}%`,
                      }}
                    />
                  </div>
                  <span className='text-xs text-gray-500'>
                    {getPasswordStrengthText(passwordStrength.score)}
                  </span>
                </div>
                {passwordStrength.feedback.length > 0 && (
                  <ul className='text-xs text-gray-500 mt-1 space-y-1'>
                    {passwordStrength.feedback.map((feedback, index) => (
                      <li key={index}>• {feedback}</li>
                    ))}
                  </ul>
                )}
              </div>
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
            disabled={isLoading || (isSignUp && passwordStrength.score < 2)}
            className='w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2.5'
          >
            {isLoading
              ? isSignUp
                ? 'アカウント作成中...'
                : 'ログイン中...'
              : isSignUp
                ? 'アカウント作成'
                : 'ログイン'}
          </Button>
        </form>

        <div className='text-center'>
          <button
            type='button'
            onClick={() => {
              setIsSignUp(!isSignUp);
              setClientErrors({});
              setPassword('');
            }}
            className='text-sm text-blue-600 hover:text-blue-500'
            disabled={isLoading}
          >
            {isSignUp
              ? 'すでにアカウントをお持ちですか？ログイン'
              : 'アカウントをお持ちでない場合は？新規作成'}
          </button>
        </div>

        <div className='text-center text-sm text-gray-500'>
          <p>🔒 エンタープライズグレードのセキュリティ</p>
          <p>Supabase + Zod による堅牢な認証システム</p>
        </div>
      </Card>
    </div>
  );
}

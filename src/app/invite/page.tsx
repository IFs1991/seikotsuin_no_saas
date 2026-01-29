'use client';

import React, { useState, useEffect, useActionState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  getInviteByToken,
  acceptInvite,
  signupAndAcceptInvite,
  loginAndAcceptInvite,
  type InviteInfo,
} from './actions';
import {
  signupSchema,
  loginSchema,
  getPasswordStrength,
  type AuthResponse,
} from '@/lib/schemas/auth';
import { createClient } from '@/lib/supabase/client';

/**
 * @file page.tsx
 * @description 招待受諾ページ
 * @spec docs/認証と権限制御_MVP仕様書.md
 */
export default function InvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLogin, setIsLogin] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    feedback: string[];
  }>({ score: 0, feedback: [] });

  // Server Actions
  const [signupState, signupAction, isSignupPending] = useActionState<
    AuthResponse,
    FormData
  >(signupAndAcceptInvite, { success: true });

  const [loginState, loginAction, isLoginPending] = useActionState<
    AuthResponse,
    FormData
  >(loginAndAcceptInvite, { success: true });

  // 招待情報を取得
  useEffect(() => {
    async function fetchInvite() {
      if (!token) {
        setError('招待トークンが必要です');
        setLoading(false);
        return;
      }

      const result = await getInviteByToken(token);
      if (result.success && result.invite) {
        setInvite(result.invite);
        setEmail(result.invite.email);
      } else {
        setError(result.error || '招待情報の取得に失敗しました');
      }
      setLoading(false);
    }

    fetchInvite();
  }, [token]);

  // 認証状態をチェック
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    }

    checkAuth();
  }, []);

  // 認証済みユーザーの招待受諾
  const handleAcceptInvite = async () => {
    if (!token) return;

    setLoading(true);
    const result = await acceptInvite(token);
    if (result.success) {
      router.push('/dashboard');
    } else {
      setError(result.error || '招待の受諾に失敗しました');
    }
    setLoading(false);
  };

  // パスワード強度計算
  useEffect(() => {
    if (!isLogin && password) {
      setPasswordStrength(getPasswordStrength(password));
    }
  }, [password, isLogin]);

  // クライアント側バリデーション
  const validateClientSide = () => {
    const errors: Record<string, string> = {};

    try {
      const schema = isLogin ? loginSchema : signupSchema;
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
    if (!validateClientSide()) {
      e.preventDefault();
    }
  };

  // Server Action の結果処理
  useEffect(() => {
    const state = isLogin ? loginState : signupState;
    if (!state.success && 'errors' in state) {
      const normalizedErrors = Object.fromEntries(
        Object.entries(state.errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? (value[0] ?? '') : (value ?? ''),
        ])
      );
      setClientErrors(normalizedErrors);
    } else if (state.success && 'message' in state && state.message) {
      setClientErrors({ _success: state.message });
    }
  }, [loginState, signupState, isLogin]);

  const isLoading = isSignupPending || isLoginPending;
  const activeState = isLogin ? loginState : signupState;
  const serverFormErrors =
    !activeState.success && 'errors' in activeState ? activeState.errors : null;

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

  // ローディング表示
  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4'>
        <Card className='w-full max-w-md p-8 text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto' />
          <p className='mt-4 text-gray-600'>招待情報を確認中...</p>
        </Card>
      </div>
    );
  }

  // エラー表示（招待が見つからない場合）
  if (error && !invite) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4'>
        <Card className='w-full max-w-md p-8 text-center'>
          <div className='w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4'>
            <span className='text-red-600 text-3xl'>!</span>
          </div>
          <h1 className='text-xl font-bold text-gray-900 mb-2'>
            招待が見つかりません
          </h1>
          <p className='text-gray-600 mb-4'>{error}</p>
          <Button
            onClick={() => router.push('/login')}
            className='bg-teal-600 hover:bg-teal-700 text-white'
          >
            ログインページへ
          </Button>
        </Card>
      </div>
    );
  }

  // 認証済みユーザー向け表示
  if (isAuthenticated && invite) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4'>
        <Card className='w-full max-w-md p-8 space-y-6'>
          <div className='text-center'>
            <div className='w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4'>
              <span className='text-teal-600 text-2xl'>✉️</span>
            </div>
            <h1 className='text-2xl font-bold text-gray-900 mb-2'>
              招待を受諾
            </h1>
            <p className='text-gray-600'>
              {invite.clinic_name} への招待があります
            </p>
          </div>

          <div className='bg-gray-50 rounded-lg p-4 space-y-2'>
            <p className='text-sm text-gray-600'>
              <span className='font-medium'>クリニック:</span>{' '}
              {invite.clinic_name}
            </p>
            <p className='text-sm text-gray-600'>
              <span className='font-medium'>役割:</span> {invite.role}
            </p>
            <p className='text-sm text-gray-600'>
              <span className='font-medium'>招待先メール:</span> {invite.email}
            </p>
          </div>

          {error && (
            <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm'>
              {error}
            </div>
          )}

          <Button
            onClick={handleAcceptInvite}
            disabled={loading}
            className='w-full bg-teal-600 hover:bg-teal-700 text-white'
          >
            {loading ? '処理中...' : '招待を受諾する'}
          </Button>
        </Card>
      </div>
    );
  }

  // 未認証ユーザー向け（サインアップ/ログインフォーム）
  return (
    <div className='min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md p-8 space-y-6'>
        <div className='text-center'>
          <div className='w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-4'>
            <span className='text-white font-bold text-2xl'>骨</span>
          </div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>招待を受諾</h1>
          <p className='text-gray-600'>
            {invite?.clinic_name} への招待があります
          </p>
        </div>

        {invite && (
          <div className='bg-gray-50 rounded-lg p-4 space-y-2'>
            <p className='text-sm text-gray-600'>
              <span className='font-medium'>クリニック:</span>{' '}
              {invite.clinic_name}
            </p>
            <p className='text-sm text-gray-600'>
              <span className='font-medium'>役割:</span> {invite.role}
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          action={isLogin ? loginAction : signupAction}
          className='space-y-4'
        >
          <input type='hidden' name='token' value={token || ''} />

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              メールアドレス <span className='text-red-500'>*</span>
            </label>
            <Input
              type='email'
              name='email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder='your@email.com'
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
                onChange={e => setPassword(e.target.value)}
                placeholder={
                  isLogin
                    ? 'パスワードを入力'
                    : '8文字以上、大小文字・数字・記号を含む'
                }
                required
                className={`w-full pr-10 ${clientErrors.password ? 'border-red-500' : ''}`}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
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
            {!isLogin && password && (
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

          {serverFormErrors?._form && (
            <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm'>
              {Array.isArray(serverFormErrors._form)
                ? serverFormErrors._form.join(', ')
                : serverFormErrors._form}
            </div>
          )}

          <Button
            type='submit'
            disabled={isLoading || (!isLogin && passwordStrength.score < 2)}
            className='w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white py-2.5'
          >
            {isLoading
              ? isLogin
                ? 'ログイン中...'
                : 'アカウント作成中...'
              : isLogin
                ? 'ログインして招待を受諾'
                : 'アカウント作成して招待を受諾'}
          </Button>
        </form>

        <div className='text-center'>
          <button
            type='button'
            onClick={() => {
              setIsLogin(!isLogin);
              setClientErrors({});
              setPassword('');
            }}
            className='text-sm text-teal-600 hover:text-teal-500'
            disabled={isLoading}
          >
            {isLogin
              ? 'アカウントをお持ちでない場合は？新規作成'
              : 'すでにアカウントをお持ちですか？ログイン'}
          </button>
        </div>

        <div className='text-center text-sm text-gray-500'>
          <p>整骨院管理システム</p>
        </div>
      </Card>
    </div>
  );
}

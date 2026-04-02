'use client';

/**
 * @file page.tsx
 * @description 初回オーナー登録ページ
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 5.1
 *
 * 設計原則:
 * - 1画面1目的（登録のみ）
 * - 必須入力3項目（email / password / termsAccepted）
 * - confirmPassword は不要（v0.2 より削除）
 * - 送信中はボタン disabled
 * - エラー文言はセキュア・非列挙型
 */

import React, { useState, useActionState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { LegalFooterLinks } from '@/components/legal/legal-footer-links';
import { registerOwner } from './actions';
import { registerSchema, type RegisterResponse } from './schema';
import { getPasswordStrength } from '@/lib/schemas/auth';

const INITIAL_STATE: RegisterResponse = { success: true };

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    feedback: string[];
  }>({ score: 0, feedback: [] });

  const [state, formAction, isPending] = useActionState<
    RegisterResponse,
    FormData
  >(registerOwner, INITIAL_STATE);

  // パスワード強度をリアルタイム計算
  useEffect(() => {
    if (password) {
      setPasswordStrength(getPasswordStrength(password));
    }
  }, [password]);

  // サーバーエラーをクライアント状態にマージ
  useEffect(() => {
    if (!state.success && 'errors' in state) {
      const errs = state.errors as Record<string, string[] | undefined>;
      const normalized = Object.fromEntries(
        Object.entries(errs).map(([k, v]) => [
          k,
          Array.isArray(v) ? (v[0] ?? '') : '',
        ])
      );
      setClientErrors(normalized);
    }
  }, [state]);

  // クライアントサイドバリデーション
  const validateField = (field: string, value: string | boolean) => {
    const partial = { email, password, termsAccepted, [field]: value };
    const result = registerSchema.safeParse(partial);
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors;
      const msg = (errs as Record<string, string[]>)[field]?.[0];
      if (msg) {
        setClientErrors(prev => ({ ...prev, [field]: msg }));
      }
    } else {
      setClientErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    // クライアント側の最終バリデーション
    const result = registerSchema.safeParse({ email, password, termsAccepted });
    if (!result.success) {
      e.preventDefault();
      const errs = result.error.flatten().fieldErrors;
      const normalized = Object.fromEntries(
        Object.entries(errs).map(([k, v]) => [k, (v as string[])[0] ?? ''])
      );
      setClientErrors(normalized);
    }
  };

  const getStrengthColor = (score: number) => {
    if (score < 2) return 'bg-red-500';
    if (score < 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthLabel = (score: number) => {
    if (score < 2) return '弱い';
    if (score < 4) return '普通';
    return '強い';
  };

  const hasFormError =
    !state.success &&
    'errors' in state &&
    (state.errors as Record<string, unknown>)._form;
  const formErrorMsg = hasFormError
    ? ((state.errors as Record<string, string[]>)._form?.[0] ?? '')
    : (clientErrors._form ?? '');

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl'>
        {/* ヘッダー */}
        <div className='text-center'>
          <div className='w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4'>
            <span className='text-white font-bold text-2xl'>骨</span>
          </div>
          <h1 className='text-2xl font-bold text-gray-900 mb-1'>
            無料で始める
          </h1>
          <p className='text-sm text-gray-500'>整骨院・サロン管理SaaS</p>
        </div>

        {/* フォーム全体エラー */}
        {formErrorMsg && (
          <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm'>
            {formErrorMsg}
          </div>
        )}

        <form action={formAction} onSubmit={handleSubmit} className='space-y-4'>
          {/* メールアドレス */}
          <div>
            <label
              htmlFor='register-email'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              メールアドレス <span className='text-red-500'>*</span>
            </label>
            <Input
              id='register-email'
              type='email'
              name='email'
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                validateField('email', e.target.value);
              }}
              placeholder='owner@yourclinic.com'
              required
              autoComplete='email'
              className={clientErrors.email ? 'border-red-500' : ''}
              aria-describedby={
                clientErrors.email ? 'register-email-error' : undefined
              }
            />
            {clientErrors.email && (
              <p
                id='register-email-error'
                className='text-red-500 text-sm mt-1'
              >
                {clientErrors.email}
              </p>
            )}
          </div>

          {/* パスワード */}
          <div>
            <label
              htmlFor='register-password'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              パスワード <span className='text-red-500'>*</span>
            </label>
            <div className='relative'>
              <Input
                id='register-password'
                type={showPassword ? 'text' : 'password'}
                name='password'
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  validateField('password', e.target.value);
                }}
                placeholder='8文字以上・大小文字・数字・記号を含む'
                required
                autoComplete='new-password'
                className={`pr-10 ${clientErrors.password ? 'border-red-500' : ''}`}
                aria-describedby={
                  clientErrors.password ? 'register-password-error' : undefined
                }
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
              <p
                id='register-password-error'
                className='text-red-500 text-sm mt-1'
              >
                {clientErrors.password}
              </p>
            )}

            {/* パスワード強度インジケーター */}
            {password && (
              <div className='mt-2'>
                <div className='flex items-center space-x-2'>
                  <div className='flex-1 bg-gray-200 rounded-full h-2'>
                    <div
                      className={`h-2 rounded-full transition-all ${getStrengthColor(passwordStrength.score)}`}
                      style={{
                        width: `${(passwordStrength.score / 5) * 100}%`,
                      }}
                    />
                  </div>
                  <span className='text-xs text-gray-500'>
                    {getStrengthLabel(passwordStrength.score)}
                  </span>
                </div>
                {passwordStrength.feedback.length > 0 && (
                  <ul className='text-xs text-gray-500 mt-1 space-y-0.5'>
                    {passwordStrength.feedback.map((fb, i) => (
                      <li key={i}>• {fb}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 利用規約同意 */}
          <div>
            <label
              htmlFor='register-terms'
              className='flex items-start gap-2 cursor-pointer'
            >
              <input
                id='register-terms'
                type='checkbox'
                name='termsAccepted'
                value='on'
                checked={termsAccepted}
                onChange={e => {
                  setTermsAccepted(e.target.checked);
                  validateField('termsAccepted', e.target.checked);
                }}
                className='mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                aria-describedby={
                  clientErrors.termsAccepted
                    ? 'register-terms-error'
                    : undefined
                }
              />
              <span className='text-sm text-gray-700'>
                <span>利用規約に同意する</span>
                <span className='text-red-500 ml-1'>*</span>
              </span>
            </label>
            <p className='ml-6 mt-1 text-xs text-gray-500'>
              同意前に{' '}
              <Link
                href='/terms'
                className='text-blue-600 hover:text-blue-500 hover:underline'
              >
                利用規約
              </Link>{' '}
              をご確認ください。
            </p>
            {clientErrors.termsAccepted && (
              <p
                id='register-terms-error'
                className='text-red-500 text-sm mt-1 ml-6'
              >
                {clientErrors.termsAccepted}
              </p>
            )}
          </div>

          {/* 送信ボタン */}
          <Button
            type='submit'
            disabled={isPending || passwordStrength.score < 2}
            className='w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2.5 font-semibold'
          >
            {isPending ? '登録中...' : '無料で始める'}
          </Button>
        </form>

        {/* 補助文・副CTA */}
        <div className='space-y-3 text-center'>
          <p className='text-xs text-gray-500'>
            スタッフ登録は招待制です。管理者から招待メールをご確認ください。
          </p>
          <LegalFooterLinks className='text-xs text-gray-500' />
          <p className='text-sm text-gray-600'>
            すでにアカウントをお持ちの場合は{' '}
            <Link
              href='/admin/login'
              className='text-blue-600 hover:text-blue-500 font-medium'
            >
              管理者ログインはこちら
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}

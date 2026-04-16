'use client';

import React, { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getPasswordStrength,
  passwordRecoverySchema,
  type PasswordRecoveryResponse,
} from '@/lib/schemas/auth';
import { completePasswordRecovery } from '../actions';

type ResetSource = 'admin' | 'clinic';

const INITIAL_STATE: PasswordRecoveryResponse = { success: true };

export function ResetPasswordForm({ source }: { source: ResetSource }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: [] as string[],
  });

  const [state, formAction, isPending] = useActionState<
    PasswordRecoveryResponse,
    FormData
  >(completePasswordRecovery, INITIAL_STATE);

  useEffect(() => {
    if (password) {
      setPasswordStrength(getPasswordStrength(password));
    } else {
      setPasswordStrength({ score: 0, feedback: [] });
    }
  }, [password]);

  useEffect(() => {
    if (!state.success && 'errors' in state) {
      const normalized = Object.fromEntries(
        Object.entries(state.errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? (value[0] ?? '') : (value ?? ''),
        ])
      );
      setClientErrors(normalized);
    }
  }, [state]);

  const links =
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

  const validateClientSide = () => {
    const result = passwordRecoverySchema.safeParse({
      password,
      confirmPassword,
    });

    if (result.success) {
      setClientErrors(prev => {
        const next = { ...prev };
        delete next.password;
        delete next.confirmPassword;
        delete next._form;
        return next;
      });
      return true;
    }

    const normalized = Object.fromEntries(
      Object.entries(result.error.flatten().fieldErrors).map(([key, value]) => [
        key,
        Array.isArray(value) ? (value[0] ?? '') : '',
      ])
    ) as Record<string, string>;
    setClientErrors(prev => ({ ...prev, ...normalized }));
    return false;
  };

  const getStrengthColor = (score: number) => {
    if (score < 2) return 'bg-red-500';
    if (score < 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleSubmit = (event: React.FormEvent) => {
    if (!validateClientSide()) {
      event.preventDefault();
    }
  };

  return (
    <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl'>
      <div className='text-center'>
        <div className='w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-slate-900'>
          <span className='text-white font-bold text-2xl'>骨</span>
        </div>
        <h1 className='text-2xl font-bold text-gray-900 mb-2'>
          新しいパスワードを設定
        </h1>
        <p className='text-sm text-gray-500'>
          新しいパスワードを入力して再設定を完了してください。
        </p>
      </div>

      <form action={formAction} onSubmit={handleSubmit} className='space-y-4'>
        <input type='hidden' name='source' value={source} />

        <div>
          <label
            htmlFor='password'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            新しいパスワード <span className='text-red-500'>*</span>
          </label>
          <div className='relative'>
            <Input
              id='password'
              type={showPassword ? 'text' : 'password'}
              name='password'
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder='8文字以上、大小文字・数字・記号を含む'
              autoComplete='new-password'
              className={
                clientErrors.password ? 'border-red-500 pr-10' : 'pr-10'
              }
            />
            <button
              type='button'
              onClick={() => setShowPassword(current => !current)}
              className='absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600'
              aria-label={
                showPassword ? 'パスワードを隠す' : 'パスワードを表示する'
              }
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {clientErrors.password && (
            <p className='text-red-500 text-sm mt-1'>{clientErrors.password}</p>
          )}

          {password && (
            <div className='mt-2'>
              <div className='flex items-center space-x-2'>
                <div className='flex-1 bg-gray-200 rounded-full h-2'>
                  <div
                    className={`h-2 rounded-full transition-all ${getStrengthColor(
                      passwordStrength.score
                    )}`}
                    style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                  />
                </div>
              </div>
              {passwordStrength.feedback.length > 0 && (
                <ul className='text-xs text-gray-500 mt-1 space-y-0.5'>
                  {passwordStrength.feedback.map((feedback, index) => (
                    <li key={index}>• {feedback}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor='confirmPassword'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            新しいパスワード（確認） <span className='text-red-500'>*</span>
          </label>
          <div className='relative'>
            <Input
              id='confirmPassword'
              type={showConfirmPassword ? 'text' : 'password'}
              name='confirmPassword'
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder='確認のためもう一度入力'
              autoComplete='new-password'
              className={
                clientErrors.confirmPassword ? 'border-red-500 pr-10' : 'pr-10'
              }
            />
            <button
              type='button'
              onClick={() => setShowConfirmPassword(current => !current)}
              className='absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600'
              aria-label={
                showConfirmPassword
                  ? '確認用パスワードを隠す'
                  : '確認用パスワードを表示する'
              }
            >
              {showConfirmPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {clientErrors.confirmPassword && (
            <p className='text-red-500 text-sm mt-1'>
              {clientErrors.confirmPassword}
            </p>
          )}
        </div>

        {clientErrors._form && (
          <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm'>
            {clientErrors._form}
          </div>
        )}

        <Button
          type='submit'
          disabled={isPending}
          className='w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5'
        >
          {isPending ? '更新中...' : 'パスワードを更新する'}
        </Button>
      </form>

      <div className='space-y-2 text-center'>
        <Link
          href={links.retryHref}
          className='text-sm font-medium text-slate-900 hover:text-slate-700 block'
        >
          再度メールを送る
        </Link>
        <Link
          href={links.loginHref}
          className='text-sm text-gray-600 hover:text-gray-500 block'
        >
          {links.loginLabel}
        </Link>
      </div>
    </Card>
  );
}

'use client';

import React, {
  Suspense,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { passwordResetSchema, type AuthResponse } from '@/lib/schemas/auth';
import { requestPasswordReset } from './actions';

type ResetSource = 'admin' | 'clinic';

function normalizeSource(source: string | null): ResetSource {
  return source === 'admin' ? 'admin' : 'clinic';
}

function ForgotPasswordContent() {
  const [email, setEmail] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const searchParams = useSearchParams();

  const source = useMemo(
    () => normalizeSource(searchParams.get('source')),
    [searchParams]
  );

  const [state, formAction, isPending] = useActionState<AuthResponse, FormData>(
    requestPasswordReset,
    { success: true }
  );

  useEffect(() => {
    if (!state.success && 'errors' in state) {
      const normalized = Object.fromEntries(
        Object.entries(state.errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? (value[0] ?? '') : (value ?? ''),
        ])
      );
      setClientErrors(normalized);
      return;
    }

    if (state.success && 'message' in state && state.message) {
      setClientErrors({ _success: state.message });
    }
  }, [state]);

  const content =
    source === 'admin'
      ? {
          theme: 'from-blue-50 to-indigo-100',
          accent:
            'bg-blue-600 hover:bg-blue-700 text-blue-600 hover:text-blue-500',
          title: '管理者向けパスワード再設定',
          description:
            '管理者アカウントのメールアドレスを入力してください。再設定用リンクを送信します。',
          emailPlaceholder: 'admin@clinic.com',
          primaryBackHref: '/admin/login',
          primaryBackLabel: '管理者ログインへ戻る',
          secondaryBackHref: '/login',
          secondaryBackLabel: 'スタッフログインへ戻る',
        }
      : {
          theme: 'from-green-50 to-teal-100',
          accent:
            'bg-teal-600 hover:bg-teal-700 text-teal-600 hover:text-teal-500',
          title: 'スタッフ向けパスワード再設定',
          description:
            'スタッフアカウントのメールアドレスを入力してください。再設定用リンクを送信します。',
          emailPlaceholder: 'staff@clinic.com',
          primaryBackHref: '/login',
          primaryBackLabel: 'スタッフログインへ戻る',
          secondaryBackHref: '/admin/login',
          secondaryBackLabel: '管理者ログインへ戻る',
        };

  const validateClientSide = () => {
    const result = passwordResetSchema.safeParse({ email });
    if (result.success) {
      setClientErrors(prev => {
        const next = { ...prev };
        delete next.email;
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

  const handleSubmit = (event: React.FormEvent) => {
    if (!validateClientSide()) {
      event.preventDefault();
    }
  };

  return (
    <div
      className={`min-h-screen bg-gradient-to-br ${content.theme} flex items-center justify-center p-4`}
    >
      <Card className='w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl'>
        <div className='text-center'>
          <div className='w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-slate-900'>
            <span className='text-white font-bold text-2xl'>骨</span>
          </div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>
            パスワード再設定
          </h1>
          <p className='text-sm font-medium text-gray-700'>{content.title}</p>
          <p className='text-sm text-gray-500 mt-2'>{content.description}</p>
        </div>

        <form action={formAction} onSubmit={handleSubmit} className='space-y-4'>
          <input type='hidden' name='source' value={source} />

          <div>
            <label
              htmlFor='forgot-password-email'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              メールアドレス <span className='text-red-500'>*</span>
            </label>
            <Input
              id='forgot-password-email'
              type='email'
              name='email'
              value={email}
              onChange={event => {
                const nextEmail = event.target.value;
                setEmail(nextEmail);

                if (clientErrors.email) {
                  const result = passwordResetSchema.safeParse({
                    email: nextEmail,
                  });
                  if (result.success) {
                    setClientErrors(prev => {
                      const next = { ...prev };
                      delete next.email;
                      return next;
                    });
                  }
                }
              }}
              placeholder={content.emailPlaceholder}
              required
              autoComplete='email'
              className={clientErrors.email ? 'border-red-500' : ''}
              aria-describedby={
                clientErrors.email ? 'forgot-password-email-error' : undefined
              }
            />
            {clientErrors.email && (
              <p
                id='forgot-password-email-error'
                className='text-red-500 text-sm mt-1'
              >
                {clientErrors.email}
              </p>
            )}
          </div>

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

          <Button
            type='submit'
            disabled={isPending}
            className={`w-full text-white py-2.5 ${content.accent.split(' ').slice(0, 2).join(' ')}`}
          >
            {isPending ? '送信中...' : '再設定メールを送信する'}
          </Button>
        </form>

        <div className='space-y-2 text-center'>
          <Link
            href={content.primaryBackHref}
            className={`text-sm font-medium block ${content.accent.split(' ').slice(2).join(' ')}`}
          >
            {content.primaryBackLabel}
          </Link>
          <Link
            href={content.secondaryBackHref}
            className='text-sm text-gray-600 hover:text-gray-500 block'
          >
            {content.secondaryBackLabel}
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900' />
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}

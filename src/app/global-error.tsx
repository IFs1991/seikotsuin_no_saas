'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang='ja'>
      <body className='bg-slate-50 text-slate-950'>
        <main className='mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center'>
          <p className='text-sm font-semibold uppercase tracking-[0.2em] text-rose-600'>
            Unexpected Error
          </p>
          <h1 className='mt-4 text-3xl font-bold'>
            システムエラーが発生しました
          </h1>
          <p className='mt-3 text-sm leading-6 text-slate-600'>
            問題を記録しました。時間を置いて再度お試しください。
          </p>
          <button
            className='mt-8 rounded-full bg-slate-950 px-6 py-3 text-sm font-medium text-white'
            onClick={() => reset()}
            type='button'
          >
            再読み込み
          </button>
        </main>
      </body>
    </html>
  );
}

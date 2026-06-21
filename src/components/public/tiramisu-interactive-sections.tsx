'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

const LazyAiDemo = lazy(async () => {
  const importedModule = await import('./tiramisu-ai-demo');
  return { default: importedModule.TiramisuAiDemo };
});

const LazyRoiCalculator = lazy(async () => {
  const importedModule = await import('./tiramisu-roi-calculator');
  return { default: importedModule.TiramisuRoiCalculator };
});

function InteractiveSectionsFallback() {
  return (
    <>
      <section
        id='ai-demo'
        aria-busy='true'
        className='bg-slate-950 py-20 text-white'
      >
        <div className='mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8'>
          <div className='space-y-4'>
            <p className='text-sm font-semibold text-cyan-100'>
              AI分析支援のイメージ
            </p>
            <h2 className='max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl'>
              自然言語で店舗データを確認する体験を読み込んでいます。
            </h2>
            <p className='max-w-2xl text-base leading-8 text-slate-300'>
              このセクションは選択肢クリック式のモックAIデモです。実APIや患者データにはアクセスしません。
            </p>
          </div>
          <div className='rounded-lg border border-white/10 bg-white/5 p-5'>
            <div className='h-10 rounded-lg bg-white/10' />
            <div className='mt-4 grid gap-2'>
              <div className='h-12 rounded-lg bg-white/10' />
              <div className='h-12 rounded-lg bg-white/10' />
              <div className='h-28 rounded-lg bg-white/10' />
            </div>
          </div>
        </div>
      </section>
      <section id='roi' aria-busy='true' className='bg-white py-20'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-8 max-w-3xl space-y-3'>
            <p className='text-sm font-semibold text-emerald-800'>
              本部業務削減シミュレーター
            </p>
            <h2 className='text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl'>
              月額費用を、戻る時間と本部負荷で判断する。
            </h2>
            <p className='text-base leading-8 text-slate-600'>
              入力値を保存せず、外部APIにも送信しない簡易試算機を読み込んでいます。
            </p>
          </div>
          <div className='grid gap-6 lg:grid-cols-[1fr_0.9fr]'>
            <div className='rounded-lg border border-slate-200 bg-slate-50 p-6'>
              <div className='h-8 max-w-md rounded-lg bg-slate-200' />
              <div className='mt-6 grid gap-4 sm:grid-cols-2'>
                <div className='h-14 rounded-lg bg-slate-200' />
                <div className='h-14 rounded-lg bg-slate-200' />
                <div className='h-14 rounded-lg bg-slate-200' />
                <div className='h-14 rounded-lg bg-slate-200' />
              </div>
            </div>
            <div className='rounded-lg bg-slate-950 p-6'>
              <div className='h-8 rounded-lg bg-white/10' />
              <div className='mt-5 h-40 rounded-lg bg-white/10' />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function TiramisuInteractiveSections() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) {
      return;
    }

    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        const firstEntry = entries[0];
        if (firstEntry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '700px 0px' }
    );

    observer.observe(root);

    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={rootRef}>
      {shouldLoad ? (
        <Suspense fallback={<InteractiveSectionsFallback />}>
          <LazyAiDemo />
          <LazyRoiCalculator />
        </Suspense>
      ) : (
        <InteractiveSectionsFallback />
      )}
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';

function InteractionFallback() {
  return (
    <div
      className='min-h-[280px] rounded-[10px] border border-border bg-card/55'
      aria-hidden='true'
    />
  );
}

export const DynamicLpAiShowcase = dynamic(
  () => import('./lp-ai-showcase').then(module => module.LpAiShowcase),
  {
    loading: InteractionFallback,
  }
);

export const DynamicLpRoiCalculator = dynamic(
  () => import('./lp-roi-calculator').then(module => module.LpRoiCalculator),
  {
    loading: InteractionFallback,
  }
);

export const DynamicLpStickyCta = dynamic(
  () => import('./lp-sticky-cta').then(module => module.LpStickyCta),
  {
    loading: () => null,
    ssr: false,
  }
);

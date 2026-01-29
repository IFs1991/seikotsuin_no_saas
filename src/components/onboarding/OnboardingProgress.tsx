'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { OnboardingStep } from '@/types/onboarding';

interface StepConfig {
  key: OnboardingStep;
  label: string;
  shortLabel: string;
}

const STEPS: StepConfig[] = [
  { key: 'profile', label: '管理者情報', shortLabel: '1' },
  { key: 'clinic', label: 'クリニック', shortLabel: '2' },
  { key: 'invites', label: 'スタッフ招待', shortLabel: '3' },
  { key: 'seed', label: '初期設定', shortLabel: '4' },
];

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  className?: string;
}

export function OnboardingProgress({
  currentStep,
  className,
}: OnboardingProgressProps) {
  const getCurrentIndex = () => {
    if (currentStep === 'completed') return STEPS.length;
    return STEPS.findIndex(s => s.key === currentStep);
  };

  const currentIndex = getCurrentIndex();

  return (
    <div className={cn('w-full', className)}>
      <div className='flex items-center justify-between'>
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = step.key === currentStep;

          return (
            <React.Fragment key={step.key}>
              {/* ステップインジケータ */}
              <div className='flex flex-col items-center'>
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    isCompleted && 'bg-green-600 text-white',
                    isCurrent && 'bg-blue-600 text-white',
                    !isCompleted && !isCurrent && 'bg-gray-200 text-gray-500'
                  )}
                >
                  {isCompleted ? (
                    <svg
                      className='w-5 h-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M5 13l4 4L19 7'
                      />
                    </svg>
                  ) : (
                    step.shortLabel
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs sm:text-sm',
                    isCurrent && 'text-blue-600 font-medium',
                    isCompleted && 'text-green-600',
                    !isCompleted && !isCurrent && 'text-gray-500'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* コネクタライン */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-1 mx-2 rounded transition-colors',
                    index < currentIndex ? 'bg-green-600' : 'bg-gray-200'
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

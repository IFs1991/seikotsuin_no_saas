'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HelpHintProps {
  /** ポップアップ内の見出し */
  title?: string;
  /** 機能の目的・使い方の説明文 */
  children: React.ReactNode;
  /** パネルの寄せ位置（画面端で見切れる場合は right を指定） */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * 「?」ボタンで機能の目的や使い方をポップアップ表示する軽量ヘルプ。
 * 見出し要素（CardTitle 等）の中に置けるよう span ベースで構成している。
 */
export function HelpHint({
  title,
  children,
  align = 'left',
  className,
}: HelpHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  return (
    <span className={cn('relative inline-flex align-middle', className)}>
      <button
        type='button'
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={title ? `${title}の説明を表示` : 'この機能の説明を表示'}
        className='inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600'
      >
        <HelpCircle className='h-4 w-4' aria-hidden='true' />
      </button>

      {isOpen && (
        <>
          <span
            className='fixed inset-0 z-40 block'
            onClick={close}
            aria-hidden='true'
          />
          <span
            id={panelId}
            role='note'
            className={cn(
              'absolute top-full z-50 mt-2 block w-72 rounded-medical border border-border bg-card p-4 text-left font-normal shadow-medical-lg',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            <span className='flex items-start justify-between gap-2'>
              {title ? (
                <span className='block text-sm font-semibold text-foreground'>
                  {title}
                </span>
              ) : (
                <span aria-hidden='true' />
              )}
              <button
                type='button'
                onClick={close}
                aria-label='説明を閉じる'
                className='inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600'
              >
                <X className='h-4 w-4' aria-hidden='true' />
              </button>
            </span>
            <span className='mt-1 block text-sm leading-relaxed text-muted-foreground'>
              {children}
            </span>
          </span>
        </>
      )}
    </span>
  );
}

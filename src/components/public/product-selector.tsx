'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, LayoutGrid, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveLegacyOsAnchor } from './marketing-links';
import { PhraseText } from './phrase-text';

// 製品選択モーダル。
// - 自動表示は共通トップだけが明示的に許可し、当該タブのセッションで初回の1回だけ開く。
// - CSP（style-src に unsafe-inline なし）で <style> を注入しないよう、ネイティブ <dialog> を使う。
// - 選んだ製品の保存・自動転送・Cookieは行わない。sessionStorage には表示済みの固定値だけを書く。

export const PRODUCT_SELECTOR_SEEN_KEY = 'tiramisu.product-selector.seen.v1';
const PRODUCT_SELECTOR_SEEN_VALUE = '1';
const SCROLL_LOCK_CLASS = 'lp-scroll-locked';

// 未表示なら表示済みを記録して true を返す。storage が使えない場合は自動表示を省略する。
export function claimProductSelectorAutoOpen(
  getStorage: () => Storage = () => window.sessionStorage
): boolean {
  try {
    const storage = getStorage();
    if (
      storage.getItem(PRODUCT_SELECTOR_SEEN_KEY) === PRODUCT_SELECTOR_SEEN_VALUE
    ) {
      return false;
    }
    storage.setItem(PRODUCT_SELECTOR_SEEN_KEY, PRODUCT_SELECTOR_SEEN_VALUE);
    return true;
  } catch {
    return false;
  }
}

// <dialog> のモーダル表示に対応していない古いブラウザでは、モーダルを使わず通常の製品カードへ案内する。
function supportsModalDialog(): boolean {
  return (
    typeof HTMLDialogElement !== 'undefined' &&
    typeof HTMLDialogElement.prototype.showModal === 'function'
  );
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

interface ProductSelectorProps {
  title: string;
  description: string;
  /** 製品カード（サーバーで描画したリンク） */
  children: ReactNode;
  /** 共通トップだけが true にする */
  autoOpenOnFirstVisit?: boolean;
  /** 共通トップだけが true にする。旧OS LPのアンカー（/#pricing 等）を /os#... へ移す */
  redirectLegacyOsAnchors?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
}

export function ProductSelector({
  title,
  description,
  children,
  autoOpenOnFirstVisit = false,
  redirectLegacyOsAnchors = false,
  triggerLabel = '製品を選ぶ',
  triggerClassName,
}: ProductSelectorProps) {
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closingForNavigationRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  // 旧アンカーの互換遷移を自動表示より先に判定し、遷移する場合はモーダルを出さない。
  useEffect(() => {
    setHydrated(true);
    if (redirectLegacyOsAnchors) {
      const legacyTarget = resolveLegacyOsAnchor(window.location.hash);
      if (legacyTarget) {
        window.location.replace(legacyTarget);
        return;
      }
    }
    if (
      autoOpenOnFirstVisit &&
      supportsModalDialog() &&
      claimProductSelectorAutoOpen()
    ) {
      setOpen(true);
    }
  }, [autoOpenOnFirstVisit, redirectLegacyOsAnchors]);

  useEffect(() => {
    if (!redirectLegacyOsAnchors) return;
    const handleHashChange = () => {
      const legacyTarget = resolveLegacyOsAnchor(window.location.hash);
      if (legacyTarget) window.location.replace(legacyTarget);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [redirectLegacyOsAnchors]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
      titleRef.current?.focus();
    }
    const root = document.documentElement;
    root.classList.add(SCROLL_LOCK_CLASS);

    let pointerDownOnBackdrop = false;
    const handlePointerDown = (event: PointerEvent) => {
      pointerDownOnBackdrop = event.target === dialog;
    };
    const handleClick = (event: MouseEvent) => {
      // 内側の要素が <dialog> の領域を覆っているため、target が dialog 自身なら背景のクリック。
      if (event.target === dialog) {
        if (pointerDownOnBackdrop) dialog.close();
        pointerDownOnBackdrop = false;
        return;
      }
      pointerDownOnBackdrop = false;
      const link =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      // 同じタブでの遷移だけ閉じる（新しいタブで開く操作ではモーダルを残す）。
      if (link && !link.hasAttribute('target') && isPlainLeftClick(event)) {
        closingForNavigationRef.current = true;
        dialog.close();
      }
    };
    const handleClose = () => {
      root.classList.remove(SCROLL_LOCK_CLASS);
      if (closingForNavigationRef.current) {
        // 遷移先の自然なフォーカス管理に任せ、消える起動元へは戻さない。
        closingForNavigationRef.current = false;
      } else {
        triggerRef.current?.focus();
      }
      setOpen(false);
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('click', handleClick);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('click', handleClick);
      dialog.removeEventListener('close', handleClose);
      root.classList.remove(SCROLL_LOCK_CLASS);
    };
  }, [open]);

  const closeDialog = () => dialogRef.current?.close();
  const openSelector = () => {
    if (supportsModalDialog()) {
      setOpen(true);
    } else {
      window.location.assign('/#products');
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type='button'
        onClick={openSelector}
        disabled={!hydrated}
        aria-haspopup='dialog'
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-white/25 px-3 text-[13px] font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-ink)] disabled:cursor-default disabled:opacity-70',
          triggerClassName
        )}
      >
        <LayoutGrid className='h-4 w-4' aria-hidden='true' />
        {triggerLabel}
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className='lp-dialog m-auto max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-[960px] overflow-hidden rounded-[18px] border-0 bg-[color:var(--lp-ivory)] p-0 text-[color:var(--lp-text)] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.5)]'
        >
          <div className='max-h-[inherit] overflow-y-auto overscroll-contain px-4 pb-5 pt-12 sm:px-8 sm:pb-7 sm:pt-10'>
            <div className='mx-auto max-w-2xl text-center'>
              <h2
                id={titleId}
                ref={titleRef}
                tabIndex={-1}
                // 改行位置の調整（<wbr>）でダイアログ名に区切りが入らないよう、表示と同じ文字列を名前にする
                aria-label={title}
                className='font-serif-jp text-[21px] font-bold leading-[1.45] focus:outline-none sm:text-[28px]'
              >
                <PhraseText text={title} />
              </h2>
              <p
                id={descriptionId}
                className='mt-2 text-[13px] leading-6 text-[color:var(--lp-text-muted)] sm:text-[14px]'
              >
                <PhraseText text={description} />
              </p>
            </div>
            <div className='mt-5 sm:mt-7'>{children}</div>
            <div className='mt-4 flex justify-center sm:mt-6'>
              <button
                type='button'
                onClick={closeDialog}
                className='inline-flex min-h-11 items-center gap-1 rounded-[8px] px-4 text-[13px] font-semibold text-[color:var(--lp-text-muted)] underline underline-offset-4 hover:text-[color:var(--lp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-ink)]'
              >
                あとで選ぶ
                <ChevronRight className='h-4 w-4' aria-hidden='true' />
              </button>
            </div>
          </div>
          <button
            type='button'
            onClick={closeDialog}
            aria-label='閉じる'
            className='absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--lp-text-muted)] transition-colors hover:bg-black/5 hover:text-[color:var(--lp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-ink)]'
          >
            <X className='h-5 w-5' aria-hidden='true' />
          </button>
        </dialog>
      ) : null}
    </>
  );
}

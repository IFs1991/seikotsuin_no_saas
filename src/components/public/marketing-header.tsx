import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import tiramisuWordmark from '@/images/brand/tiramisu-wordmark.png';
import { CspSafeImage } from './csp-safe-image';
import { productSelectorCopy } from './marketing-content';
import { ProductSelectorCards } from './product-cards';
import { ProductSelector } from './product-selector';

// 公開サイト専用ヘッダー。業務アプリ・予約画面・ログイン画面には使わない。

type MarketingNavKey = 'works' | 'os' | 'contact';

const navItems: ReadonlyArray<{
  key: MarketingNavKey;
  href: string;
  label: string;
  /** 狭い画面での表示名（承認済み画像のナビ表記）。読み上げ名は label のまま */
  shortLabel?: string;
}> = [
  {
    key: 'works',
    href: '/works',
    label: 'Tiramisu Works',
    shortLabel: 'Works',
  },
  { key: 'os', href: '/os', label: 'Tiramisu OS', shortLabel: 'OS' },
  { key: 'contact', href: '/contact', label: 'お問い合わせ' },
];

interface MarketingHeaderProps {
  current?: MarketingNavKey;
  /**
   * auto: 共通トップ（初回だけ自動表示＋旧アンカー互換）、manual: 手動の「製品を選ぶ」だけ、
   * none: 表示しない（問い合わせ・法務ページ）。
   */
  productSelector?: 'auto' | 'manual' | 'none';
  /** 製品LPのページ内ナビ（広い画面だけ表示） */
  subNav?: ReactNode;
}

export function MarketingHeader({
  current,
  productSelector = 'none',
  subNav,
}: MarketingHeaderProps) {
  return (
    <>
      <a
        href='#main'
        className='sr-only z-50 rounded-[8px] bg-white px-4 py-2 text-[14px] font-bold text-[color:var(--lp-ink)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4'
      >
        本文へ移動
      </a>
      <header className='sticky top-0 z-40 border-b border-white/10 bg-[color:var(--lp-ink-glass)] text-white backdrop-blur'>
        <div className='mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8'>
          <Link
            href='/'
            prefetch={false}
            className='flex shrink-0 items-center rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
          >
            <CspSafeImage
              src={tiramisuWordmark}
              alt='Tiramisu'
              width={178}
              height={50}
              className='h-10 w-auto shrink-0 object-contain sm:h-11'
              priority
            />
          </Link>
          <nav
            aria-label='製品とお問い合わせ'
            className='hidden items-center gap-6 text-[14px] md:flex'
          >
            {navItems.map(item => (
              <Link
                key={item.key}
                href={item.href}
                prefetch={false}
                aria-current={current === item.key ? 'page' : undefined}
                className={cn(
                  'rounded-[4px] py-2 text-white/75 underline-offset-8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]',
                  current === item.key && 'text-white underline'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className='flex items-center gap-2'>
            <Link
              href='/login'
              prefetch={false}
              className='hidden min-h-11 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)] md:inline-flex'
            >
              <LogIn className='h-4 w-4' aria-hidden='true' />
              OSログイン
            </Link>
            {productSelector !== 'none' ? (
              <ProductSelector
                title={productSelectorCopy.title}
                description={productSelectorCopy.description}
                autoOpenOnFirstVisit={productSelector === 'auto'}
                redirectLegacyOsAnchors={productSelector === 'auto'}
              >
                <ProductSelectorCards />
              </ProductSelector>
            ) : null}
          </div>
        </div>
        {subNav ? (
          <div className='hidden border-t border-white/10 lg:block'>
            {subNav}
          </div>
        ) : null}
      </header>
      <nav
        aria-label='製品とお問い合わせ'
        className='border-b border-white/10 bg-[color:var(--lp-ink)] text-white md:hidden'
      >
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 text-[13px]'>
          {navItems.map(item => (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              aria-current={current === item.key ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[4px] text-white/80 underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]',
                current === item.key && 'font-bold text-white underline'
              )}
            >
              {item.shortLabel ? (
                <>
                  <span className='sr-only'>Tiramisu </span>
                  {item.shortLabel}
                </>
              ) : (
                item.label
              )}
            </Link>
          ))}
          <Link
            href='/login'
            prefetch={false}
            className='inline-flex min-h-11 items-center gap-1.5 rounded-[4px] text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
          >
            <LogIn className='h-4 w-4' aria-hidden='true' />
            OSログイン
          </Link>
        </div>
      </nav>
    </>
  );
}

// 製品LPのページ内ナビ（ヘッダー2段目）。
export function MarketingSubNav({
  label,
  items,
  cta,
}: {
  label: string;
  items: ReadonlyArray<{ label: string; href: string }>;
  cta?: ReactNode;
}) {
  return (
    <div className='mx-auto flex min-h-12 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8'>
      <nav aria-label={label} className='flex items-center gap-5 text-[13px]'>
        {items.map(item => (
          <a
            key={item.href}
            href={item.href}
            className='rounded-[4px] py-1 text-white/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
          >
            {item.label}
          </a>
        ))}
      </nav>
      {cta}
    </div>
  );
}

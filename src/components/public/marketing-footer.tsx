import Link from 'next/link';
import tiramisuWordmark from '@/images/brand/tiramisu-wordmark.png';
import { CspSafeImage } from './csp-safe-image';
import { createContactHref } from './marketing-links';

// 公開サイト専用フッター。両製品・問い合わせ・法務への通常リンクをまとめる。

const footerColumns: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}> = [
  {
    title: '製品',
    links: [
      { label: 'Tiramisu Works', href: '/works' },
      { label: 'Tiramisu OS', href: '/os' },
    ],
  },
  {
    title: 'お問い合わせ',
    links: [
      { label: 'お問い合わせ', href: createContactHref() },
      {
        label: '事業者情報の開示請求',
        href: createContactHref({ intent: 'operator-disclosure' }),
      },
    ],
  },
  {
    title: '規約・運営者情報',
    links: [
      { label: '利用規約', href: '/terms' },
      { label: 'プライバシーポリシー', href: '/privacy' },
      { label: '運営者情報・販売条件', href: '/legal' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className='bg-[color:var(--lp-ink-deep)] py-12 text-white/75'>
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <div className='grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,1fr)]'>
          <div className='sm:col-span-2 lg:col-span-1'>
            <Link
              href='/'
              prefetch={false}
              className='inline-flex rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
            >
              <CspSafeImage
                src={tiramisuWordmark}
                alt='Tiramisu'
                width={178}
                height={50}
                className='h-11 w-auto shrink-0 object-contain'
              />
            </Link>
            <p className='mt-4 max-w-sm text-[12px] leading-6 text-white/65'>
              Tiramisuは、既存ツールを活かす業務支援「Tiramisu
              Works」と、店舗・本部管理「Tiramisu
              OS」の2つの製品をご案内しています。
            </p>
          </div>
          {footerColumns.map(column => (
            <div key={column.title}>
              <h2 className='text-[12px] font-bold text-white'>
                {column.title}
              </h2>
              <ul className='mt-3 flex flex-col gap-1'>
                {column.links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      className='inline-flex min-h-9 items-center rounded-[4px] text-[13px] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className='mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex flex-wrap gap-x-5 gap-y-1 text-[12px]'>
            <Link
              href='/login'
              prefetch={false}
              className='inline-flex min-h-9 items-center rounded-[4px] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
            >
              OSスタッフログイン
            </Link>
            <Link
              href='/admin/login'
              prefetch={false}
              className='inline-flex min-h-9 items-center rounded-[4px] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
            >
              OS管理者ログイン
            </Link>
          </div>
          <p className='font-mono text-[11px] text-white/60'>
            © 2026 Tiramisu. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

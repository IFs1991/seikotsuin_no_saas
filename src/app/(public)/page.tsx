import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import {
  brandTopCopy,
  marketingProducts,
} from '@/components/public/marketing-content';
import { createContactHref } from '@/components/public/marketing-links';
import { PhraseText } from '@/components/public/phrase-text';
import {
  ProductCards,
  ProductComparison,
  ProductIllustration,
} from '@/components/public/product-cards';
import { cn } from '@/lib/utils';
import './lp-styles.css';

// Tiramisu共通トップ。本文と製品への通常リンクはサーバーで描画し、
// JavaScriptなしでも両製品を選べる。製品選択モーダルはヘッダー内の小さなclient境界だけ。

export const metadata: Metadata = {
  title: 'Tiramisu | Tiramisu Works・Tiramisu OS',
  description:
    '今のツールを活かす業務支援「Tiramisu Works」と、店舗の情報をまとめる経営管理「Tiramisu OS」。目的に合わせて選べる、2つのTiramisuをご案内します。',
  alternates: { canonical: '/' },
};

const undecidedContactHref = createContactHref({
  product: 'undecided',
  intent: 'sales',
});

const heroMonogramClass: Record<'works' | 'os', string> = {
  works: 'bg-[color:var(--lp-works)] text-white',
  os: 'bg-[color:var(--lp-accent-strong)] text-white',
};

function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className='font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--lp-accent-strong)]'>
      {children}
    </p>
  );
}

export default function BrandTopPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader productSelector='auto' />

      <main id='main'>
        {/* ===== Hero ===== */}
        <section className='relative overflow-hidden bg-[color:var(--lp-ink)] text-white'>
          <div className='absolute inset-x-0 top-0 h-px bg-[color:var(--lp-accent-line)]' />
          <div className='mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24'>
            <div className='flex flex-col gap-6'>
              <p className='font-serif-en text-[15px] tracking-[0.18em] text-[color:var(--lp-accent-soft)]'>
                Tiramisu
              </p>
              <h1 className='font-serif-jp text-[34px] font-bold leading-[1.35] tracking-tight sm:text-5xl lg:text-[58px]'>
                {brandTopCopy.heroTitleLines.map(line => (
                  <span key={line} className='block'>
                    {line}
                  </span>
                ))}
              </h1>
              <p className='max-w-xl text-[16px] leading-8 text-white/80'>
                {brandTopCopy.heroLead}
              </p>
              <div className='grid max-w-xl gap-3 sm:grid-cols-2'>
                {marketingProducts.map(product => (
                  <Link
                    key={product.key}
                    href={product.href}
                    prefetch={false}
                    className='group inline-flex min-h-14 items-center gap-3 rounded-[10px] bg-[color:var(--lp-ivory)] px-4 py-3 text-[15px] font-bold text-[color:var(--lp-text)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-ink)]'
                  >
                    <span
                      aria-hidden='true'
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] font-serif-en text-[16px]',
                        heroMonogramClass[product.key]
                      )}
                    >
                      {product.monogram}
                    </span>
                    <span className='flex-1'>{product.linkLabel}</span>
                    <ArrowRight
                      className='h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5'
                      aria-hidden='true'
                    />
                  </Link>
                ))}
              </div>
              <Link
                href={undecidedContactHref}
                prefetch={false}
                className='inline-flex min-h-11 w-fit items-center gap-2 rounded-[6px] text-[14px] text-white/80 underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
              >
                <MessageCircle className='h-4 w-4' aria-hidden='true' />
                どちらが合うか相談する
              </Link>
            </div>

            <figure
              aria-hidden='true'
              className='rounded-[16px] border border-white/10 bg-white/5 p-4 sm:p-5'
            >
              <div className='grid gap-4 sm:grid-cols-2'>
                {marketingProducts.map(product => (
                  <div
                    key={product.key}
                    className='rounded-[12px] bg-[color:var(--lp-ivory)] p-3 text-[color:var(--lp-text)]'
                  >
                    <p className='mb-2 flex items-center gap-2 text-[13px] font-bold'>
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-[5px] font-serif-en text-[12px]',
                          heroMonogramClass[product.key]
                        )}
                      >
                        {product.monogram}
                      </span>
                      {product.name}
                    </p>
                    <ProductIllustration productKey={product.key} />
                    <p className='mt-2 text-[12px] leading-5 text-[color:var(--lp-text-muted)]'>
                      {product.label}
                    </p>
                  </div>
                ))}
              </div>
              <figcaption className='mt-3 text-right text-[11px] text-white/65'>
                説明図（実際の画面ではありません）
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ===== Products ===== */}
        <section
          id='products'
          aria-labelledby='products-title'
          className='py-16 sm:py-24'
        >
          <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
            <div className='mb-10 max-w-3xl space-y-4'>
              <SectionEyebrow>Products</SectionEyebrow>
              <h2
                id='products-title'
                className='font-serif-jp text-3xl font-bold leading-[1.35] text-[color:var(--lp-text)] sm:text-4xl'
              >
                <PhraseText text={brandTopCopy.productsTitle} />
              </h2>
              <p className='text-[15px] leading-8 text-[color:var(--lp-text-muted)]'>
                {brandTopCopy.productsLead}
              </p>
            </div>
            <ProductCards />
          </div>
        </section>

        {/* ===== Compare ===== */}
        <section
          id='compare'
          aria-labelledby='compare-title'
          className='border-y border-[color:var(--lp-line)] bg-[color:var(--lp-paper-warm)] py-16 sm:py-24'
        >
          <div className='mx-auto max-w-5xl px-4 sm:px-6 lg:px-8'>
            <div className='mb-8 max-w-3xl space-y-4'>
              <SectionEyebrow>How to choose</SectionEyebrow>
              <h2
                id='compare-title'
                className='font-serif-jp text-3xl font-bold leading-[1.35] text-[color:var(--lp-text)] sm:text-4xl'
              >
                目的から選ぶ
              </h2>
            </div>
            <ProductComparison />
          </div>
        </section>

        {/* ===== Consult ===== */}
        <section
          id='consult'
          aria-labelledby='consult-title'
          className='bg-[color:var(--lp-ink)] py-16 text-white sm:py-20'
        >
          <div className='mx-auto flex max-w-4xl flex-col items-start gap-6 px-4 sm:px-6 lg:px-8'>
            <h2
              id='consult-title'
              className='font-serif-jp text-2xl font-bold leading-[1.45] sm:text-3xl'
            >
              <PhraseText text={brandTopCopy.consultTitle} />
            </h2>
            <p className='text-[15px] leading-8 text-white/80'>
              {brandTopCopy.consultLead}
            </p>
            <Link
              href={undecidedContactHref}
              prefetch={false}
              className='inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-[color:var(--lp-accent)] px-6 py-3 text-[15px] font-bold text-[color:var(--lp-ink-deep)] transition-colors hover:bg-[color:var(--lp-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-ink)]'
            >
              どちらが合うか相談する
              <ArrowRight className='h-4 w-4' aria-hidden='true' />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

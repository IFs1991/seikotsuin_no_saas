import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  MessageSquareText,
  PlayCircle,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  marketingProducts,
  productComparisonRows,
  type MarketingProduct,
  type MarketingProductKey,
} from './marketing-content';
import { PhraseText } from './phrase-text';

// 製品カード。トップの通常表示（JavaScriptなしでも選べる実リンク）と、
// 製品選択モーダル内のコンパクト表示で同じデータを使う。

const productTheme: Record<
  MarketingProductKey,
  { surface: string; monogram: string; link: string }
> = {
  works: {
    surface:
      'border-[color:var(--lp-works-line)] bg-[color:var(--lp-works-soft)]',
    monogram: 'bg-[color:var(--lp-works)] text-white',
    link: 'bg-[color:var(--lp-works)] text-white hover:bg-[color:var(--lp-works-hover)] focus-visible:ring-[color:var(--lp-works)]',
  },
  os: {
    surface:
      'border-[color:var(--lp-accent-line)] bg-[color:var(--lp-os-soft)]',
    monogram: 'bg-[color:var(--lp-accent-strong)] text-white',
    link: 'bg-[color:var(--lp-accent)] text-[color:var(--lp-ink-deep)] hover:bg-[color:var(--lp-accent-soft)] focus-visible:ring-[color:var(--lp-accent-strong)]',
  },
};

const worksFlow = [
  { label: '依頼', icon: MessageSquareText },
  { label: '承認', icon: UserCheck },
  { label: '実行', icon: PlayCircle },
  { label: '記録', icon: ClipboardList },
] as const;

const osBars = ['h-[38%]', 'h-[62%]', 'h-[48%]', 'h-[80%]', 'h-[56%]'];

// 抽象的な説明図。実際の画面・実績ではないため数値を描かず、「イメージ」と明示する。
export function ProductIllustration({
  productKey,
}: {
  productKey: MarketingProductKey;
}) {
  return (
    <div
      aria-hidden='true'
      className='relative overflow-hidden rounded-[10px] border border-black/5 bg-white/80 p-4'
    >
      <span className='absolute right-2 top-1.5 text-[10px] font-semibold text-[color:var(--lp-text-muted)]'>
        イメージ
      </span>
      {productKey === 'works' ? (
        <ol className='flex items-center justify-between gap-0.5 pt-3'>
          {worksFlow.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.label}
                className='flex min-w-0 items-center gap-0.5'
              >
                <span className='flex flex-col items-center gap-1'>
                  <span className='flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--lp-works)] text-white'>
                    <Icon className='h-4 w-4' />
                  </span>
                  <span className='text-[11px] font-bold text-[color:var(--lp-text)]'>
                    {step.label}
                  </span>
                </span>
                {index < worksFlow.length - 1 ? (
                  <ArrowRight className='mb-4 h-3 w-3 shrink-0 text-[color:var(--lp-text-muted)]' />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className='flex items-end gap-3 pt-3'>
          <div className='flex h-14 flex-1 items-end gap-1.5'>
            {osBars.map(height => (
              <span
                key={height}
                className={cn(
                  'flex-1 rounded-t-[3px] bg-[color:var(--lp-accent-muted)]',
                  height
                )}
              />
            ))}
          </div>
          <span className='flex items-center gap-1 rounded-full bg-[color:var(--lp-os-soft)] px-2 py-1 text-[11px] font-bold text-[color:var(--lp-text)]'>
            <BarChart3 className='h-3.5 w-3.5' />
            店舗比較
          </span>
        </div>
      )}
    </div>
  );
}

function ProductHeading({
  product,
  headingLevel,
}: {
  product: MarketingProduct;
  headingLevel: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <div className='flex items-center gap-3'>
      <span
        aria-hidden='true'
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] font-serif-en text-[22px] font-bold',
          productTheme[product.key].monogram
        )}
      >
        {product.monogram}
      </span>
      <div className='min-w-0'>
        <Heading className='font-serif-en text-[20px] font-bold leading-tight text-[color:var(--lp-text)] sm:text-[22px]'>
          {product.name}
        </Heading>
        <p className='mt-1 inline-block rounded-full border border-black/10 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--lp-text-muted)]'>
          {product.label}
        </p>
      </div>
    </div>
  );
}

function ProductLink({
  product,
  className,
}: {
  product: MarketingProduct;
  className?: string;
}) {
  return (
    <Link
      href={product.href}
      prefetch={false}
      className={cn(
        'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] px-5 py-3 text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        productTheme[product.key].link,
        className
      )}
    >
      {product.linkLabel}
      <ArrowRight className='h-4 w-4' aria-hidden='true' />
    </Link>
  );
}

// 共通トップの製品カード（2列・等幅）。
export function ProductCards() {
  return (
    <div className='grid gap-5 md:grid-cols-2 md:gap-6'>
      {marketingProducts.map(product => (
        <article
          key={product.key}
          className={cn(
            'flex flex-col rounded-[16px] border p-5 sm:p-7',
            productTheme[product.key].surface
          )}
        >
          <ProductHeading product={product} headingLevel='h3' />
          <div className='mt-5'>
            <ProductIllustration productKey={product.key} />
          </div>
          <p className='mt-5 font-serif-jp text-[20px] font-bold leading-[1.5] text-[color:var(--lp-text)] sm:text-[22px]'>
            <PhraseText text={product.heading} />
          </p>
          <p className='mt-2 text-[14px] leading-7 text-[color:var(--lp-text-muted)]'>
            {product.description}
          </p>
          <ul className='mt-4 flex flex-1 flex-col gap-2'>
            {product.points.map(point => (
              <li
                key={point}
                className='flex items-start gap-2 text-[14px] text-[color:var(--lp-text)]'
              >
                <CheckCircle2
                  className='mt-1 h-4 w-4 shrink-0 text-[color:var(--lp-good)]'
                  aria-hidden='true'
                />
                {point}
              </li>
            ))}
          </ul>
          <p className='mt-4 text-[12px] leading-6 text-[color:var(--lp-text-muted)]'>
            {product.note}
          </p>
          <ProductLink product={product} className='mt-5' />
        </article>
      ))}
    </div>
  );
}

// 製品選択モーダル内のカード。スマホでは説明図と箇条書きを省き、2製品と遷移操作を先に見せる。
export function ProductSelectorCards() {
  return (
    <div className='grid gap-3 sm:grid-cols-2 sm:gap-5'>
      {marketingProducts.map(product => (
        <section
          key={product.key}
          aria-label={product.name}
          className={cn(
            'flex flex-col rounded-[14px] border p-4 text-left sm:p-5',
            productTheme[product.key].surface
          )}
        >
          <ProductHeading product={product} headingLevel='h3' />
          <div className='mt-4 hidden sm:block'>
            <ProductIllustration productKey={product.key} />
          </div>
          <p className='mt-3 font-serif-jp text-[16px] font-bold leading-[1.5] text-[color:var(--lp-text)] sm:mt-4 sm:text-[19px]'>
            <PhraseText text={product.heading} />
          </p>
          <p className='mt-1.5 hidden text-[13px] leading-6 text-[color:var(--lp-text-muted)] sm:block'>
            {product.description}
          </p>
          <ul className='mt-3 hidden flex-1 flex-col gap-1.5 sm:flex'>
            {product.points.map(point => (
              <li
                key={point}
                className='flex items-start gap-2 text-[13px] text-[color:var(--lp-text)]'
              >
                <CheckCircle2
                  className='mt-1 h-3.5 w-3.5 shrink-0 text-[color:var(--lp-good)]'
                  aria-hidden='true'
                />
                {point}
              </li>
            ))}
          </ul>
          <p className='mt-2 text-[12px] leading-5 text-[color:var(--lp-text-muted)] sm:mt-3'>
            {product.note}
          </p>
          <ProductLink product={product} className='mt-3 sm:mt-4' />
        </section>
      ))}
    </div>
  );
}

// 目的別の選び方（共通トップと Works LP「OSとの違い」で共用）。
export function ProductComparison() {
  return (
    <>
      <div className='hidden overflow-hidden rounded-[12px] border border-[color:var(--lp-line)] bg-white md:block'>
        <table className='w-full text-left'>
          <caption className='sr-only'>
            Tiramisu WorksとTiramisu OSの目的別の違い
          </caption>
          <thead className='border-b border-[color:var(--lp-line)] bg-[color:var(--lp-paper-warm)]'>
            <tr>
              <th
                scope='col'
                className='w-[18%] px-5 py-4 text-[12px] font-bold text-[color:var(--lp-text-muted)]'
              >
                観点
              </th>
              <th
                scope='col'
                className='px-5 py-4 text-[14px] font-bold text-[color:var(--lp-text)]'
              >
                Tiramisu Works
              </th>
              <th
                scope='col'
                className='px-5 py-4 text-[14px] font-bold text-[color:var(--lp-text)]'
              >
                Tiramisu OS
              </th>
            </tr>
          </thead>
          <tbody>
            {productComparisonRows.map(row => (
              <tr
                key={row.axis}
                className='border-b border-[color:var(--lp-line)] last:border-b-0'
              >
                <th
                  scope='row'
                  className='px-5 py-4 text-[13px] font-bold text-[color:var(--lp-text)]'
                >
                  {row.axis}
                </th>
                <td className='px-5 py-4 text-[14px] leading-7 text-[color:var(--lp-text)]'>
                  {row.works}
                </td>
                <td className='px-5 py-4 text-[14px] leading-7 text-[color:var(--lp-text)]'>
                  {row.os}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className='flex flex-col gap-4 md:hidden'>
        {productComparisonRows.map(row => (
          <div
            key={row.axis}
            className='overflow-hidden rounded-[12px] border border-[color:var(--lp-line)] bg-white'
          >
            <dt className='bg-[color:var(--lp-paper-warm)] px-4 py-2 text-[13px] font-bold text-[color:var(--lp-text)]'>
              {row.axis}
            </dt>
            <dd className='px-4 py-3 text-[13px] leading-6 text-[color:var(--lp-text)]'>
              <span className='block text-[11px] font-bold text-[color:var(--lp-works)]'>
                Tiramisu Works
              </span>
              {row.works}
            </dd>
            <dd className='border-t border-[color:var(--lp-line)] px-4 py-3 text-[13px] leading-6 text-[color:var(--lp-text)]'>
              <span className='block text-[11px] font-bold text-[color:var(--lp-accent-strong)]'>
                Tiramisu OS
              </span>
              {row.os}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

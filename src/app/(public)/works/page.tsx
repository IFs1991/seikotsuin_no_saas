import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  ClipboardList,
  MessageSquareText,
  PlayCircle,
  UserCheck,
} from 'lucide-react';
import { MarketingFooter } from '@/components/public/marketing-footer';
import {
  MarketingHeader,
  MarketingSubNav,
} from '@/components/public/marketing-header';
import { createContactHref } from '@/components/public/marketing-links';
import { PhraseText } from '@/components/public/phrase-text';
import { ProductComparison } from '@/components/public/product-cards';
import {
  formatYen,
  worksFaqItems,
  worksFlowSteps,
  worksGovernanceItems,
  worksHeroCopy,
  worksNavItems,
  worksNotProvided,
  worksOnboardingSteps,
  worksPlans,
  worksPricingCopy,
  worksProblems,
  worksServiceAvailabilityLabels,
  worksServices,
  worksUseCases,
  type WorksServiceAvailability,
} from '@/components/public/works-content';
import { cn } from '@/lib/utils';
import '../lp-styles.css';

export const metadata: Metadata = {
  title: 'Tiramisu Works | 今のツールを活かす業務支援',
  description:
    'Tiramisu Worksは、ChatGPTを入口に、接続済みサービスを使う業務を支援します。対象の店舗・権限・承認条件を確認し、対応済みの業務を進めます。',
  alternates: { canonical: '/works' },
};

const worksSalesHref = createContactHref({ product: 'works', intent: 'sales' });

const availabilityBadgeClass: Record<WorksServiceAvailability, string> = {
  entry:
    'border-[color:var(--lp-works-line)] bg-[color:var(--lp-works-soft)] text-[color:var(--lp-works)]',
  'confirm-scope':
    'border-[color:var(--lp-accent-line)] bg-[color:var(--lp-os-soft)] text-[color:var(--lp-accent-strong)]',
  'in-progress':
    'border-[color:var(--lp-line)] bg-[color:var(--lp-paper-warm)] text-[color:var(--lp-text-muted)]',
};

const heroFlow = [
  { label: '依頼', icon: MessageSquareText },
  { label: '確認・承認', icon: UserCheck },
  { label: '対応済みの実行', icon: PlayCircle },
  { label: '記録', icon: ClipboardList },
] as const;

// 濃色背景の上に置く相談ボタン（暖色背景に濃色文字でコントラストを確保）。
const accentButtonClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-[color:var(--lp-accent)] px-6 py-3 text-[15px] font-bold text-[color:var(--lp-ink-deep)] transition-colors hover:bg-[color:var(--lp-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-ink)]';

function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className='mb-10 max-w-3xl space-y-3'>
      <p className='font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--lp-accent-strong)]'>
        {eyebrow}
      </p>
      <h2
        id={id}
        className='font-serif-jp text-3xl font-bold leading-[1.35] text-[color:var(--lp-text)] sm:text-4xl'
      >
        <PhraseText text={title} />
      </h2>
      {lead ? (
        <p className='text-[15px] leading-8 text-[color:var(--lp-text-muted)]'>
          {lead}
        </p>
      ) : null}
    </div>
  );
}

export default function WorksLandingPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader
        current='works'
        productSelector='manual'
        subNav={
          <MarketingSubNav
            label='Tiramisu Worksのページ内リンク'
            items={worksNavItems}
            cta={
              <Link
                href={worksSalesHref}
                prefetch={false}
                className='inline-flex min-h-10 items-center gap-2 rounded-[8px] bg-[color:var(--lp-accent)] px-4 py-2 text-[13px] font-bold text-[color:var(--lp-ink-deep)] transition-colors hover:bg-[color:var(--lp-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
              >
                {worksHeroCopy.primaryCtaLabel}
                <ArrowRight className='h-4 w-4' aria-hidden='true' />
              </Link>
            }
          />
        }
      />

      <main id='main'>
        {/* ===== Hero ===== */}
        <section className='relative overflow-hidden bg-[color:var(--lp-ink)] text-white'>
          <div className='mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8 lg:py-24'>
            <div className='flex flex-col gap-6'>
              <p className='inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 font-serif-en text-[14px] tracking-[0.12em] text-[color:var(--lp-accent-soft)]'>
                {worksHeroCopy.eyebrow}
              </p>
              <h1 className='font-serif-jp text-[30px] font-bold leading-[1.4] tracking-tight sm:text-[44px] lg:text-[50px]'>
                {worksHeroCopy.titleLines.map(line => (
                  <span key={line} className='block'>
                    <PhraseText text={line} />
                  </span>
                ))}
              </h1>
              <p className='max-w-2xl text-[16px] leading-8 text-white/80'>
                {worksHeroCopy.lead}
              </p>
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Link
                  href={worksSalesHref}
                  prefetch={false}
                  className={accentButtonClass}
                >
                  {worksHeroCopy.primaryCtaLabel}
                  <ArrowRight className='h-4 w-4' aria-hidden='true' />
                </Link>
                <a
                  href='#capabilities'
                  className='inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-white/30 px-6 py-3 text-[15px] font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent-soft)]'
                >
                  {worksHeroCopy.secondaryCtaLabel}
                  <ArrowDown className='h-4 w-4' aria-hidden='true' />
                </a>
              </div>
            </div>

            <figure
              aria-hidden='true'
              className='rounded-[16px] border border-white/10 bg-white/5 p-5 sm:p-6'
            >
              <ol className='flex flex-col gap-2'>
                {heroFlow.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.label} className='flex flex-col items-start'>
                      <span className='flex w-full items-center gap-3 rounded-[10px] bg-[color:var(--lp-ivory)] px-4 py-3 text-[15px] font-bold text-[color:var(--lp-text)]'>
                        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--lp-works)] text-white'>
                          <Icon className='h-4 w-4' />
                        </span>
                        {step.label}
                      </span>
                      {index < heroFlow.length - 1 ? (
                        <ArrowDown className='my-1 ml-6 h-4 w-4 text-white/60' />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <figcaption className='mt-4 text-right text-[11px] text-white/65'>
                説明図（ChatGPTやSlackの実際の画面ではありません）
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ===== Problems ===== */}
        <section
          id='problems'
          aria-labelledby='problems-title'
          className='bg-white py-16 sm:py-24'
        >
          <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='problems-title'
              eyebrow='Problems'
              title='ツールが増えるほど、つなぐ手間が残ります。'
            />
            <div className='grid gap-4 md:grid-cols-3'>
              {worksProblems.map(problem => (
                <div
                  key={problem.title}
                  className='rounded-[10px] border border-[color:var(--lp-line)] bg-[color:var(--lp-paper)] p-6'
                >
                  <h3 className='font-serif-jp text-lg font-bold text-[color:var(--lp-text)]'>
                    {problem.title}
                  </h3>
                  <p className='mt-3 text-[14px] leading-7 text-[color:var(--lp-text-muted)]'>
                    {problem.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== How it works ===== */}
        <section
          id='how-it-works'
          aria-labelledby='how-title'
          className='border-y border-[color:var(--lp-line)] bg-[color:var(--lp-paper-warm)] py-16 sm:py-24'
        >
          <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='how-title'
              eyebrow='How it works'
              title='依頼から記録まで、確認しながら進めます。'
            />
            <ol className='grid gap-4 md:grid-cols-5'>
              {worksFlowSteps.map(step => (
                <li
                  key={step.step}
                  className='rounded-[10px] border border-[color:var(--lp-line)] bg-white p-5'
                >
                  <p className='font-mono text-[12px] font-bold text-[color:var(--lp-works)]'>
                    STEP {step.step}
                  </p>
                  <h3 className='mt-2 font-serif-jp text-[17px] font-bold text-[color:var(--lp-text)]'>
                    {step.title}
                  </h3>
                  <p className='mt-2 text-[13px] leading-6 text-[color:var(--lp-text-muted)]'>
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ===== Capabilities ===== */}
        <section
          id='capabilities'
          aria-labelledby='capabilities-title'
          className='bg-white py-16 sm:py-24'
        >
          <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='capabilities-title'
              eyebrow='What it does'
              title='できること・確認が必要なこと'
              lead='対応できる業務と接続先は、ご利用中のサービスや契約によって異なります。導入前に、対象業務ごとに確認します。'
            />
            <div className='grid gap-4 md:grid-cols-3'>
              {worksUseCases.map(useCase => (
                <div
                  key={useCase.claimId}
                  className='flex flex-col rounded-[10px] border border-[color:var(--lp-works-line)] bg-[color:var(--lp-works-soft)] p-6'
                >
                  <h3 className='font-serif-jp text-lg font-bold text-[color:var(--lp-text)]'>
                    {useCase.title}
                  </h3>
                  <p className='mt-3 flex-1 text-[14px] leading-7 text-[color:var(--lp-text)]'>
                    {useCase.description}
                  </p>
                  <p className='mt-4 border-t border-[color:var(--lp-works-line)] pt-3 text-[12px] leading-6 text-[color:var(--lp-text-muted)]'>
                    {useCase.requirements}
                  </p>
                </div>
              ))}
            </div>

            <div className='mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]'>
              <div>
                <h3 className='font-serif-jp text-xl font-bold text-[color:var(--lp-text)]'>
                  接続先と提供状況
                </h3>
                <ul className='mt-4 divide-y divide-[color:var(--lp-line)] rounded-[10px] border border-[color:var(--lp-line)] bg-white'>
                  {worksServices.map(service => (
                    <li
                      key={service.claimId}
                      className='flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4'
                    >
                      <div className='flex items-center gap-3 sm:w-56 sm:shrink-0'>
                        <span className='text-[14px] font-bold text-[color:var(--lp-text)]'>
                          {service.name}
                        </span>
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-bold',
                            availabilityBadgeClass[service.availability]
                          )}
                        >
                          {worksServiceAvailabilityLabels[service.availability]}
                        </span>
                      </div>
                      <p className='text-[13px] leading-6 text-[color:var(--lp-text-muted)]'>
                        {service.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className='rounded-[10px] border border-[color:var(--lp-line)] bg-[color:var(--lp-paper)] p-6'>
                <h3 className='flex items-center gap-2 font-serif-jp text-xl font-bold text-[color:var(--lp-text)]'>
                  <CircleSlash
                    className='h-5 w-5 text-[color:var(--lp-text-muted)]'
                    aria-hidden='true'
                  />
                  {worksNotProvided.title}
                </h3>
                <ul className='mt-4 flex flex-col gap-2 text-[14px] leading-7 text-[color:var(--lp-text)]'>
                  {worksNotProvided.items.map(item => (
                    <li key={item} className='flex gap-2'>
                      <span aria-hidden='true'>・</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className='mt-4 text-[13px] leading-6 text-[color:var(--lp-text-muted)]'>
                  {worksNotProvided.note}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Governance ===== */}
        <section
          id='governance'
          aria-labelledby='governance-title'
          className='border-y border-[color:var(--lp-line)] bg-[color:var(--lp-paper-warm)] py-16 sm:py-24'
        >
          <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='governance-title'
              eyebrow='Governance'
              title='対象・権限・承認・記録を確かめる仕組み'
            />
            <div className='grid gap-4 md:grid-cols-2'>
              {worksGovernanceItems.map(item => (
                <div
                  key={item.claimId}
                  className='rounded-[10px] border border-[color:var(--lp-line)] bg-white p-6'
                >
                  <h3 className='flex items-center gap-2 font-serif-jp text-lg font-bold text-[color:var(--lp-text)]'>
                    <CheckCircle2
                      className='h-5 w-5 shrink-0 text-[color:var(--lp-good)]'
                      aria-hidden='true'
                    />
                    {item.title}
                  </h3>
                  <p className='mt-3 text-[14px] leading-7 text-[color:var(--lp-text-muted)]'>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Compare ===== */}
        <section
          id='compare'
          aria-labelledby='compare-title'
          className='bg-white py-16 sm:py-24'
        >
          <div className='mx-auto max-w-5xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='compare-title'
              eyebrow='Works and OS'
              title='Tiramisu OSとの違い'
              lead='Tiramisu Worksは、Tiramisu OSの廉価版ではありません。目的に合わせてお選びください。店舗数だけで決める必要はありません。'
            />
            <ProductComparison />
            <Link
              href='/os'
              prefetch={false}
              className='mt-6 inline-flex min-h-11 items-center gap-2 rounded-[6px] text-[14px] font-bold text-[color:var(--lp-text)] underline underline-offset-4 hover:text-[color:var(--lp-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-ink)]'
            >
              Tiramisu OSを見る
              <ArrowRight className='h-4 w-4' aria-hidden='true' />
            </Link>
          </div>
        </section>

        {/* ===== Pricing ===== */}
        <section
          id='pricing'
          aria-labelledby='pricing-title'
          className='border-y border-[color:var(--lp-line)] bg-[color:var(--lp-paper)] py-16 sm:py-24'
        >
          <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='pricing-title'
              eyebrow='Pricing'
              title={worksPricingCopy.title}
              lead={worksPricingCopy.lead}
            />

            <h3 className='font-serif-jp text-lg font-bold text-[color:var(--lp-text)]'>
              導入の流れ
            </h3>
            <ol className='mt-4 grid gap-2 sm:grid-cols-5 sm:gap-3'>
              {worksOnboardingSteps.map((step, index) => (
                <li
                  key={step.title}
                  className='flex items-start gap-3 rounded-[10px] border border-[color:var(--lp-line)] bg-white px-4 py-3 sm:flex-col sm:gap-1 sm:p-4'
                >
                  <p className='pt-0.5 font-mono text-[11px] font-bold text-[color:var(--lp-works)] sm:pt-0'>
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <div>
                    <p className='text-[14px] font-bold text-[color:var(--lp-text)]'>
                      {step.title}
                    </p>
                    <p className='mt-1 text-[12px] leading-5 text-[color:var(--lp-text-muted)]'>
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <p className='mt-12 inline-flex rounded-full border border-[color:var(--lp-accent-line)] bg-[color:var(--lp-accent-tint)] px-3 py-1 text-[12px] font-bold text-[color:var(--lp-accent-strong)]'>
              {worksPricingCopy.provisionalLabel}
            </p>
            <div className='mt-6 grid gap-5 lg:grid-cols-3 lg:items-stretch'>
              {worksPlans.map(plan => {
                const planContactHref = createContactHref({
                  product: 'works',
                  intent: 'sales',
                  plan: plan.key,
                });
                return (
                  <article
                    key={plan.key}
                    aria-labelledby={`works-plan-${plan.key}`}
                    className={cn(
                      'relative flex flex-col rounded-[14px] bg-white p-6 sm:p-7',
                      plan.featured
                        ? 'border-2 border-[color:var(--lp-accent)] shadow-[0_24px_60px_-36px_rgba(43,58,63,0.55)] lg:-translate-y-2'
                        : 'border border-[color:var(--lp-line)]'
                    )}
                  >
                    {plan.featured ? (
                      <p className='absolute -top-3 left-6 rounded-[4px] bg-[color:var(--lp-accent)] px-3 py-1 text-[11px] font-bold text-[color:var(--lp-ink-deep)]'>
                        {worksPricingCopy.featuredBadge}
                      </p>
                    ) : null}
                    <h3
                      id={`works-plan-${plan.key}`}
                      className='font-serif-en text-2xl font-bold text-[color:var(--lp-text)]'
                    >
                      {plan.name}
                    </h3>
                    {plan.featured ? (
                      <p className='mt-1 text-[12px] font-bold text-[color:var(--lp-accent-strong)]'>
                        {worksPricingCopy.featuredCaption}
                      </p>
                    ) : null}
                    <p className='mt-2 text-[13px] font-semibold text-[color:var(--lp-text-muted)]'>
                      {plan.scope}
                    </p>
                    <dl className='mt-5 space-y-3 border-y border-[color:var(--lp-line)] py-4'>
                      <div className='flex items-baseline justify-between gap-3'>
                        <dt className='text-[13px] text-[color:var(--lp-text-muted)]'>
                          月額
                        </dt>
                        <dd className='text-right'>
                          <span className='font-mono text-[28px] font-bold tabular-nums text-[color:var(--lp-text)]'>
                            {formatYen(plan.monthlyFeeYen)}
                          </span>
                          <span className='ml-1 text-[12px] text-[color:var(--lp-text-muted)]'>
                            （税別）
                          </span>
                        </dd>
                      </div>
                      <div className='flex items-baseline justify-between gap-3'>
                        <dt className='text-[13px] text-[color:var(--lp-text-muted)]'>
                          初期費用
                        </dt>
                        <dd className='text-right'>
                          <span className='font-mono text-[17px] font-bold tabular-nums text-[color:var(--lp-text)]'>
                            {formatYen(plan.initialFeeYen)}
                          </span>
                          <span className='ml-1 text-[12px] text-[color:var(--lp-text-muted)]'>
                            （税別）
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <p className='mt-4 flex-1 text-[13px] leading-7 text-[color:var(--lp-text)]'>
                      {plan.description}
                    </p>
                    <Link
                      href={planContactHref}
                      prefetch={false}
                      className={cn(
                        'mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] px-5 py-3 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                        plan.featured
                          ? 'bg-[color:var(--lp-works)] text-white hover:bg-[color:var(--lp-works-hover)] focus-visible:ring-[color:var(--lp-works)]'
                          : 'border border-[color:var(--lp-works)] bg-white text-[color:var(--lp-works)] hover:bg-[color:var(--lp-works-soft)] focus-visible:ring-[color:var(--lp-works)]'
                      )}
                    >
                      {plan.ctaLabel}
                      {plan.ctaLabel.includes(plan.name) ? null : (
                        <span className='sr-only'>（{plan.name}プラン）</span>
                      )}
                      <ArrowRight className='h-4 w-4' aria-hidden='true' />
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className='mt-8 flex flex-col gap-4 rounded-[14px] border border-dashed border-[color:var(--lp-line)] bg-white p-6 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <h3 className='font-serif-jp text-lg font-bold text-[color:var(--lp-text)]'>
                  {worksPricingCopy.custom.title}
                </h3>
                <p className='mt-2 text-[13px] leading-7 text-[color:var(--lp-text-muted)]'>
                  {worksPricingCopy.custom.description}
                </p>
              </div>
              <Link
                href={createContactHref({
                  product: 'works',
                  intent: 'sales',
                  plan: 'custom',
                })}
                prefetch={false}
                className='inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-[color:var(--lp-ink)] px-5 py-3 text-[14px] font-bold text-[color:var(--lp-ink)] transition-colors hover:bg-[color:var(--lp-paper-warm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-ink)] focus-visible:ring-offset-2'
              >
                {worksPricingCopy.custom.ctaLabel}
                <ArrowRight className='h-4 w-4' aria-hidden='true' />
              </Link>
            </div>

            <ul className='mt-6 flex flex-col gap-2 text-[12px] leading-6 text-[color:var(--lp-text-muted)]'>
              {worksPricingCopy.notes.map(note => (
                <li key={note}>※ {note}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section
          id='faq'
          aria-labelledby='faq-title'
          className='bg-white py-16 sm:py-24'
        >
          <div className='mx-auto max-w-3xl px-4 sm:px-6 lg:px-8'>
            <SectionHeading
              id='faq-title'
              eyebrow='FAQ'
              title='よくあるご質問'
            />
            <div className='border-t border-[color:var(--lp-line)]'>
              {worksFaqItems.map((item, index) => (
                <details
                  key={item.question}
                  open={index === 0}
                  className='group border-b border-[color:var(--lp-line)]'
                >
                  <summary className='flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 font-serif-jp text-[15px] font-bold text-[color:var(--lp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-ink)] [&::-webkit-details-marker]:hidden'>
                    {item.question}
                    <span
                      aria-hidden='true'
                      className='shrink-0 text-[20px] leading-none text-[color:var(--lp-ink)] transition-transform group-open:rotate-45'
                    >
                      +
                    </span>
                  </summary>
                  <p className='border-l-2 border-[color:var(--lp-accent-line)] pb-5 pl-4 text-[14px] leading-[1.9] text-[color:var(--lp-text-muted)]'>
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Final CTA ===== */}
        <section
          aria-labelledby='works-cta-title'
          className='bg-[color:var(--lp-ink)] py-16 text-white sm:py-20'
        >
          <div className='mx-auto flex max-w-4xl flex-col items-start gap-6 px-4 sm:px-6 lg:px-8'>
            <h2
              id='works-cta-title'
              className='font-serif-jp text-2xl font-bold leading-[1.45] sm:text-3xl'
            >
              <PhraseText text='今お使いのツールと、任せたい業務をお聞かせください。' />
            </h2>
            <p className='text-[15px] leading-8 text-white/80'>
              対応できる業務と接続先、必要な契約・費用を導入前に確認します。このページから申込み・決済はできません。
            </p>
            <Link
              href={worksSalesHref}
              prefetch={false}
              className={accentButtonClass}
            >
              {worksHeroCopy.primaryCtaLabel}
              <ArrowRight className='h-4 w-4' aria-hidden='true' />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

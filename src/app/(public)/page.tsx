import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  LogIn,
} from 'lucide-react';
import {
  faqItems,
  featureItems,
  navItems,
  planItems,
  problemItems,
  trustItems,
  valueItems,
} from '@/components/public/tiramisu-landing-content';
import { createCtaLink } from '@/components/public/tiramisu-landing-links';
import { TiramisuInteractiveSections } from '@/components/public/tiramisu-interactive-sections';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Tiramisu | 整骨院グループ向け本部管理OS',
  description:
    'Tiramisuは、5店舗以上の整骨院グループ向けに、日報・売上・予約・シフト・店舗比較を一元管理する本部管理OSです。',
};

const demoCta = createCtaLink('デモ相談をする', 'demo');
const documentCta = createCtaLink('資料請求する', 'document');
const contactCta = createCtaLink('問い合わせる', 'contact');

function CtaAnchor({
  cta,
  variant = 'primary',
  className,
}: {
  cta: typeof demoCta;
  variant?: 'primary' | 'secondary' | 'dark';
  className?: string;
}) {
  return (
    <a
      href={cta.href}
      target={cta.external ? '_blank' : undefined}
      rel={cta.external ? 'noreferrer' : undefined}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variant === 'primary' &&
          'bg-cyan-500 text-slate-950 hover:bg-cyan-400 focus-visible:ring-cyan-500',
        variant === 'secondary' &&
          'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-slate-500',
        variant === 'dark' &&
          'bg-slate-950 text-white hover:bg-slate-800 focus-visible:ring-slate-700',
        className
      )}
    >
      {cta.label}
      {cta.external ? (
        <ExternalLink className='h-4 w-4' aria-hidden='true' />
      ) : (
        <ArrowRight className='h-4 w-4' aria-hidden='true' />
      )}
    </a>
  );
}

export default function LandingPage() {
  return (
    <main className='min-h-screen bg-slate-50 text-slate-950'>
      <header className='sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 text-white backdrop-blur'>
        <div className='mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8'>
          <Link href='/' className='flex items-center gap-3'>
            <span className='flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 text-lg font-black text-slate-950'>
              T
            </span>
            <span className='text-lg font-bold tracking-normal'>Tiramisu</span>
          </Link>
          <nav className='hidden items-center gap-5 text-sm text-slate-300 lg:flex'>
            {navItems.map(item => (
              <a key={item.href} href={item.href} className='hover:text-white'>
                {item.label}
              </a>
            ))}
          </nav>
          <div className='hidden items-center gap-2 md:flex'>
            <Link
              href='/login'
              prefetch={false}
              className='inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-white/10'
            >
              <LogIn className='h-4 w-4' aria-hidden='true' />
              スタッフログイン
            </Link>
            <Link
              href='/admin/login'
              prefetch={false}
              className='inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-white/10'
            >
              管理者ログイン
            </Link>
            <CtaAnchor cta={demoCta} className='min-h-10 px-4 py-2' />
          </div>
        </div>
      </header>

      <section className='relative overflow-hidden bg-slate-950 text-white'>
        <div className='absolute inset-x-0 top-0 h-px bg-cyan-300/40' />
        <div className='mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-24'>
          <div className='flex flex-col justify-center space-y-7'>
            <div className='inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100'>
              <Building2 className='h-4 w-4' aria-hidden='true' />
              5店舗以上の整骨院グループ向け
            </div>
            <div className='space-y-5'>
              <h1 className='max-w-4xl text-4xl font-black leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl'>
                5店舗以上の整骨院グループ向け 本部管理OS
              </h1>
              <p className='max-w-3xl text-lg leading-9 text-slate-200'>
                日報・売上・予約・シフト・店舗比較を一元化。
                Excel・LINE・紙・各店舗報告に分断された数字を、
                ひとつの経営ダッシュボードへ。
              </p>
              <p className='max-w-3xl text-base leading-8 text-slate-300'>
                本部の集計・確認・報告作業を減らし、院長と経営者が
                毎日同じ数字で動ける状態をつくります。
              </p>
            </div>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <CtaAnchor cta={demoCta} />
              <CtaAnchor cta={documentCta} variant='secondary' />
            </div>
            <div className='flex flex-wrap gap-3 text-sm text-slate-300'>
              <Link
                href='/login'
                prefetch={false}
                className='underline underline-offset-4'
              >
                スタッフログイン
              </Link>
              <Link
                href='/admin/login'
                prefetch={false}
                className='underline underline-offset-4'
              >
                管理者ログイン
              </Link>
              <Link
                href='/terms'
                prefetch={false}
                className='underline underline-offset-4'
              >
                利用規約
              </Link>
              <Link
                href='/privacy'
                prefetch={false}
                className='underline underline-offset-4'
              >
                プライバシーポリシー
              </Link>
            </div>
          </div>

          <div className='relative min-h-[440px] rounded-lg border border-white/10 bg-white/5 p-4 shadow-2xl shadow-cyan-950/40 sm:p-6'>
            <div className='rounded-lg bg-white p-4 text-slate-950 shadow-xl'>
              <div className='mb-4 flex items-center justify-between border-b border-slate-200 pb-4'>
                <div>
                  <p className='text-sm font-semibold text-slate-500'>
                    Group Dashboard
                  </p>
                  <p className='text-xl font-bold'>本部経営サマリー</p>
                </div>
                <span className='rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700'>
                  Daily
                </span>
              </div>
              <div className='grid gap-3 sm:grid-cols-3'>
                {[
                  ['8店舗', '確認対象'],
                  ['92.4%', '日報提出率'],
                  ['-18h', '集計削減見込み'],
                ].map(([value, label]) => (
                  <div key={label} className='rounded-lg bg-slate-50 p-4'>
                    <p className='text-2xl font-black'>{value}</p>
                    <p className='mt-1 text-xs font-semibold text-slate-500'>
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              <div className='mt-4 space-y-3'>
                {[
                  ['新宿院', '売上達成率 104%', 'bg-emerald-500'],
                  ['横浜院', 'キャンセル率 要確認', 'bg-amber-500'],
                  ['大宮院', '午後枠に空きあり', 'bg-cyan-500'],
                ].map(([store, note, color]) => (
                  <div
                    key={store}
                    className='flex items-center justify-between rounded-lg border border-slate-200 p-3'
                  >
                    <div className='flex items-center gap-3'>
                      <span className={cn('h-3 w-3 rounded-full', color)} />
                      <span className='font-bold'>{store}</span>
                    </div>
                    <span className='text-sm text-slate-600'>{note}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className='absolute bottom-5 right-5 max-w-xs rounded-lg border border-cyan-300/30 bg-slate-900 p-4 text-sm leading-6 text-cyan-50 shadow-xl'>
              本部、院長、経営者が同じ数字を見て、店舗別の確認と改善会議を進めるための管理基盤です。
            </div>
          </div>
        </div>
      </section>

      <section id='problems' className='bg-white py-20'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 max-w-3xl space-y-4'>
            <p className='text-sm font-bold uppercase text-cyan-700'>
              Problems
            </p>
            <h2 className='text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl'>
              店舗が増えるほど、本部の確認作業は静かに膨らみます。
            </h2>
            <p className='text-base leading-8 text-slate-600'>
              Tiramisuは単店舗向けの日報ツールではありません。多店舗経営で分断された数字を、
              本部が毎日見られる形にそろえるための業務基盤です。
            </p>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            {problemItems.map(item => (
              <div
                key={item.title}
                className='rounded-lg border border-slate-200 p-5'
              >
                <h3 className='text-lg font-bold text-slate-950'>
                  {item.title}
                </h3>
                <p className='mt-3 text-sm leading-7 text-slate-600'>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className='bg-slate-100 py-20'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='grid gap-5 md:grid-cols-2 lg:grid-cols-4'>
            {valueItems.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className='rounded-lg bg-white p-5 shadow-sm'
                >
                  <Icon className='h-7 w-7 text-cyan-700' aria-hidden='true' />
                  <h3 className='mt-4 text-lg font-bold'>{item.title}</h3>
                  <p className='mt-3 text-sm leading-7 text-slate-600'>
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id='features' className='bg-white py-20'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 max-w-3xl space-y-4'>
            <p className='text-sm font-bold uppercase text-cyan-700'>
              Features
            </p>
            <h2 className='text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl'>
              日報、売上、予約、シフト、店舗比較を本部で扱いやすくする。
            </h2>
          </div>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {featureItems.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className='rounded-lg border border-slate-200 p-5'
                >
                  <Icon className='h-6 w-6 text-slate-900' aria-hidden='true' />
                  <h3 className='mt-4 text-base font-bold'>{item.title}</h3>
                  <p className='mt-3 text-sm leading-7 text-slate-600'>
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <TiramisuInteractiveSections />

      <section id='pricing' className='bg-slate-100 py-20'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end'>
            <div className='space-y-4'>
              <p className='text-sm font-bold uppercase text-cyan-700'>
                Pricing
              </p>
              <h2 className='text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl'>
                5店舗以上の法人導入を前提にした料金設計です。
              </h2>
            </div>
            <p className='rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-sm leading-7 text-cyan-950'>
              5〜10店舗規模で、本部・院長の集計確認作業が月30時間削減される場合、
              時給3,000円換算で月90,000円相当。さらに、キャンセル率・リピート率・
              店舗別粗利の改善余地まで可視化できます。
            </p>
          </div>

          <div className='grid gap-5 lg:grid-cols-3'>
            {planItems.map(plan => (
              <div
                key={plan.name}
                className={cn(
                  'relative rounded-lg border bg-white p-6 shadow-sm',
                  plan.recommended
                    ? 'border-cyan-500 shadow-xl shadow-cyan-100'
                    : 'border-slate-200'
                )}
              >
                {plan.recommended ? (
                  <span className='absolute right-5 top-5 rounded-full bg-cyan-500 px-3 py-1 text-xs font-black text-slate-950'>
                    主力プラン
                  </span>
                ) : null}
                <h3 className='text-xl font-black'>{plan.name}</h3>
                <p className='mt-3 text-sm leading-7 text-slate-600'>
                  {plan.positioning}
                </p>
                <div className='mt-6'>
                  <span className='text-4xl font-black'>
                    {plan.monthlyPrice}
                  </span>
                  <span className='text-sm font-semibold text-slate-500'>
                    {' '}
                    / 月
                  </span>
                </div>
                <dl className='mt-5 grid gap-3 text-sm'>
                  <div className='flex justify-between gap-4 border-b border-slate-100 pb-3'>
                    <dt className='text-slate-500'>含まれる店舗数</dt>
                    <dd className='font-bold'>{plan.stores}</dd>
                  </div>
                  <div className='flex justify-between gap-4 border-b border-slate-100 pb-3'>
                    <dt className='text-slate-500'>初期費用</dt>
                    <dd className='font-bold'>{plan.initialCost}</dd>
                  </div>
                  <div className='flex justify-between gap-4'>
                    <dt className='text-slate-500'>追加店舗</dt>
                    <dd className='font-bold'>{plan.extraStore}</dd>
                  </div>
                </dl>
                <ul className='mt-6 space-y-3'>
                  {plan.features.map(feature => (
                    <li
                      key={feature}
                      className='flex gap-2 text-sm text-slate-700'
                    >
                      <CheckCircle2
                        className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600'
                        aria-hidden='true'
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CtaAnchor
                  cta={demoCta}
                  variant={plan.recommended ? 'dark' : 'secondary'}
                  className='mt-6 w-full'
                />
              </div>
            ))}
          </div>

          <p className='mt-6 rounded-lg bg-white p-4 text-sm leading-7 text-slate-600'>
            単店舗向けの簡易プランは月額12,000円〜。詳細はお問い合わせください。
            税込・税抜の表記は未確定のため、このLPでは断定していません。
          </p>
        </div>
      </section>

      <section id='contact' className='bg-slate-950 py-20 text-white'>
        <div className='mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8'>
          <div className='space-y-5'>
            <p className='text-sm font-bold uppercase text-cyan-200'>Contact</p>
            <h2 className='text-3xl font-bold tracking-normal sm:text-4xl'>
              まずは店舗数と現在の管理方法をもとに、デモ相談で確認します。
            </h2>
            <p className='text-base leading-8 text-slate-300'>
              初回LPでは本体側に送信フォームを実装していません。 Google
              Formの正式URLが設定されるまでは、このセクションへ案内します。
            </p>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <CtaAnchor cta={demoCta} />
              <CtaAnchor cta={documentCta} variant='secondary' />
              <CtaAnchor cta={contactCta} variant='secondary' />
            </div>
          </div>
          <div className='rounded-lg border border-white/10 bg-white/5 p-5'>
            <h3 className='text-lg font-bold'>問い合わせ時に確認したいこと</h3>
            <ul className='mt-4 space-y-3 text-sm leading-7 text-slate-300'>
              {[
                '会社名 / 屋号、氏名、連絡先',
                '店舗数、役職、現在の管理方法',
                '関心のある内容: デモ相談、資料請求、料金相談、稟議相談',
                '困っていること、希望連絡方法、個人情報の取り扱いへの同意',
              ].map(item => (
                <li key={item} className='flex gap-2'>
                  <CheckCircle2
                    className='mt-1 h-4 w-4 shrink-0 text-cyan-300'
                    aria-hidden='true'
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id='faq' className='bg-white py-20'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 max-w-3xl space-y-4'>
            <p className='text-sm font-bold uppercase text-cyan-700'>FAQ</p>
            <h2 className='text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl'>
              導入前によく確認されること
            </h2>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            {faqItems.map(item => (
              <div
                key={item.question}
                className='rounded-lg border border-slate-200 p-5'
              >
                <h3 className='text-base font-bold'>{item.question}</h3>
                <p className='mt-3 text-sm leading-7 text-slate-600'>
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className='bg-slate-100 py-14'>
        <div className='mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:px-8'>
          {trustItems.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className='rounded-lg bg-white p-5'>
                <Icon className='h-6 w-6 text-emerald-700' aria-hidden='true' />
                <h3 className='mt-4 text-lg font-bold'>{item.title}</h3>
                <p className='mt-3 text-sm leading-7 text-slate-600'>
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className='bg-slate-950 py-10 text-slate-300'>
        <div className='mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8'>
          <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-center'>
            <Link href='/' className='text-lg font-black text-white'>
              Tiramisu
            </Link>
            <div className='flex flex-wrap gap-4 text-sm'>
              <Link href='/login' prefetch={false} className='hover:text-white'>
                スタッフログイン
              </Link>
              <Link
                href='/admin/login'
                prefetch={false}
                className='hover:text-white'
              >
                管理者ログイン
              </Link>
              <Link href='/terms' prefetch={false} className='hover:text-white'>
                利用規約
              </Link>
              <Link
                href='/privacy'
                prefetch={false}
                className='hover:text-white'
              >
                プライバシーポリシー
              </Link>
              <a href={contactCta.href} className='hover:text-white'>
                問い合わせ
              </a>
            </div>
          </div>
          <p className='text-xs leading-6 text-slate-500'>
            Tiramisuは、5店舗以上の整骨院グループ向けに、日報・売上・予約・シフト・店舗比較を一元管理する本部管理OSです。
          </p>
        </div>
      </footer>
    </main>
  );
}

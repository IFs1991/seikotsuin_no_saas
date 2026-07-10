import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import {
  comparisonRows,
  featureItems,
  heroStats,
  heroStoreRows,
  marqueePrefectures,
  navItems,
  pillarItems,
  planItems,
  problemItems,
  timelineItems,
} from '@/components/public/lp-content';
import { createCtaLink, type CtaLink } from '@/components/public/lp-links';
import {
  DynamicLpAiShowcase,
  DynamicLpRoiCalculator,
  DynamicLpStickyCta,
} from '@/components/public/lp-dynamic-sections';
import { LpFaq } from '@/components/public/lp-faq';
import { cn } from '@/lib/utils';
import tiramisuWordmark from '@/images/brand/tiramisu-wordmark.png';
import './lp-styles.css';

export const metadata: Metadata = {
  title: 'Tiramisu | 5店舗以上の整骨院グループ向け 本部管理OS',
  description:
    'Tiramisuは、5店舗以上の整骨院グループ向けに、日報・売上・予約・シフト・店舗比較を一元管理する本部管理OSです。',
};

const demoCta = createCtaLink('デモ相談をする', 'demo');
const documentCta = createCtaLink('資料請求する', 'document');
const contactCta = createCtaLink('問い合わせる', 'contact');

const toneDot: Record<(typeof heroStoreRows)[number]['tone'], string> = {
  good: 'bg-[#3F7D5C]',
  warn: 'bg-[#C4956C]',
  info: 'bg-[#2B3A3F]',
};

function CtaAnchor({
  cta,
  variant = 'primary',
  className,
}: {
  cta: CtaLink;
  variant?: 'primary' | 'secondary' | 'dark' | 'light';
  className?: string;
}) {
  return (
    <a
      href={cta.href}
      target={cta.external ? '_blank' : undefined}
      rel={cta.external ? 'noreferrer' : undefined}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-6 py-3 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variant === 'primary' &&
          'bg-[#2B3A3F] text-white hover:bg-[#1f292d] focus-visible:ring-[#C4956C]',
        variant === 'secondary' &&
          'border border-[#2B3A3F]/25 bg-white text-[#2B3A3F] hover:bg-[#2B3A3F]/5 focus-visible:ring-[#2B3A3F]',
        variant === 'dark' &&
          'bg-[#C4956C] text-white hover:bg-[#b3855d] focus-visible:ring-[#E8B87A]',
        variant === 'light' &&
          'bg-white text-[#2B3A3F] hover:bg-[#F3EFE8] focus-visible:ring-[#C4956C]',
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

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className='font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C4956C]'>
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      {/* ===== Header ===== */}
      <header className='sticky top-0 z-40 border-b border-white/10 bg-[#2B3A3F]/95 text-white backdrop-blur'>
        <div className='mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8'>
          <Link href='/' className='flex items-center gap-3'>
            <Image
              src={tiramisuWordmark}
              alt='Tiramisu'
              width={178}
              height={50}
              className='h-11 w-auto shrink-0 object-contain'
              priority
            />
          </Link>
          <nav className='hidden items-center gap-5 text-[13px] text-white/70 lg:flex'>
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
              className='inline-flex min-h-10 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold text-white/80 hover:bg-white/10'
            >
              <LogIn className='h-4 w-4' aria-hidden='true' />
              スタッフログイン
            </Link>
            <CtaAnchor
              cta={demoCta}
              variant='dark'
              className='min-h-10 px-4 py-2'
            />
          </div>
          <CtaAnchor
            cta={demoCta}
            variant='dark'
            className='min-h-10 px-4 py-2 md:hidden'
          />
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className='relative overflow-hidden bg-[#2B3A3F] text-white'>
        <div className='absolute inset-x-0 top-0 h-px bg-[#C4956C]/50' />
        <div className='mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.92fr] lg:px-8 lg:py-24'>
          <div className='lp-fade-up flex flex-col justify-center gap-7'>
            <span className='inline-flex w-fit items-center gap-2 rounded-full border border-[#C4956C]/40 bg-[#C4956C]/15 px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-wider text-[#E8B87A]'>
              <Building2 className='h-4 w-4' aria-hidden='true' />
              For 5+ clinic groups
            </span>
            <div className='space-y-5'>
              <h1 className='font-serif-jp text-4xl font-bold leading-[1.25] tracking-tight sm:text-5xl lg:text-[56px]'>
                店舗が増えるほど、
                <br />
                本部の数字は
                <span className='lp-shimmer font-bold'>ひとつに</span>。
              </h1>
              <p className='max-w-2xl text-[17px] leading-9 text-white/85'>
                5店舗以上の整骨院グループ向け本部管理OS。日報・売上・予約・シフト・店舗比較を一元化し、
                Excel・LINE・紙・各店舗報告に分断された数字を、ひとつの経営ダッシュボードへ。
              </p>
              <p className='max-w-2xl text-[15px] leading-8 text-white/65'>
                本部の集計・確認・報告作業を減らし、院長と経営者が毎日同じ数字で動ける状態をつくります。
              </p>
            </div>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <CtaAnchor cta={demoCta} variant='dark' />
              <CtaAnchor cta={documentCta} variant='light' />
            </div>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/55'>
              <Link
                href='/login'
                prefetch={false}
                className='underline underline-offset-4 hover:text-white'
              >
                スタッフログイン
              </Link>
              <Link
                href='/admin/login'
                prefetch={false}
                className='underline underline-offset-4 hover:text-white'
              >
                管理者ログイン
              </Link>
              <span className='inline-flex items-center gap-1.5'>
                <ShieldCheck
                  className='h-4 w-4 text-[#3F7D5C]'
                  aria-hidden='true'
                />
                公開LPは業務データに接続しません
              </span>
            </div>
          </div>

          {/* ダッシュボードモック */}
          <div className='lp-fade-up lp-fade-up-2 relative min-h-[420px]'>
            <div className='rounded-[14px] border border-white/10 bg-white/5 p-4 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)] sm:p-5'>
              <div className='rounded-[10px] bg-white p-4 text-[#1A1A1A] shadow-xl'>
                <div className='mb-4 flex items-center justify-between border-b border-[#E8E4DE] pb-4'>
                  <div>
                    <p className='font-mono text-[11px] font-semibold uppercase tracking-wider text-[#595959]'>
                      Group Dashboard
                    </p>
                    <p className='font-serif-jp text-xl font-bold'>
                      本部経営サマリー
                    </p>
                  </div>
                  <span className='rounded-full bg-[#3F7D5C]/10 px-3 py-1 font-mono text-[11px] font-bold text-[#3F7D5C]'>
                    Daily
                  </span>
                </div>
                <div className='grid gap-3 sm:grid-cols-3'>
                  {heroStats.map(stat => (
                    <div
                      key={stat.label}
                      className='rounded-[8px] bg-[#FAF8F5] p-4'
                    >
                      <p className='font-mono text-2xl font-bold'>
                        {stat.value}
                      </p>
                      <p className='mt-1 text-[11px] font-semibold text-[#595959]'>
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
                <div className='mt-4 space-y-3'>
                  {heroStoreRows.map(row => (
                    <div
                      key={row.store}
                      className='flex items-center justify-between rounded-[8px] border border-[#E8E4DE] p-3'
                    >
                      <span className='flex items-center gap-3'>
                        <span
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            toneDot[row.tone]
                          )}
                        />
                        <span className='font-bold'>{row.store}</span>
                      </span>
                      <span className='text-[13px] text-[#595959]'>
                        {row.note}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className='absolute -bottom-4 right-4 max-w-[16rem] rounded-[10px] border border-[#C4956C]/30 bg-[#1f292d] p-4 text-[13px] leading-6 text-[#E8B87A] shadow-xl'>
                本部・院長・経営者が同じ数字を見て、店舗別の確認と改善会議を進めるための管理基盤です。
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Marquee（導入検討エリア） ===== */}
      <div className='overflow-hidden border-y border-[#E8E4DE] bg-[#FAF8F5] py-4'>
        <div className='lp-marquee-track flex items-center gap-8 whitespace-nowrap'>
          {[0, 1].map(loop => (
            <div
              key={loop}
              className='flex items-center gap-8 whitespace-nowrap'
              aria-hidden={loop === 1}
            >
              <span className='font-mono text-[12px] uppercase tracking-widest text-[#595959]'>
                導入検討エリア
              </span>
              {marqueePrefectures.map(pref => (
                <span
                  key={`${loop}-${pref}`}
                  className='font-serif-jp text-[14px] font-medium text-[#1A1A1A]'
                >
                  {pref}
                </span>
              ))}
              <span className='font-mono text-[12px] text-[#C4956C]'>
                + more
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Problems ===== */}
      <section id='problems' className='bg-white py-20 md:py-28'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-12 max-w-3xl space-y-4'>
            <SectionEyebrow>Problems</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              店舗が増えるほど、本部の確認作業は静かに膨らみます。
            </h2>
            <p className='text-[15px] leading-8 text-[#595959]'>
              Tiramisuは単店舗向けの日報ツールではありません。多店舗経営で分断された数字を、
              本部が毎日見られる形にそろえるための業務基盤です。
            </p>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            {problemItems.map(item => (
              <div
                key={item.title}
                className='rounded-[8px] border border-[#E8E4DE] bg-[#FAF8F5] p-6'
              >
                <h3 className='font-serif-jp text-lg font-bold text-[#1A1A1A]'>
                  {item.title}
                </h3>
                <p className='mt-3 text-[14px] leading-7 text-[#595959]'>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Pillars ===== */}
      <section className='border-y border-[#E8E4DE] bg-[#F3EFE8] py-20 md:py-28'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-12 max-w-3xl space-y-3'>
            <SectionEyebrow>What You Get</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              本部に必要な3つを、ひとつの基盤で。
            </h2>
          </div>
          <div className='grid gap-5 md:grid-cols-3 md:gap-6'>
            {pillarItems.map(pillar => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.index}
                  className={cn(
                    'relative flex flex-col rounded-[10px] p-6 md:p-8',
                    pillar.core
                      ? 'border-2 border-[#C4956C]/40 bg-gradient-to-br from-[#C4956C]/12 to-white shadow-[0_24px_60px_-36px_rgba(196,149,108,0.7)] md:-translate-y-2'
                      : 'border border-[#E8E4DE] bg-white'
                  )}
                >
                  {pillar.core && (
                    <span className='absolute -top-3 left-6 rounded bg-[#C4956C] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white'>
                      Core
                    </span>
                  )}
                  <div
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-[8px]',
                      pillar.core
                        ? 'bg-[#C4956C]/20 text-[#C4956C]'
                        : 'bg-[#2B3A3F]/10 text-[#2B3A3F]'
                    )}
                  >
                    <Icon className='h-5 w-5' aria-hidden='true' />
                  </div>
                  <p className='mt-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#C4956C]'>
                    {pillar.index} / {pillar.eyebrow}
                  </p>
                  <h3 className='mt-1 font-serif-jp text-xl font-bold text-[#1A1A1A]'>
                    {pillar.title}
                  </h3>
                  <p className='mt-3 text-[13px] leading-7 text-[#595959]'>
                    {pillar.description}
                  </p>
                  <ul className='mt-4 flex flex-col gap-2'>
                    {pillar.bullets.map(bullet => (
                      <li
                        key={bullet}
                        className='flex items-center gap-2 text-[13px] text-[#1A1A1A]'
                      >
                        <CheckCircle2
                          className='h-4 w-4 shrink-0 text-[#3F7D5C]'
                          aria-hidden='true'
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id='features' className='bg-white py-20 md:py-28'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-12 max-w-3xl space-y-3'>
            <SectionEyebrow>Features</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              日報・売上・予約・シフト・店舗比較を、本部で扱いやすく。
            </h2>
          </div>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {featureItems.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className='rounded-[8px] border border-[#E8E4DE] bg-[#FAF8F5] p-5'
                >
                  <Icon className='h-6 w-6 text-[#C4956C]' aria-hidden='true' />
                  <h3 className='mt-4 font-serif-jp text-base font-bold text-[#1A1A1A]'>
                    {item.title}
                  </h3>
                  <p className='mt-2 text-[13px] leading-7 text-[#595959]'>
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== AI Showcase ===== */}
      <section
        id='ai'
        className='border-y border-[#E8E4DE] bg-[#F3EFE8] py-20 md:py-28'
      >
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 max-w-3xl space-y-3'>
            <SectionEyebrow>AI Chat / Real Scenarios</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              本部の「で、今どうなの？」に、その場で。
            </h2>
            <p className='text-[15px] leading-8 text-[#595959]'>
              店舗横断の数字を読み込んだAIに、自然言語で確認するイメージです。質問候補を選ぶと、分析イメージが表示されます。
            </p>
          </div>
          <DynamicLpAiShowcase />
        </div>
      </section>

      {/* ===== Founder Letter ===== */}
      <section className='bg-white py-20 md:py-28'>
        <div className='mx-auto grid max-w-5xl gap-12 px-4 sm:px-6 md:grid-cols-[0.42fr_0.58fr] md:gap-16 lg:px-8'>
          <div className='flex flex-col gap-5'>
            <div className='relative aspect-[4/5] w-full overflow-hidden rounded-[10px] border border-[#E8E4DE] bg-[#F3EFE8]'>
              <Image
                src='/images/lp/founder-letter-field-origin.jpg'
                alt='整骨院の受付で、紙資料とPC画面の数字を確認している様子'
                fill
                sizes='(min-width: 768px) 420px, 100vw'
                className='object-cover object-[55%_50%] saturate-[0.92]'
              />
              <div className='absolute inset-0 bg-gradient-to-t from-[#2B3A3F]/20 via-transparent to-transparent' />
            </div>
            <div className='rounded-[8px] border border-[#E8E4DE] bg-[#FAF8F5] p-5'>
              <ul className='flex flex-col gap-2.5 text-[13px] font-medium text-[#1A1A1A]'>
                {[
                  '紙・Excel・LINEに情報が分散',
                  '店舗が増えるほど本部確認が重くなる',
                  '数字を見に行く運営から、数字が集まる運営へ',
                ].map((line, index) => (
                  <li key={line} className='flex items-start gap-3'>
                    <span className='mt-0.5 font-mono text-[11px] font-bold tracking-wider text-[#C4956C]'>
                      0{index + 1}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className='flex flex-col'>
            <p className='font-mono text-[11px] uppercase tracking-[0.2em] text-[#595959]'>
              A letter from the founder
            </p>
            <h2 className='mt-4 font-serif-jp text-3xl font-bold leading-[1.45] text-[#1A1A1A] sm:text-[38px]'>
              「店舗が増えるほど、
              <br className='hidden md:block' />
              本部が見えなくなる。」
              <span className='mt-4 block text-lg font-medium text-[#595959] sm:text-xl'>
                ——その違和感が、Tiramisuの出発点でした。
              </span>
            </h2>
            <div className='mt-8 flex flex-col gap-5 text-[15px] leading-[1.95] text-[#1A1A1A]'>
              <p>
                多店舗の整骨院グループでは、店舗が増えるほど本部の確認作業が静かに膨らみます。
                日報はLINE、売上はExcel、予約は別システム。数字は確かにあるのに、
                <span className='font-bold'>
                  本部が全店を同じ目線で見られる場所がない。
                </span>
              </p>
              <p>
                集計や確認や報告のような
                <span className='font-bold'>
                  間接利益の業務が、直接利益の時間を圧迫している
                </span>
                ——この構造を、現場と本部の両方から見てきました。
              </p>
              <p>
                だからTiramisuは、派手な新機能ではなく、
                <span className='bg-[#C4956C]/15 px-1'>
                  本部が毎日同じ数字で動ける状態
                </span>
                をつくることに振り切っています。数字を読みに行くのではなく、数字のほうから要点が返ってくる。そんな本部運営を目指しています。
              </p>
            </div>
            <div className='mt-10 border-t border-[#E8E4DE] pt-6'>
              <p className='font-serif-jp text-2xl text-[#1A1A1A]'>
                Tiramisu 開発チーム
              </p>
              <p className='mt-1 font-mono text-[12px] tracking-wider text-[#595959]'>
                PRODUCT NOTE / FROM THE FIELD
              </p>
              <a
                href={contactCta.href}
                target={contactCta.external ? '_blank' : undefined}
                rel={contactCta.external ? 'noreferrer' : undefined}
                className='mt-3 inline-flex w-fit items-center gap-1 text-[13px] text-[#2B3A3F] underline underline-offset-4 transition-colors hover:text-[#C4956C]'
              >
                直接相談する
                <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ROI ===== */}
      <section
        id='roi'
        className='border-y border-[#E8E4DE] bg-[#FAF8F5] py-20 md:py-28'
      >
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 max-w-3xl space-y-3'>
            <SectionEyebrow>Back Office Impact</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              月額費用を、戻る時間と本部負荷で判断する。
            </h2>
            <p className='text-[15px] leading-8 text-[#595959]'>
              店舗数・日報確認・集計・会議資料作成にかかる時間から、本部業務の削減余地を簡易試算します。
              入力値は保存せず、外部APIにも送信しません。
            </p>
          </div>
          <DynamicLpRoiCalculator />
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id='pricing' className='bg-[#2B3A3F] py-20 text-white md:py-28'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end'>
            <div className='space-y-3'>
              <SectionEyebrow>Pricing</SectionEyebrow>
              <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] sm:text-4xl'>
                5店舗以上の法人導入を前提にした料金設計です。
              </h2>
            </div>
            <p className='rounded-[10px] border border-[#C4956C]/30 bg-[#C4956C]/12 p-4 text-[14px] leading-7 text-[#E8B87A]'>
              5〜10店舗規模で本部・院長の集計確認作業が月30時間削減される場合、時給3,000円換算で月90,000円相当。
              さらにキャンセル率・リピート率・店舗別粗利の改善余地まで可視化できます。
            </p>
          </div>
          <div className='grid gap-5 lg:grid-cols-3'>
            {planItems.map(plan => (
              <div
                key={plan.name}
                className={cn(
                  'relative flex flex-col rounded-[10px] p-6 md:p-7',
                  plan.recommended
                    ? 'border-2 border-[#C4956C] bg-[#C4956C]/12 md:-translate-y-2'
                    : 'border border-white/10 bg-white/5'
                )}
              >
                {plan.recommended && (
                  <span className='absolute -top-3 left-6 rounded bg-[#C4956C] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white'>
                    主力プラン
                  </span>
                )}
                <h3 className='font-serif-jp text-xl font-bold'>{plan.name}</h3>
                <p className='mt-2 text-[13px] leading-7 text-white/70'>
                  {plan.positioning}
                </p>
                <div className='mt-6 flex items-baseline gap-1'>
                  <span className='font-mono text-4xl font-bold'>
                    {plan.monthlyPrice}
                  </span>
                  <span className='text-[13px] font-semibold text-white/60'>
                    {' '}
                    / 月（税抜）
                  </span>
                </div>
                <dl className='mt-5 grid gap-3 text-[13px]'>
                  <div className='flex justify-between gap-4 border-b border-white/10 pb-3'>
                    <dt className='text-white/60'>含まれる店舗数</dt>
                    <dd className='font-bold'>{plan.stores}</dd>
                  </div>
                  <div className='flex justify-between gap-4 border-b border-white/10 pb-3'>
                    <dt className='text-white/60'>初期費用</dt>
                    <dd className='font-bold'>{plan.initialCost}</dd>
                  </div>
                  <div className='flex justify-between gap-4'>
                    <dt className='text-white/60'>追加店舗</dt>
                    <dd className='font-bold'>{plan.extraStore}</dd>
                  </div>
                </dl>
                <ul className='mt-6 flex flex-1 flex-col gap-3'>
                  {plan.features.map(feature => (
                    <li
                      key={feature}
                      className='flex gap-2 text-[13px] text-white/90'
                    >
                      <CheckCircle2
                        className='mt-0.5 h-4 w-4 shrink-0 text-[#3F7D5C]'
                        aria-hidden='true'
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CtaAnchor
                  cta={demoCta}
                  variant={plan.recommended ? 'dark' : 'light'}
                  className='mt-6 w-full'
                />
              </div>
            ))}
          </div>
          <p className='mt-6 rounded-[10px] border border-white/10 bg-white/5 p-4 text-[13px] leading-7 text-white/60'>
            単店舗向けの簡易プランは月額12,000円〜。詳細はお問い合わせください。
            税込・税抜の表記は条件により変わるため、最終金額はデモ相談で確認します。
          </p>
        </div>
      </section>

      {/* ===== Comparison ===== */}
      <section className='bg-white py-20 md:py-28'>
        <div className='mx-auto max-w-5xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 max-w-3xl space-y-3'>
            <SectionEyebrow>Comparison</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              他の選択肢と、何が違うのか。
            </h2>
          </div>

          {/* デスクトップ: テーブル */}
          <div className='hidden overflow-hidden rounded-[8px] border border-[#E8E4DE] md:block'>
            <table className='w-full text-left'>
              <thead className='border-b border-[#E8E4DE] bg-[#F3EFE8]'>
                <tr>
                  <th className='px-5 py-4 font-mono text-[12px] font-bold uppercase tracking-wider text-[#595959]'>
                    観点
                  </th>
                  <th className='px-5 py-4 text-[13px] font-bold text-[#1A1A1A]'>
                    Tiramisu
                  </th>
                  <th className='px-5 py-4 text-[13px] font-medium text-[#595959]'>
                    単店舗向けシステム
                  </th>
                  <th className='px-5 py-4 text-[13px] font-medium text-[#595959]'>
                    Excel運用
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, index) => (
                  <tr
                    key={row.axis}
                    className={cn(
                      'border-b border-[#E8E4DE] last:border-b-0',
                      index % 2 === 0 ? 'bg-white' : 'bg-[#FAF8F5]/60'
                    )}
                  >
                    <td className='px-5 py-4 text-[13px] font-bold text-[#1A1A1A]'>
                      {row.axis}
                    </td>
                    <td className='border-l-2 border-[#C4956C] bg-[#C4956C]/5 px-5 py-4 text-[13px] text-[#1A1A1A]'>
                      <span className='flex items-start gap-2'>
                        <CheckCircle2
                          className='mt-0.5 h-4 w-4 shrink-0 text-[#3F7D5C]'
                          aria-hidden='true'
                        />
                        {row.tiramisu}
                      </span>
                    </td>
                    <td className='px-5 py-4 text-[13px] text-[#595959]'>
                      {row.others}
                    </td>
                    <td className='px-5 py-4 text-[13px] text-[#595959]'>
                      {row.excel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル: カード */}
          <div className='flex flex-col gap-4 md:hidden'>
            {comparisonRows.map(row => (
              <div
                key={row.axis}
                className='overflow-hidden rounded-[8px] border border-[#E8E4DE]'
              >
                <div className='bg-[#F3EFE8] px-4 py-2 text-[13px] font-bold text-[#1A1A1A]'>
                  {row.axis}
                </div>
                <div className='flex items-start gap-2 border-l-2 border-[#C4956C] bg-[#C4956C]/5 p-4'>
                  <CheckCircle2
                    className='mt-0.5 h-4 w-4 shrink-0 text-[#3F7D5C]'
                    aria-hidden='true'
                  />
                  <div>
                    <p className='mb-0.5 text-[11px] font-bold text-[#C4956C]'>
                      Tiramisu
                    </p>
                    <p className='text-[13px] text-[#1A1A1A]'>{row.tiramisu}</p>
                  </div>
                </div>
                <div className='border-t border-[#E8E4DE] p-4 text-[12px] leading-6 text-[#595959]'>
                  <span className='font-bold'>単店舗向け:</span> {row.others}
                  <br />
                  <span className='font-bold'>Excel:</span> {row.excel}
                </div>
              </div>
            ))}
          </div>
          <p className='mt-6 text-[11px] italic text-[#595959]'>
            ※ 一般的な比較であり、個別システムの最新仕様は各社にご確認ください。
          </p>
        </div>
      </section>

      {/* ===== Timeline ===== */}
      <section className='border-y border-[#E8E4DE] bg-[#FAF8F5] py-20 md:py-28'>
        <div className='mx-auto max-w-4xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-12 max-w-3xl space-y-3'>
            <SectionEyebrow>How to Start</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] text-[#1A1A1A] sm:text-4xl'>
              導入は、現状確認から段階的に。
            </h2>
          </div>
          <div className='relative pl-8'>
            <div className='absolute left-[7px] top-1 h-full w-px bg-[#E8E4DE]' />
            <div className='flex flex-col gap-10'>
              {timelineItems.map(item => (
                <div key={item.phase} className='relative'>
                  <span
                    className={cn(
                      'absolute -left-8 top-1 h-3.5 w-3.5 rounded-full border-2',
                      item.active
                        ? 'lp-pulse border-[#3F7D5C] bg-[#3F7D5C]'
                        : 'border-[#E8E4DE] bg-white'
                    )}
                  />
                  <p
                    className={cn(
                      'font-mono text-[11px] font-bold uppercase tracking-widest',
                      item.active ? 'text-[#3F7D5C]' : 'text-[#595959]'
                    )}
                  >
                    {item.phase}
                  </p>
                  <h3 className='mt-1 font-serif-jp text-xl font-bold text-[#1A1A1A]'>
                    {item.title}
                  </h3>
                  <p className='mt-2 text-[14px] leading-8 text-[#595959]'>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id='faq' className='bg-white py-20 md:py-28'>
        <div className='mx-auto max-w-3xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-10 text-center'>
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2 className='mt-3 font-serif-jp text-3xl font-bold text-[#1A1A1A] sm:text-4xl'>
              よくあるご質問
            </h2>
          </div>
          <LpFaq />
        </div>
      </section>

      {/* ===== Contact ===== */}
      <section
        id='contact'
        className='scroll-mt-20 bg-[#2B3A3F] py-20 text-white md:py-28'
      >
        <div className='mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8'>
          <div className='space-y-5'>
            <SectionEyebrow>Contact</SectionEyebrow>
            <h2 className='font-serif-jp text-3xl font-bold leading-[1.3] sm:text-4xl'>
              店舗数と現在の管理方法をもとに、デモ相談で確認します。
            </h2>
            <p className='text-[15px] leading-8 text-white/70'>
              本部の確認フローや既存システムとの併用、導入スケジュールなど、導入前の論点を直接相談できます。
            </p>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <CtaAnchor cta={demoCta} variant='dark' />
              <CtaAnchor cta={documentCta} variant='light' />
            </div>
          </div>
          <div className='rounded-[10px] border border-white/10 bg-white/5 p-5'>
            <h3 className='font-serif-jp text-lg font-bold'>
              相談時に伺うこと
            </h3>
            <ul className='mt-4 flex flex-col gap-3 text-[14px] leading-7 text-white/75'>
              {[
                '会社名 / 屋号、ご担当者名、連絡先',
                '店舗数、役職、現在の管理方法',
                'ご関心: デモ相談 / 資料請求 / 料金相談 / 稟議相談',
                '困っていること、希望連絡方法',
              ].map(item => (
                <li key={item} className='flex gap-2'>
                  <CheckCircle2
                    className='mt-1 h-4 w-4 shrink-0 text-[#E8B87A]'
                    aria-hidden='true'
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className='bg-[#1f292d] py-12 text-white/70'>
        <div className='mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8'>
          <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-center'>
            <Link href='/' className='flex w-fit items-center gap-3'>
              <Image
                src={tiramisuWordmark}
                alt='Tiramisu'
                width={178}
                height={50}
                className='h-11 w-auto shrink-0 object-contain'
              />
            </Link>
            <div className='flex flex-wrap gap-x-5 gap-y-2 text-[13px]'>
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
              <a
                href={contactCta.href}
                target={contactCta.external ? '_blank' : undefined}
                rel={contactCta.external ? 'noreferrer' : undefined}
                className='hover:text-white'
              >
                問い合わせ
              </a>
            </div>
          </div>
          <p className='text-[12px] leading-6 text-white/45'>
            Tiramisuは、5店舗以上の整骨院グループ向けに、日報・売上・予約・シフト・店舗比較を一元管理する本部管理OSです。
          </p>
          <p className='font-mono text-[11px] text-white/30'>
            © 2026 Tiramisu. All rights reserved.
          </p>
        </div>
      </footer>

      <DynamicLpStickyCta />
    </div>
  );
}

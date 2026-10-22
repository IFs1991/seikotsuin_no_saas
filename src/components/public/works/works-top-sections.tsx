import Image from 'next/image';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Store,
  Workflow,
} from 'lucide-react';
import {
  controlPlaneItems,
  heroStats,
  heroTrustItems,
  principleItems,
  problemItems,
  useCaseItems,
} from '@/components/public/works-content';
import {
  CtaAnchor,
  Eyebrow,
  IntegrationNode,
  SectionHeading,
  WorkflowTrail,
  heroCta,
  iconMap,
} from '@/components/public/works/works-shared';
import { cn } from '@/lib/utils';
import worksLogo from '@/images/brand/tiramisu-works-logo.png';
export function WorksTopSections() {
  return (
    <>
      <section className='relative overflow-hidden bg-[#26363B] text-white'>
        <div
          className='works-hero-grid absolute inset-0 opacity-35'
          aria-hidden='true'
        />
        <div className='absolute -left-24 top-28 h-72 w-72 rounded-full bg-[#C88755]/10 blur-3xl' />
        <div className='absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-[#E3A36F]/10 blur-3xl' />
        <div className='relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.96fr_1.04fr] lg:px-8 lg:py-24'>
          <div className='works-fade-up flex flex-col justify-center'>
            <div className='mb-7 flex flex-wrap items-center gap-2'>
              <span className='inline-flex items-center gap-2 rounded-full border border-[#C88755]/35 bg-[#C88755]/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#F2B783]'>
                <Store className='h-4 w-4' aria-hidden='true' />
                For small teams / 1–3 locations
              </span>
              <span className='rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/65'>
                サロン・治療院・店舗型ビジネス
              </span>
            </div>
            <h1 className='font-serif-jp text-[42px] font-bold leading-[1.22] tracking-tight sm:text-[52px] lg:text-[62px]'>
              大きなシステムは
              <br />
              いらない。
              <br />
              今ある業務を、
              <br />
              <span className='works-copper-text'>AIでつなぐ。</span>
            </h1>
            <p className='mt-7 max-w-2xl text-[16px] leading-8 text-white/78 sm:text-[17px] sm:leading-9'>
              1〜3店舗のサロン・治療院向け。LINE、予約、Google、Instagramなど、すでに使っているツールを活かし、転記・確認・共有・投稿作成を
              <span className='font-bold text-white'>
                「現場で毎日回る仕組み」
              </span>
              に変えます。
            </p>
            <p className='mt-3 max-w-2xl text-[14px] leading-7 text-white/52'>
              AI研修ではなく、業務診断・設計・接続・スタッフ導入まで。必要な場合だけ小規模開発を行います。
            </p>
            <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
              <CtaAnchor cta={heroCta} variant='copper' />
              <a
                href='#use-cases'
                className='inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-white/20 bg-white/5 px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-white/10'
              >
                導入イメージを見る
                <ArrowRight className='h-4 w-4' aria-hidden='true' />
              </a>
            </div>
            <div className='mt-8 flex flex-col gap-2.5 text-[12px] text-white/62 sm:flex-row sm:flex-wrap sm:gap-x-5'>
              {heroTrustItems.map(item => (
                <span key={item} className='flex items-center gap-2'>
                  <CheckCircle2
                    className='h-4 w-4 shrink-0 text-[#E3A36F]'
                    aria-hidden='true'
                  />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className='works-fade-up works-fade-up-2 relative flex items-center'>
            <div className='relative w-full rounded-[16px] border border-white/10 bg-[#F8F5EF] p-4 text-[#26363B] shadow-[0_36px_90px_-36px_rgba(0,0,0,0.75)] sm:p-5'>
              <div className='flex items-center justify-between border-b border-[#DDD6CB] pb-4'>
                <div>
                  <p className='font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#B66F3E]'>
                    Daily workflow
                  </p>
                  <p className='mt-1 font-serif-jp text-lg font-bold'>
                    既存ツールを、ひとつの流れへ
                  </p>
                </div>
                <span className='inline-flex items-center gap-2 rounded-full bg-[#3F7D5C]/10 px-3 py-1 font-mono text-[10px] font-bold uppercase text-[#3F7D5C]'>
                  <span className='works-live-dot h-1.5 w-1.5 rounded-full bg-[#3F7D5C]' />
                  Live
                </span>
              </div>
              <div className='mt-4 grid gap-3 sm:grid-cols-[0.9fr_1.25fr_0.9fr] sm:items-stretch'>
                <div className='space-y-2.5'>
                  <p className='font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#777E80]'>
                    Customer touchpoints
                  </p>
                  <IntegrationNode integration='line' label='LINE公式' />
                  <IntegrationNode integration='booking' label='予約サービス' />
                  <IntegrationNode integration='instagram' label='Instagram' />
                </div>
                <div className='works-flow-center relative flex min-h-[230px] flex-col justify-between overflow-hidden rounded-[12px] bg-[#26363B] p-4 text-white'>
                  <div
                    className='absolute inset-0 works-mini-grid opacity-50'
                    aria-hidden='true'
                  />
                  <div className='relative'>
                    <span className='inline-flex rounded-full border border-[#E3A36F]/30 bg-[#E3A36F]/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#F2B783]'>
                      AI + Workflow
                    </span>
                    <Image
                      src={worksLogo}
                      alt=''
                      width={195}
                      height={63}
                      className='mt-4 h-auto w-[180px] max-w-full object-contain'
                      aria-hidden='true'
                    />
                    <p className='mt-3 text-[11px] leading-6 text-white/58'>
                      転記、要約、通知、承認、実行を一本の業務フローへ。
                    </p>
                  </div>
                  <div className='relative grid grid-cols-2 gap-2'>
                    {['接続', '判断', '承認', '記録'].map((label, index) => (
                      <div
                        key={label}
                        className='rounded-[7px] border border-white/10 bg-white/5 px-2.5 py-2'
                      >
                        <p className='font-mono text-[8px] text-[#E3A36F]'>
                          0{index + 1}
                        </p>
                        <p className='mt-0.5 text-[10px] font-bold'>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='space-y-2.5'>
                  <p className='font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#777E80]'>
                    Owner & team
                  </p>
                  <IntegrationNode
                    integration='google'
                    label='Google'
                    tone='copper'
                  />
                  <IntegrationNode
                    integration='slack'
                    label='Slack'
                    tone='copper'
                  />
                  <IntegrationNode
                    integration='chatgpt'
                    label='ChatGPT'
                    tone='copper'
                  />
                </div>
              </div>
              <div className='mt-4 rounded-[10px] border border-[#DAD3C8] bg-white p-4 shadow-sm'>
                <div className='flex items-center justify-between gap-3'>
                  <span className='flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#B66F3E]'>
                    <BellRing className='h-4 w-4' aria-hidden='true' />
                    Today&apos;s brief
                  </span>
                  <span className='text-[10px] font-semibold text-[#777E80]'>
                    08:30
                  </span>
                </div>
                <p className='mt-2 text-[12px] font-semibold leading-6 text-[#26363B]'>
                  明日の予約6件、空き枠2件、未対応LINE1件。投稿案は承認待ちです。
                </p>
              </div>
              <div className='absolute -bottom-5 -left-3 hidden rounded-[9px] border border-[#C88755]/30 bg-[#172428] px-4 py-3 text-[11px] font-semibold text-[#F2B783] shadow-xl sm:block'>
                人の承認後に外部へ実行
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className='border-b border-[#DDD6CB] bg-[#F6F1E9]'>
        <div className='mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8'>
          {heroStats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                'px-3 py-7 sm:px-6',
                index % 2 === 0 ? 'border-r border-[#DDD6CB]' : '',
                index === 1 ? 'lg:border-r' : '',
                index === 2 ? 'border-r border-[#DDD6CB]' : ''
              )}
            >
              <p className='font-serif-jp text-xl font-bold text-[#172428] sm:text-2xl'>
                {stat.value}
              </p>
              <p className='mt-1 text-[11px] leading-5 text-[#6A7274]'>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section id='problems' className='bg-white py-20 md:py-28'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <SectionHeading
            eyebrow='Problems'
            title={
              <>
                AIが足りないのではなく、
                <br />
                業務が分断されています。
              </>
            }
            description='便利なツールをもう一つ増やすのではなく、毎週繰り返している転記・確認・共有・後回しを特定し、既存の環境をつなぎ直します。'
          />
          <div className='mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {problemItems.map(item => {
              const Icon = item.icon ? iconMap[item.icon] : Workflow;
              return (
                <article
                  key={item.title}
                  className='group rounded-[10px] border border-[#E1DBD1] bg-[#FAF8F4] p-6 transition-transform duration-300 hover:-translate-y-1'
                >
                  <div className='flex items-center justify-between gap-4'>
                    <span className='font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#B66F3E]'>
                      {item.eyebrow}
                    </span>
                    <span className='flex h-10 w-10 items-center justify-center rounded-[8px] bg-white text-[#B66F3E] shadow-sm'>
                      <Icon className='h-5 w-5' aria-hidden='true' />
                    </span>
                  </div>
                  <h3 className='mt-5 font-serif-jp text-lg font-bold text-[#172428]'>
                    {item.title}
                  </h3>
                  <p className='mt-3 text-[13px] leading-7 text-[#636B6D]'>
                    {item.description}
                  </p>
                  <p className='mt-5 border-t border-[#E1DBD1] pt-4 text-[12px] font-bold text-[#3F7D5C]'>
                    {item.outcome}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      <section
        id='use-cases'
        className='border-y border-[#DDD6CB] bg-[#F2ECE3] py-20 md:py-28'
      >
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
          <SectionHeading
            eyebrow='What we implement'
            title={
              <>
                相談だけで終わらせず、
                <br />
                実際に動くところまで。
              </>
            }
            description='何を自動化するかは、ヒアリング後に決めます。既存コネクタと既存サービスで済むものを優先し、個別開発は必要な場合だけ行います。'
          />
          <div className='mt-12 grid gap-5 md:grid-cols-2'>
            {useCaseItems.map((item, index) => {
              const Icon = item.icon ? iconMap[item.icon] : Workflow;
              return (
                <article
                  key={item.title}
                  className='relative overflow-hidden rounded-[12px] border border-[#DDD6CB] bg-white p-6 sm:p-7'
                >
                  <span className='absolute right-5 top-4 font-mono text-5xl font-bold text-[#F0E9DF]'>
                    0{index + 1}
                  </span>
                  <div className='relative flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#26363B] text-[#F2B783]'>
                    <Icon className='h-5 w-5' aria-hidden='true' />
                  </div>
                  <p className='relative mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#B66F3E]'>
                    {item.eyebrow}
                  </p>
                  <h3 className='relative mt-1 font-serif-jp text-xl font-bold text-[#172428]'>
                    {item.title}
                  </h3>
                  <p className='relative mt-3 text-[13px] leading-7 text-[#636B6D]'>
                    {item.description}
                  </p>
                  {item.flowSteps ? (
                    <WorkflowTrail steps={item.flowSteps} />
                  ) : (
                    <div className='relative mt-5 rounded-[8px] bg-[#F6F1E9] px-4 py-3 font-mono text-[11px] font-semibold leading-6 text-[#435053]'>
                      {item.flow}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
      <section className='bg-white py-20 md:py-24'>
        <div className='mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.42fr_0.58fr] lg:px-8'>
          <div className='flex min-h-[310px] flex-col justify-between rounded-[14px] bg-[#26363B] p-7 text-white sm:p-9'>
            <div>
              <Eyebrow inverted>Design principle</Eyebrow>
              <blockquote className='mt-6 font-serif-jp text-3xl font-bold leading-[1.45] sm:text-[38px]'>
                「導入するのはAIではなく、
                <br />
                毎日回る仕組みです。」
              </blockquote>
            </div>
            <p className='mt-8 text-[13px] leading-7 text-white/56'>
              AIありきで設計しません。自動化しない方が安全・安い業務は、そのまま残します。
            </p>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            {principleItems.map(item => {
              const Icon = item.icon ? iconMap[item.icon] : Workflow;
              return (
                <article
                  key={item.title}
                  className='rounded-[10px] border border-[#E1DBD1] bg-[#FAF8F4] p-5'
                >
                  <div className='flex items-center justify-between'>
                    <span className='font-mono text-[10px] font-bold text-[#B66F3E]'>
                      {item.eyebrow}
                    </span>
                    <Icon
                      className='h-5 w-5 text-[#B66F3E]'
                      aria-hidden='true'
                    />
                  </div>
                  <h3 className='mt-4 font-serif-jp text-base font-bold text-[#172428]'>
                    {item.title}
                  </h3>
                  <p className='mt-2 text-[12px] leading-6 text-[#636B6D]'>
                    {item.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      <section className='overflow-hidden border-y border-white/10 bg-[#172428] py-20 text-white md:py-28'>
        <div className='mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.5fr_0.5fr] lg:px-8'>
          <div>
            <SectionHeading
              eyebrow='Thin control plane'
              title={
                <>
                  データを奪わず、
                  <br />
                  接続・承認・記録を束ねる。
                </>
              }
              description='顧客データの保管先は、原則として既存のGoogle Driveや各業務サービスのまま。Tiramisu Worksは、その上に薄い管理層を置きます。'
              inverted
            />
            <div className='mt-8 rounded-[12px] border border-white/10 bg-white/5 p-5'>
              <div className='grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center'>
                <div className='space-y-2'>
                  <IntegrationNode
                    integration='line'
                    label='LINE / 予約 / SNS'
                    tone='dark'
                  />
                  <IntegrationNode
                    integration='google'
                    label='Google Drive'
                    tone='dark'
                  />
                </div>
                <ArrowRight
                  className='mx-auto h-5 w-5 rotate-90 text-[#E3A36F] sm:rotate-0'
                  aria-hidden='true'
                />
                <div className='rounded-[10px] border border-[#E3A36F]/25 bg-[#E3A36F]/10 p-4'>
                  <p className='font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#E3A36F]'>
                    Control plane
                  </p>
                  <p className='mt-2 font-serif-jp text-lg font-bold'>
                    Tiramisu Works
                  </p>
                  <p className='mt-2 text-[11px] leading-5 text-white/56'>
                    認証 / 権限 / 承認 / 実行 / 監査 / 再試行
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            {controlPlaneItems.map(item => {
              const Icon = item.icon ? iconMap[item.icon] : Workflow;
              return (
                <article
                  key={item.title}
                  className='rounded-[11px] border border-white/10 bg-white/5 p-5'
                >
                  <span className='flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#E3A36F]/[0.12] text-[#E3A36F]'>
                    <Icon className='h-5 w-5' aria-hidden='true' />
                  </span>
                  <h3 className='mt-4 font-serif-jp text-base font-bold'>
                    {item.title}
                  </h3>
                  <p className='mt-2 text-[12px] leading-6 text-white/55'>
                    {item.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

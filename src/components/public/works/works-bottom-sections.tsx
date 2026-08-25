import {
ArrowRight,
Check,
CheckCircle2,
ChevronDown,
ShieldCheck,
X,
} from 'lucide-react';
import {
excludedItems,
faqItems,
implementationSteps,
includedItems,
osPlan,
pricing,
supportTags,
trustItems,
worksPlan,
} from '@/components/public/works-content';
import {
CtaAnchor,
Eyebrow,
FamilyPlanCard,
SectionHeading,
consultCta,
iconMap,
} from '@/components/public/works/works-shared';
export function WorksBottomSections() {
return (
<>
<section id='implementation' className='bg-[#F2ECE3] py-20 md:py-28'>
<div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
<SectionHeading
eyebrow='Implementation'
title='原則30日で、小さく実運用へ。'
description='初回から大規模なDX計画は作りません。現状を聞き、効果が大きく実装が軽い1〜2業務から始めます。'
/>
<div className='mt-12 grid gap-3 md:grid-cols-5'>
{implementationSteps.map((step, index) => (
<article
key={step.index}
className='relative rounded-[10px] border border-[#DDD6CB] bg-white p-5'
>
<span className='font-mono text-[11px] font-bold text-[#B66F3E]'>{step.index}</span>
<h3 className='mt-4 font-serif-jp text-base font-bold text-[#172428]'>
{step.title}
</h3>
<p className='mt-2 text-[12px] leading-6 text-[#636B6D]'>{step.description}</p>
{index < implementationSteps.length - 1 && (
<ArrowRight className='absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-[#F2ECE3] p-1 text-[#B66F3E] md:block' aria-hidden='true' />
)}
</article>
))}
</div>
<div className='mt-8 grid gap-4 lg:grid-cols-2'>
<div className='rounded-[12px] border border-[#3F7D5C]/25 bg-[#3F7D5C]/[0.08] p-6'>
<p className='flex items-center gap-2 font-serif-jp text-lg font-bold text-[#244F3A]'>
<CheckCircle2 className='h-5 w-5' aria-hidden='true' />
初期導入に含むもの
</p>
<div className='mt-5 grid gap-3 sm:grid-cols-2'>
{includedItems.map(item => (
<span key={item} className='flex items-start gap-2 text-[12px] leading-6 text-[#335C48]'>
<Check className='mt-1 h-3.5 w-3.5 shrink-0' aria-hidden='true' />
{item}
</span>
))}
</div>
</div>
<div className='rounded-[12px] border border-[#B66F3E]/20 bg-[#B66F3E]/[0.06] p-6'>
<p className='flex items-center gap-2 font-serif-jp text-lg font-bold text-[#70401F]'>
<X className='h-5 w-5' aria-hidden='true' />
標準範囲外
</p>
<div className='mt-5 grid gap-3 sm:grid-cols-2'>
{excludedItems.map(item => (
<span key={item} className='flex items-start gap-2 text-[12px] leading-6 text-[#7A573F]'>
<span className='mt-3 h-px w-3 shrink-0 bg-[#B66F3E]' aria-hidden='true' />
{item}
</span>
))}
</div>
</div>
</div>
</div>
</section>
<section id='product-family' className='bg-[#26363B] py-20 text-white md:py-28'>
<div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
<SectionHeading
eyebrow='Tiramisu product family'
title='小規模ではWorks。多店舗化したらTiramisu OS。'
description='Tiramisu Worksは、Tiramisuの廉価版SaaSではありません。今あるサービスを使いながら業務を整える導入支援です。横断KPIや多店舗権限が必要になった段階で、本体Tiramisuが選択肢になります。'
inverted
/>
<div className='mt-12 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch'>
<FamilyPlanCard plan={worksPlan} featured />
<div className='flex items-center justify-center'>
<ArrowRight className='h-8 w-8 rotate-90 text-[#E3A36F] lg:rotate-0' aria-hidden='true' />
</div>
<FamilyPlanCard plan={osPlan} showProductLink />
</div>
<p className='mt-6 text-center text-[11px] leading-6 text-white/42'>
※ 成長に合わせて必ず移行する必要はありません。事業規模と課題に合う方を提案します。
</p>
</div>
</section>
<section className='bg-white py-20 md:py-28'>
<div className='mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.38fr_0.62fr] lg:px-8'>
<div className='rounded-[14px] border border-[#DDD6CB] bg-[#F6F1E9] p-7'>
<div className='flex h-20 w-20 items-center justify-center rounded-full border border-[#C88755]/25 bg-white shadow-sm'>
<span className='font-serif-jp text-2xl font-bold text-[#8F4E24]'>T/W</span>
</div>
<p className='mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#B66F3E]'>
Who supports you
</p>
<div className='mt-5 flex flex-wrap gap-2'>
{supportTags.map(tag => (
<span key={tag} className='rounded-full border border-[#DDD6CB] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#435053]'>
{tag}
</span>
))}
</div>
</div>
<div className='flex flex-col justify-center'>
<h2 className='font-serif-jp text-3xl font-bold leading-[1.4] text-[#172428] sm:text-4xl'>
現場を知る鍼灸師と、
<br />
業務を組めるエンジニアを、一人に。
</h2>
<p className='mt-6 text-[15px] leading-8 text-[#5A6264]'>
治療院の現場経験と、Vertical SaaS「Tiramisu」の設計・開発経験をベースに、生成AIを“使う”だけでなく、LINE・Google・Slack・既存サービスにつなぎ、スタッフが運用できる状態まで実装します。
</p>
<p className='mt-4 text-[13px] leading-7 text-[#7A8183]'>
売るために無理な自動化を勧めません。人がやった方が安い、API制約で安定しない、情報リスクが高い——その場合は導入しない判断も含めて提示します。
</p>
</div>
</div>
</section>
<section className='border-y border-[#DDD6CB] bg-[#F6F1E9] py-20 md:py-24'>
<div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
<SectionHeading
eyebrow='Safety by design'
title='自動化より先に、事故を止める設計を。'
description='スピードは重要です。ただし、顧客への誤送信、過剰権限、個人情報の拡散は、削減時間を一撃で吹き飛ばします。'
/>
<div className='mt-10 grid gap-4 md:grid-cols-3'>
{trustItems.map(item => {
const Icon = item.icon ? iconMap[item.icon] : ShieldCheck;
return (
<article key={item.title} className='rounded-[10px] border border-[#DDD6CB] bg-white p-6'>
<Icon className='h-6 w-6 text-[#B66F3E]' aria-hidden='true' />
<h3 className='mt-4 font-serif-jp text-lg font-bold text-[#172428]'>{item.title}</h3>
<p className='mt-2 text-[12px] leading-6 text-[#636B6D]'>{item.description}</p>
</article>
);
})}
</div>
</div>
</section>
<section id='pricing' className='bg-white py-20 md:py-28'>
<div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
<SectionHeading
eyebrow='Pricing'
title={
<>
料金は「AI利用料」ではなく、
<br />
動く業務を作るための導入費です。
</>
}
description='まず標準範囲で小さく導入。追加開発が必要な場合だけ分けます。継続改善は必要な場合のみです。'
/>
<div className='mt-12 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]'>
<article className='relative overflow-hidden rounded-[14px] bg-[#26363B] p-7 text-white sm:p-9'>
<div className='absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C88755]/12 blur-3xl' />
<div className='relative'>
<p className='font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#E3A36F]'>
{pricing.initial.label}
</p>
<h3 className='mt-3 font-serif-jp text-2xl font-bold'>{pricing.initial.name}</h3>
<div className='mt-7 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
<span className='font-mono text-5xl font-bold tracking-tight sm:text-6xl'>
{pricing.initial.price}
</span>
<span className='text-[13px] text-white/58'>{pricing.initial.unit}</span>
</div>
<p className='mt-5 max-w-2xl text-[13px] leading-7 text-white/60'>
{pricing.initial.description}
</p>
<div className='mt-7 grid gap-3 sm:grid-cols-2'>
{includedItems.map(item => (
<span key={item} className='flex items-center gap-2 text-[12px] text-white/82'>
<CheckCircle2 className='h-4 w-4 shrink-0 text-[#E3A36F]' aria-hidden='true' />
{item}
</span>
))}
</div>
<CtaAnchor cta={consultCta} variant='copper' className='mt-8' />
</div>
</article>
<div className='grid gap-5'>
{[pricing.monthly, pricing.custom].map(item => (
<article key={item.name} className='rounded-[12px] border border-[#DDD6CB] bg-[#FAF8F4] p-6'>
<p className='font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#B66F3E]'>
{item.label}
</p>
<div className='mt-3 flex items-baseline justify-between gap-4'>
<h3 className='font-serif-jp text-lg font-bold text-[#172428]'>{item.name}</h3>
</div>
<div className='mt-4 flex flex-wrap items-baseline gap-2'>
<span className='font-mono text-3xl font-bold text-[#172428]'>{item.price}</span>
<span className='text-[11px] text-[#6A7274]'>{item.unit}</span>
</div>
<p className='mt-4 text-[12px] leading-6 text-[#636B6D]'>{item.description}</p>
</article>
))}
</div>
</div>
<p className='mt-5 text-[11px] leading-6 text-[#777E80]'>
※ LINE公式、Google Workspace、予約サービス、ChatGPT等の外部サービス利用料は別途。実装可否は各サービスのAPI・権限・契約プラン・利用規約に依存します。
</p>
</div>
</section>
<section id='faq' className='border-t border-[#DDD6CB] bg-[#F6F1E9] py-20 md:py-28'>
<div className='mx-auto max-w-4xl px-4 sm:px-6 lg:px-8'>
<SectionHeading eyebrow='FAQ' title='よくある質問' />
<div className='mt-10 divide-y divide-[#DDD6CB] border-y border-[#DDD6CB]'>
{faqItems.map((item, index) => (
<details key={item.question} className='works-faq group' open={index === 0}>
<summary className='flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-left font-serif-jp text-[15px] font-bold text-[#172428] sm:text-base'>
<span>{item.question}</span>
<span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DDD6CB] bg-white text-[#B66F3E]'>
<ChevronDown className='h-4 w-4 transition-transform duration-200 group-open:rotate-180' aria-hidden='true' />
</span>
</summary>
<p className='max-w-3xl pb-6 pr-12 text-[13px] leading-7 text-[#636B6D]'>{item.answer}</p>
</details>
))}
</div>
</div>
</section>
<section className='relative overflow-hidden bg-[#26363B] py-20 text-white md:py-24'>
<div className='works-hero-grid absolute inset-0 opacity-25' aria-hidden='true' />
<div className='relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6 lg:px-8'>
<Eyebrow inverted>Start small, operate for real</Eyebrow>
<h2 className='mt-5 font-serif-jp text-3xl font-bold leading-[1.4] sm:text-4xl'>
まずは、いま一番面倒な業務を
<br />
一つだけ教えてください。
</h2>
<p className='mt-5 max-w-2xl text-[14px] leading-7 text-white/60'>
機能ありきで提案しません。現在の業務、利用中のツール、スタッフ体制を聞き、導入効果が見込める範囲だけ整理します。
</p>
<CtaAnchor cta={consultCta} variant='copper' className='mt-8' />
</div>
</section>
</>
);
}

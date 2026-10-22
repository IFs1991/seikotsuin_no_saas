import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ExternalLink, Info } from 'lucide-react';
import { resolveLpFormLink } from '@/components/public/lp-links';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import {
  normalizeContactSelection,
  type ContactIntent,
  type ContactProduct,
  type ContactSearchParams,
  type WorksPlanInterest,
} from '@/components/public/marketing-links';
import { PhraseText } from '@/components/public/phrase-text';
import { formatYen, worksPlans } from '@/components/public/works-content';
import { cn } from '@/lib/utils';
import '../lp-styles.css';

// 共通の問い合わせページ。受付は既存のGoogleフォームを再利用し、独自フォームAPIは持たない。
// query（product / intent / plan）は表示補助だけに使い、外部フォームへ転記したようには見せない。

export const metadata: Metadata = {
  title: 'お問い合わせ | Tiramisu',
  description:
    'Tiramisu Works・Tiramisu OSの導入相談、ご利用中のサポート、個人情報の取扱い、事業者情報の開示請求を受け付けています。',
  alternates: { canonical: '/contact' },
};

const productLabels: Record<ContactProduct, string> = {
  works: 'Tiramisu Works',
  os: 'Tiramisu OS',
  both: '両方（Tiramisu Works・Tiramisu OS）',
  undecided: '未定（どちらが合うか相談したい）',
};

const intentLabels: Record<ContactIntent, string> = {
  sales: '導入相談',
  support: 'ご利用中のサポート',
  privacy: '個人情報の取扱い・削除依頼',
  'operator-disclosure': '事業者情報の開示請求',
};

function describeWorksPlan(plan: WorksPlanInterest): string {
  if (plan === 'custom') return '個別見積もり（3つのプランとは別のご相談）';
  const found = worksPlans.find(item => item.key === plan);
  if (!found) return plan;
  return `${found.name}（暫定価格: 月額${formatYen(found.monthlyFeeYen)}・初期費用${formatYen(found.initialFeeYen)}、税別）`;
}

interface IntentGuide {
  intent: ContactIntent;
  description: string;
  fill: string[];
  note?: ReactNode;
}

const intentGuides: readonly IntentGuide[] = [
  {
    intent: 'sales',
    description:
      'Tiramisu Works・Tiramisu OSの導入、料金、提供範囲についてのご相談です。',
    fill: [
      '対象の製品（Tiramisu Works／Tiramisu OS／両方／未定）',
      'Tiramisu Worksの場合は希望プラン（Light／Standard／Pro／個別見積もり）',
      'ご相談の内容と、返信先の連絡先',
    ],
  },
  {
    intent: 'support',
    description: 'ご利用中のサービスについてのお問い合わせです。',
    fill: [
      '対象の製品と、ご利用中の組織・店舗名',
      'お困りの内容（画面名や発生した日時など）',
      '返信先の連絡先',
    ],
  },
  {
    intent: 'privacy',
    description:
      'ご本人の個人データの開示・訂正・利用停止・削除等のご請求と、個人情報の取扱いに関するお問い合わせです。ご請求の内容により、ご本人確認をお願いする場合があります。',
    fill: [
      'ご請求・お問い合わせの内容',
      '対象のサービス（分かる範囲で）',
      '返信先の連絡先',
    ],
    note: (
      <>
        取扱いの詳細は
        <Link
          href='/privacy#requests'
          prefetch={false}
          className='mx-1 underline underline-offset-4 hover:text-[color:var(--lp-text)]'
        >
          プライバシーポリシー
        </Link>
        をご確認ください。
      </>
    ),
  },
  {
    intent: 'operator-disclosure',
    description:
      '当事業者の所在地・電話番号のご請求です。お申し込みの前でもご請求いただけ、ご購入・ご契約の有無や、ご請求の理由は問いません。ご本人の個人データの開示請求とは別の窓口です。',
    fill: ['「事業者情報の開示請求」であること', '返信先のメールアドレス'],
    note: (
      <>
        開示の方針は
        <Link
          href='/legal#operator-disclosure'
          prefetch={false}
          className='mx-1 underline underline-offset-4 hover:text-[color:var(--lp-text)]'
        >
          運営者情報・販売条件
        </Link>
        に掲載しています。
      </>
    ),
  },
];

interface ContactPageProps {
  searchParams: Promise<ContactSearchParams>;
}

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const selection = normalizeContactSelection(await searchParams);
  const formLink = resolveLpFormLink();
  const hasSelection =
    selection.product !== null ||
    selection.intent !== null ||
    selection.plan !== null;

  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader current='contact' />

      <main id='main' className='pb-20'>
        <section className='bg-[color:var(--lp-ink)] text-white'>
          <div className='mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8'>
            <h1 className='font-serif-jp text-3xl font-bold leading-[1.35] sm:text-4xl'>
              お問い合わせ
            </h1>
            <p className='mt-4 text-[15px] leading-8 text-white/80'>
              Tiramisu Works・Tiramisu
              OSの導入相談、ご利用中のサポート、個人情報の取扱い、事業者情報の開示請求を受け付けています。受付はGoogleフォームで行っています。
            </p>
          </div>
        </section>

        <div className='mx-auto flex max-w-4xl flex-col gap-8 px-4 pt-10 sm:px-6 lg:px-8'>
          {hasSelection ? (
            <section
              aria-labelledby='contact-selection-title'
              className='rounded-[12px] border border-[color:var(--lp-line)] bg-white p-5 sm:p-6'
            >
              <h2
                id='contact-selection-title'
                className='text-[15px] font-bold text-[color:var(--lp-text)]'
              >
                選択中の内容
              </h2>
              <dl className='mt-3 grid gap-2 text-[14px] sm:grid-cols-[9rem_1fr]'>
                {selection.product ? (
                  <>
                    <dt className='text-[color:var(--lp-text-muted)]'>
                      対象の製品
                    </dt>
                    <dd className='font-bold text-[color:var(--lp-text)]'>
                      {productLabels[selection.product]}
                    </dd>
                  </>
                ) : null}
                {selection.intent ? (
                  <>
                    <dt className='text-[color:var(--lp-text-muted)]'>
                      ご相談の種類
                    </dt>
                    <dd className='font-bold text-[color:var(--lp-text)]'>
                      {intentLabels[selection.intent]}
                    </dd>
                  </>
                ) : null}
                {selection.plan ? (
                  <>
                    <dt className='text-[color:var(--lp-text-muted)]'>
                      希望プラン
                    </dt>
                    <dd className='font-bold text-[color:var(--lp-text)]'>
                      {describeWorksPlan(selection.plan)}
                    </dd>
                  </>
                ) : null}
              </dl>
              <p className='mt-4 flex gap-2 rounded-[8px] bg-[color:var(--lp-paper-warm)] p-3 text-[13px] leading-6 text-[color:var(--lp-text)]'>
                <Info
                  className='mt-0.5 h-4 w-4 shrink-0 text-[color:var(--lp-accent-strong)]'
                  aria-hidden='true'
                />
                この表示はページ上の確認用で、フォームには自動で入力されません。フォーム内で、対象の製品・ご相談の種類・希望プランを選択または記入してください。
              </p>
            </section>
          ) : null}

          <section
            aria-labelledby='contact-form-title'
            className='rounded-[12px] border border-[color:var(--lp-line)] bg-white p-5 sm:p-7'
          >
            <h2
              id='contact-form-title'
              className='font-serif-jp text-xl font-bold text-[color:var(--lp-text)] sm:text-2xl'
            >
              お問い合わせフォーム
            </h2>
            {formLink.status === 'ready' ? (
              <div className='mt-4 flex flex-col gap-2'>
                <a
                  href={formLink.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[color:var(--lp-ink)] px-6 py-3 text-[15px] font-bold text-white transition-colors hover:bg-[color:var(--lp-ink-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lp-accent)] focus-visible:ring-offset-2 sm:w-fit'
                >
                  Googleフォームを開く
                  <span className='sr-only'>（外部サイト・新しいタブ）</span>
                  <ExternalLink className='h-4 w-4' aria-hidden='true' />
                </a>
                <p className='text-[13px] text-[color:var(--lp-text-muted)]'>
                  外部サイト（Googleフォーム）が新しいタブで開きます。
                </p>
              </div>
            ) : (
              <p
                role='alert'
                className='mt-4 flex gap-2 rounded-[8px] border border-[color:var(--lp-accent-line)] bg-[color:var(--lp-os-soft)] p-4 text-[14px] leading-7 text-[color:var(--lp-text)]'
              >
                <AlertTriangle
                  className='mt-1 h-4 w-4 shrink-0 text-[color:var(--lp-accent-strong)]'
                  aria-hidden='true'
                />
                現在、お問い合わせフォームへのリンクを表示できません。時間をおいて、もう一度このページをご確認ください。
              </p>
            )}
            <ul className='mt-5 flex flex-col gap-2 text-[13px] leading-6 text-[color:var(--lp-text)]'>
              <li>
                ・フォームを送信するまで、お問い合わせは届きません。フォームを開いただけでは受付になりません。
              </li>
              <li>
                ・患者・顧客の個人情報、パスワード、認証コード、APIキーは入力しないでください。
              </li>
              <li>
                ・運営者の情報は
                <Link
                  href='/legal'
                  prefetch={false}
                  className='mx-1 underline underline-offset-4 hover:text-[color:var(--lp-accent-strong)]'
                >
                  運営者情報・販売条件
                </Link>
                をご確認ください。
              </li>
            </ul>
          </section>

          <section aria-labelledby='contact-intents-title'>
            <h2
              id='contact-intents-title'
              className='font-serif-jp text-xl font-bold text-[color:var(--lp-text)] sm:text-2xl'
            >
              <PhraseText text='ご相談の種類と、フォームに記入いただくこと' />
            </h2>
            <div className='mt-5 grid gap-4 md:grid-cols-2'>
              {intentGuides.map(guide => {
                const selected = selection.intent === guide.intent;
                return (
                  <section
                    key={guide.intent}
                    id={guide.intent}
                    aria-labelledby={`intent-${guide.intent}`}
                    className={cn(
                      'flex flex-col rounded-[12px] bg-white p-5',
                      selected
                        ? 'border-2 border-[color:var(--lp-accent)]'
                        : 'border border-[color:var(--lp-line)]'
                    )}
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3
                        id={`intent-${guide.intent}`}
                        className='text-[16px] font-bold text-[color:var(--lp-text)]'
                      >
                        {intentLabels[guide.intent]}
                      </h3>
                      {selected ? (
                        <span className='rounded-full bg-[color:var(--lp-accent-tint)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--lp-accent-strong)]'>
                          選択中
                        </span>
                      ) : null}
                    </div>
                    <p className='mt-2 text-[13px] leading-6 text-[color:var(--lp-text-muted)]'>
                      {guide.description}
                    </p>
                    <p className='mt-3 text-[12px] font-bold text-[color:var(--lp-text)]'>
                      フォームに記入いただくこと
                    </p>
                    <ul className='mt-1 flex flex-col gap-1 text-[13px] leading-6 text-[color:var(--lp-text)]'>
                      {guide.fill.map(item => (
                        <li key={item}>・{item}</li>
                      ))}
                    </ul>
                    {guide.note ? (
                      <p className='mt-3 text-[12px] leading-6 text-[color:var(--lp-text-muted)]'>
                        {guide.note}
                      </p>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </section>

          <nav
            aria-label='製品の説明ページ'
            className='flex flex-wrap gap-x-6 gap-y-2 text-[14px]'
          >
            <Link
              href='/works'
              prefetch={false}
              className='inline-flex min-h-11 items-center gap-1 underline underline-offset-4 hover:text-[color:var(--lp-accent-strong)]'
            >
              Tiramisu Worksを見る
              <ArrowRight className='h-4 w-4' aria-hidden='true' />
            </Link>
            <Link
              href='/os'
              prefetch={false}
              className='inline-flex min-h-11 items-center gap-1 underline underline-offset-4 hover:text-[color:var(--lp-accent-strong)]'
            >
              Tiramisu OSを見る
              <ArrowRight className='h-4 w-4' aria-hidden='true' />
            </Link>
          </nav>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

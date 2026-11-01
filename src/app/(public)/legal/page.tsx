import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalPendingValue } from '@/components/legal/legal-page';
import {
  OperatorProfileList,
  OperatorProfileValue,
} from '@/components/legal/operator-profile-list';
import { planItems } from '@/components/public/lp-content';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import { createContactHref } from '@/components/public/marketing-links';
import {
  legalDescription,
  legalRobots,
} from '@/components/public/release-readiness';
import {
  formatYen,
  worksPlans,
  worksPricingCopy,
} from '@/components/public/works-content';
import '../lp-styles.css';

// 運営者情報・販売条件（暫定案）。特定商取引法に基づく表示の要否と項目は、
// 実際の販売・申込みの方法を確認してから確定する（公開前チェック B07・B09）。

export const metadata: Metadata = {
  title: '運営者情報・販売条件 | Tiramisu',
  description: legalDescription(
    'legal',
    'Tiramisu Works・Tiramisu OSの運営者情報・販売条件と事業者情報の開示請求窓口。'
  ),
  alternates: { canonical: '/legal' },
  robots: legalRobots('legal'),
};

const linkClass = 'underline underline-offset-4 hover:text-slate-900';

function TermsList({
  rows,
}: {
  rows: ReadonlyArray<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className='divide-y divide-slate-200 rounded-xl border border-slate-200'>
      {rows.map(row => (
        <div
          key={row.label}
          className='grid gap-1 p-4 sm:grid-cols-[10rem_1fr]'
        >
          <dt className='font-semibold text-slate-900'>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const pendingSalesTermRows = [
  { label: '支払方法・支払時期', value: <LegalPendingValue /> },
  { label: '提供開始時期', value: <LegalPendingValue /> },
  { label: '契約期間・更新', value: <LegalPendingValue /> },
  { label: '解約・返金', value: <LegalPendingValue /> },
];

export default function LegalNoticePage() {
  const disclosureHref = createContactHref({ intent: 'operator-disclosure' });

  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader />
      <main id='main'>
        <LegalPage
          title='運営者情報・販売条件'
          document='legal'
          sections={[
            {
              id: 'operator',
              title: '運営者情報',
              body: (
                <LegalReviewRequired field='legal:operator'>
                  {<OperatorProfileList />}
                </LegalReviewRequired>
              ),
            },
            {
              id: 'operator-disclosure',
              title: '所在地・電話番号の開示',
              body: (
                <LegalReviewRequired field='legal:operator-disclosure'>
                  {
                    <>
                      <p>
                        <OperatorProfileValue field='addressAndPhonePolicy' />
                      </p>
                      <p>
                        <Link
                          href={disclosureHref}
                          prefetch={false}
                          className='inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 font-semibold text-slate-900 hover:bg-slate-50'
                        >
                          事業者情報の開示請求へ
                        </Link>
                      </p>
                      <p>
                        ご自身の個人データの開示・訂正・削除等のご請求は、これとは別の窓口です。
                        <Link
                          href='/privacy#requests'
                          prefetch={false}
                          className={linkClass}
                        >
                          プライバシーポリシーの「開示等の請求・お問い合わせ」
                        </Link>
                        をご確認ください。
                      </p>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'works',
              title: '販売条件: Tiramisu Works',
              body: (
                <LegalReviewRequired field='legal:works'>
                  {
                    <TermsList
                      rows={[
                        {
                          label: '販売価格',
                          value: (
                            <ul className='space-y-1'>
                              {worksPlans.map(plan => (
                                <li key={plan.key}>
                                  {plan.name}: 月額
                                  {formatYen(plan.monthlyFeeYen)}
                                  ・初期費用{formatYen(plan.initialFeeYen)}
                                </li>
                              ))}
                              <li>個別見積もり: 個別にご案内します</li>
                            </ul>
                          ),
                        },
                        {
                          label: '価格の表示',
                          value: worksPricingCopy.provisionalLabel,
                        },
                        {
                          label: '提供範囲・上限',
                          value: worksPricingCopy.notes[1],
                        },
                        {
                          label: '商品代金以外の必要料金',
                          value: worksPricingCopy.externalFeesNote,
                        },
                        ...pendingSalesTermRows,
                        {
                          label: '動作環境',
                          value:
                            'ChatGPT（対応するプラン・利用環境は導入前にご案内します）',
                        },
                        {
                          label: 'お申し込み',
                          value:
                            'このサイトからはお申し込み・決済はできません。導入相談のうえ、正式な条件をご案内します。',
                        },
                      ]}
                    />
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'os',
              title: '販売条件: Tiramisu OS',
              body: (
                <LegalReviewRequired field='legal:os'>
                  {
                    <TermsList
                      rows={[
                        {
                          label: '販売価格',
                          value: (
                            <>
                              <ul className='space-y-1'>
                                {planItems.map(plan => (
                                  <li key={plan.name}>
                                    {plan.name}: 月額{plan.monthlyPrice}
                                    ・初期費用{plan.initialCost}（{plan.stores}
                                    ・追加店舗: {plan.extraStore}）
                                  </li>
                                ))}
                              </ul>
                              <p className='mt-2'>
                                税の表記と最終金額は、
                                <Link
                                  href='/os#pricing'
                                  prefetch={false}
                                  className={linkClass}
                                >
                                  Tiramisu OSの料金欄
                                </Link>
                                の注記をご確認ください。
                              </p>
                            </>
                          ),
                        },
                        {
                          label: '価格・税区分',
                          value:
                            '現行LPの掲載値であり正式な営業決定ではありません。OSの税区分と最終金額は未確定です。契約前に統一した条件をご案内します。',
                        },
                        {
                          label: '商品代金以外の必要料金',
                          value:
                            '追加店舗料金は上記のとおりです。通信費・端末費・外部連携先費用、移行・追加支援の費用と負担は個別見積もりで確認します。',
                        },
                        ...pendingSalesTermRows,
                        { label: '動作環境', value: <LegalPendingValue /> },
                        {
                          label: 'お申し込み',
                          value:
                            'このサイトからはお申し込み・決済はできません。導入相談のうえ、正式な条件をご案内します。',
                        },
                      ]}
                    />
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'sales-method',
              title: '販売方法と公開前の確認事項',
              body: (
                <LegalReviewRequired field='legal:sales-method'>
                  {
                    <>
                      <p>
                        本サイトは導入相談のみを受け付け、ここでは申込・決済・自動更新への同意は行いません。上記は現行掲載値であり、価格の掲載承認や確定した契約条件を示すものではありません。
                      </p>
                      <p>
                        支払方法・期日、提供開始、最低利用期間、更新、解約・返金、動作環境は製品別に契約前に明示します。特定商取引法の適用・必要な表示、所在地・電話番号の請求時開示を利用できる条件と実際の受付・返信運用は専門家と事業者による確認が必要です。B2B向けであることだけで適用除外とは扱いません。
                      </p>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

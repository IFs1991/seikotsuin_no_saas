import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalPendingValue } from '@/components/legal/legal-page';
import { OperatorProfileList } from '@/components/legal/operator-profile-list';
import { planItems } from '@/components/public/lp-content';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import { createContactHref } from '@/components/public/marketing-links';
import { operatorProfile } from '@/components/public/release-readiness';
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
  description:
    'Tiramisu Works・Tiramisu OSの運営者情報と販売条件（暫定案）、事業者情報の開示請求の窓口。',
  alternates: { canonical: '/legal' },
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
          updatedAt='2026-10-22'
          sections={[
            {
              id: 'operator',
              title: '運営者情報',
              body: <OperatorProfileList profile={operatorProfile} />,
            },
            {
              id: 'operator-disclosure',
              title: '所在地・電話番号の開示',
              body: (
                <>
                  <p>
                    {operatorProfile.addressAndPhonePolicy.value ?? (
                      <LegalPendingValue />
                    )}
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
              ),
            },
            {
              id: 'works',
              title: '販売条件: Tiramisu Works',
              body: (
                <TermsList
                  rows={[
                    {
                      label: '販売価格',
                      value: (
                        <ul className='space-y-1'>
                          {worksPlans.map(plan => (
                            <li key={plan.key}>
                              {plan.name}: 月額{formatYen(plan.monthlyFeeYen)}
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
              ),
            },
            {
              id: 'os',
              title: '販売条件: Tiramisu OS',
              body: (
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
                                ・初期費用{plan.initialCost}
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
                    ...pendingSalesTermRows,
                    { label: '動作環境', value: <LegalPendingValue /> },
                    {
                      label: 'お申し込み',
                      value:
                        'このサイトからはお申し込み・決済はできません。導入相談のうえ、正式な条件をご案内します。',
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

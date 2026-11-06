import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import {
  OperatorProfileList,
  OperatorProfileValue,
} from '@/components/legal/operator-profile-list';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import { createContactHref } from '@/components/public/marketing-links';
import {
  legalDescription,
  legalRobots,
} from '@/components/public/release-readiness';
import { worksPricingCopy } from '@/components/public/works-content';
import '../lp-styles.css';

// 運営者情報と、お申し込み前に個別条件を提示する販売方式を記載する。

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

const individualContractRows = [
  {
    label: '支払方法・支払時期',
    value:
      '支払方法、請求時期、支払期限、初期費用と継続料金の支払区分は、お申込み前に提示する見積書・申込書・契約書等に明示します。',
  },
  {
    label: '提供開始時期',
    value:
      '利用する機能、接続設定、導入作業の内容を確認したうえで、提供開始日を個別の契約条件としてご案内します。',
  },
  {
    label: '契約期間・更新',
    value:
      '契約期間、最低利用期間、自動更新の有無、更新時の条件・通知期限は、お申込み前に個別の契約条件として明示します。',
  },
  {
    label: '解約・返金',
    value:
      '解約の受付方法・通知期限・効力発生日、既払い料金の返金・日割りの有無は、お申込み前に個別の契約条件として明示します。手続の確認はお問い合わせ窓口で受け付けます。',
  },
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
              body: <OperatorProfileList />,
            },
            {
              id: 'operator-disclosure',
              title: '所在地・電話番号の開示',
              body: (
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
                        <>
                          <p>
                            対象店舗、接続先、業務と導入支援の範囲に応じて個別にご案内します。適用する初期費用・継続料金・追加費用と税区分は、お申込み前に提示する見積書等をご確認ください。
                          </p>
                          <p className='mt-2'>
                            検討用の参考料金は、
                            <Link
                              href='/works#pricing'
                              prefetch={false}
                              className={linkClass}
                            >
                              Tiramisu Worksの料金欄
                            </Link>
                            に掲載しています。掲載額をそのまま契約金額とするものではありません。
                          </p>
                        </>
                      ),
                    },
                    {
                      label: '価格の表示',
                      value:
                        '公開サイトの料金は検討用の参考情報です。正式な金額、税区分、初期費用と継続料金の内訳は、お申込み前に個別の契約条件として明示します。',
                    },
                    {
                      label: '提供範囲・上限',
                      value: worksPricingCopy.notes[1],
                    },
                    {
                      label: '商品代金以外の必要料金',
                      value: worksPricingCopy.externalFeesNote,
                    },
                    ...individualContractRows,
                    {
                      label: '動作環境',
                      value:
                        '利用するChatGPTのプラン・環境、連携先サービスの契約、必要な権限と接続設定を導入前にご案内します。',
                    },
                    {
                      label: 'お申し込み',
                      value:
                        '本サイト上に申込み・決済機能はありません。Worksの有料契約は導入相談後に別途提示する条件に基づき申込みを受け付けます。',
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
                          <p>
                            対象店舗数、利用する機能、移行・導入支援の範囲に応じて、契約条件を個別にご案内します。適用する初期費用・継続料金・追加店舗料金は、お申込み前に提示する見積書等をご確認ください。
                          </p>
                          <p className='mt-2'>
                            検討用の参考料金は、
                            <Link
                              href='/os#pricing'
                              prefetch={false}
                              className={linkClass}
                            >
                              Tiramisu OSの料金欄
                            </Link>
                            に掲載しています。掲載額をそのまま契約金額とするものではありません。
                          </p>
                        </>
                      ),
                    },
                    {
                      label: '価格・税区分',
                      value:
                        '正式な金額、税区分、初期費用と継続料金の内訳は、お申込み前に提示する見積書・申込書・契約書等に明示します。',
                    },
                    {
                      label: '商品代金以外の必要料金',
                      value:
                        '利用店舗の追加、通信費・端末費・外部連携先費用、移行・追加支援に費用が発生する場合は、対象と負担する費用をお申込み前にご案内します。',
                    },
                    ...individualContractRows,
                    {
                      label: '動作環境',
                      value:
                        '利用する端末・ブラウザーとネットワーク環境、必要な外部サービスを導入前にご案内します。',
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
              id: 'sales-method',
              title: 'お申し込みと契約条件の確認',
              body: (
                <>
                  <p>
                    本サイト上には申込み・決済・自動更新への同意機能はありません。Worksは導入相談後に別途提示した条件に基づき、有料契約の申込みを受け付けます。OSは導入相談のうえ、提供範囲と契約条件をご案内します。サイトの閲覧やお問い合わせだけで、有料契約又は自動更新に同意したものとは扱いません。
                  </p>
                  <p>
                    お申込み前に、製品ごとの費用、支払方法・期日、提供開始、契約期間・更新、解約・返金、動作環境と、
                    <Link href='/terms' prefetch={false} className={linkClass}>
                      利用規約
                    </Link>
                    をご確認ください。提示された条件に不明な点がある場合は、
                    <Link
                      href='/contact'
                      prefetch={false}
                      className={linkClass}
                    >
                      お問い合わせ窓口
                    </Link>
                    へご連絡ください。
                  </p>
                </>
              ),
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

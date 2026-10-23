import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalPage } from '@/components/legal/legal-page';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import { createContactHref } from '@/components/public/marketing-links';
import '../lp-styles.css';

// プライバシーポリシー（暫定案）。共通ページでも、製品・窓口ごとに取得する情報は異なるため分けて記載する。
// 実データフロー・保持・削除の確定（公開前チェック B08）までは、未確認の断言をしない。

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Tiramisu',
  description:
    'Tiramisu OS・Tiramisu Works・お問い合わせフォームにおける個人情報の取扱い（暫定案）。',
  alternates: { canonical: '/privacy' },
};

const linkClass = 'underline underline-offset-4 hover:text-slate-900';

export default function PrivacyPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader />
      <main id='main'>
        <LegalPage
          title='プライバシーポリシー'
          updatedAt='2026-10-22'
          sections={[
            {
              id: 'scope',
              title: 'このページについて',
              body: (
                <p>
                  本ページは、Tiramisu OS、Tiramisu
                  Works、お問い合わせフォームのそれぞれにおける個人情報の取扱いを分けて記載する暫定案です。共通のページですが、各サービスで取り扱う情報は異なります。
                </p>
              ),
            },
            {
              id: 'common',
              title: '共通事項',
              body: (
                <LegalArticle title='取扱事業者'>
                  <p>
                    個人情報は、本サービスを運営する個人事業主（以下「当事業者」といいます）が取り扱います。事業者の氏名等は
                    <Link href='/legal' prefetch={false} className={linkClass}>
                      運営者情報・販売条件
                    </Link>
                    に掲載します。
                  </p>
                </LegalArticle>
              ),
            },
            {
              id: 'os',
              title: 'Tiramisu OS（店舗・本部管理）',
              body: (
                <>
                  <LegalArticle title='1. 取得する情報'>
                    <p>
                      当事業者は、本サービスの提供にあたり、利用者情報、患者情報、予約情報、設定情報、アクセスログその他サービス運営に必要な情報を取得します。
                    </p>
                    <p>
                      取得する情報には、氏名、メールアドレス、所属院、予約履歴、利用端末情報、操作ログが含まれる場合があります。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='2. 利用目的'>
                    <p>
                      取得した情報は、本人確認、サービス提供、サポート対応、障害調査、セキュリティ対策、品質改善のために利用します。
                    </p>
                    <p>
                      パイロット期間中は、利用実態に基づく改善のため、統計化または必要な範囲で分析を行うことがあります。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='3. 個人情報・医療情報の管理'>
                    <p>
                      本文は、個人情報へのアクセスを業務上必要な範囲に限定する方針を示す暫定案です。適用法令、事業者と利用院の役割、実際の運用状況は正式提供前に確認します。
                    </p>
                    <p>
                      医療情報について必要となる認証、アクセス制御、ログ監査、保存先管理は、医療情報システムの安全管理に関するガイドライン等を踏まえて確認し、実施証跡を残す必要があります。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='4. 第三者提供'>
                    <p>
                      第三者提供の条件、共同利用の有無、委託との区分は、正式提供前に実際のデータフローと契約を確認して確定します。
                    </p>
                    <p>
                      クラウド基盤、認証、監視その他の委託先、取扱データ、保管地域、再委託条件は、確定後の本文または別表で明示する必要があります。
                    </p>
                  </LegalArticle>
                </>
              ),
            },
            {
              id: 'works',
              title: 'Tiramisu Works（既存ツールを活かす業務支援）',
              body: (
                <>
                  <p>
                    Tiramisu
                    Worksで取り扱う情報の範囲と取扱いは、実際のデータの流れを確認したうえで確定します。確定前のため、次の事項は本ページに記載していません。
                  </p>
                  <ul className='list-disc space-y-1 pl-5'>
                    <li>
                      依頼の入力・出力、承認・実行の記録として取り扱う情報と、その保存先・保存期間
                    </li>
                    <li>
                      OAuth等による連携情報の取得範囲・保存場所と、連携解除・削除の関係
                    </li>
                    <li>
                      ChatGPT等の外部サービスへ渡す情報と、外部サービス側での取扱い
                    </li>
                  </ul>
                </>
              ),
            },
            {
              id: 'contact-form',
              title: 'お問い合わせフォーム',
              body: (
                <p>
                  お問い合わせは、Googleフォーム（Google
                  LLCが提供する外部サービス）で受け付けます。入力いただいた内容は、お問い合わせへの対応のために利用します。回答の保管場所・閲覧者・保存期間は確定前です。
                </p>
              ),
            },
            {
              id: 'requests',
              title: '開示等の請求・お問い合わせ',
              body: (
                <>
                  <p>
                    ご本人の個人データの開示・訂正・利用停止・削除等のご請求は、
                    <Link
                      href={createContactHref({ intent: 'privacy' })}
                      prefetch={false}
                      className={linkClass}
                    >
                      お問い合わせページの「個人情報の取扱い・削除依頼」
                    </Link>
                    から受け付けます。ご請求の内容により、ご本人確認をお願いする場合があります。
                  </p>
                  <p>
                    受付経路はお問い合わせページですが、正式窓口としての運用と本人確認手順は未確定です。商用提供前に事業者情報とともに明示します。
                  </p>
                  <p>
                    当事業者の氏名・住所等のお問い合わせは、
                    <Link
                      href={createContactHref({
                        intent: 'operator-disclosure',
                      })}
                      prefetch={false}
                      className={linkClass}
                    >
                      「事業者情報の開示請求」
                    </Link>
                    から受け付けます。ご本人の個人データの開示請求とは別の窓口です。
                  </p>
                </>
              ),
            },
            {
              id: 'pending',
              title: '商用提供前の確認事項',
              body: (
                <p>
                  事業者情報、管理責任者、利用目的の詳細、法的根拠、保存期間、委託先一覧、国外移転の有無、安全管理措置、漏えい時の連絡、開示等請求の手順を確定し、専門家レビューを完了する必要があります。
                </p>
              ),
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

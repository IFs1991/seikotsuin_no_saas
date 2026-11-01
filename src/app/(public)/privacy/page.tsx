import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalPage } from '@/components/legal/legal-page';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import { createContactHref } from '@/components/public/marketing-links';
import {
  legalDescription,
  legalRobots,
} from '@/components/public/release-readiness';
import '../lp-styles.css';

// プライバシーポリシー（暫定案）。共通ページでも、製品・窓口ごとに取得する情報は異なるため分けて記載する。
// 実データフロー・保持・削除の確定（公開前チェック B08）までは、未確認の断言をしない。

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Tiramisu',
  description: legalDescription(
    'privacy',
    'Tiramisu OS・Tiramisu Works・お問い合わせフォームにおける個人情報の取扱い。'
  ),
  alternates: { canonical: '/privacy' },
  robots: legalRobots('privacy'),
};

const linkClass = 'underline underline-offset-4 hover:text-slate-900';

export default function PrivacyPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader />
      <main id='main'>
        <LegalPage
          title='プライバシーポリシー'
          document='privacy'
          sections={[
            {
              id: 'scope',
              title: 'このページについて',
              body: (
                <LegalReviewRequired field='privacy:scope'>
                  {
                    <p>
                      本ページは、Tiramisu OS、Tiramisu
                      Works、公開サイト、お問い合わせフォームに適用します。共通規定と各製品固有の取扱いを分けて記載します。各サービスで取り扱う情報は異なります。
                    </p>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'common',
              title: '共通事項',
              body: (
                <LegalReviewRequired field='privacy:common'>
                  {
                    <>
                      <LegalArticle title='1. 取扱事業者'>
                        <p>
                          個人情報は、本サービスを運営する個人事業主（以下「当事業者」といいます）が取り扱います。事業者の氏名等は
                          <Link
                            href='/legal'
                            prefetch={false}
                            className={linkClass}
                          >
                            運営者情報・販売条件
                          </Link>
                          に掲載します。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='2. 情報の種類と利用目的'>
                        <p>
                          アカウントの氏名・メールアドレス・所属組織や店舗・ロール、契約・請求・サポート情報、IPアドレス・アクセス・操作・監査ログを、利用する機能に応じて取り扱います。
                        </p>
                        <p>
                          認証、組織・店舗の権限管理、機能提供、依頼の承認・実行・通知、料金の請求、問い合わせ対応、障害調査、不正防止、契約履行のために利用します。品質改善は適法な範囲と目的に限定し、患者情報の汎用AI学習利用について未確認の許諾を推定しません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 委託・第三者提供・国外移転'>
                        <p>
                          サービス運営の委託先への処理委託、法令または本人同意等に基づく第三者提供、利用者が接続する独立した外部サービスへの送信は区別します。委託先・再委託先、送信項目、契約、保管地域・所在国は製品別に確認し、確定後に別表として案内します。共同利用の有無も未確定です。
                        </p>
                        <p>
                          国外の委託先等については、個人情報保護法28条等の適用を確認し、必要な同意・所在国等の情報提供・相当措置の確認を行う必要があります。外部サービスの利用だけで国外移転への同意を得たものとは扱いません。現時点で送信先の全件と適法性の確認は完了していません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 安全管理措置'>
                        <p>
                          コード上は、OSの院スコープとRLSによるアクセス制御、Worksの組織・店舗・権限の検証、Vaultを用いた認証情報の参照管理、承認と監査の記録を設けています。本番設定、担当者教育、委託先監督、監査・障害対応の運用証跡は別途確認が必要です。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'os',
              title: 'Tiramisu OS（店舗・本部管理）',
              body: (
                <LegalReviewRequired field='privacy:os'>
                  {
                    <>
                      <LegalArticle title='1. 取得する情報'>
                        <p>
                          利用院が登録する患者・顧客の識別情報、氏名・連絡先、予約・来院履歴、問診・施術等の医療関連情報、売上・日報、スタッフ・シフト、設定・操作ログを機能に応じて取り扱います。問診・施術等には要配慮個人情報に該当する情報が含まれ得ます。
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
                          AI分析では、Geminiへの売上集計・スタッフ名と実績・患者動向の集計値の送信経路がコード上にあります。有効化と契約・保存条件は未確認です。「個人情報をAIへ一切送信しない」とは保証しません。OS患者データをWorks・ChatGPTへ自動共有するものではありません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 個人情報・医療情報の管理'>
                        <p>
                          原則として、利用院が取得目的・登録権限・保有方針を決定し、当事業者は委託された範囲で処理します。例外は個別契約で明示します。患者からの請求は利用院と連携して対応し、権限のない第三者へ患者データを返しません。
                        </p>
                        <p>
                          医療情報システムの安全管理に関するガイドライン第7.0版を参照し、別途データ処理契約（DPA）、役割分担、アクセス・監査、返却・削除の合意と運用証跡を整備します。本ポリシーだけで完全準拠を示すものではありません。
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
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'works',
              title: 'Tiramisu Works（既存ツールを活かす業務支援）',
              body: (
                <LegalReviewRequired field='privacy:works'>
                  {
                    <>
                      <p>
                        Worksでは組織・店舗・メンバーシップ・ロール、接続先のメタデータ・許可スコープ、Workflow・Run・Approval・承認ハッシュ・監査・利用量・コスト、依頼本文・承認プレビュー・一時素材を機能に応じて取り扱います。
                      </p>
                      <ul className='list-disc space-y-1 pl-5'>
                        <li>
                          ChatGPTへの入力、MCPの応答、承認や送信に必要な情報は、ChatGPTや利用する外部サービスに表示・送信され得ます。Slack・LINE・Instagram・Google・予約サービス等は、接続可能な機能・プラン・権限・有効化状態に応じた例示であり、すべての一般提供を意味しません。
                        </li>
                        <li>
                          OAuth認証情報にはアクセストークン・更新トークン・有効期限・スコープ等が含まれ、サーバーがVault参照を通じて扱います。認証情報をチャットへ入力しないでください。連携解除・プロバイダ側の失効・Vault上の削除は別の処理です。解除しても外部サービス上の既存データは自動削除されません。
                        </li>
                        <li>
                          利用者が許可した接続スコープに加え、サーバーで組織・店舗・ロール・業務承認を確認します。ChatGPT上の許可はWorks側の認可や承認を代替しません。外部サービス側の保管・削除には各社の条件が適用されます。
                        </li>
                      </ul>
                      <LegalArticle title='患者情報・禁止入力とAIの境界'>
                        <p>
                          患者カルテの正本・全履歴を原則保持しない設計は、個人情報を一切処理しないという意味ではありません。現在のChatGPT向けプラグインのルールに従い、PHI（保護対象保健情報）、決済カード情報、政府発行の識別番号、パスワード・APIキー・認証コード等をチャット入力・素材・ツール処理の対象にしないでください。その他の機微情報も必要性、適法な同意、取得前の明示を確認せず入力しないでください。
                        </p>
                        <p>
                          Worksは現行設計でOpenAIの推論APIを直接呼び出さず、ChatGPT等が推論を担います。これはChatGPTへの入力・MCP応答の送信がないという意味ではありません。禁止情報の検出・受付防止についても本番運用の確認が必要です。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'contact-form',
              title: 'お問い合わせフォーム',
              body: (
                <LegalReviewRequired field='privacy:contact-form'>
                  {
                    <p>
                      お問い合わせは、Googleフォーム（Google
                      LLCが提供する外部サービス）で受け付けます。入力内容・返信先は問い合わせへの対応に利用し、Google側の利用規約・プライバシーポリシーも適用されます。フォームへの遷移前に入力項目を確認し、患者の医療情報や認証情報を記入しないでください。回答の保管場所・閲覧者・保存期間・通知・代替窓口の運用は未確認です。
                    </p>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'requests',
              title: '開示等の請求・お問い合わせ',
              body: (
                <LegalReviewRequired field='privacy:requests'>
                  {
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
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'retention',
              title: '保存期間・返却・削除と連携解除',
              body: (
                <LegalReviewRequired field='privacy:retention'>
                  {
                    <>
                      <LegalArticle title='OS・契約・問い合わせ・監査記録'>
                        <p>
                          OSの患者情報・予約・業務記録、契約・請求・会計記録、問い合わせ、操作・監査ログの保持根拠と期間、終了後の返却方法・削除期限、法令上の保存・紛争対応の例外は未確定です。返却30日・削除30日・ログ90日・監査365日等の期限を確約していません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='Worksの一時データ'>
                        <p>
                          Slack経由のLINE依頼本文・宛先等は24時間の期限後に削除処理の対象となる実装があります。毎時処理のため厳密に24時間で削除する保証ではなく、最小識別子・ハッシュ等は残ります。投稿素材等の別経路へ一律に適用する期限ではありません。
                        </p>
                        <p>
                          Square予約の一時入力・承認情報・結果・Webhookキャッシュには7日の失効と削除処理があります。物理削除は保守処理に依存し、最小識別子・ハッシュ・監査記録は残ります。削除タスクの本番稼働は未確認です。
                        </p>
                        <p>
                          Meta削除通知に対する状態照会の仕組みがありますが、受付やcompleted表示は全外部サービス・バックアップの完全削除を保証しません。OAuth認証情報、その他の依頼・素材・実行記録の期限は分類ごとの確認が必要です。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='バックアップ・外部サービス'>
                        <p>
                          稼働系からの削除、バックアップの世代消去、外部プロバイダ上の削除は別です。バックアップの保管地域・保持期間・復元時の削除反映は未確認で、90日等の期限や退会時の即時完全削除を約束しません。確定した保持・削除条件と例外は公開前に別表として整備します。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'pending',
              title: '商用提供前の確認事項',
              body: (
                <LegalReviewRequired field='privacy:pending'>
                  {
                    <>
                      <p>
                        事業者情報、管理責任者、利用目的の詳細、法的根拠、保存期間、委託先一覧、国外移転の有無、安全管理措置、漏えい時の連絡、開示等請求の手順を確定し、専門家レビューを完了する必要があります。
                      </p>
                      <p>
                        漏えい等が発生した場合の調査・拡大防止・法令に基づく報告・本人通知の担当と連絡手順は公開前に確定します。請求の可否、本人確認方法、回答期限や手数料は法令と利用院との役割分担に従って案内し、請求だけで一律の削除を約束しません。
                      </p>
                      <p>
                        本ポリシーを改定する場合は本ページ等で内容を案内し、法令上必要な手続を行います。改定日・施行日は公開承認された実際の日付のみ表示します。
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

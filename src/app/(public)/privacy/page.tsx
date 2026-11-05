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
                          アカウントの氏名・メールアドレス・所属する組織や店舗・アクセス権限、契約・請求・問い合わせに関する情報、IPアドレス・アクセスや操作の記録を、利用する機能に応じて取り扱います。
                        </p>
                        <p>
                          これらの情報は、本人確認、組織・店舗ごとの権限管理、依頼された機能の提供、承認・実行・通知、料金の請求、問い合わせ対応、障害調査、不正利用の防止および契約の履行に使用します。利用院から預かる患者情報と、当事業者が問い合わせ等で直接取得する情報は、取得目的と管理する役割を分けて取り扱います。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 委託・第三者提供・国外移転'>
                        <p>
                          サービスを運営するための処理委託と、利用者が依頼した操作に伴う外部サービスへの送信は、目的と送信先を区別します。OS・Worksのデータベースは東京リージョンに設定されています。これは、Web処理、外部連携、監視、バックアップを含むすべての情報が日本国内だけで処理されることを意味しません。
                        </p>
                        <p>
                          国外への個人データの提供について法令上必要となる同意や情報提供は、サービスへの接続許可とは別に扱います。外部サービスを接続したことだけをもって、あらゆる国外提供への同意があったとは扱いません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 安全管理措置'>
                        <p>
                          OSでは所属院に応じたアクセス制御を行い、Worksでは操作する利用者の組織・店舗・権限と、必要な業務承認を確認する仕組みを設けています。外部サービスの認証情報は業務データと区別して管理し、依頼・承認・実行の記録を不正利用の防止や調査に使用します。
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
                          利用院が登録する患者・顧客の識別情報、氏名・連絡先、予約・来院履歴、予約フォームへの回答、売上・日報、スタッフ・シフト、設定や操作の記録を、利用する機能に応じて取り扱います。
                        </p>
                        <p>
                          予約フォームや自由記入欄に健康・施術に関する情報が入力された場合、その内容に要配慮個人情報が含まれることがあります。カルテの正本を管理しないことは、健康に関する情報を一切取り扱わないことを意味しません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='2. 利用目的'>
                        <p>
                          取得した情報は、利用院から依頼された予約・顧客・店舗業務の管理、集計・分析、本人確認、サポート、障害調査およびセキュリティ対策に使用します。
                        </p>
                        <p>
                          AI分析機能が有効な場合、売上の集計、スタッフ名と実績、患者動向の集計値をGoogleのGeminiへ送信する経路があります。スタッフ名を含むため、すべて匿名情報だけの処理とは説明しません。OSの患者データをWorks・ChatGPTへ自動共有する機能ではありません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 個人情報・医療情報の管理'>
                        <p>
                          原則として、利用院が取得目的・登録権限・保有方針を決定し、当事業者は委託された範囲で処理します。例外は個別契約で明示します。患者からの請求は利用院と連携して対応し、権限のない第三者へ患者データを返しません。
                        </p>
                        <p>
                          利用院が預ける情報の範囲、利用院と当事業者の役割、情報へのアクセス、契約終了後の返却・削除等は、個別のデータ処理に関する合意の対象です。本ポリシーだけで、医療情報の取扱いに必要なすべての契約や運用が整ったことを示すものではありません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 主な処理先'>
                        <p>
                          認証とデータ管理にはSupabase、Webサービスの運営にはVercelを使用する構成です。外部への通知、AI分析、障害監視等では、それぞれの機能が有効な場合に、その処理を担うサービスへ必要な情報を送信します。OSの処理先とWorksの連携先は同一ではありません。
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
                      <LegalArticle title='1. 取得する情報と利用目的'>
                        <p>
                          Worksでは、利用者のアカウント、所属する組織・店舗、アクセス権限、外部サービスとの接続状態、業務の設定・依頼・承認・実行の履歴、利用量を取り扱います。利用できる機能の範囲で投稿案の保存を依頼した場合は、その本文と、利用者が選択した画像・動画、承認や配信に必要な情報を保存・処理します。
                        </p>
                        <p>
                          これらの情報は、本人確認、対象の組織・店舗の確認、依頼された業務の提供、承認内容の確認、重複実行の防止、結果の確認、サポートおよび不正利用対策に使用します。顧客台帳やメッセージ全履歴を保管するためのサービスではありませんが、依頼本文や投稿素材に個人情報が含まれる場合があります。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='2. 事前確認・投稿案の保存・外部への送信'>
                        <p>
                          LINE投稿文の事前確認だけを依頼した場合、その確認処理によって投稿案や配信処理が新しく保存されることはありません。入力された文章は確認のために処理されます。投稿案の保存には別の依頼が必要であり、保存しただけでLINEの送信やInstagramの公開が行われるものではありません。
                        </p>
                        <p>
                          ChatGPTから依頼した内容と、その依頼に必要な結果・状態・選択した素材は、機能に応じてOpenAIとの間で処理されます。承認連絡にはSlackを使用し、依頼と必要な承認・権限確認が成立した場合には、LINEやInstagram等の対象サービスへ本文や素材等を送信します。利用できる連携先と操作は、契約内容、接続設定、権限および各サービスの利用条件によって異なります。
                        </p>
                        <p>
                          ChatGPTへ入力した内容やWorksから返した結果は、OpenAI側でも処理されます。会話の取扱いには、OpenAIの規約および利用者の設定も適用されます。Works側の投稿案を削除することと、ChatGPTの会話を削除することは別の操作です。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 運営基盤と接続情報'>
                        <p>
                          Worksは、認証・データ・ファイルの管理にSupabase、管理画面とWeb処理にVercel、ChatGPT等からの依頼受付にRailway、業務の実行と定期処理にTrigger.devを使用する構成です。利用者が接続するSlack・LINE・Instagram等とは、それぞれの処理の役割が異なります。
                        </p>
                        <p>
                          外部サービスとの接続では、接続先のアカウント、許可された操作、有効期限、アクセスに必要な認証情報を取り扱います。認証情報は接続用の管理機能で扱い、チャットや投稿素材へ入力しないでください。Worksの連携解除、外部サービス側の許可取消し、保存済み情報の削除は別の処理です。連携を解除しても、外部サービスにすでに送信した情報は自動削除されません。
                        </p>
                        <p>
                          操作時には、接続先が許可した範囲に加え、Works側の組織・店舗・利用者の権限と必要な業務承認を確認します。ChatGPT上の許可設定だけで、Works側の確認を省略することはできません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 入力しないでいただきたい情報'>
                        <p>
                          ChatGPT向けプラグインには、患者カルテやPHI（保護対象保健情報）、決済カード情報、政府発行の識別番号、パスワード・APIキー・認証コード等を、チャット・本文・画像・動画として入力しないでください。その他の機微情報も、必要性と適法な取扱いを確認せずに入力しないでください。禁止情報が常に自動検出・除去されることを前提に利用しないでください。
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
                    <>
                      <p>
                        お問い合わせは、Googleフォーム（Google
                        LLCが提供する外部サービス）で受け付けます。入力内容と返信先は、問い合わせ、契約条件のご案内、サポート、個人情報や事業者情報の開示等の請求への対応に使用します。Google側の利用規約・プライバシーポリシーも適用されます。
                      </p>
                      <p>
                        フォームで求められる項目を確認し、患者の医療情報や認証情報を記入しないでください。フォームを利用できない場合は、お問い合わせページに掲載している業務用メールをご利用ください。
                      </p>
                    </>
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
                        から受け付けます。フォームを利用できない場合は、同ページの業務用メールをご利用ください。
                      </p>
                      <p>
                        ご請求の内容に応じてご本人確認をお願いする場合があります。利用院が管理する情報については利用院と連携して対応します。法令に基づく保存義務や第三者の権利等により、ご希望の方法で対応できない場合があります。権限のない方へ情報を開示することはありません。
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
                          保存期間は情報の種類と利用目的によって異なります。OSで利用院から預かる情報、アカウント情報、契約・請求・会計記録、問い合わせ、操作・監査記録は、同じ期間で一括削除されるものではありません。契約終了や連携解除だけで、これらの情報がすべて即時に削除されるものではありません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='Worksの一時データ'>
                        <p>
                          Slack経由のLINE送信依頼の本文・宛先や、投稿案・素材の一部には、初期有効期間を24時間とする仕組みがあります。送信を試みた後の素材を7日間延長して保持する経路もあります。利用できなくなる時点と、サーバーから実際に削除される時点は異なります。
                        </p>
                        <p>
                          Worksで会話から利用するSquare予約の検証用連携では、一時的な入力・承認情報・結果や予約状態の通知に、7日で参照を失効させる仕組みがあります。実際の削除は別の保守処理によります。この説明は、Square予約連携の一般提供や、OSの予約情報への同じ保存期間の適用を示すものではありません。
                        </p>
                        <p>
                          一時的な本文や素材を削除した後も、二重実行の防止や処理結果の確認に必要な識別情報、内容の一致を確認するための値、監査記録等が残る場合があります。上記の24時間・7日は、Works内の全情報がその期限に完全消去されるという保証ではありません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='バックアップ・外部サービス'>
                        <p>
                          利用中のデータからの削除、バックアップからの消去、外部サービスに送信済みの情報の削除は、それぞれ別に扱います。外部サービス側の保存・削除には各社の契約や設定が適用されます。Worksの連携を解除しても、ChatGPTの過去の会話やSlack・LINE・Instagram上の情報まで削除されるものではありません。
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
                      <LegalArticle title='確認用原稿に残る未確定事項'>
                        <p>
                          この原稿は公開承認前です。次の事項は未確定または実運用の確認前であり、上記の説明をもって確認済みとは扱いません。公開する本文・別表には、確認した実際の条件を反映します。
                        </p>
                        <ul className='list-disc space-y-1 pl-5'>
                          <li>
                            OSの預かり情報、Worksのアカウント・実行・承認・監査記録、契約・会計・問い合わせ記録ごとの保存期間、終了後の返却・削除期限、法令や紛争対応による例外。
                          </li>
                          <li>
                            一時情報の削除処理の本番設定・稼働と実削除、バックアップの保管地域・保持期間・復元時の削除反映。24時間・7日の有効期限から、実際の削除期限を推定しないこと。
                          </li>
                          <li>
                            実際に有効な委託先・再委託先・外部送信先、送信項目、処理国、契約条件、共同利用の有無、国外提供に必要な対応。OSのAI分析の有効化と取扱条件を含む。
                          </li>
                          <li>
                            OSで預かる情報の役割分担とデータ処理の合意、開示等の請求の本人確認・回答方法・手数料、漏えい時の連絡と安全管理の運用。窓口の受信・通知・返信は事業者から完了申告済みであり、その再実施を一律に求めるものではありません。
                          </li>
                        </ul>
                      </LegalArticle>
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

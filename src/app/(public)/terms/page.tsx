import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalPage } from '@/components/legal/legal-page';
import { OperatorProfileValue } from '@/components/legal/operator-profile-list';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import {
  legalDescription,
  legalRobots,
} from '@/components/public/release-readiness';
import '../lp-styles.css';

// 掲載確認用の規約原稿。共通事項と製品別の条件を見出し・アンカーで分ける。
// 個別契約の採用条件・データ運用との照合と文書の公開承認は別途必要。
// LegalReviewRequiredは本文の確定を示さない。公開判定・日付をこのページで変更しない。

export const metadata: Metadata = {
  title: '利用規約 | Tiramisu',
  description: legalDescription(
    'terms',
    'Tiramisu OS・Tiramisu Worksの共通利用条件と製品固有の条件。'
  ),
  alternates: { canonical: '/terms' },
  robots: legalRobots('terms'),
};

const linkClass = 'underline underline-offset-4 hover:text-slate-900';

export default function TermsPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader />
      <main id='main'>
        <LegalPage
          title='利用規約'
          document='terms'
          sections={[
            {
              id: 'scope',
              title: 'このページについて',
              body: (
                <LegalReviewRequired field='terms:scope'>
                  {
                    <p>
                      本利用規約は、Tiramisu OSおよびTiramisu
                      Works（以下総称して「本サービス」）の事業用利用に関する共通の条件と、製品ごとの条件を定めます。提供内容や料金等の個別条件は、お申込み前に提示する見積書・申込書・契約書等でご案内します。本規約と個別契約の関係・優先順位も、その契約条件に明示します。適用法令の強行規定に反する合意は適用しません。
                    </p>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'common',
              title: '共通事項',
              body: (
                <LegalReviewRequired field='terms:common'>
                  {
                    <>
                      <LegalArticle title='1. 運営者'>
                        <p>
                          本サービスは、
                          <OperatorProfileValue field='name' />
                          （以下「当事業者」といいます）が運営します。運営者の連絡先、所在地・電話番号の開示窓口は
                          <Link
                            href='/legal'
                            prefetch={false}
                            className={linkClass}
                          >
                            運営者情報・販売条件
                          </Link>
                          をご確認ください。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='2. 契約の成立・料金・契約期間'>
                        <p>
                          本サイトには直接の申込み・決済機能はありません。Tiramisu
                          Worksの有料契約は、導入相談後に別途提示する条件に基づき申込みを受け付けます。契約の成立時点と適用条件は、申込者に提示した見積書・申込書・契約書等の合意内容に従います。サイトの閲覧やお問い合わせだけで有料契約は成立しません。
                        </p>
                        <p>
                          サイトの掲載料金は検討のための参考情報です。実際に適用する価格、税区分、初期導入費、継続料金、支払方法、対象店舗・接続先、機能と支援の範囲は、お申込み前に提示する個別条件をご確認ください。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. アカウント・権限・禁止事項'>
                        <p>
                          契約者は、利用権限のある所属院・組織の業務に限り利用し、アカウントを適切に管理してください。不正アクセス、他院・他組織データの取得、認証情報の共有・貸与、迷惑配信、無断の情報取得、法令や外部サービス規約に違反する利用は禁止します。権限喪失や不正利用を知った場合は速やかに連絡してください。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 期間・更新・解約・返金・支払遅延'>
                        <p>
                          契約期間、最低利用期間、自動更新の有無と通知時期、解約の受付方法・通知期限・効力発生日、返金・日割り、支払遅延時の催告・利用停止条件は、お申込み前に提示する個別契約に定めます。本規約のみを根拠に、最低利用期間、自動更新又は返金不可の条件を付加するものではありません。
                        </p>
                        <p>
                          解約の相談や手続の確認は、個別契約に記載の窓口又は
                          <Link
                            href='/contact'
                            prefetch={false}
                            className={linkClass}
                          >
                            お問い合わせページ
                          </Link>
                          からご連絡ください。
                        </p>
                        <p>
                          通信費、ChatGPTの利用プラン、連携先サービス利用料・送信料等が別途発生する場合は、負担する費用と条件を導入前にご案内します。Worksの有料契約とChatGPT上の利用許可・接続設定は別の手続です。ChatGPT向けプラグイン内で、新規の有料契約や決済は受け付けていません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='5. お問い合わせ'>
                        <p>
                          本サービスに関するお問い合わせは、
                          <Link
                            href='/contact'
                            prefetch={false}
                            className={linkClass}
                          >
                            お問い合わせページ
                          </Link>
                          で受け付けます。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'os',
              title: 'Tiramisu OS（店舗・本部管理）の条件',
              body: (
                <LegalReviewRequired field='terms:os'>
                  {
                    <>
                      <LegalArticle title='第1条 適用'>
                        <p>
                          本項は、整骨院管理SaaS（Tiramisu
                          OS）の固有条件です。利用できる機能と条件は、利用院にご案内する提供範囲に従います。サイトの閲覧やお問い合わせだけで有料契約又は医療情報処理への同意があったとはみなしません。
                        </p>
                        <p>
                          本サービスは限定パイロットとして提供され、正式版と比較して提供機能や運用条件が一部異なる場合があります。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='第2条 利用範囲'>
                        <p>
                          利用者は、自己の所属する院または許可されたテナントの業務目的に限り、本サービスを利用できます。
                        </p>
                        <p>
                          利用者は、アカウント情報を適切に管理し、第三者への貸与、共有、譲渡を行ってはなりません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='第3条 禁止事項'>
                        <p>
                          利用者は、法令違反、不正アクセス、他院データへの不正なアクセス、サービス運営を妨げる行為を行ってはなりません。
                        </p>
                        <p>
                          医療情報、患者情報、スタッフ情報を取り扱うため、業務上知り得た情報を正当な権限なく持ち出すことを禁止します。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='第4条 個人情報と医療情報の取扱い'>
                        <p>
                          利用院は患者情報の登録権限、取得時の説明・同意等、利用目的・保有方針を確認します。当事業者は委託された範囲の処理と安全管理を担い、責任をすべて利用院へ移転しません。医療判断・施術判断は専門職が行い、本サービスやAIの情報を診断・治療の代替にしないでください。
                        </p>
                        <p>
                          患者情報等を取り扱う場合は、処理する情報と目的、当事業者と利用院の役割分担、安全管理・アクセス監査、データの移行・返却形式・費用・削除条件を、別途データ処理契約等で合意します。本規約だけで医療情報の取扱いに必要な手続や、適用される法令・ガイドラインへの対応が完了するものではありません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='第5条 免責'>
                        <p>
                          当事業者は、パイロット提供期間中、継続的な品質改善に努めますが、障害や仕様変更が生じる可能性があります。
                        </p>
                        <p>
                          利用者は、重要な業務判断を行う際には、本サービス上の情報のみならず、自院の運用記録や原資料も確認するものとします。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'works',
              title: 'Tiramisu Works（既存ツールを活かす業務支援）の条件',
              body: (
                <LegalReviewRequired field='terms:works'>
                  {
                    <>
                      <LegalArticle title='1. 外部アカウント・利用範囲'>
                        <p>
                          接続できるのは契約者が適法な権限を持つ外部アカウントのみです。利用できる機能は、契約上の提供範囲、接続先が許可したスコープ、プラン・利用環境、所属する組織や店舗の権限、外部サービスの規約に従います。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='2. 依頼・承認・実行の責任分界'>
                        <p>
                          ChatGPT上の操作許可、OAuth接続、Worksのサーバー認可、本文・素材の保存依頼、業務承認、送信・公開は別の手続です。接続成功だけで投稿案を保存・承認・公開しません。送信・公開は対象の権限と承認ポリシーに従い、承認者は宛先・内容・対象アカウントを確認してください。内容変更時は必要な再承認を行います。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 障害・実行結果不明時の対応'>
                        <p>
                          外部サービスの停止・仕様変更・認可失効等で処理できない場合があります。依頼の受付や承認だけでは、送信・公開又は相手への到達が完了したことにはなりません。Worksは実行結果が不明な操作を自動再送しません。実行結果が確認できないときは、新しい依頼として再送する前に、元の操作ID・記録と外部サービスの状態を照合してください。確認できない場合は当事業者へご連絡ください。復旧対応・補償・サポートの範囲は、有効な個別契約と適用法令に従います。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 入力とAI生成情報'>
                        <p>
                          AI生成内容には誤り・欠落・権利侵害等があり得ます。契約者は重要判断・外部公開前に内容・権利・宛先を確認してください。この確認責任は当事業者の法令上・契約上の責任をすべて免除するものではありません。
                        </p>
                        <p>
                          患者カルテの正本・全履歴やPHI、決済カード情報、政府発行の識別番号、パスワード・APIキー・認証コード等をChatGPT向けの入力・素材・処理に含めないでください。詳細はプライバシーポリシーのWorks固有規定を確認してください。迷惑配信・無断取得や権限外の実行は禁止します。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'data-rights',
              title: 'データ・知的財産・秘密保持',
              body: (
                <LegalReviewRequired field='terms:data-rights'>
                  {
                    <>
                      <LegalArticle title='権利と利用許諾'>
                        <p>
                          契約者が登録するデータの権利は権利者に留保し、契約者は登録・送信・公開に必要な権利を確認します。当事業者に認める利用範囲はサービス提供に必要な範囲として契約で明示します。サービス自体の知的財産と契約者のデータは区別し、AI成果物の独占性・非侵害を保証しません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='秘密保持・終了時の返却と削除'>
                        <p>
                          相手方の非公開の業務情報は目的外利用・無断開示を行わず、法令に基づく開示や必要な委託の条件は契約で定めます。当事業者も必要な安全管理と委託先管理を担います。
                        </p>
                        <p>
                          契約の終了・停止に伴うデータ返却の対象・形式・費用・受付期間と、当事業者が保有する情報の削除条件は、個別契約及びプライバシーポリシーに従います。法令上の保存義務、監査・会計・紛争対応に必要な記録、バックアップの扱いは、対象となる情報ごとに区別します。連携解除だけで、外部サービス上のデータやバックアップを含むすべての情報が直ちに削除されるものではありません。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'liability',
              title: '損害賠償・規約変更・準拠法',
              body: (
                <LegalReviewRequired field='terms:liability'>
                  {
                    <>
                      <LegalArticle title='責任・損害賠償'>
                        <p>
                          当事業者に帰責事由がある場合の責任及び損害賠償は、適用法令と有効な個別契約に従います。本規約は一律の損害賠償上限を定めず、AIや外部サービスを利用することだけを理由に当事業者の責任をすべて免除するものではありません。法令により免責又は責任の制限が認められない場合は、その法令に従います。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='変更・停止・準拠法・管轄'>
                        <p>
                          機能変更・停止・契約終了又は規約改定は、適用法令と個別契約に従い、必要な通知・予告・同意の手続を行います。規約を改定するときは、変更内容と改定日・施行日を本ページ等でご案内します。利用を継続したことだけで、すべての変更に同意したものとは扱いません。準拠法及び紛争解決については、適用法令と有効な個別契約の定めに従います。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'pending',
              title: 'ご契約前にご確認いただく事項',
              body: (
                <LegalReviewRequired field='terms:pending'>
                  {
                    <p>
                      お申込み前に、利用する製品と提供範囲、費用と支払条件、契約期間・更新・解約・返金、サポートの範囲、データの取扱い・返却・削除の条件をご確認ください。条件の確認に必要な情報が不足している場合や、本規約と提示された個別条件について不明な点がある場合は、お申込み前にお問い合わせ窓口へご連絡ください。
                    </p>
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

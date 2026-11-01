import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalPage } from '@/components/legal/legal-page';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import {
  legalDescription,
  legalRobots,
} from '@/components/public/release-readiness';
import '../lp-styles.css';

// 利用規約（暫定案）。共通事項と製品別の条件を見出し・アンカーで分ける。
// 条文の確定は事業者と専門家の確認後（公開前チェック B09）。未確定の条件は架空の内容で埋めない。

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
                      本ページは、Tiramisu OSおよびTiramisu
                      Works（以下総称して「本サービス」）の事業用利用を対象に、共通事項と製品ごとの条件を定める原稿です。個別契約と抵触する場合の優先順位も契約前に明示し、適用法令の強行規定に反する合意は適用しません。B2B向けであることだけで法令の適用除外を保証するものではありません。
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
                          本サービスは、個人事業主（以下「当事業者」といいます）が運営します。事業者の氏名等は
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
                      <LegalArticle title='2. 契約の成立・料金・契約期間'>
                        <p>
                          本サイトには直接の申込み・決済機能はありませんが、当事業者は導入相談後に別途契約条件を提示し、その条件に基づく有料契約の申込みを受け付けます。契約の成立時点と適用条件は、申込者に提示した見積書・申込書・契約書等の合意内容に従います。サイト閲覧や問い合わせだけで有料契約は成立しません。現行サイトの掲載料金は参考であり、実際の価格・税区分・初期導入費・支払方法・提供範囲は申込み前に明示します。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. アカウント・権限・禁止事項'>
                        <p>
                          契約者は、利用権限のある所属院・組織の業務に限り利用し、アカウントを適切に管理してください。不正アクセス、他院・他組織データの取得、認証情報の共有・貸与、迷惑配信、無断の情報取得、法令や外部サービス規約に違反する利用は禁止します。権限喪失や不正利用を知った場合は速やかに連絡してください。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='4. 期間・更新・解約・返金・支払遅延'>
                        <p>
                          契約期間、最低利用期間、自動更新の有無と通知時期、解約の受付方法・効力発生日、返金・日割り、支払遅延時の催告・利用停止条件は未確定です。契約前に製品別に明示して合意し、本規約と販売条件へ反映します。未確定の期間や返金不可条件を適用しません。解約の方法を電話だけに限定しない設計を確認します。
                        </p>
                        <p>
                          通信費、ChatGPTのプラン、連携先サービス利用料・送信料等は別途発生する場合があり、負担と上限は導入前に案内します。本サイトの外部Web契約とChatGPT内の利用は区別します。ChatGPT向けプラグイン内でデジタルサービスの購入・新規サブスク・アップセルを行う導線は設けず、現行OpenAI規定に従います。
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
                          OS）の固有条件です。利用・閲覧だけをもって未確定の有料条件や医療情報処理への同意があったとはみなしません。
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
                          適用される法令・ガイドライン、別途DPA・役割分担、安全管理・アクセス監査、患者データの移行・返却形式・費用・削除期限は個別に合意する必要があります。共通規約だけで医療情報システムの安全管理への準拠を保証しません。
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
                          接続できるのは契約者が適法な権限を持つ外部アカウントのみです。機能・接続スコープ・プラン・環境・組織や店舗の範囲と、外部サービスの規約に従います。実装の存在だけで一般提供や利用許可を意味しません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='2. 依頼・承認・実行の責任分界'>
                        <p>
                          ChatGPT上の操作許可、OAuth接続、Worksのサーバー認可、本文・素材の保存依頼、業務承認、送信・公開は別の手続です。接続成功だけで投稿案を保存・承認・公開しません。送信・公開は対象の権限と承認ポリシーに従い、承認者は宛先・内容・対象アカウントを確認してください。内容変更時は必要な再承認を行います。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='3. 障害・実行結果不明時の対応'>
                        <p>
                          外部サービスの停止・仕様変更・認可失効等で処理できない場合があります。受付・承認・実行・相手への到達は同一ではありません。outcome_unknown（結果不明）の操作は自動で重複送信せず、元の操作ID・記録と外部サービスの状態を照合します。利用者も新しい依頼として再送せず、運営者へ確認してください。復旧・補償・サポートの範囲は契約で確認します。
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
                          終了・停止の予告、データ返却の対象・形式・費用・受付期間、稼働系の削除期限、監査・会計・紛争対応上の保存例外、バックアップは未確定です。プライバシーポリシーと個別契約で整合させます。連携解除は外部サービス上のデータ削除とは異なり、即時完全削除を約束しません。
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
                          当事業者に帰責事由がある場合の責任は適用法令と有効な契約に従います。損害賠償の範囲・上限、故意・重過失等の例外は未確定であり、過去12か月の利用料等の上限を本原稿で設定しません。AI・外部サービスの利用を理由とする全面免責は定めません。
                        </p>
                      </LegalArticle>
                      <LegalArticle title='変更・停止・準拠法・管轄'>
                        <p>
                          機能変更・停止・契約終了や規約改定の事由、通知方法・予告期間・必要な同意手続は、法令に従い契約前に明示します。改定は利用だけで一律に同意したものとせず、承認された改定日・施行日を表示します。準拠法・裁判管轄の具体的合意は専門家確認と事業者承認後に掲載し、未確認の裁判所名を設定しません。
                        </p>
                      </LegalArticle>
                    </>
                  }
                </LegalReviewRequired>
              ),
            },
            {
              id: 'pending',
              title: '商用提供前の未確定事項',
              body: (
                <LegalReviewRequired field='terms:pending'>
                  {
                    <p>
                      運営者の氏名・ブランド・業務メールは掲載承認済みです。窓口の受付・返信については事業者が運用確認完了を申告しており、証跡の照合が残っています。実契約に基づく料金・税・支払、期間・更新・解約・返金、サービス水準、データ返却・削除、責任範囲・準拠法・裁判管轄は必要な確認と専門家レビューを経て確定します。
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

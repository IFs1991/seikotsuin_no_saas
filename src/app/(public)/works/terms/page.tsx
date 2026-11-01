import Link from 'next/link';
import {
  WorksDocument,
  worksDocumentMetadata,
} from '@/components/legal/works-document';
import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import '../../lp-styles.css';

export const metadata = worksDocumentMetadata('works/terms', '利用規約');
export default function WorksTermsPage() {
  return (
    <WorksDocument
      title='Tiramisu Works 利用規約'
      document='works/terms'
      sections={[
        {
          id: 'scope',
          title: '1. 目的・提供範囲',
          body: (
            <LegalReviewRequired field='works/terms:scope'>
              <p>
                本規約はTiramisu
                Worksの利用条件を定めます。Worksは既存SaaSを正本とし、認可された接続・業務・初期設定の状態確認、設定の案内、提供可能な環境での投稿案の準備を支援します。外部履歴の無制限コピー、カルテ管理、OSの患者データの自動共有、将来の未提供機能は対象に含みません。
              </p>
              <p>
                利用可能な機能は現在の環境、権限、接続、Provider審査、運用設定により異なります。限定PoCや初期提供を含め、利用前に提示する対象範囲を確認してください。申請対象の本番機能と有効化・検証の証拠は事業者の確認待ちです。PoCのみを完成した一般提供機能として申請しません。
              </p>
            </LegalReviewRequired>
          ),
        },
        {
          id: 'authority',
          title: '2. 接続権限と利用者認証',
          body: (
            <>
              <p>
                利用者は自己または所属組織から権限を与えられた店舗・外部SaaSだけを接続し、対象アカウント、権限の範囲、送信先、必要な同意を確認してください。アカウントを共有せず、認証情報は正規の安全な設定画面で扱ってください。
              </p>
              <p>
                Worksは現在の本人・組織・店舗・ロールとScopeで操作を判断します。権限の不足、失効、対象不一致、結果不明を別Appや別アカウントで迂回しないでください。接続済み・正常という表示だけで、個々の業務の実行や完了は保証されません。
              </p>
            </>
          ),
        },
        {
          id: 'approval',
          title: '3. AI生成物・投稿案・本人承認',
          body: (
            <>
              <p>
                AIが提案した文面や素材の事実、権利、個人情報、対象店舗・アカウント・宛先を利用者が確認してください。AIの出力を業務判断や医療判断の正本にしないでください。運営者は本規約とPrivacy
                Policyに基づくサービス提供・安全管理・サポートを行い、利用者による確認にすべての責任を転嫁しません。
              </p>
              <p>
                投稿案の保存・受付、素材検査、Slackへの承認カードの配送、本人承認、ProviderのAPI受理、相手への到達、公開はそれぞれ異なります。保存・承認だけでは公開・送信されていません。承認対象が変わった場合は既存承認を流用せず、現在の権限と必要な確認・承認を満たす必要があります。
              </p>
            </>
          ),
        },
        {
          id: 'prohibited',
          title: '4. 禁止行為・禁止データ',
          body: (
            <>
              <p>
                不正アクセス、他組織・他店舗の情報取得、無権限の接続・送信、承認やProvider制限の回避、第三者の権利侵害、迷惑送信、サービス妨害を禁止します。
              </p>
              <p>
                患者カルテ・診療内容・健康情報、決済カード情報、政府発行の識別番号、認証秘密や不要な機微情報を会話、MCP、投稿案、素材、問い合わせへ入力しないでください。APIキー・パスワード・MFA／OTP等を会話で要求・開示する機能は提供しません。
              </p>
            </>
          ),
        },
        {
          id: 'failures',
          title: '5. 外部サービス・結果不明・利用停止',
          body: (
            <>
              <p>
                外部SaaS・OpenAI等の障害、権限変更、審査や利用制限により利用できない場合があります。実行結果が不明な場合は元の操作ID・受付IDで状態を照会し、重複送信のおそれがある操作を新しいIDで再実行しないでください。API受理や配信記録を端末到達や公開完了と解釈しないでください。
              </p>
              <p>
                不正利用、情報漏えいのおそれ、権限失効や法令上の必要がある場合、対象機能の利用を制限・停止することがあります。利用の中止、連携解除、停止への問い合わせは
                <Link
                  href='/contact?product=works&intent=support'
                  prefetch={false}
                >
                  Worksサポート
                </Link>
                へご連絡ください。解除と保存済み情報の削除は別の手続きです。
              </p>
            </>
          ),
        },
        {
          id: 'commercial',
          title: '6. 料金表示と契約・個人情報',
          body: (
            <>
              <p>
                公開LPは導入相談を受け付けるもので、オンライン契約・決済を行いません。LPの料金は暫定の税別参考表示であり、これだけで個別契約や支払義務は成立しません。有料提供の対象範囲・価格・税・支払・開始・終了等は契約前に別途提示し合意します。本規約では未確定の最低利用期間、解約金、返金条件、責任上限や合意管轄を定めません。
              </p>
              <p>
                ChatGPT／MCP内で新規サブスクリプションの販売・アップセル・決済開始は行いません。個人情報、外部送信、保持、連携解除や開示等の請求は
                <Link href='/works/privacy'>Worksプライバシーポリシー</Link>
                に従います。運営者情報は
                <Link href='/works/privacy#operator'>同方針の運営者欄</Link>
                を参照してください。
              </p>
              <p>
                提供内容の変更は必要な通知・同意を伴って案内します。改定日・施行日は公開承認された実日付をページ上部に表示します。
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

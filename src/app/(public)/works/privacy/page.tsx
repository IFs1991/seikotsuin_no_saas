import Link from 'next/link';
import {
  WorksDocument,
  worksDocumentMetadata,
} from '@/components/legal/works-document';
import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import { OperatorProfileValue } from '@/components/legal/operator-profile-list';
import '../../lp-styles.css';

export const metadata = worksDocumentMetadata(
  'works/privacy',
  'プライバシーポリシー'
);

export default function WorksPrivacyPage() {
  return (
    <WorksDocument
      title='Tiramisu Works プライバシーポリシー'
      document='works/privacy'
      sections={[
        {
          id: 'scope',
          title: '1. 適用範囲とデータの正本',
          body: (
            <>
              <p>
                本方針はTiramisu
                WorksとそのChatGPT／MCP連携、Worksに関するお問い合わせに適用します。Tiramisu
                OSの予約・顧客データの取扱いには適用しません。
              </p>
              <p>
                Worksは既存SaaSを業務データの正本とするControl
                Planeです。外部サービスの全履歴や患者カルテを集約・恒久保存するサービスではありません。認可、接続、業務の進行、本人承認、監査に必要な情報と、依頼・投稿案・素材などの一時データを扱います。この原則は、個人情報を一切保存・処理・外部送信しないという意味ではありません。OS患者データを自動共有することは前提としません。
              </p>
            </>
          ),
        },
        {
          id: 'operator',
          title: '2. 運営者と窓口',
          body: (
            <LegalReviewRequired field='works/privacy:operator'>
              <p>
                運営主体：
                <OperatorProfileValue field='businessType' />／
                <OperatorProfileValue field='name' />
                。ブランド：
                <OperatorProfileValue field='brand' />。
              </p>
              <p>
                公開用メール：
                <OperatorProfileValue field='publicEmail' />
                。所在地・連絡先の開示方法：
                <OperatorProfileValue field='addressAndPhonePolicy' />
              </p>
              <p>
                <Link
                  href='/contact?product=works&intent=operator-disclosure'
                  prefetch={false}
                >
                  事業者情報の開示請求
                </Link>
                ／
                <Link
                  href='/contact?product=works&intent=support'
                  prefetch={false}
                >
                  サポート
                </Link>
                。事業者情報の開示方法が個人情報保護法上の公表等の要件を満たすかは事業者確認待ちです。
              </p>
            </LegalReviewRequired>
          ),
        },
        {
          id: 'information',
          title: '3. 取り扱う情報と目的',
          body: (
            <>
              <ul className='list-disc space-y-2 pl-5'>
                <li>
                  利用者ID、ログイン用メールアドレス・表示名、認証・セッション、所属組織・店舗・ロール：本人確認、権限管理と組織・店舗間のアクセス分離。
                </li>
                <li>
                  接続先アカウントID、許可Scope、接続世代・状態、有効期限、Vault参照：外部サービスの接続・再接続・解除と許可された操作。
                </li>
                <li>
                  Workflowと版、Run・Stepの状態、Approval、宛先同意、操作ID、Payload
                  Hash、監査・利用量：承認対象の固定、重複実行の防止、進捗確認、障害調査、不正利用対策。ハッシュやIDだけを持つ記録もありますが、すべての記録が匿名情報になるわけではありません。
                </li>
                <li>
                  LINE／Slack由来の依頼本文、本文の投稿案、宛先や承認カードに必要な情報：依頼の準備、本人確認・承認、許可された送信。
                </li>
                <li>
                  Instagram等の投稿案本文、利用者が選択した画像・動画、形式・サイズ・ハッシュ・検査状態：素材の取込、検査、プレビュー、投稿案の保存と承認。対応していない形式や権限不足では公開に進みません。
                </li>
                <li>
                  問い合わせ・有料契約の申込連絡で利用者が入力・送付する連絡先、組織・店舗、相談・申込内容：サポート、契約条件の提示・申込受付と契約関連の連絡、個人情報の開示・訂正・利用停止・削除等の対応。既存Googleフォームまたは公開用業務メールで受け付けます。サイトの製品・目的の選択はフォームへ自動転記されません。
                </li>
                <li>
                  アクセス・エラー等の技術ログ：接続の保護、運用・障害調査。実際の記録項目と保持条件は下記の確認対象です。
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'transfers',
          title: '4. 受信者・外部送信・国外処理',
          body: (
            <LegalReviewRequired field='works/privacy:transfers'>
              <p>
                ChatGPT／CodexからMCPへ、対象の組織・店舗、操作ID、選択した依頼・投稿案・素材など、その操作に必要な入力が送信されます。MCPの応答には接続や業務の状態、依頼本文・投稿案、許可された画像・動画やプレビューが含まれる場合があり、OpenAIへ送信されます。会話全体をWorksが一律に取得する設計ではありません。OpenAI側での会話・応答の保持等には利用者とOpenAIとの規約・設定が適用され、Worksでの削除や連携解除だけで削除されるとは限りません。
              </p>
              <p>
                実行が許可された場合、LINEには宛先と本文・素材、Slackには依頼・承認カードとその表示に必要な情報、Instagram／Metaには対象アカウント・本文・画像などが送られます。投稿案保存だけで公開・送信されたことにはなりません。Works以外の標準Appで利用者が行う操作はWorksの管理対象外です。
              </p>
              <p>
                認証・DB・Vault・StorageにはSupabase、WebにはVercel、MCPにはRailway、実行基盤にはTrigger.devを使用する構成です。問い合わせフォームの受信者は運営者とGoogleです。業務メールの問い合わせ・契約連絡は運営者と利用するメールサービス事業者が処理します（メール基盤の事業者・保管条件は照合待ち）。監視の設定にはSentry等が関係する場合があります。受信者ごとの本番有効化、送信項目、委託・第三者提供の区分、所在国・リージョン・再委託、国外処理の適用根拠はUNKNOWN（未確認）です。確認済み範囲と必要な説明・同意が成立するまで、その経路を公開申請対象として承認しません。
              </p>
              <p>
                Worksは現在、OpenAI Responses
                API等を直接呼び出すAI生成基盤を提供していません。ChatGPT／MCPを通じた情報送信とは別の事項です。
              </p>
            </LegalReviewRequired>
          ),
        },
        {
          id: 'credentials',
          title: '5. OAuth・認証情報と安全管理',
          body: (
            <>
              <p>
                OAuthの同意や認証秘密の入力は正規のStudio・外部サービスの安全な画面で行います。APIキー、パスワード、MFA／OTP、アクセストークン等をChatGPTの会話、MCPの入力、投稿案、問い合わせ本文へ入力しないでください。外部サービスへの接続に必要な認証情報はVaultで扱い、業務テーブルには参照と接続メタデータを記録します。MCPの応答で秘密を返すことは提供範囲に含めません。
              </p>
              <p>
                本人・組織・店舗の認可、RLS、操作範囲と現在の権限の検証、本人承認、監査記録などでアクセスを制御します。コード上の安全機構は、本番設定、委託先の管理、バックアップ削除や認証取得の保証を意味しません。
              </p>
            </>
          ),
        },
        {
          id: 'retention',
          title: '6. 保持・失効・削除',
          body: (
            <LegalReviewRequired field='works/privacy:retention'>
              <p>
                組織・権限、接続メタデータ、Workflow、Run、Approval、監査、ハッシュの一律の保存期限・自動削除期間はUNKNOWNです。連携解除は将来の接続利用を停止する操作で、これらの記録や外部サービス側の履歴をすべて消去する操作ではありません。
              </p>
              <p>
                SlackのLINE依頼経路では、本文等に約24時間後のpurge条件があり、毎時の削除タスクが実装されています。これはタスクの有効化と正常実行が必要な条件付きの処理で、外部Slack／LINEの投稿や監査記録まで24時間で消す保証ではありません。
              </p>
              <p>
                MCP投稿案・素材には初期値24時間の有効期限と、期限後の本文消去・Storage削除処理があります。既存Instagram投稿案、Slack由来の素材、LINE送信用コピーは別のテーブル・処理です。送信試行後の素材に7日間の保持延長がある経路もあります。有効期限、参照不能、本文消去、実ファイル削除は異なる状態です。削除タスク・件数制限・再試行・バックアップを含む本番の削除実績と最終期限はUNKNOWNです。一律のTTLや即時完全削除は約束しません。
              </p>
              <p>
                問い合わせ、技術ログ、委託先ログ・バックアップの保存期間もUNKNOWNです。事業者が実際の設定・削除基準を確認し、この条項の未確認事項を解消するまで正式公開を保留します。
              </p>
            </LegalReviewRequired>
          ),
        },
        {
          id: 'requests',
          title: '7. 利用者の管理手段・開示等の請求',
          body: (
            <LegalReviewRequired field='works/privacy:requests'>
              <p>
                現在の権限に応じてStudioから連携解除を行い、必要に応じ外部サービス側でもアプリの許可を取り消してください。Works内で対象Credentialを削除する経路があっても、Provider側の失効や過去データの削除とは別です。投稿案は承認前の準備と送信・公開を区別し、未確認・結果不明の操作を繰り返さないでください。
              </p>
              <p>
                開示、訂正、利用停止、削除、保持条件の確認は
                <Link
                  href='/contact?product=works&intent=privacy'
                  prefetch={false}
                >
                  個人情報の取扱い・削除依頼
                </Link>
                から行えます。対象の組織・店舗と操作ID等の最小限の情報をお知らせください。本人確認、権限、法令や監査上の保存の必要性、外部サービス管理分を確認して対応します。身分証や認証秘密をフォームへ添付しないでください。
              </p>
              <p>
                窓口の受信・通知・返信と事業者情報の開示対応は、運営者から運用確認完了の申告を受けています。公開可能な証跡の参照先、本人確認・請求への対応手順、問い合わせ情報の保持・削除条件を照合中です。受付期限や削除完了日は未確定です。
              </p>
            </LegalReviewRequired>
          ),
        },
        {
          id: 'restricted',
          title: '8. 入力しない情報・改定',
          body: (
            <>
              <p>
                患者カルテ・診療内容・健康情報、PCI対象の決済カード情報、政府発行の識別番号、認証秘密、その他業務に不要な機微情報を扱う用途は本申請の対象外です。画像・動画の人物や権利にも注意し、対象者の必要な許可を得た素材だけを選択してください。
              </p>
              <p>
                実際の取扱いや提供範囲が変わる場合は本方針を更新し、必要な通知・同意を行います。改定日と施行日は事業者の承認した実日付をページ上部に表示します。利用条件は
                <Link href='/works/terms'>Works利用規約</Link>をご覧ください。
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

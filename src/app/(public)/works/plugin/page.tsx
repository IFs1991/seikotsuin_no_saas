import Link from 'next/link';
import {
  WorksDocument,
  worksDocumentMetadata,
} from '@/components/legal/works-document';
import { LegalReviewRequired } from '@/components/legal/legal-review-required';
import { OperatorProfileValue } from '@/components/legal/operator-profile-list';
import '../../lp-styles.css';

export const metadata = worksDocumentMetadata(
  'works/plugin',
  'プラグインについて'
);
export default function WorksPluginPage() {
  return (
    <WorksDocument
      title='Tiramisu Works プラグインについて'
      document='works/plugin'
      sections={[
        {
          id: 'scope',
          title: '目的と利用できる範囲',
          body: (
            <LegalReviewRequired field='works/plugin:scope'>
              <p>
                Tiramisu
                Worksは、店舗の既存SaaSを活かし、初期設定の案内、認可された接続・業務・手続きの保存済み状態の確認を支援するControl
                Planeです。Worksのアカウントと、対象組織・店舗への権限が必要です。
              </p>
              <p>
                提供条件を満たす環境では、本文と選択された画像・動画を投稿案として準備します。投稿案保存、素材検査、本人承認、外部サービスの受理、送信・公開を区別します。機能の有効化と審査環境の確認が済むまで、未検証の経路を申請対象に含めません。
              </p>
            </LegalReviewRequired>
          ),
        },
        {
          id: 'publisher',
          title: '運営者と問い合わせ',
          body: (
            <>
              <p>
                公開者：
                <OperatorProfileValue field='name' />／
                <OperatorProfileValue field='brand' />。
              </p>
              <p>
                <Link href='/works/privacy#operator'>運営者情報</Link>／
                <Link
                  href='/contact?product=works&intent=support'
                  prefetch={false}
                >
                  Worksサポート
                </Link>
                ／
                <Link
                  href='/contact?product=works&intent=privacy'
                  prefetch={false}
                >
                  データ取扱い・削除の問い合わせ
                </Link>
              </p>
              <p>
                プラグインで新規購入・契約・アップセルは行いません。OpenAIが提供・認定するサービスであることを示すものではありません。
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

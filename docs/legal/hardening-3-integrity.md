# PR-3: 原稿と承認の整合性

基準main `fc23881f4947a1bcc673de59b4fe0bda1bebb211`、PR-1 `b8f5d9f4ce29f18ffa1cb3a46f5f5a415771bc3a`、PR-2 `06b81ff5917ad554c68aacf030ac8078a6b063fa`に依存する別PR。承認代行、Production操作、Vercel設定変更、DB/Auth/RLS変更は行わない。

## 原稿の範囲と検証

`scripts/public-site/legal-manifest.mjs`が3ページごとに決定的なSHA-256を生成する。対象はページ本文、LegalPage等の表示部品、運営者情報・公開判定、Works/OSの料金正本、リンク正本、およびそれらの内部依存の推移閉包。ヘッダー/フッター・画像も含む。正確な対象一覧は`legal-content-snapshot.json`の`inputFiles`に記録する。テキストはLFへ正規化し、画像等のバイナリは元バイトをbase64化する。価格は3文書共通の対象とし、価格変更でも3文書を再レビューする。コメントや表示に影響しない対象ソースの変更でも再レビューとなる保守的な方式。

静的import/export、文字列literalのdynamic import/require/import-equalsを追跡し、非静的な依存やrequireの値別名は検証不能として拒否する。外部パッケージの内部、環境変数、外部フォーム本文、稼働環境の挙動はこのhashの証明範囲外。依存の追加、依存更新、外部設定の変更は別途レビュー・正確なartifactの検証を必要とする。

循環を避け、生成JSONと`legal-approval-records.ts`だけをhash入力から除外する。JSONを読むTS adapter自体は対象。承認レコードのstatus/版/証跡/日付/未解決事項はhashとは独立して全件検証する。`reviewedRevisedOn`と`reviewedEffectiveOn`でレビュー後の日付書換えも拒否する。

`prebuild`、Vercel wrapperの事前処理、release-check、CIのmanifest検査が、現在ソースから再計算して生成JSONとの完全一致を確認する。JSONのhashや未解決リストを手で変更しても通らない。描画時は同じビルドに含まれるJSONと同じ承認関数を使用するため、静的生成とランタイムで別の原稿を認めない。原稿更新後は`npm run legal:manifest`を実行するが、生成は承認状態を変更しない。

## 未解決事項と正式表示

`LegalReviewRequired`は未レビューの必須条項を示す透明なマーカー（DOM追加なし）。現在はprivacy 8条項・terms 7条項・legal 5条項に付与する。販売条件の`LegalPendingValue`も構造的に収集する。別名、namespace/destructuring、依存部品内のマーカーも対象。一般文中の「未確定」という単語だけを禁止しない。

現在の生成結果はprivacy 8件・terms 7件・legal 10件の未解決項目を持つ。原稿の必要事項を事業者・専門家・運用担当が解消し、レビューした条項のマーカーを外す。未解決のままマーカーだけ削除してよいという手順ではない。運営者の必須値はマーカーとは別に公開承認済み実値を検証し、表示部品も同じglobal operatorProfileだけを参照する。未承認の私有値をSSRへ出さない。

正式表示には、B01〜B09の既存全前提、必須運営者情報、マーカー/販売placeholderなし、未解決判断なし、版一致、reviewed/approved両hash一致、証跡、実際の承認日とレビュー済みの改定日/施行日を要求する。B10は従来どおり申請用の別ゲート。PR-1のProduction環境・明示モードも別途必要。statusだけ、hash一致だけ、CI成功だけでは公開承認にならない。

hashは電子署名ではなく、権限を持つ人間の法務承認・証跡確認を代行しない。ソースと承認レコードを両方書き換えられる人の不正を暗号学的に防ぐ仕組みではない。レビューされたcommitを固定し、承認証跡と変更差分を人間が照合する。

## 承認時の操作

1. [判断台帳](issue-167-decisions.md)のP0/P1を各担当が解消し、本文・料金・公開運営者情報・条項マーカーをレビューする。
2. contentVersionを更新してmanifestを再生成。文書ごとの入力一覧・hash・表示結果をレビュー者が確認し、reviewedVersion/reviewedContentHashとレビューした改定日/施行日を記録する。
3. 事業者がその同じhashと日付を対象に承認し、approvedContentHash、approvedOn、公開可能なevidence、statusを記録。未確認の項目は埋めない。今回の実レコードはdraft/nullを維持する。
4. 必須台帳と公開窓口、完全なbuild/scan/E2Eを再確認し、[PR-1の人間によるstaged release](hardening-1-production.md)へ進む。原稿や料金を変更したら再生成・再レビュー・再承認が必要。

## UI・監査

EXTEND。`/terms`の共通条項を表示順に1/2/3/4/5へ訂正。意味・順序・既存アンカーを維持。マーカーは表示を変えず、運営者の保留表示と請求導線を保持する。DOD-07/10/11に対応。

read-onlyレビュー2件（公開制御/承認整合性）を実施。依存のdynamic import、バイナリhash、マーカー別名、依存先マーカー、任意profileのfallback除外を修正し負テストを追加。再確認で追加の重大・必須修正なし。レビューは法務承認・本番検証ではない。

最終検証結果は後掲。外部ゲートは未設定・未実証、稼働中Production artifactは未変更である。

# PR-U04 原文と出力境界

開始base: `af3a455`。AUDIT-V2:F10、N01は未取込前提として分離。DB、依存、UIデザイン、通知送信、課金処理を変更しない。

## 入力の呼出元

`src/lib/api-helpers.ts::sanitizeInput` の直接callerは `processApiRequest` と `src/app/api/admin/tenants/route.ts` のclinic作成時の氏名・院名・住所・電話。後者の明示sanitizeは保持する。共通処理はobject/arrayを再帰的に辿り、`__proto__` / `constructor` / `prototype` を除外したまま文字列を原文で返す。

`processApiRequest(requireBody:true)` の既定入力変換を受けるroute群:

- `processClinicScopedBody` 経由: customers（identity-aliases/insurance-coveragesを含む）、reservations（mobile含む）、menus/menu-templates（billing-profiles/importを含む）、resources、care-episodes、daily-reports/items（care-episode/tags/pricingを含む）、revenue-estimates/recalculate、mobile-uiux/daily-reports、staff/availability-events。
- 直接経由: blocks、admin/managers/*/clinics、admin/users（permission_idを含む）、admin/settings、admin/staff/invites、admin/mobile-uiux/entitlements、admin/rate-limit、admin/tables、admin/notifications、admin/security、admin/tenants/[clinic_id]、menu-templates、mobile-uiux/settings、mfa、outreach/campaigns。
- `sanitizeInputValues:false` は従来からraw受渡し: beta、admin/chat、admin/line-credentials、admin/billing/checkout・upgrade、admin/users/accounts、admin/tenants作成。optionの意味を変更していない。

共通auth/origin、個別Zod、最終clinic再検証、billing write gateは維持。F16の認証再解決は変更していない。GETだけのcallerはbody変換を通らない。

## 保存後の出力

| 出力先 | 確認した実装 | 保護/検証 |
| --- | --- | --- |
| 患者API | `src/app/api/customers/route.ts` POST/GET/PATCH、同schemaのDTO→row | 実route・実processApiRequest・実processClinicScopedBodyを通し、永続化境界のみfixture。A&B、<、>、引用符、literal &amp;、img文字列が再保存まで不変。DB/RLS証明ではない |
| React | `src/components/patients/patients-table.tsx` name/notes/Link/aria | JSX文字列、raw HTML挿入なし。実componentで原文textContentとimg/script nodeなしを確認 |
| HTML応答 | `src/lib/mobile-uiux/responses.ts::buildErrorHtml` | 既存escapeHtmlは出力側なので維持。`html-transform.ts` の挿入は配布asset/shell用、`bridge-manifest.ts` の動的表示はtextContent。入力変換に依存させない |
| メールHTML | `src/lib/notifications/email/templates/` 9 files | 生の氏名・院名・メニュー・担当・日時・変更前後・質問回答・billing文言のHTML挿入をescapeEmailHtmlへ。subject/textは原文。全9 rendererをDOM parseしてタグ混入なしを検証 |
| メールリンク | reminder-day-before/same-day | http/httpsだけをlink化し、hrefとlink textを出力エンコード。引用符・&を含むURL、javascript/dataを検証。plain text版URLの内容は変更なし |
| CSV | `src/lib/csv-export.ts::escapeCsvCell/createCsv` | 既存の全cell引用符/二重引用符/CRLF/数式prefix保護を維持。文字列と数値の負値を区別する既存回帰も実行 |
| セキュリティCSV | `src/components/admin/SecurityDashboard.tsx::handleDownloadReport` | 独立レビューで説明/解決メモの手書きCSV生成を発見。既存createCsvへ接続し、実componentのdownload Blobで埋込引用符/改行/式prefixのRED→GREENを確認。`memo",=1+1,"tail` を一つのcellに保持 |

## 受入制限

- N01のPATCH省略値保持/明示削除は開始HEADに既存修正がない。今回schemaやmapperを再実装せず、round-tripテストは対象値を明示して保存する。N01を維持済み/PASSとしない。
- 過去にentity化されたDB行の判別・修復は未実行。自動decodeや一括UPDATEなし。
- 全callerの実DB往復、通知実送信/受信、production browserは未検証。共通入力経路と代表実API/出力本体を検証したものである。

## 結果

`audit-v2-u04-red.log`: API round-trip/メールHTMLの23失敗・4成功を確認。`audit-v2-u04-green.log`: 新規3 suitesと既存customers/helper/mail/CSVを合わせて9 suites/102 tests PASS、skip0。型・lint・独立レビュー結果は実行台帳へ記録する。

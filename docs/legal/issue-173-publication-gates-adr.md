# Issue #173 — 共通法務公開検査の分離

- Date: 2026-11-02 JST
- Status: 実装レビュー対象。法務承認・本番設定変更の記録ではない。
- Base: OS main `49cbd889b6635ff87d385bbf05e1d52eb9ced943`
- Related: [残件・最小確認リスト](issue-173-remaining-actions-20261102.md)、[原稿hashの不変条件](hardening-3-integrity.md)

## 問題

`getLegalPublication`と共通法務のVercel build前後検査が、WorksのLP機能広告、OSの移設LP広告の承認まで必要としていた。法務文書に必要な実契約・データ取扱いの確認と、LPの提供機能・効果等の広告承認は別の判断である。片方を満たすために他方を架空で承認しない。

holdビルドの成果物検査には別の問題もあった。厳格なscannerは、サーバー内の仮ドメイン拒否定数であってもsource mapの出所証明なしではBLOCKする。旧設定ではmap生成に法務公開モードapprovedが必要だったため、holdのままP1の出所検証を完了できなかった。

## 決定

### 共通法務の必須条件

`release-readiness.ts`の`legalPublicationPrerequisiteIds`を次の12項目に固定する。3文書には保守的に同じ前提を残し、文書ごとの必要条件を更に縮小する判断は今回行わない。

| 台帳 | 必須ID | 維持する理由 |
| --- | --- | --- |
| B01 | operator-name / operator-brand | 運営主体とブランドの掲載承認 |
| B02 | contact-form-operation / contact-alternative | 請求・問い合わせの実運用、代替窓口 |
| B03 | operator-disclosure-operation / operator-disclosure-text | 事業者情報の請求時開示の実務と掲載文 |
| B04 | public-origin | 正式originの実値と掲載承認 |
| B06 | works-plan-scope | 実契約の提供範囲・課金単位・上限 |
| B07 | works-pricing-publication / subscription-terms | 価格・税・支払・更新・解約等の整合 |
| B08 | data-handling | 保持・削除・外部送信・委託・国外処理、OS DPA |
| B09 | legal-approval | 必要な事業者・専門家レビュー |

分離するのは`works-claims`と`os-migrated-claims`の2つのLP広告項目だけ。これらは既定のサイト全体検査には残り、未承認ならサイト全体はRELEASE_BLOCKEDのまま。B10は従来どおり別のプラグイン申請ゲート。

各法務必須IDの欠落・重複・台帳種別/requiredFor/必須値型の変更を拒否する。operatorProfileの全必須値と事業区分・メールの承認、原稿の未解決markerなし、reviewed/approved双方のhash、版、根拠、実承認日・改定日・施行日の一致も従来どおり要求する。文書の承認レコードは変更しない。

### 検査・build

- `npm run public-site:release-check`：従来のサイト全体検査。LP広告・B10の参考表示を含む。
- `npm run public-site:release-check -- --legal-only`：共通3文書と上記12前提を検査。フォームURL・原稿manifest・3文書の承認も必要。`--scan-build .next`は既存の全成果物scannerをそのまま実行し、検査対象ファイルや拒否条件を減らさない。
- `build-for-vercel.mjs`：共通法務の正式配信を選ぶ場合だけ、前後検査へ`--legal-only`を指定。通常holdのアプリbuildを停止せず、Works固有の正式配信検査も代用しない。
- `next.config.js`：明示Productionではholdも含めserver source mapを生成する。browser source map、型検査、scannerは変更しない。これは出所証明用のサーバー成果物であり公開許可ではない。

`LEGAL_PUBLICATION_MODE`・`WORKS_LEGAL_PUBLICATION_MODE`、Vercel本番設定、`decideLegalDelivery`は変更しない。明示Production・配信設定approved・正しい文書承認のすべてが必要。URLやクライアントからの昇格は不可。

### 確認と承認の区別

受信・通知・返信は既存の事業者完了申告を根拠にconfirmedとし、再試験・非公開原本の再収集を一律には要求しない。originのconfirmedはVercel alias/匿名GETによる実環境照合を表すもので、事業者による掲載承認ではない。いずれも`checkReleaseItem().satisfied=false`であり、実値・公開可能な証跡・手順・正式原稿を照合して承認するまでは公開しない。事業区分もconfirmedのまま。

## 検証と不変条件

- 実装前：LP承認なしでの文書承認、法務専用CLI、hold map生成の5テストがFAIL。他の82件はPASS。変更すべき境界を先に確認した。
- 法務必須12項目は3文書それぞれで未承認・欠落を拒否する。契約・B08・医療DPAを省略しない。既存のhash/日付/marker/重複/値欠損の負テストを維持。
- LP2項目がdraftでも、架空fixtureの正当な文書承認は可能。一方、サイト全体は拒否する。実レコードは全3文書draftのまま。
- server mapは公開しない。完成した本番相当holdビルドでscannerの出所検証、browser/static map非生成、実HTTPでmapが取得できないこととHTML/RSCのhold/noindexを検証する。未実行の項目は実行済みと扱わない。

最終コマンド結果は本PRの検証欄に記録する。`RELEASE_BLOCKED`は法務承認未了である以上想定結果。scannerの実BLOCKと未承認によるBLOCKは区別して報告する。

## 影響・戻し方

High risk（public/legal）。Change DoDのruntime・公開境界・独立review、歴史的DoD-07/10/11に対応。EXTENDで見た目・アンカー・フォーム・価格・依存を変更しない。各文書の入力ソース変更により6文書hashを正規再生成するが、未解決リスト・承認を変更しない。

この設計・実装は3文書の正式公開やLP全体の承認ではない。rollbackは承認ゲートを維持した通常のrevert/forward-fix。保護ルール迂回、force push、DB操作、本番公開モード変更は不要。

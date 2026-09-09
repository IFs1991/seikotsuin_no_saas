# Tiramisu OS 技術負債・整合性・性能監査 — 更新版 v2

- 更新日：2026-09-06（Asia/Tokyo）
- 対象：`IFs1991/seikotsuin_no_saas`
- 今回の固定main：`4f7794402400790afffb0c41db5538c9f97884a3`
- 初版監査基準：`beb0978bf59e72e1496278a2266ce35857eb0443`
- Core100統合基準：`c028573d089cb6085ab3e29121fa9fe4d2f923c0`
- 文書ID：`TIRAMISU-OS-AUDIT-V2-4f77944`
- 対になる実行用文書：[remediation_backlog.md](remediation_backlog.md)
- 本書は旧 `tiramisu_os_technical_audit_2026-09-05.md` を更新する。旧ファイルは歴史的記録として保存し、現在の修正命令には本書と同梱backlogを使う。

## 0. 判断

**Core100とPost-Core100の主要修正は維持する。旧24項目は全件解消していない。現行で残る局所的な不整合を修正し、配備・通知・復旧・容量の実証へ進む。全面リライトは不要。**

直前の再確認レポートの「収益2点」は、その回で追った範囲の残件だった。元の24項目へ戻すと、汎用Redisの二重復元、middleware合成、入力原文変換、匿名web患者照合なども残っている。本書はこれらを復活させた新規要求としてではなく、**旧指摘の現在地**として記録する。今回の変更が原因の退行と確認したものではない。根拠：[S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts) / [S10: 汎用レート制限・JSON復元/段階的ブロック](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/rate-limiter.ts) / [S19: 入力HTML変換・共通API処理](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/api-helpers.ts) / [S20: bodyヘルパー・対象院認可の再確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/route-helpers.ts) / [S21: 公開予約・患者照合/個別書込/補償](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/services/public-reservation-service.ts)。

### 0.1 現在の結論を三層で読む

| 層 | 現在の判断 |
|---|---|
| コードと既存CI | 固定mainの8ジョブ成功を確認。旧指摘の対象コードが改善された箇所がある |
| データ/業務の正確性 | F03/F04/F06/F09/F10/F11などの残件を確認。既存CIがすべての反例を網羅するわけではない |
| 10社100院の出荷 | 実容量・認証後production動作・実通知・復元・配備設定等が未検証。NO_GO / 出荷未判定を維持 |

根拠：[S01: main / 対象コミット](https://github.com/IFs1991/seikotsuin_no_saas/commit/4f7794402400790afffb0c41db5538c9f97884a3) / [S02: 最終main CI・8ジョブ](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34009652063) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)。

## 1. 今回の更新範囲・証拠の強さ

初版レポート837行、初版backlog273行、直前再確認レポート159行を全文読取し、元F01〜F24・V01〜V07を対応付けた。GitHubで最新mainを再取得し、直前と同じSHAであることを確認した。残件の重要な関数を同SHAで再取得し、同一SHAで前回読んだAPI・UI・migration・試験コードとも照合した。

**全ソース全行・全migration本文の新規フル監査ではない。** 今回のコンテナではGitHubのDNS解決ができず完全checkoutは取得していないが、GitHub connectorによるSHA固定の読取は成功した。本体Jest/build/pgTAP/Playwright、実Redis、配備先DB、負荷、実通知、復元を今回独立再実行していない。コード変更、DB変更、GitHub settings変更、外部送信もしていない。

| 証拠 | 何を意味するか | 意味しないこと |
|---|---|---|
| 現在SHAで再取得 | 該当関数・契約が今のmainに存在する | 本番で事故が発生したこと |
| 同一SHAの前回読取 | 直前の精査結果を同じsnapshotへ継承できる | 後から変わり得る環境設定の一致 |
| 既存CIジョブ/ステップ | GitHub上の当該runが成功 | この環境で再実行したこと、全要件網羅 |
| リポジトリ内の修正報告 | 実装者が記録したPR/検証/未実施状態 | 独立監査人数や実機結果のこちらによる新規再実施 |
| 本書同梱の縮約probe | 局所ロジックの反例/境界を再現 | 実アプリ・SDK・DB・ブラウザの合格 |
| VERIFY_FIRST / ENV_PENDING | 追加の仕様確認・計測・環境証拠が必要 | 確定バグ、または解消済み |

### 1.1 最終mainのCI

確認run：`34009652063`。対象SHAは本書先頭と一致。以下8ジョブのSUCCESSを確認した。[S02: 最終main CI・8ジョブ](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34009652063)。

| ジョブ | 状態 | 境界 |
|---|---|---|
| Quality Checks | SUCCESS | lint/type・inventory・secret scan・offline tooling |
| Build | SUCCESS | buildに加えproduction CSP/画面遷移のブラウザ検証ステップも成功 |
| Database Contract | SUCCESS | replay、DB契約、deferred経路、招待競合、GoTrue取消、生成型確認 |
| Security Tests | SUCCESS | 既存security/session suites |
| Supabase Types Contract | SUCCESS | 補助的な型ファイルの契約確認 |
| Fixture Preflight (Static) | SUCCESS | static検証をDB実行と混同しない |
| Full Jest Regression | SUCCESS | 今回は最終runの個別テスト件数をログから再集計していない |
| App E2E (Local Supabase + Chromium) | SUCCESS | ローカルSupabaseの試験。実Redis/配備先CSP/容量ではない |

統合前E headの448 suites / 3798 passed / 2 skipped、DB858 tests等は修正文書に記録されているが、**最終mainのrunログを今回再集計した数値として転記しない**。過去の444/3733も旧Core100基準の履歴であり、将来の必須テスト件数として固定しない。skip・flaky・未実施は個別に報告する。[S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)。

### 1.2 今回実行した補助probe

同梱の `logic_probes.mjs` をNode v22.16.0で実行し、9件のassertionが完了した。結果は `logic_probe_results.json`。P01〜P07は未解消ロジックの反例モデル、P08はserver CASの保証範囲、P09は患者PATCH mapperの修正モデルを確認する。**全件完了はアプリが修正済み/出荷可能という意味ではない。** リポジトリimport・実SDK・React・DB・実ブラウザは使用していない。

| Probe | 対象 | 結果の意味 |
|---|---|---|
| P01 | F03 | REPRODUCED_MODEL |
| P02 | F04 | REPRODUCED_MODEL |
| P03 | F06 | REPRODUCED_MODEL |
| P04 | F09 | REPRODUCED_MODEL |
| P05 | F10 | REPRODUCED_MODEL |
| P06 | F11 | REPRODUCED_MODEL |
| P07 | F15 | REPRODUCED_MODEL |
| P08 | F14 | BOUNDARY_CONFIRMED_MODEL |
| P09 | N01 | FIXED_MAPPING_CONFIRMED_MODEL |

## 2. ID体系・誤った完了判定を防ぐ対応表

| この2ファイルでのID | 意味・対応 |
|---|---|
| F01〜F24 | 初版技術監査のIDを変更せず継承 |
| F06 | 直前再確認のR1（期間内訳の上書き）と同一 |
| F09 | 直前再確認のR2（院切替後の旧応答）と同一 |
| N01 | 後から発見した患者PATCHの省略項目消去。元24件に追加して管理 |
| N02 | email worker lease / provider冪等キーの改善。元F12とは保証範囲を分離 |
| N03 / N04 | 配備前提 / branch保護・証跡の運用課題 |
| V01〜V07 | 初版の断定保留領域を維持 |
| リポジトリ内のF-01〜F-20 | **別監査の番号体系。本書F01〜F24と自動対応させない** |

例えば、別監査F-01の「LINE identityを電話だけで結合しない」が解消しても、本書F11の「匿名webの家族共有連絡先」が解消したことにはならない。原本が見つからない場合も、番号だけでRESOLVEDにせず未照合と記録する。[S04: Post-Core100再分類・別監査の番号体系](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-audit-status.md) / [S21: 公開予約・患者照合/個別書込/補償](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/services/public-reservation-service.ts)。

### 状態の定義


- **CODE_FIXED**：対象のコード修正済み。
- **OPEN**：残存を確認。
- **PARTIAL**：部分解消・保証範囲に残件。
- **VERIFY_FIRST**：仕様・再現・運用経路の確認後に判断。
- **CONDITIONAL**：提供機能に依存する残件。
- **DEFERRED**：改善候補・今は再設計しない。
- **ENV_PENDING**：実環境検証待ち。

CODE_FIXEDは対象コード原因の解消であり、出荷や全受入試験の合格ではない。PARTIALは直した範囲と残った範囲を本文で分ける。

## 3. 旧24項目の現在地

| ID | 対象 | 現在の状態 | 今の優先度 | 次の単位 |
|---|---|---|---|---|
| F01 | CSP・nonceとproduction middlewareの動作 | PARTIAL | P1（認証後の環境試験） | ENV-02 |
| F02 | ログイン画面GETが認証試行枠を消費する | CODE_FIXED | 維持 | 維持 / ENV-01 |
| F03 | Upstash自動復元後のJSON.parse | OPEN | P1 | PR-U01 |
| F04 | レート制限の許可応答で後続middlewareを打ち切る | OPEN | P1 | PR-U01 |
| F05 | 固定人件費率・単純倍率予測・前年逆算 | CODE_FIXED | 維持 | 維持 |
| F06 | 日別区分・金額内訳を期間合計へ集約しない | OPEN | P1 | PR-U02 |
| F07 | 直近30件を累計・月別集計へ流用する | CODE_FIXED | 維持 / ENV-01 | 維持 / ENV-01 |
| F08 | 取得上限による明細・予約一覧の切り捨て | CODE_FIXED | 維持 / ENV-04 | 維持 / ENV-04 |
| F09 | 院切替後に古い収益応答を適用する | OPEN | P1 | PR-U03 |
| F10 | 入力保存時のHTMLエスケープで原文を変更する | OPEN | P1 | PR-U04 |
| F11 | 共有連絡先から先頭患者へ自動名寄せする | OPEN | P1（公開予約で実患者を扱う前） | PR-U05 |
| F12 | 予約書込と通知永続化の境界 | PARTIAL | P1（通知の提供・保証範囲に依存） | PR-U07 / ENV-03 |
| F13 | 予約保存後のprojection失敗を操作全体の失敗にする | CODE_FIXED | 維持 | 維持 |
| F14 | 予約編集の競合検知・期待version | PARTIAL | P2（仕様確認） | PR-U08（必要時） |
| F15 | 日報DELETEがscope配列の先頭院だけを対象にする | OPEN | P2（複数院から削除を提供する前） | PR-U06 |
| F16 | 認証context再解決の重複と鮮度 | VERIFY_FIRST | P2 | PERF-01 |
| F17 | LINEチャットの1院1実行1件と障害隔離 | CONDITIONAL | P1（チャットを提供）/ P2（対象外） | PR-U09（提供時） |
| F18 | Stripe processingイベントの停止後復旧 | VERIFY_FIRST | P2（有料運用前に復旧経路を確認） | VERIFY-02 |
| F19 | option価格差分と任意調整の契約 | VERIFY_FIRST | P2 | VERIFY-03 |
| F20 | 公開予約の患者作成と予約作成が別書込 | VERIFY_FIRST | P2（F11と依存整理） | VERIFY-04 / PR-U05の必要範囲 |
| F21 | 外部image取得失敗でDB型生成ゲートが完走しない | CODE_FIXED | 維持 | 維持 |
| F22 | migration最終状態の把握コスト | DEFERRED | P2 | DEFER-01 |
| F23 | 本番サイズに依存するDDL・性能条件 | ENV_PENDING | P2（配備条件を事前確認） | ENV-01 |
| F24 | 単院・本部・日報の集計契約と取得方式の分散 | DEFERRED | P2 | PERF-01 / DEFER-01 |

状態別件数：CODE_FIXED=6、OPEN=7、PARTIAL=3、VERIFY_FIRST=4、CONDITIONAL=1、DEFERRED=2、ENV_PENDING=1。合計24項目。これを「未修正バグ24件」や「確定事故件数」と読まない。

## 4. 詳細：根拠・影響・最小修正・受入条件

<a id="f01"></a>

### F01 — CSP・nonceとproduction middlewareの動作

**状態：PARTIAL / 優先度：P1（認証後の環境試験） / 実行単位：ENV-02**

**証拠の範囲：** 同一SHAの実装・production試験コードを前回確認。今回main不変とCIステップ成功を再確認。

**確認事実：** src/middleware.tsの入口、requestへのnonce/CSP伝播、動的SSRが追加された。production試験はloginのSSR、React操作、admin/loginへのクライアント遷移を対象にする。

**影響・解釈：** ログイン画面の合格は、認証後dashboard・予約保存・日報・manager画面の合格ではない。実Redis/proxyを伴う経路は別。

**打ち手：** 入口・nonceを再実装しない。full-enforceのproduction buildで認証後の主要フローを追加検証する。新しい登録入口で有効になった汎用rate limiterのF03/F04も先に回帰確認する。

**受入条件：**
- 認証後dashboard→予約作成/変更→日報→managerを通す。
- SSRのnonce一致、hydration、client navigation、console違反を確認する。
- Redis/proxyを迂回して試験をPASSにしない。

**断定しないこと・停止条件：** 前回の「nonceが渡らない」という原因そのものは修正済み。現に本番全画面が壊れているとは判定しない。

**根拠：** [S05: CSP・認証のroot middleware](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/middleware.ts) / [S06: Next.js middleware登録入口](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/middleware.ts) / [S07: production CSPブラウザ試験](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/__tests__/e2e-playwright/production-csp.spec.ts) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [O01: Next.js 15公式 CSP / nonce](https://nextjs.org/docs/15/app/guides/content-security-policy)。

<a id="f02"></a>

### F02 — ログイン画面GETが認証試行枠を消費する

**状態：CODE_FIXED / 優先度：維持 / 実行単位：維持 / ENV-01**

**証拠の範囲：** 現在SHAで汎用ルーティングを再取得。実認証guardは同一SHAの読取結果とCore100記録を照合。

**確認事実：** 画面GETを旧login枠へ入れず、実パスワード認証はaccount/IPのLua guardで制限。登録・回復の変更系リクエストは別budget。

**影響・解釈：** 実Redis・実proxy・Supabase Auth側の制限まで検証済みという意味ではない。

**打ち手：** Core100の実装を維持し、共有IP・実認証の受入試験だけ残す。古いLOGIN_ATTEMPTS定数の存在だけで元のGET不具合が未修正と判断しない。

**受入条件：**
- 同一IPの通常スタッフ複数人が画面を開ける。
- 実認証の閾値、TTL、復帰、誤proxy設定を確認する。

**断定しないこと・停止条件：** F03の汎用RateLimiterは別実装。Lua guardがあることを汎用経路の修正完了に流用しない。

**根拠：** [S08: 実認証のaccount/IP Lua制限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/auth/auth-attempt-guard.ts) / [S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts) / [S36: Core100変更記録](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/core100-release-changes.md)。

<a id="f03"></a>

### F03 — Upstash自動復元後のJSON.parse

**状態：OPEN / 優先度：P1 / 実行単位：PR-U01**

**証拠の範囲：** 今回、rate-limiter.tsとredis-client.tsを現在SHAで再取得し、公式仕様も再確認。

**確認事実：** new Redis({url, token})で自動復元を無効化していない。blockInfo/escalationDataにJSON.parse(... as string)が残る。

**影響・解釈：** ブロック状態の読取でJSON.parseの型不一致となり、429ではなくbackend unavailable→本番503になり得る。

**打ち手：** 汎用Redisの読取値をunknownから形状検証し、object契約へ統一する。互換性が必要なら保存済み文字列とobjectを限定的に扱う。共有client全体のautomaticDeserializationを一括変更する場合は他の全利用箇所の影響を先に調べる。

**受入条件：**
- SDK相当のobject返却、旧文字列返却、破損値を区別する。
- 上限超過→次の要求→TTL後の復帰が429/解除として動く。
- 実Redis障害は503、壊れた状態を制限無効化で通さない。

**断定しないこと・停止条件：** 実Upstash通信は未実行。すべての通常要求が失敗する問題ではない。新しいaccount/IP Luaの不具合としても扱わない。

**根拠：** [S10: 汎用レート制限・JSON復元/段階的ブロック](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/rate-limiter.ts) / [S11: Upstash client生成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/redis-client.ts) / [S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts) / [O02: Upstash公式 自動JSON復元](https://upstash.com/docs/redis/sdks/ts/advanced)。

<a id="f04"></a>

### F04 — レート制限の許可応答で後続middlewareを打ち切る

**状態：OPEN / 優先度：P1 / 実行単位：PR-U01**

**証拠の範囲：** 今回、許可結果・applyRateLimits・パス振分けを現在SHAで再取得。rootは同一SHA読取を使用。

**確認事実：** 許可時もNextResponse.nextを返し、applyRateLimitsはtruthy結果を返す。rootもrateLimitResponseを即returnするため後続のCSP等に進まない経路が残る。

**影響・解釈：** 複数limiterの2個目や後続ヘッダー設定が省略される。F01の入口修正後に実際のproduction経路で評価が必要。

**打ち手：** 許可結果と拒否responseを判別可能にする。許可時のrate-limit headersを最終responseへ合成し、拒否時だけ処理を終了する。

**受入条件：**
- 1番目許可・2番目拒否で2番目が実行される。
- 全許可時に後続処理が1回実行され、CSPとrate-limit headersが両立する。
- 実認証ページ・回復/登録POST・公開API・認証済APIで権限拒否を維持する。

**断定しないこと・停止条件：** API内の独立した認可は残る。これだけで全認証バイパス/tenant越境を主張しない。

**根拠：** [S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts) / [S05: CSP・認証のroot middleware](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/middleware.ts) / [S06: Next.js middleware登録入口](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/middleware.ts)。

<a id="f05"></a>

### F05 — 固定人件費率・単純倍率予測・前年逆算

**状態：CODE_FIXED / 優先度：維持 / 実行単位：維持**

**証拠の範囲：** 現在と同一SHAのAPI/hook/UI読取と修正記録。

**確認事実：** revenueForecast/costAnalysisはnull。前年売上を実額で返し、データなしと0を区別。

**影響・解釈：** F06の内訳表示とは別で、F05の修正を収益画面全体の保証にしてはいけない。

**打ち手：** 未算出表示と前年実額を維持する。指標を復活させるなら根拠データと算出定義を別途実装する。

**受入条件：**
- 前年なし/0/333円/当年0、成長率-100%で実額を確認する。
- 入力のない人件費率32.5%や1.1倍が実績として復活しない。

**断定しないこと・停止条件：** 新しい予測モデルの開発は今回の残件修正に含めない。

**根拠：** [S12: 単院収益API・期間集計と内訳変換](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/revenue/route.ts) / [S13: 単院収益hook・応答の適用](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/hooks/useRevenue.ts) / [S14: 単院収益UI・内訳Map・院の受渡し](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/revenue/page.tsx) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)。

<a id="f06"></a>

### F06 — 日別区分・金額内訳を期間合計へ集約しない

**状態：OPEN / 優先度：P1 / 実行単位：PR-U02**

**証拠の範囲：** 直前の同一SHA再確認R1。DB→API→hook→UIを照合済み。今回は原本とR1の対応を確認。

**確認事実：** viewはclinic×日付×amount_role。APIのbuildRevenueBreakdownSummaryはmapのみ。UIはnew Map(amountRole,row)で最後の同区分行を残す。上位カードはsumBreakdownByRoleで加算する。

**影響・解釈：** 2日分100円/1件＋200円/1件で、カード300円に対し内訳200円/1件になる。code別のrevenueContextSummaryも日別行の重複を確認対象にする。

**打ち手：** 対象期間内でamountRoleごとにestimatedAmount/lineCountを加算し、1区分1行にする。code別も同じ粒度へ揃える。既に全ページ取得される行の1-pass集約ならmigration不要。

**受入条件：**
- 複数日・同一roleが300円/2件になり、カードと一致する。
- 複数role、0円、許可された調整値、別院、期間外、空集合を確認する。
- 1001件超、ページ境界、後続page失敗の既存回帰を維持する。
- 実際の内訳UIを描画するテストを追加する。

**断定しないこと・停止条件：** 総売上の全数値が誤るという意味ではない。直前R1は本F06と同じであり二重計上しない。

**根拠：** [S42: 日付×金額区分のビュー定義](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql) / [S12: 単院収益API・期間集計と内訳変換](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/revenue/route.ts) / [S13: 単院収益hook・応答の適用](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/hooks/useRevenue.ts) / [S14: 単院収益UI・内訳Map・院の受渡し](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/revenue/page.tsx)。

<a id="f07"></a>

### F07 — 直近30件を累計・月別集計へ流用する

**状態：CODE_FIXED / 優先度：維持 / ENV-01 / 実行単位：維持 / ENV-01**

**証拠の範囲：** 同一SHAの日報read modelとPR-B記録を確認済み。

**確認事実：** 一覧30件、期間summaryのDB aggregate、月別用必要列の全ページ取得へ分離。

**影響・解釈：** 配備先でPostgREST aggregateが無効なら取得に失敗する。コード修正完了は設定完了ではない。

**打ち手：** 現行分離を維持。対象環境のaggregateとstatement timeout等の保護、対象期間全件の整合性を確認する。

**受入条件：**
- 31/61/1001件、一覧の件数変更、期間指定でもsummaryが正しい。
- aggregate失敗を0や部分集計に置き換えない。

**断定しないこと・停止条件：** 月別データ転送の更なるDB集約は測定後の最適化。今の修正を全面的に作り直さない。

**根拠：** [S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [O03: PostgREST公式 Aggregate Functions](https://docs.postgrest.org/en/stable/references/api/aggregate_functions.html)。

<a id="f08"></a>

### F08 — 取得上限による明細・予約一覧の切り捨て

**状態：CODE_FIXED / 優先度：維持 / ENV-04 / 実行単位：維持 / ENV-04**

**証拠の範囲：** 同一SHAの収益6経路、予約API・cursor・クライアントを前回確認。

**確認事実：** 対象とした収益データソースはfetchAllRows、予約一覧はkeyset pagination、画面も全ページ完了を確認する構造へ変更。

**影響・解釈：** 全リポジトリの全取得に上限問題がないと証明したわけではない。全ページ方式の実容量・DB上限・読み取り途中の更新は別の評価対象。

**打ち手：** 対象経路を再実装しない。配備先の上限とpage size、途中失敗時の挙動を確認し、性能未達の経路のみDB集約する。

**受入条件：**
- 999/1000/1001/1100件で指定範囲を取り切る。
- 同時刻のマイクロ秒、ID順、cursor条件の不一致、後続page失敗を維持する。
- 実際のData API max_rowsよりpage sizeが大きい場合の検証を行う。

**断定しないこと・停止条件：** 修正済みは旧F08で特定した経路に限定。snapshot isolationや100院性能の合格とは異なる。

**根拠：** [S12: 単院収益API・期間集計と内訳変換](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/revenue/route.ts) / [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts) / [S17: 予約cursorの契約](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/reservations/pagination.ts) / [S18: 予約UIの全ページ取得](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/reservations/api.ts) / [S47: 収益用の既存全ページ取得helper](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/manager-fetch.ts)。

<a id="f09"></a>

### F09 — 院切替後に古い収益応答を適用する

**状態：OPEN / 優先度：P1 / 実行単位：PR-U03**

**証拠の範囲：** 直前の同一SHA再確認R2。hookとkeyなしの呼出元を照合済み。

**確認事実：** clinicId変更でinFlightをリセットするが、応答適用条件は共有isMountedRefのみ。旧finallyも新しいinFlightを消せる。

**影響・解釈：** A遅延→B成功→A成功で、B院を選択中なのにA院の数字へ戻る。旧失敗やfinallyによる状態破壊もあり得る。

**打ち手：** 要求単位の世代番号/identityで成功・catch・finally全体を制御。abortだけに依存しない。既存Queryへ寄せる場合も当該hookだけに限定する。

**受入条件：**
- 実React hookでA遅延→B成功→A成功/失敗を再現しBを維持する。
- 旧finallyが新inFlightを消さない。
- A→B→A、enabled=false、unmount、同一院background refresh、logoutを確認する。

**断定しないこと・停止条件：** RLS突破を確認したものではない。R2は本F09と同一で二重計上しない。

**根拠：** [S13: 単院収益hook・応答の適用](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/hooks/useRevenue.ts) / [S14: 単院収益UI・内訳Map・院の受渡し](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/revenue/page.tsx)。

<a id="f10"></a>

### F10 — 入力保存時のHTMLエスケープで原文を変更する

**状態：OPEN / 優先度：P1 / 実行単位：PR-U04**

**証拠の範囲：** 今回、escapeHtml・requireBody既定動作・bodyヘルパーを現在SHAで再取得。

**確認事実：** 文字列をHTML entityへ変換するsanitizeInputがrequireBodyの既定。processClinicScopedBodyは無効化指定をしていない。

**影響・解釈：** A&B→A&amp;B→A&amp;amp;Bのように保存・再保存で原文が変わり、氏名検索・照合・通知などの整合性が崩れる。

**打ち手：** 原文保存・Zod検証・危険キー除外・出力文脈での安全処理を分離する。HTMLとして描画する経路だけ別のsanitizerを使う。影響経路を列挙してから段階変更し、既存DBを無断一括decodeしない。

**受入条件：**
- 氏名/notesの&、<、>、引用符が保存→読取→再保存で変わらない。
- Reactテキスト・メールHTML・CSV等の出力安全性を個別に確認する。
- __proto__等の拒否/除外と既存認可を維持する。
- 本来文字列として入力された&amp;を無条件decodeしない。

**断定しないこと・停止条件：** 患者PATCHの未指定保持修正N01とは別。XSS防御を単に削除する指示ではない。

**根拠：** [S19: 入力HTML変換・共通API処理](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/api-helpers.ts) / [S20: bodyヘルパー・対象院認可の再確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/route-helpers.ts)。

<a id="f11"></a>

### F11 — 共有連絡先から先頭患者へ自動名寄せする

**状態：OPEN / 優先度：P1（公開予約で実患者を扱う前） / 実行単位：PR-U05**

**証拠の範囲：** 今回、公開予約serviceのLINE/通常web分岐とlimit(1)を現在SHAで再取得。

**確認事実：** 通常webでは電話→メールで既存IDを探し、nameを照合せずlimit(1)を採用する。確認済みLINEはID＋credential generationで別に制約される。

**影響・解釈：** 家族共有電話/メールで、別人の予約を既存患者へ紐付ける可能性。本人確認済みという根拠にはならない。

**打ち手：** 連絡先一致を本人確定としない。確認済みidentityまたは既存の要照合/仮患者経路を優先し、曖昧な場合に先頭1件へ結合しない。氏名一致を加えるだけでも本人確認は完了しない。

**受入条件：**
- 同じ電話の別人・同じメールの別人・同名・電話変更を検証する。
- 匿名APIから候補患者の個人情報を公開しない。
- 確認済みLINEとcredential世代の境界を維持する。
- 単純な電話unique制約で家族を登録不可にしない。

**断定しないこと・停止条件：** リポジトリの別監査F-01（LINE乗っ取り対策）とは別指摘。LINE側の修正済み判定で本F11を閉じない。

**根拠：** [S21: 公開予約・患者照合/個別書込/補償](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/services/public-reservation-service.ts) / [S22: 公開予約route・serviceの組合せ](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/public/reservations/route.ts)。

<a id="f12"></a>

### F12 — 予約書込と通知永続化の境界

**状態：PARTIAL / 優先度：P1（通知の提供・保証範囲に依存） / 実行単位：PR-U07 / ENV-03**

**証拠の範囲：** 同一SHAのroute、通知service、新migrationを前回照合。

**確認事実：** 通常POST/PATCHはenqueueをawaitする。通知claim＋prepared outbox生成は同一DB transactionになった。しかし予約本体のcommitと通知intent登録は別。enqueue失敗はcatchして予約成功を維持。

**影響・解釈：** 応答後打切りの窓は減ったが、予約commit直後の停止やenqueue失敗で未投入通知が残る可能性。outboxが存在しない通知をworkerだけでは回収できない。

**打ち手：** 既存await化を維持し、通知を保証する場合は予約＋最小eventを同一transactionで残すか、durableな欠落検出/再投入経路を検証する。重いprovider送信はworkerへ残す。

**受入条件：**
- 予約commit直後/通知前/通知後/provider受理後に停止させて区別する。
- 既存の通知を重複生成せず欠落を把握できる。
- 宛先参照失敗やenqueue失敗が観測・再処理可能。
- 通知失敗で保存済み予約を再送させる500へ戻さない。

**断定しないこと・停止条件：** 前回の実装指示は最低限awaitを許容していたため、その要件は達成。予約と通知が完全atomicという主張だけを避ける。

**根拠：** [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts) / [S23: 通知claimとoutboxの永続化確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/reservation-notifications.ts) / [S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S25: email worker・lease回収/CAS/試行上限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/processor.ts) / [S51: 通知対象の患者/メニュー/担当者参照](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/reservation-enqueue.ts)。

<a id="f13"></a>

### F13 — 予約保存後のprojection失敗を操作全体の失敗にする

**状態：CODE_FIXED / 優先度：維持 / 実行単位：維持**

**証拠の範囲：** 同一SHAのreadCommittedReservationと通常routeを確認。mobileは修正記録と先行照合。

**確認事実：** 保存済みの安全な列から成功結果を返し、projectionStatus=unavailableを明示する共通処理を導入。

**影響・解釈：** ネットワーク応答自体の喪失や一般的なcreate intent冪等性は、この修正だけで完全解決しない。

**打ち手：** 保存済みIDとdegraded表示を維持。view再取得だけ失敗するケースを回帰で守る。create冪等性は必要性を検証して別タスク化する。

**受入条件：**
- 通常/mobileのPOST/PATCHで保存成功→view失敗でも保存済みIDが分かる。
- 内部列・生DBエラーをレスポンスに追加しない。
- UIが再保存不要の案内を出す。

**断定しないこと・停止条件：** 旧バックログの「応答喪失後も同じintentを復元する」は別の拡張要件として分離。未実装を修正済みへ読み替えない。

**根拠：** [S27: 保存成功後のprojection結果](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/reservations/mutation-result.ts) / [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)。

<a id="f14"></a>

### F14 — 予約編集の競合検知・期待version

**状態：PARTIAL / 優先度：P2（仕様確認） / 実行単位：PR-U08（必要時）**

**証拠の範囲：** 同一SHAのrouteを前回確認。今回更新DTOにexpected versionがないことを再確認。

**確認事実：** サーバーが読んだraw updated_atをUPDATE条件へ含め、読取から書込までの競合を409にする。ブラウザが編集開始時に見たversionはDTOに含まれない。

**影響・解釈：** 同時に同じ旧DB状態を読む要求の競合は保護されるが、古い編集画面から後で送る要求は最新行を読み直して上書きできる。

**打ち手：** 現在のserver CASを維持。古い画面からの上書きも防止する業務要件なら、GETでversionを返し更新DTOへ期待versionを加える最小拡張を検討する。

**受入条件：**
- サーバー間競合は一方成功・他方409。
- Bの変更後に古いA画面から送る順序を実UI/APIで試験し、仕様を決める。
- raw timestamp精度・clinic条件・before/after通知整合性を維持。

**断定しないこと・停止条件：** 「CAS未実装」はもう誤り。「あらゆる編集競合を防止済み」も誤り。2接続の実同時試験は今回未実行。

**根拠：** [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts) / [S28: 予約DTO・期待versionの有無/option差分](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/schema.ts) / [S48: 予約の同時更新DB試験](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/tests/reservation_optimistic_concurrency_test.sql)。

<a id="f15"></a>

### F15 — 日報DELETEがscope配列の先頭院だけを対象にする

**状態：OPEN / 優先度：P2（複数院から削除を提供する前） / 実行単位：PR-U06**

**証拠の範囲：** 今回、DELETEを現在SHAで再取得。

**確認事実：** resolveScopedClinicIds(permissions)?.[0]を院IDとし、その課金確認と日報院IDの一致判定を実行している。

**影響・解釈：** 複数院に正当な権限があるユーザーでも、先頭以外の日報を拒否する可能性。配列順で結果が変わる。

**打ち手：** 対象日報の実際のclinic_idについてscope・role・billingを確認する。既存RLSを使う読取または明示的なscoped lookupに限定し、無制限service_role読取へ変更しない。

**受入条件：**
- A/B権限でB日報の削除が可能、scope順交換で結果不変。
- C院・未許可role・未払対象院の拒否を維持する。
- 日報削除の子明細・履歴への影響を既存契約で検証する。

**断定しないこと・停止条件：** tenant越境ではなく過剰拒否の指摘。削除機能の業務上の許可範囲を勝手に拡張しない。

**根拠：** [S29: 日報DELETE・scope先頭院](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/daily-reports/route.ts)。

<a id="f16"></a>

### F16 — 認証context再解決の重複と鮮度

**状態：VERIFY_FIRST / 優先度：P2 / 実行単位：PERF-01**

**証拠の範囲：** 今回、bodyヘルパーとprocessApiRequestの二段階guardを再取得。実行回数・latencyは未測定。

**確認事実：** processApiRequestでensureClinicAccessを行い、DTOからclinic_idを得た後に再度ensureClinicAccessする。

**影響・解釈：** 余分な往復候補だが、対象院が判明した後の権限鮮度確認には意味がある。単純削除はstale scopeの再導入リスク。

**打ち手：** 同一要求でのgetUser/authority読取回数を計測。必要な最終scope確認を保持したままVerifiedSubject等を再利用する。実測効果と安全性がない変更はしない。

**受入条件：**
- 要求ごとのAuth/DB呼出回数とp95をbefore/afterで比較。
- 権限剥奪・無効化・別ユーザー並行処理でfail-closed維持。

**断定しないこと・停止条件：** 旧版の「不要な認証なので削る」を無条件な実装命令にはしない。

**根拠：** [S19: 入力HTML変換・共通API処理](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/api-helpers.ts) / [S20: bodyヘルパー・対象院認可の再確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/route-helpers.ts) / [S04: Post-Core100再分類・別監査の番号体系](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-audit-status.md)。

<a id="f17"></a>

### F17 — LINEチャットの1院1実行1件と障害隔離

**状態：CONDITIONAL / 優先度：P1（チャットを提供）/ P2（対象外） / 実行単位：PR-U09（提供時）**

**証拠の範囲：** 今回、chat-outbox-processorを現在SHAで再取得。2分Cronは同一SHAの既読設定。

**確認事実：** CLAIM_SIZE=1で院を一巡。claim失敗は院ごとにcontinueするが、renew/finalizeの例外は上へ伝播する。院を逐次処理。

**影響・解釈：** このCronだけなら1院最大30件/時。5件待ちの末尾は約8〜10分＋処理時間という算定。別起動があれば変わる。

**打ち手：** チャット提供時だけbounded drain、院間の少数並列、院内の順序維持、例外隔離を評価。既存claim token/renew/retry keyを維持する。

**受入条件：**
- 1院10件、複数院各10件のoldest queued age/p95を測る。
- 1院のDBエラー・timeoutが他院配送を止めない。
- 重複Cronでも二重送信/順序破壊なし。

**断定しないこと・停止条件：** 予約LINE通知とLINEチャットは別worker。email lease改善N02で本件を閉じない。提供しない場合もAPI/Cronを無断停止しない。

**根拠：** [S30: LINEチャット・1院1件claim/逐次処理](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/line/chat-outbox-processor.ts) / [S31: LINE worker実行route](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/internal/process-line-outbox/route.ts) / [S32: 配備設定・Cron周期](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/vercel.json)。

<a id="f18"></a>

### F18 — Stripe processingイベントの停止後復旧

**状態：VERIFY_FIRST / 優先度：P2（有料運用前に復旧経路を確認） / 実行単位：VERIFY-02**

**証拠の範囲：** 今回、claim分類を現在SHAで再取得。内部replay/resyncの全体試験は未実施。

**確認事実：** 通常受信の既存processingは経過時刻を見ずbusyになる。received/failedの回収はある。

**影響・解釈：** claim後の強制終了で通常再送だけでは滞留が進まない可能性。内部復旧があるため「絶対復旧不能」とは言えない。

**打ち手：** 監視・internal replay/resync・実行中判定を先に調べ、手動復旧を保証するかlease回収を追加する。無条件にprocessingを奪わない。

**受入条件：**
- 処理中断後の滞留検出・安全な復旧。
- 稼働中処理を二重実行しない。
- 順序逆転イベント・internal replayと通常受信の競合で課金状態を巻き戻さない。

**断定しないこと・停止条件：** 外部の課金や顧客契約をこの文書作成で操作していない。

**根拠：** [S33: Stripe webhook claim分類](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/billing/stripe-events.ts) / [S34: Stripe webhook受信route](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/stripe/webhook/route.ts) / [S35: 内部replay・復旧経路の検証対象](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/internal/billing/replay-webhook-event/route.ts)。

<a id="f19"></a>

### F19 — option価格差分と任意調整の契約

**状態：VERIFY_FIRST / 優先度：P2 / 実行単位：VERIFY-03**

**証拠の範囲：** 今回schemaを現在SHAで再取得。価格計算への使用は同一SHAの通常route読取で確認。

**確認事実：** optionId/name/priceDeltaを受け取り、数値差分を料金snapshotへ使う経路が残る。

**影響・解釈：** catalog選択とスタッフの任意調整が混ざる可能性。正当な値引き仕様もあるため、差分入力自体を脆弱性とは決めない。

**打ち手：** catalog optionはID→サーバー価格、任意adjustmentはrole・範囲・理由・監査という別契約を検討。仕様が未確認なら強制的にcatalog価格へ置換しない。

**受入条件：**
- 未知option、極端値、許可外負値、任意調整roleを検証。
- 過去snapshotがmaster更新で変わらない。

**断定しないこと・停止条件：** 匿名APIの価格改ざんとしては報告しない。認証済みスタッフ経路の入力/業務契約の確認。

**根拠：** [S28: 予約DTO・期待versionの有無/option差分](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/schema.ts) / [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts)。

<a id="f20"></a>

### F20 — 公開予約の患者作成と予約作成が別書込

**状態：VERIFY_FIRST / 優先度：P2（F11と依存整理） / 実行単位：VERIFY-04 / PR-U05の必要範囲**

**証拠の範囲：** 今回、serviceのfindOrCreate/createReservation/rollbackCustomerを現在SHAで再取得。全分岐の新規実行なし。

**確認事実：** 患者作成と予約作成が別のDB要求で、失敗後に患者DELETEで補償する。

**影響・解釈：** 並行作成・予約失敗・補償失敗で不要患者が残る可能性。家族の識別ルールと一体で判断する必要。

**打ち手：** F11のidentity方針を先に固定。必要なら通常予約の最小単位をtransaction/RPCでまとめる。既存の空き枠通知予約用atomic経路は作り直さない。

**受入条件：**
- 同一作成intentの並行送信・予約失敗・補償失敗を試験。
- 別予約が患者を参照した後の補償が既存患者を誤削除しない。

**断定しないこと・停止条件：** 非transactionであること自体を全予約で必ず破損するバグとして数えない。

**根拠：** [S21: 公開予約・患者照合/個別書込/補償](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/services/public-reservation-service.ts) / [S22: 公開予約route・serviceの組合せ](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/public/reservations/route.ts)。

<a id="f21"></a>

### F21 — 外部image取得失敗でDB型生成ゲートが完走しない

**状態：CODE_FIXED / 優先度：維持 / 実行単位：維持**

**証拠の範囲：** Core100のretry追加記録と、今回の最終main Database Contract各ステップ成功を照合。

**確認事実：** 一時的なimage pull障害だけを対象に有界retryする修正記録がある。最終mainでは生成型検証まで成功している。

**影響・解釈：** 将来のregistry停止を完全に防止する保証ではない。SQL/型drift失敗をretryで隠してはいけない。

**打ち手：** 現在のgateと限定retryを維持し、再発時に外部取得障害と型driftを分ける。

**受入条件：**
- 生成型diff不一致とSQLエラーが確実に失敗する。
- クリーンCIでDB→型→E2Eが実行される。

**断定しないこと・停止条件：** 旧runの失敗を現在の失敗として残さない。現在の型検証成功は配備済DBの一致とは別。

**根拠：** [S02: 最終main CI・8ジョブ](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34009652063) / [S36: Core100変更記録](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/core100-release-changes.md) / [S43: CI workflow・production CSPを含む](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/.github/workflows/ci.yml)。

<a id="f22"></a>

### F22 — migration最終状態の把握コスト

**状態：DEFERRED / 優先度：P2 / 実行単位：DEFER-01**

**証拠の範囲：** 旧監査の保守提案を維持。今回DB catalogの全面比較は未実施。既存の生成台帳/exportを再利用する前提。

**確認事実：** 凍結履歴・forward-fix・関数権限行列・source inventoryを持つ構成。追加通知migrationに合わせた検証script/期待行列の追補が修正記録にある。

**影響・解釈：** 複数の監査番号や古いDDLを現行と誤認すると、解消済み問題を再修正して壊し得る。

**打ち手：** 既存catalog exportと台帳の不足だけ補い、最終RPC ACL/RLS/trigger/indexをCI artifactにする。第二の手編集DDL正本や新しい汎用監査基盤は作らない。

**受入条件：**
- 同じ署名の最終owner/search_path/grantが追える。
- 空DBと承認upgrade経路の終点を比較可能。

**断定しないこと・停止条件：** migration本数自体を負債としない。全migration本文の再監査完了を意味しない。

**根拠：** [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [S38: 既存のDB catalog export](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/scripts/commercial-hardening/export-db-catalog.mjs) / [S49: 関数実行権限の完全行列テスト](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/tests/commercial_function_execution_test.sql) / [S43: CI workflow・production CSPを含む](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/.github/workflows/ci.yml)。

<a id="f23"></a>

### F23 — 本番サイズに依存するDDL・性能条件

**状態：ENV_PENDING / 優先度：P2（配備条件を事前確認） / 実行単位：ENV-01**

**証拠の範囲：** 旧監査で確認したforward-fixの条件を保持。現在の本番サイズ/実行計画は未取得。

**確認事実：** 既存のサイズ・長期transaction・lock timeout等の安全条件を前提にしたupgrade経路がある。新通知migrationのindex作成・権限・triggerも配備前に確認が必要。

**影響・解釈：** 空DB replay成功でも、稼働中のデータ量・lockに対する適用安全性は別。

**打ち手：** 対象環境をread-only preflightし、承認されたmigration順と停止条件を決める。必要な大テーブル手順のみ追加し、guardを外さない。

**受入条件：**
- 本番相当snapshotの適用・rollback/forward-fix方針を確認。
- 対象tableサイズ・長いtransaction・lock・index状態を記録。

**断定しないこと・停止条件：** 旧forward-fixがすでに適用済みなら再実行しない。最新本番への適用状況は未確認。

**根拠：** [S39: 既存forward-fix安全条件・再検証対象](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260815104957_pr11_deferred_production_forward_fix.sql) / [S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S37: Core100有人運用・負荷試験runbook](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/operations/CORE100_RUNBOOK.md)。

<a id="f24"></a>

### F24 — 単院・本部・日報の集計契約と取得方式の分散

**状態：DEFERRED / 優先度：P2 / 実行単位：PERF-01 / DEFER-01**

**証拠の範囲：** 同一SHAの複数read modelを前回照合。今はF06/F09へ具体的に切り出す。

**確認事実：** DB aggregate、既存RPC、全ページ取得＋JS集計、手書きhookが併存する。個別の正確性修正は進んだが契約の統一は部分的。

**影響・解釈：** 指標定義・対象期間・0/不明・cache keyの差で不整合を再発しやすい。複数方式の存在だけでは障害ではない。

**打ち手：** まずF06/F09を修正し、同一院/同一期間/同一定義での結果一致テストを作る。単院と本部の粒度が違う指標まで無理に同一化しない。共通化とRPC移行は効果を測ってから。

**受入条件：**
- 同一定義の値が単院/本部で一致する。
- 一覧page sizeと順序でsummaryが変わらない。
- scopeを含むキーで旧応答・別ユーザーcacheが混ざらない。

**断定しないこと・停止条件：** 全read modelや全hookの全面書換えは今回の修正条件ではない。

**根拠：** [S12: 単院収益API・期間集計と内訳変換](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/revenue/route.ts) / [S13: 単院収益hook・応答の適用](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/hooks/useRevenue.ts) / [S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts) / [S40: manager exact count実装](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/manager-dashboard-counts.ts) / [S52: 本部dashboard aggregate](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/admin/dashboard/route.ts)。

## 5. 後続指摘・改善の追跡（旧24件とは別）

### N01 — 患者PATCHの省略email/notes消去

**CODE_FIXED / 維持**

未指定キーをUPDATE payloadから除外し、null/空文字を明示削除とする修正を確認済み。元24項目にはない後続指摘。F10の原文変換とは別。

根拠：[S41: 患者PATCH schema/mapper](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/customers/schema.ts) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)。

### N02 — email worker lease回収とprovider冪等キー

**CODE_FIXED / 維持 / ENV-03**

単調updated_at revision、fresh/stale lease、CAS、試行上限、長時間経過時の手動確認、Resend SDK第2引数のidempotencyKeyを確認済み。実通知・停止復帰は未検証。providerの24時間保持に依存し、exactly-onceを無期限に保証するものではない。

根拠：[S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S25: email worker・lease回収/CAS/試行上限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/processor.ts) / [S26: Resend HTTP idempotency key](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/resend-provider.ts) / [O04: Resend公式 Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)。

### N03 — 新migration・aggregate・Redis・CSPの配備前提

**ENV_PENDING / P1（配備前）**

通知migrationのCI適用を配備先適用へ読み替えない。日報summaryもPostgREST aggregateに依存。middleware入口有効化により、実Redis未設定時の503が実際の業務APIへ影響するため、環境ごとの接続先・信頼proxy・flagsを確認する。

根拠：[S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts) / [S06: Next.js middleware登録入口](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/middleware.ts) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [O03: PostgREST公式 Aggregate Functions](https://docs.postgrest.org/en/stable/references/api/aggregate_functions.html)。

### N04 — mainの保護設定とリリース証跡

**ENV_PENDING / P1（継続開発の保護）**

今回のbranch応答でprotected=false。現在の成功チェックをrequiredにする提案を維持するが、repository rulesetsを含む実設定と承認を確認してから変更する。文書自身のmerge SHAを毎回埋め直す無限の文書更新PRを作らず、commitに紐づくGitHub checksと証跡を正本にする。

根拠：[S01: main / 対象コミット](https://github.com/IFs1991/seikotsuin_no_saas/commit/4f7794402400790afffb0c41db5538c9f97884a3) / [S02: 最終main CI・8ジョブ](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34009652063) / [S46: branch protection提案・無断変更禁止](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-branch-protection.md)。

## 6. 断定を保留した7領域の更新

ここは確認対象であり、自動的な修正命令ではない。

### V01 — 売上の正本・日報と明細の更新順

**VERIFY_FIRST**。F07は読取件数を直しただけ。manual日報総額・明細合計・予約snapshotの正本、trigger、confirmed/override保護を業務仕様と照合する。確定した売上破壊としては計上しない。

根拠：[S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts) / [S42: 日付×金額区分のビュー定義](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql)。

### V02 — soft deleteと予約履歴表示

**VERIFY_FIRST**。関連masterが削除状態になると既存viewのJOIN/フィルタに影響し得る。現行viewの最終定義とmaster削除guardを合わせて確認。F13のdegraded成功は履歴の見え方を直したものではない。

根拠：[S27: 保存成功後のprojection結果](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/reservations/mutation-result.ts) / [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts)。

### V03 — 公開予約のprice/指名料snapshot

**VERIFY_FIRST**。公開予約serviceの通常insertはprice/staff_nomination_feeを明示しないことを今回再確認。DB default/trigger・来院時計算・料金表示まで追う前に0円バグと断定しない。

根拠：[S21: 公開予約・患者照合/個別書込/補償](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/services/public-reservation-service.ts) / [S42: 日付×金額区分のビュー定義](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql)。

### V04 — Redisの実原子性・proxy・timeout

**ENV_PENDING**。認証専用Luaと、汎用RateLimiterのpipeline/段階的blockを区別。F03/F04の修正後、実SDK/Redisで競合・TTL・429/503・信頼proxy・復帰を検証する。

根拠：[S08: 実認証のaccount/IP Lua制限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/auth/auth-attempt-guard.ts) / [S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts) / [S10: 汎用レート制限・JSON復元/段階的ブロック](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/rate-limiter.ts) / [S11: Upstash client生成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/redis-client.ts)。

### V05 — 依存パッケージの到達可能性

**VERIFY_FIRST**。Core100でNextの限定更新が記録されている。古いnpm audit件数を最新へ転記しない。今回新しいauditは未実行。現行lockfileのruntime/dev/公開入力経路を分類し、必要な更新だけ行う。

根拠：[S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [S36: Core100変更記録](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/core100-release-changes.md) / [S45: Core100結果・依存到達性と未確認事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/core100-release-result.md)。

### V06 — JST・無効日付・金額・精度

**VERIFY_FIRST**。Core100の予約JST/マイクロ秒修正を維持する。全画面の年月日検証や数値精度まで完了としない。月末/閏日/JST00時/無効日付/丸めを対象ごとに確認する。

根拠：[S17: 予約cursorの契約](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/reservations/pagination.ts) / [S18: 予約UIの全ページ取得](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/reservations/api.ts) / [S28: 予約DTO・期待versionの有無/option差分](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/schema.ts) / [S12: 単院収益API・期間集計と内訳変換](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/revenue/route.ts)。

### V07 — 本番・容量・復旧・個人情報運用

**ENV_PENDING**。配備先catalog/RLS/RPC・ログ/保持/削除・通知実受信・監視到達・backup restore・100院負荷は別gate。既存CI成功やPreviewのユーザー確認を実施証拠へ転用しない。

根拠：[S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [S37: Core100有人運用・負荷試験runbook](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/operations/CORE100_RUNBOOK.md) / [S43: CI workflow・production CSPを含む](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/.github/workflows/ci.yml) / [S44: Core100仕様・性能基準](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/tiramisu-os-codex-release-spec-10companies-100clinics-v1.0.md)。

## 7. migration・配備の扱い

**既存migrationの編集・削除・再squash、履歴repairでの辻褄合わせをしない。** 新しいDDLが必要ならappend-only。不要なtable/RPCを追加しない。

現在の通知変更には `20260906003219_post_core100_notification_durability.sql` がある。CIではこの変更を含むDB契約ジョブが成功しているが、配備先への適用は別証拠である。アプリだけを先に展開してtriggerがない状態を成功扱いにしない。通知の `persistNotificationIntent()` はenqueued状態を確認する構造であり、migration未適用を単純な成功fallbackで隠してはいけない。[S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S23: 通知claimとoutboxの永続化確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/reservation-notifications.ts) / [S02: 最終main CI・8ジョブ](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34009652063) / [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)。

最小の配備順は、対象環境・現在の履歴・backup・lock条件の確認 → 承認された追加migrationの適用 → trigger/関数権限/型とaggregateの確認 → アプリの同一release展開 → 認証後の業務と通知の受入である。実環境の既存release手順がある場合はそれを優先し、この順序案で無断実行しない。

SQL保守を簡単にするために、新たな正本を増やさない。既存export/台帳を再利用して、最終table/FK/index、RPC owner/search_path/ACL、policy、trigger依存先、承認upgrade経路を生成する。不足だけ補い、手編集の別schemaを正本にしない。[S38: 既存のDB catalog export](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/scripts/commercial-hardening/export-db-catalog.mjs) / [S49: 関数実行権限の完全行列テスト](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/tests/commercial_function_execution_test.sql) / [S43: CI workflow・production CSPを含む](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/.github/workflows/ci.yml)。

## 8. Core100の性能基準へ統一

初版監査の「read p95 1秒 / write 1.5秒」は提案例だった。本更新では、別途作成・実装されたCore100仕様/runbookの基準を主として採用する。**古い提案例を追加の必須SLAにしない。** 以下は実測結果ではなく、受入用の検証条件である。[S37: Core100有人運用・負荷試験runbook](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/operations/CORE100_RUNBOOK.md) / [S44: Core100仕様・性能基準](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/tiramisu-os-codex-release-spec-10companies-100clinics-v1.0.md)。

| 項目 | 採用する検証条件 |
|---|---|
| 会社・店舗 | 10社・実店舗100院。組織root10件は実店舗数へ加えない |
| 分布A | 10院×10社 |
| 分布B | 50院＋6院×5社＋5院×4社＝100院 |
| 標準fixture | 500アカウント、患者10万、予約150万。実患者をコピーしない |
| 負荷 | warmup5分、200VU/30分、400VU/5分、200VU/5分回復。操作間隔10秒 |
| API目標 | read p95≤2秒、write≤3秒、aggregate≤5秒 |
| エラー | 通常の想定外エラー<0.1%。意図した403/409は別集計。HTTP200の業務失敗/欠落を成功にしない |
| その他 | 会社境界、独立正解SQLとの件数/金額一致、停止からの回復を確認 |

VU・業務操作数/秒・HTTP要求数/秒を混ぜない。1台の負荷生成機の共有IPだけで100院のネットワーク条件を再現したとしない。負荷試験先は使い捨てlocalまたは専用stagingで、外部通知・Stripe・Cron等を隔離する。small/smokeの成功を標準容量の証拠にしない。

### 測定してから直す場所

manager exact countは1院4要求なので50院で200要求、最大16並列というコード上の構造。実際に遅いことは未確認。ここを主測定対象にし、目標内なら維持、未達なら複数院一括aggregate/RPCを検討する。[S40: manager exact count実装](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/manager-dashboard-counts.ts)。

収益の全ページ取得、日報の月別用行取得、F16のAuth往復、LINEのoldest queued ageも測定対象。集計結果を8行にするなどの行数削減を、そのまま同率のlatency/料金削減と見積もらない。

## 9. 次の実行順とペイする範囲

| 順 | 単位 | 目的 |
|---|---|---|
| 1 | PR-U01（F03/F04） | 実際に動き始めたmiddlewareの制限/許可経路を安定化 |
| 2 | PR-U02（F06）とPR-U03（F09）を別PR | 経営数字の粒度・表示先を正す。R1/R2はここへ統合 |
| 3 | PR-U04（F10） | 原文を変える書込を止め、これ以上の補正負債を増やさない |
| 4 | PR-U05（F11、必要範囲F20） | 公開予約の患者誤照合を防ぐ。実患者利用前に完了 |
| 5 | ENV-01/02/03 | 配備・認証後CSP・通知/監視・停止復帰の実証 |
| 6 | ENV-04/05 | 100院容量と復元。未達箇所だけ最適化 |
| 条件付き | PR-U06〜09、VERIFY群 | 利用範囲・仕様・再現に応じて小さく処理 |
| 後回し | F22/F24全体再設計 | 今の不整合修正と性能目標達成に不要なら作らない |

順序は独立PRの着手順の提案であり、F11等の安全上の修正を実患者導入後まで後回しにしてよい意味ではない。PR-U01〜05は一つの巨大PRにまとめない。仕様判断が必要な項目に遭遇したら、独立して明確なコード修正は先へ進め、外部変更・データ補正・課金・機能停止だけは承認境界を守る。

今回の改善効果は、誤表示・問い合わせ・復旧不能のリスクを下げること。実latency・料金・サポート件数を計測していないため、削減金額/工数/高速化率は断定しない。不要な基盤移行より、狭い反例テストと正しい契約の方を優先する。

## 10. 出荷判定を閉じるための証跡

| 領域 | 今の状態 | 完了に必要な証拠 |
|---|---|---|
| Code / CI | 8 jobs成功、残存P1あり | 各未解消反例の回帰と新release SHAのCI |
| Data correctness | 改善済みと未解消が混在 | F06/F09/F10/F11等と、対象業務の独立正解照合 |
| Security | 既存DB/認可を維持。F03/F04・実環境待ち | 実Redis/proxy、role/会社境界、公開入力の試験 |
| Capacity | BLOCKED / NOT VERIFIED | 標準fixture A/B・200/400VU・DB指標・回復 |
| Recovery | BLOCKED / NOT VERIFIED | 隔離復元、会社分離、件数/金額、鍵/Storage/Authも含むRPO/RTO |
| Notifications | code改善、端点間保証は未検証 | enqueue/停止/再開/provider受理/受信/再試行/重複の証跡 |
| Production configuration | 未検証 | migration/aggregate/Redis/proxy/flags/provider/regionの一致 |
| Operational readiness | 未検証 | owner・監視通知先・窓口・運用/返却/削除・承認済み保護設定 |

既存DRのRPO/RTOとCore100の提案値が異なる場合、短い方を無断で約束しない。費用・方式・実復元に基づくToshuの承認値を正本とする。PreviewのUSER_CONFIRMEDは、実Redis・実通知・復元・100院負荷の代替ではない。[S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [S37: Core100有人運用・負荷試験runbook](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/operations/CORE100_RUNBOOK.md)。

## 11. Codexへの受渡し

本書と `remediation_backlog.md` の**2ファイルを同時に渡す**。原本は履歴として保存するが、実装命令を混在させない。

実装開始時に現行HEAD・作業ブランチ・未commit変更を確認し、このSHAと違えば差分を再分類する。IDごとに現在のコードを再確認し、実アプリのRED → 最小修正 → 回帰 → CIで終了判定する。縮約probeの成功、文書のCONFIRMED、過去のCIを新実装のPASSに流用しない。

RLS・同一院参照制約・課金guard・service-only ACL・機密値保護・migration履歴を弱めない。DB/設定/負荷/外部通知/有料サービス/本番展開は承認された対象だけ。repo読取や文書更新の依頼を、本番変更の承認とみなさない。

## 12. 参照・確認経路

以下は固定SHAの参照先。掲載は全行精査済みを意味せず、関数名と各Findingの「証拠の範囲」が優先する。S35/S38/S39などは再検証対象・既存運用資産を含む。

- [S01: main / 対象コミット](https://github.com/IFs1991/seikotsuin_no_saas/commit/4f7794402400790afffb0c41db5538c9f97884a3)
- [S02: 最終main CI・8ジョブ](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34009652063)
- [S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md)
- [S04: Post-Core100再分類・別監査の番号体系](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-audit-status.md)
- [S05: CSP・認証のroot middleware](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/middleware.ts)
- [S06: Next.js middleware登録入口](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/middleware.ts)
- [S07: production CSPブラウザ試験](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/__tests__/e2e-playwright/production-csp.spec.ts)
- [S08: 実認証のaccount/IP Lua制限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/auth/auth-attempt-guard.ts)
- [S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts)
- [S10: 汎用レート制限・JSON復元/段階的ブロック](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/rate-limiter.ts)
- [S11: Upstash client生成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/redis-client.ts)
- [S12: 単院収益API・期間集計と内訳変換](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/revenue/route.ts)
- [S13: 単院収益hook・応答の適用](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/hooks/useRevenue.ts)
- [S14: 単院収益UI・内訳Map・院の受渡し](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/revenue/page.tsx)
- [S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts)
- [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts)
- [S17: 予約cursorの契約](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/reservations/pagination.ts)
- [S18: 予約UIの全ページ取得](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/%28app%29/reservations/api.ts)
- [S19: 入力HTML変換・共通API処理](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/api-helpers.ts)
- [S20: bodyヘルパー・対象院認可の再確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/route-helpers.ts)
- [S21: 公開予約・患者照合/個別書込/補償](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/services/public-reservation-service.ts)
- [S22: 公開予約route・serviceの組合せ](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/public/reservations/route.ts)
- [S23: 通知claimとoutboxの永続化確認](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/reservation-notifications.ts)
- [S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql)
- [S25: email worker・lease回収/CAS/試行上限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/processor.ts)
- [S26: Resend HTTP idempotency key](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/resend-provider.ts)
- [S27: 保存成功後のprojection結果](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/reservations/mutation-result.ts)
- [S28: 予約DTO・期待versionの有無/option差分](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/schema.ts)
- [S29: 日報DELETE・scope先頭院](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/daily-reports/route.ts)
- [S30: LINEチャット・1院1件claim/逐次処理](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/line/chat-outbox-processor.ts)
- [S31: LINE worker実行route](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/internal/process-line-outbox/route.ts)
- [S32: 配備設定・Cron周期](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/vercel.json)
- [S33: Stripe webhook claim分類](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/billing/stripe-events.ts)
- [S34: Stripe webhook受信route](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/stripe/webhook/route.ts)
- [S35: 内部replay・復旧経路の検証対象](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/internal/billing/replay-webhook-event/route.ts)
- [S36: Core100変更記録](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/core100-release-changes.md)
- [S37: Core100有人運用・負荷試験runbook](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/operations/CORE100_RUNBOOK.md)
- [S38: 既存のDB catalog export](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/scripts/commercial-hardening/export-db-catalog.mjs)
- [S39: 既存forward-fix安全条件・再検証対象](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260815104957_pr11_deferred_production_forward_fix.sql)
- [S40: manager exact count実装](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/manager-dashboard-counts.ts)
- [S41: 患者PATCH schema/mapper](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/customers/schema.ts)
- [S42: 日付×金額区分のビュー定義](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql)
- [S43: CI workflow・production CSPを含む](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/.github/workflows/ci.yml)
- [S44: Core100仕様・性能基準](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/tiramisu-os-codex-release-spec-10companies-100clinics-v1.0.md)
- [S45: Core100結果・依存到達性と未確認事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/core100-release-result.md)
- [S46: branch protection提案・無断変更禁止](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-branch-protection.md)
- [S47: 収益用の既存全ページ取得helper](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/manager-fetch.ts)
- [S48: 予約の同時更新DB試験](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/tests/reservation_optimistic_concurrency_test.sql)
- [S49: 関数実行権限の完全行列テスト](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/tests/commercial_function_execution_test.sql)
- [S50: Next.js用CSP構成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/security/csp-config.ts)
- [S51: 通知対象の患者/メニュー/担当者参照](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/reservation-enqueue.ts)
- [S52: 本部dashboard aggregate](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/admin/dashboard/route.ts)

技術仕様は以下の一次資料を2026-09-06に確認。Next.jsはリポジトリの15系に合わせた資料を使い、新しい版のProxy名称等をそのまま移植しない。
- [O01: Next.js 15公式 CSP / nonce](https://nextjs.org/docs/15/app/guides/content-security-policy)
- [O02: Upstash公式 自動JSON復元](https://upstash.com/docs/redis/sdks/ts/advanced)
- [O03: PostgREST公式 Aggregate Functions](https://docs.postgrest.org/en/stable/references/api/aggregate_functions.html)
- [O04: Resend公式 Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)


## 13. 更新履歴と終点

v1（初版、beb0978）→ Core100（c028573d）→ Post-Core100（4f77944）をこの2ファイルへ統合した。元F01〜F24の番号を維持し、R1=F06/R2=F09を明記。後続指摘はN番号へ分離し、未算出・CAS・通知claim/outbox・production CSPの達成範囲を更新した。

**この文書の完成条件は「残っていること・直っていること・まだ知らないことを混同せず、次の実装単位を特定できること」。10社100院の出荷承認ではない。**

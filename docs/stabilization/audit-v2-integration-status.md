# Audit v2 実装・main統合結果

更新日: 2026-09-10 (JST)。対象: `IFs1991/seikotsuin_no_saas`。

## 対象と承認

- 開始SHA: `2f1434e0ffa410e97672ea8956e65231843ff250`。ユーザー指定どおり、元作業ツリー・branch `codex/audit-v2-verify01` は `f0587f37c6754ba518f25d09ff18f77e04753f42` で保持した。
- pushに続き、PR作成・mergeをユーザーが明示承認。別worktree `auditv2pr/` で、fetch時のmain `4f7794402400790afffb0c41db5538c9f97884a3` に既存修正を保持して単位別に統合した。開始HEADをresetせず、既存mainの64コミットを新規修正に数えない。
- 最終アプリコードSHA: `74b54a6a3748c908ec891c1a027b6943b9dc76d1`。その後の暦日PR head `a7320ecd0f0b2b152be976356bc80df10bc00148` は文書追加のみ。最終コードPRのmerge SHA: `e9e3b10e4aff5800bd06b1c813c6bbe4dc2b3538`。
- 結果記録branch: `codex/audit-v2-integration-results-main`。本記録自体の最終head/mergeとchecksは[同branchのPR検索](https://github.com/IFs1991/seikotsuin_no_saas/pulls?q=is%3Apr+head%3Acodex%2Faudit-v2-integration-results-main)で閉じ、SHA追記だけの再mergeを繰り返さない。
- 本番/共有DB・Auth・Redis、実Stripe、実通知、設定/課金、手動deployは操作していない。通常PR/mergeのCIと既存Vercel連携は自動実行された。Vercelチェックの成功を実環境受入や手動deployの実施証拠にしない。
- 新規migration・RLS・DDL・機能停止なし。依存変更はVERIFY-05のNext関連patchのみ。CI設定、除外、検査、権限を弱めていない。

## 原本と履歴

以下の相対パスは本repo基準。原本の基準SHAはともに `4f7794402400790afffb0c41db5538c9f97884a3`。

| 入力 | 実ファイル / ID / SHA-256 |
| --- | --- |
| 実行指示 | [codex_execution_prompt_v2.md](audit-v2-originals/codex_execution_prompt_v2.md)、全10節読了 |
| 監査原本 | [tiramisu_os_technical_audit_2026-09-06_v2.md](audit-v2-originals/tiramisu_os_technical_audit_2026-09-06_v2.md)、`TIRAMISU-OS-AUDIT-V2-4f77944`、`50e24ab5790851f6b3ddbc92e43b5e1553d51f56aaf46a3ddfe462d494801cfe` |
| backlog原本 | [remediation_backlog.md](audit-v2-originals/remediation_backlog.md)、`TIRAMISU-OS-BACKLOG-V2-4f77944`、`fb7146befa1f21da72a305774d718388a7717f3cbf944a0a5c51e55c17dacd4d` |

抽出先の元絶対パスは `C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/audit-v2-originals/`。原本は無変更、[manifest](audit-v2-originals/input_manifest.json)と照合した。

開始HEADでのRED→GREEN、fixture不備と製品不具合の区別、旧全体Jest失敗/中断は[実行履歴](audit-v2-execution-status.md)に保持。[条件付き確認履歴](audit-v2-verification-notes.md)と[旧検証receipt](audit-v2-verification-receipt.json)も保存した。これらの「未取込・push/PR未実施」は当時の状態であり、現在は本記録を参照する。

## PR・CI・マージ

全コードPRは固定headの通常8ゲートSUCCESSと独立read-onlyレビュー2件を確認して通常mergeした。後続draftのCIは先行して実行し、merge前にmainが予定した先行mergeから動いていないこと、mainのtreeが検証済み親headと一致すること、差分が当該単位だけになったことを確認した。force/admin bypassは使用していない。

| 単位 | PR / 固定head | CI run / 全体Jest | merge SHA |
| --- | --- | --- | --- |
| U01 | [#123](https://github.com/IFs1991/seikotsuin_no_saas/pull/123) / `535ff20e` | [34427863933](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34427863933)、8/8 SUCCESS、450 suites / 3842 passed / 2 skipped | `d39cd0b4c02f1135e8d68e4868375ebf1506eea3` |
| U02 | [#124](https://github.com/IFs1991/seikotsuin_no_saas/pull/124) / `c6084ff7` | [34429309219](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34429309219)、8/8 SUCCESS、451 suites / 3853 passed / 2 skipped | `237e73fd04ca05b373986cadac2363d466bfe46b` |
| U03 | [#125](https://github.com/IFs1991/seikotsuin_no_saas/pull/125) / `8c3dc35e` | [34430139033](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34430139033)、8/8 SUCCESS、452 suites / 3869 passed / 2 skipped | `8841c25cf7c8251d631cd1ace73f6825ed5e16e1` |
| U04 | [#126](https://github.com/IFs1991/seikotsuin_no_saas/pull/126) / `44e2dc54` | [34430872045](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34430872045)、8/8 SUCCESS、456 suites / 3909 passed / 2 skipped | `4d203725ef63bc16e4eb98dd40f4c6ef42fdca5e` |
| U05 | [#127](https://github.com/IFs1991/seikotsuin_no_saas/pull/127) / `dc2c450d` | [34431851592](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34431851592)、8/8 SUCCESS、457 suites / 3921 passed / 2 skipped | `c67814856ae24ba55790065d14899a5d7d73ada6` |
| U06 | [#128](https://github.com/IFs1991/seikotsuin_no_saas/pull/128) / `adc1b75d` | [34431912368](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34431912368)、8/8 SUCCESS、458 suites / 3930 passed / 2 skipped | `c86d3b3c116f9cdec98184ca0abcc3c030da4216` |
| VERIFY05 | [#129](https://github.com/IFs1991/seikotsuin_no_saas/pull/129) / `51cc326e` | [34431915305](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34431915305)、8/8 SUCCESS、458 suites / 3930 passed / 2 skipped | `d7d00f90d028af184514d8a36e74363f8eacac34` |
| VERIFY02 | [#130](https://github.com/IFs1991/seikotsuin_no_saas/pull/130) / `22e94453` | [34432069688](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34432069688)、8/8 SUCCESS、459 suites / 3946 passed / 2 skipped | `3041bdfdfd439c3be3c5f28df06d529a443f38ce` |
| VERIFY01 | [#131](https://github.com/IFs1991/seikotsuin_no_saas/pull/131) / `a7320ecd` | [34432414736](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34432414736)、8/8 SUCCESS、460 suites / 3961 passed / 2 skipped | `e9e3b10e4aff5800bd06b1c813c6bbe4dc2b3538` |

実際のコマンド全文、コードSHA、branch、レビュー、CI run/job/stepと完了時刻は[統合検証receipt](audit-v2-integration-receipt.json)。CI表のJest件数はそのrunのログ集計であり、旧監査の件数を転用していない。

## 変更と維持した契約

| 単位 | 原因 → 実装 / ファイル・関数 | main統合で維持・修正した点 |
| --- | --- | --- |
| U01 / F03,F04 | `src/lib/rate-limiting/rate-limiter.ts::RateLimiter`のSDK object/旧JSON復元を形状検証。不正/null/backend障害はproduction 503。`rate-limiting/middleware.ts::applyRateLimits`は許可headerと拒否responseを分離 | 実入口`src/middleware.ts`、request CSP/nonce、auth cookie、`/line-chat`保護、実認証Luaを維持。実入口のcomposition回帰を追加 |
| U02 / F06 | `src/app/api/revenue/route.ts::buildRevenueContextSummary/buildRevenueBreakdownSummary`をcode/amountRoleごとに期間合算 | 全ページ取得・後続ページ障害拒否・前年実額/nullを維持。fixtureをorder/range対応とし、1001日の2ページ、context/breakdown第2ページ障害、APIと実UIの100+200=300/件数2を検証 |
| U03 / F09 | `src/hooks/useRevenue.ts`で要求ごとのSymbolによりdata/error/loading/hasLoaded/inFlight更新を制限 | A→B→A、古い成功/失敗/finally、disable/unmount、StrictMode、同期throw。mainの必須lastYearRevenueをfixtureへ反映 |
| U04 / F10 | `src/lib/api-helpers.ts::sanitizeInput`は危険key除去を保ち原文保存。`notifications/email/html.ts`と9rendererでHTML出力時encode。`SecurityDashboard.tsx::handleDownloadReport`は共有createCsv | N01の省略保持/明示clear、Zod/origin/auth/clinic/billingを維持。raw round-trip/実React/HTML/CSVを区別。UIはEXTEND、リスタイルなし。過去DB decodeなし |
| U05 / F11 | `src/lib/services/public-reservation-service.ts::findOrCreateCustomer`で匿名電話/email/氏名から既存患者を再利用せず、新規患者へ進む | 確認済みLINEは同clinic・active・credential世代で検索/PATCH。mainのclinic+LINE uniqueへfixtureを適合。他院の同ID新規作成、同院旧世代/削除済み/legacy再利用拒否、空世代の照会前拒否。既存補償・FK・空き枠通知atomic経路は維持 |
| U06 / F15 | `src/app/api/daily-reports/route.ts::DELETE`は許可scope内lookupで得た実日報clinicにfresh guard/billingを適用し、fresh clientでid+clinic付き削除 | scope順、対象B院課金lock、権限剥奪、他院/不存在、manager拒否、DB障害を回帰。admin/clinic_admin限定を維持。manifestはmainから再生成 |
| VERIFY-05 / V05 | `package.json/package-lock.json`のNext15.5.21→15.5.24。Next/@next/env/SWC8種とroot pinのみ | `npm ci --ignore-scripts --no-audit --no-fund` exit0、1038 packages、runtime15.5.24。新規依存/無関係な更新なし。全脆弱性ゼロの主張なし |
| VERIFY-02 / F18 | `src/app/api/internal/billing/replay-webhook-event/route.ts::POST`でevent ID+読取statusのCAS claim後だけaudit/process/mark。processingはforceでも409 | internal secret/billing境界を維持。同一event競合/claim障害は拒否。billing-config fixtureは未設定と明示空値を分離し製品の空値→[]を保持。停止復旧/別event順序/fencingは残る |
| VERIFY-01 / V06 | `src/lib/jst.ts`の実暦日/year>0検証、ISO JST parseで0099年保持。`src/app/api/public/schema.ts`で不正暦日をDB前400 | 閏日/月末/JST深夜を検証し24時以降の繰越を保持。料金snapshot、全日時DTO、CAS timestamp精度を変更しない |

2026-09-10に公式 [AVIF画像最適化勧告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) と [Windows勧告](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) の修正版15.5.24を再確認した。画像formatsは出力設定であり攻撃入力の到達証明ではない。本番OS/実到達性/全依存audit件数は未確認、実exploitは行っていない。

## 実際の検証

ローカルはWindows/PowerShell、Node24/npm。別worktreeに実.envをコピーせず、合成localhost URL/鍵、telemetry/Sentry無効のテスト環境を使用。SDK fixtureのfetchはfixtureへ閉じ、実Redis/Stripe/通知受信や実DB排他の成功証拠としない。

| 単位 / コードSHA | suites / passed / failed / skipped | 秒 |
| --- | --- | --- |
| U01 / `c9914b41` | 6 / 114 / 0 / 0 | 27.742 |
| U02 / `f13fddc1` | 4 / 55 / 0 / 0 | 46.669 |
| U03 / `6a33d698` | 5 / 71 / 0 / 0 | 56.735 |
| U04 / `d6d21eb7` | 11 / 113 / 0 / 0 | 26.747 |
| U05 / `69902a14` | 5 / 78 / 0 / 0 | 24.106 |
| U06 / `91e7dfd5` | 4 / 35 / 0 / 0 | 13.977 |
| VERIFY05 / `42bee5cf` | 15 / 233 / 0 / 0 | 142.771 |
| VERIFY02 / `56495cee` | 6 / 41 / 0 / 0 | 38.244 |
| VERIFY01 / `74b54a6a` | 9 / 88 / 0 / 0 | 40.674 |

すべて `npm run test -- --ci --runTestsByPath <receipt記載のパス全文>`。重複を含む別々の関連回帰であり合算して独立テスト総数にしない。最後のアプリSHAでは、通常tsconfigのアプリ対象にaudit-v2新規test/fixture全13ファイルを明示追加したTypeScript Programが診断0。通常のtest除外を型検査済みの根拠にしない。

最終アプリSHAの `commercial:inventory:source:check`、`commercial:inventory:routes:check`、`security:verify-mutating-routes` はexit0（132 mutating / 9 side-effecting GET）。generator/checker自体は無変更。通常8 CIゲートの範囲:

1. Quality Checks: lint:ci、type-check、type-check:commercial、lint:commercial、test:release-tooling、route policy・route/source inventory・production assets drift・scan:secrets。
2. Build: npm run buildとproduction-build Chromium CSP/画面遷移試験。
3. Supabase Types Contract: 生成ファイル形式。
4. Database Contract: CI専用使い捨てSupabaseの全migration/seed replay、pgTAP、deferred upgrade、atomic invite並行処理、実GoTrue claims/古いJWT剥奪、生成型diff。
5. Fixture Preflight (Static): UUID/email等の静的整合性。
6. Full Jest Regression: 既存non-E2E全体。除外は既存のe2e/red-contractsを維持。
7. Security Tests: security/session回帰。
8. App E2E (Local Supabase + Chromium): CI専用DBでの業務smoke。

CIはUbuntu/Node24。CIのproduction CSPはローカルproduction build、App E2EはCI専用環境であり、Windows production browserや実Redis付き認証後全導線のENV-02受入とは区別する。DB replay成功を本番/共有DBへのmigration適用と読み替えない。

### 失敗・修正・skip・レビュー

- U01の最初の関連回帰はWindowsの`.w`パスで0件検出、exit1。専用worktreeを`auditv2pr`へ移して同じ設定/コマンドで114件成功。
- U02初回[CI 34428819592](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34428819592)はQualityのsource inventory driftで失敗。既存generatorで収益route参照位置6件を更新し、最終headの全8ゲート成功。U04のsource scannedFile数、U05の参照位置、U06のmanifest、VERIFY-02のclaim参照も既存generatorで更新した。
- U03独立レビューのlastYearRevenue欠落を修正し71件と明示test型検査を再実行。U05の古いglobal LINE unique fixtureをmainのclinic+LINE制約へ合わせ、期待する本人確認/拒否は弱めなかった。
- 元branchの全体Jestは3657 passed / 1 failed / 2 skippedで完走。失敗はbilling-config fixtureの親環境継承で、未設定と明示空値を分離した後に関連回帰を実行。旧全体を修正後PASSと改ざんせず、現在の全体成功は各PRの新CIで確認した。旧中断・fixture由来REDも実行履歴に残す。
- 全体Jestのskip2件は既存 `src/__tests__/lib/api-client.test.ts::should handle timeout` と `src/__tests__/pages/reservations.test.tsx::ReservationsPageがエラーなくレンダリングされる`。新規skipなし。反復によるflaky判定は未実施。CIの任意Claude review jobはdraft条件でSKIPPEDだが、通常8ゲートと実際の独立2レビューは省略していない。
- 全コード単位を同一固定差分で `u01_requirements_review` / `u01_failure_review` がread-only確認。要求適合と反例/障害を分け、追加指摘修正後に残存actionable findingなし。reviewerはテスト/DB/ネットワーク操作をしていない。親による実行とレビューを混同しない。

DoD紐付け: DOD-10/11（build/型/lint/Jest）、DOD-06/07の関連ブラウザ検証、DOD-08/09（scope/認可保持）、CI専用DOD-02/03/05/12（DB/fixture/生成型）。[DoD-v0.1](DoD-v0.1.md)の過去12/12は今回の証拠ではなく、変更完了は[Change DoD](../quality/change-dod-v1.0.md)、出荷判断は別のRelease Gateを使う。

## 全35 IDの最終対応

すべてAUDIT-V2のID。原本CODE_FIXEDは再実装せず、mainに存在する既存実装を維持した。`CODE_FIXED`は該当コード修正の状態であり、実環境受入を含まない。

| ID | 原本状態 | 現行再確認 / 今回の結果 | 残件・次の最小作業 / 根拠 |
| --- | --- | --- | --- |
| F01 | PARTIAL | src/middleware実入口/CSP/nonceを保持。production CSP CI成功 | ENV-02: 実Redis/承認accountによる認証後全導線と役割・会社境界 |
| F02 | CODE_FIXED | auth-attempt-guardのaccount/IP LuaとgetPathRateLimit既存修正を保持 | ENV-01: 実Redis/proxyのTTL/429/503・認証制限 |
| F03 | OPEN | U01 CODE_FIXED、SDK object/旧JSON/null破損回帰 | 実Redis遅延・EXISTS追加影響は未計測 |
| F04 | OPEN | U01 CODE_FIXED、許可header/拒否response分離、実入口合成 | 実環境認証後導線はENV-02 |
| F05 | CODE_FIXED | revenueの前年実額・未算出/null表示を保持 | U02/U03回帰。既存修正の二重計上なし |
| F06 (R1) | OPEN | U02 CODE_FIXED、期間合算/2ページ/実UI回帰 | 実環境aggregate・容量はENV-01/04 |
| F07 | CODE_FIXED | daily-reports/read-modelの一覧と期間summary分離を保持 | 対象DBのaggregate/ACL適用はENV-01 |
| F08 | CODE_FIXED | main既存ページングを保持、U02でページ境界/後続障害検証 | Core100標準A/Bは未計測、ENV-04 |
| F09 (R2) | OPEN | U03 CODE_FIXED、要求identityで全状態更新を保護 | UIで古い要求が新要求を上書きしない回帰成功 |
| F10 | OPEN | U04 CODE_FIXED、原文保存/文脈別出力/N01保持 | 過去保存データの棚卸し/補正・実通知は別承認 |
| F11 | OPEN | U05 CODE_FIXED、匿名contact照合を除去、確認済みLINE世代保持 | 新規患者重複の業務上の照合、実LINE受入は別途 |
| F12 | PARTIAL | U07条件付き。mainのawait・notification claim/outbox atomic・durability migrationを保持 | 予約commit→intent欠落の追加保証、停止復帰/過去変更・取消event再構築をENV-03で検証。ログだけを永続回復としない |
| F13 | CODE_FIXED | reservations/mutation-result等のmain既存修正を保持 | 新規機能停止なし、既存CI回帰 |
| F14 | PARTIAL | U08条件付き。mainのserver CASを保持 | 古い編集画面のexpected version契約、通常/mobile DTO/UIの適用範囲確定。timestampマイクロ秒を丸めない |
| F15 | OPEN | U06 CODE_FIXED、対象日報の実clinicでfresh認可/billing/DELETE | 実DBで削除直前の並行変更はENV-01 |
| F16 | VERIFY_FIRST | PERF-01未計測。最終scope/権限鮮度を維持 | Auth/DB呼出回数と遅延を計測後、効果あるcontext再利用だけ |
| F17 | CONDITIONAL | U09判断待ち。mainにline/chat-outbox-processorとLINE chat画面が存在 | 提供範囲・待ち時間合意後、bounded drain/少数並列/院内順序/例外隔離を検証。対象外扱いしない |
| F18 | VERIFY_FIRST | VERIFY-02 PARTIAL、同一eventのprocessing保護CODE_FIXED | stripe-events::syncStripeSubscription/markWebhookEventの別event/resync順序、停止回復、terminal応答喪失fencing |
| F19 | VERIFY_FIRST | VERIFY-03仕様確認待ち。手動/overrideの正当な調整を維持 | catalog正価と権限/上限/理由/監査付き任意調整を区別。selected_optionsを無条件クランプしない |
| F20 | VERIFY_FIRST | VERIFY-04/U05で集約、FK RESTRICT・補償scope・空き枠通知atomic経路を保持 | 実DBの予約失敗/並行参照/補償失敗/孤立患者を専用対象で確認。全面RPC化なし |
| F21 | CODE_FIXED | 既存8ゲート/image retry/生成型検査を保持、今回各SHAのCI成功 | 過去runを今回の証拠へ転用しない |
| F22 | DEFERRED | DEFER-01保留、必要な既存inventoryのみ更新 | 第2のDDL正本・過去migration編集/削除なし |
| F23 | ENV_PENDING | ENV-01未実施。CI専用DB成功と分離 | 対象project/origin、実migration/trigger/ACL履歴、lock/size、aggregate適用証拠 |
| F24 | DEFERRED | PERF-01/DEFER-01保留、性能未計測 | 容量目標未達を測定した範囲だけ最適化 |
| N01 | CODE_FIXED | mainのcustomers PATCH省略保持/明示clearを維持、U04回帰 | 開始HEAD未取込の記述は履歴。現在未取込とは報告しない |
| N02 | CODE_FIXED | mainのnotifications/email/processor・provider/通知migrationを保持 | 通知受理/受信、lease/古いworker/応答喪失の実証はENV-03 |
| N03 | ENV_PENDING | ENV-01/02未完了 | origin/project・実Redis/proxy・aggregate・build時NEXT_PUBLIC flagsの確認 |
| N04 | ENV_PENDING | protection API404（未保護）、rulesets[]をread-only確認 | 設定は未変更。必要checks必須化は別承認、運用責任者の確定 |
| V01 | VERIFY_FIRST | 日報は明細集約、override/confirmed/recalculated保護をspec/triggerで確認 | 実環境の明細/確定値の整合はENV-01。二重正本にしない |
| V02 | VERIFY_FIRST | master soft deleteと物理履歴参照、新規利用active条件を確認 | 既存予約編集/来院/取消と削除のDB競合、運用上の禁止/許可条件 |
| V03 | VERIFY_FIRST | price nullable・来院時master fallbackを確認。常時0円とは判定しない | 公開提示価格/指名料/予約時snapshot契約とmaster変更の実DB再現 |
| V04 | ENV_PENDING | ENV-01未実施 | 専用Redis/proxy、試験account/originと操作承認が必要 |
| V05 | VERIFY_FIRST | VERIFY-05 CODE_FIXED、Next15.5.24へ最小patch、関連/全CI成功 | 全依存audit/実到達性は未検証、脆弱性ゼロ判定ではない |
| V06 | VERIFY_FIRST | VERIFY-01 PARTIAL、実暦日/0099年/API400を修正 | 全金額丸め、birth_date/start_time全境界、日時DTO/CAS精度は未完了 |
| V07 | ENV_PENDING | ENV-03/04/05未実施 | 実通知/監視到達・容量・隔離復元・運用owner/承認値の確定 |

## 環境待ちと個別判定

未実施項目の担当は未割当。期限を推測せず、各受入開始前にユーザー/運用担当が専用対象・担当・承認値を確定する。

| ゲート | 未実施 / 解除に必要な条件 |
| --- | --- |
| ENV-01 | 承認済みproject/origin、専用DB/Redis/proxy、migration/trigger/ACL適用履歴、PostgREST aggregate、認証・課金402/設定不足503・build flags。起動済みlocalhostを使い捨てとみなさない |
| ENV-02 | 実Redis/proxy・承認account、full-enforce production build/startでlogin→dashboard→患者→予約作成/変更/取消→日報→manager。nonce/hydration/client navigation/会社・院・role境界 |
| ENV-03 | 承認test宛先・provider/監視担当、予約保存→intent→outbox→provider受理→受信の各段階、停止復帰/古いworker/受理後応答喪失/保持期限後の手動確認。通知SLAを新設しない |
| ENV-04 | 専用容量対象とseed/load承認。Core100の10社100実店舗・標準A/B・500accounts/10万患者/150万予約、200/400VUと回復、独立件数/金額照合。read p95≤2秒/write≤3秒/aggregate≤5秒、通常想定外error<0.1%を維持 |
| ENV-05 | 隔離復元先/backup/鍵/Storage/Authと復元承認、実RPO/RTO・会社分離/件数/金額、窓口/障害owner/返却削除、branch保護設定の別承認 |

| 判定軸 | 結果 |
| --- | --- |
| Code | 上記9単位は実装・回帰・CI・main merge完了。条件付きU07/U08/U09等を含む監査全件完了ではない |
| Data correctness | PARTIAL。局所回帰/CI専用DB契約成功、価格snapshot・実履歴競合・実環境適用は未完了 |
| Security | PARTIAL。対象scope/認可/出力/依存修正とCI成功、実Redis・認証後全導線・本番設定は未受入 |
| Capacity | NOT_RUN。smokeを100院容量PASSにしない |
| Recovery | NOT_RUN。停止回復/隔離復元/RPO/RTOは未受入 |
| Notifications | NOT_RUN（実通知受理/受信/停止復帰）。既存コード保証の維持と分ける |
| Production configuration | NOT_RUN。実設定適用・本番配備完了を主張しない |
| Operational readiness | NOT_RUN。担当/運用合意/branch保護/復元受入が残る |

次の最小コード作業はF18: `src/lib/billing/stripe-events.ts::syncStripeSubscription/markWebhookEvent` に対して旧event・新event・resync・終端応答喪失を競合REDへ固定し、必要なCAS/fencingを仕様とrollback付きの別単位にする。実Stripe/共有DB操作は行わず進められる。V03/F19は公開料金snapshotと権限付き調整契約、U07/U08/U09は提供・保証契約を確定してから依存作業を進める。環境試験は上表の対象と承認を揃える。

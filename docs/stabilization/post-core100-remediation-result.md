# Post-Core100 修正・検証結果

確認日: 2026-09-06 JST。対象: `IFs1991/seikotsuin_no_saas`。目標は10社・合計100院での運用に必要な、患者データ・経営数字・予約・通知・本番相当CSPの正確性である。

**判定は NO_GO / 出荷未判定。** コード修正・main統合の完了は容量検証と運用準備の完了を意味しない。各PRの統合状態は次表を正本とし、過去のCIと最新の統合後CIを区別する。

2026-09-06 JST、ユーザーから「プレビュー確認したのでマージをよろしく」と確認・統合依頼を受領した。Preview受入は **USER_CONFIRMED** とし、A〜Eを依存順にmainへ統合した。Fの文書更新と統合結果はPR #122の履歴を参照する。実Redis、100院容量、配備先DB、実通知、復旧・運用の検証とは別の証跡である。

## 基準とPR進捗

| 対象 | commit / PR | 確認済み状態 | 未完了・次の確認 |
| --- | --- | --- | --- |
| 修正前基準main | `c028573d089cb6085ab3e29121fa9fe4d2f923c0`、[PR #116](https://github.com/IFs1991/seikotsuin_no_saas/pull/116) merge済み | [CI 33996399702](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/33996399702) 8 jobs SUCCESS。Jest 444 suites / 3733 passed / 2 skipped。E2E 9 passed / 3 flaky（retry成功）/ 1 skipped | 修正前の履歴。追加修正の統合後CIへ読み替えない |
| コード統合main | `1d95419e918b8748ac45c69b6b3ee84e3a369579`（PR-Eのmerge commit） | A〜Eのmain統合完了。全コードを含むE更新headのCI 8 jobs成功。Previewはユーザー確認済み | Fの文書更新・merge結果はPR #122履歴、merge後main CIはGitHub checksを参照。容量・運用は別判定 |
| PR-A 患者PATCH | `2b10dfd`、[PR #117](https://github.com/IFs1991/seikotsuin_no_saas/pull/117) | [CI 34001862639](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34001862639) 8 jobs SUCCESS。Jest 444 suites / 3742 passed / 2 skipped。E2E 11 passed / 1 flaky（retry成功）/ 1 skipped。独立read-only監査2名PASS | **MERGED**、main merge commit `03fc8b66`（2026-09-06）。全コードの組合せCIはE行を参照 |
| PR-B 日報・収益 | `a913ea2`、[PR #118](https://github.com/IFs1991/seikotsuin_no_saas/pull/118) | [CI 34002471970](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34002471970) 8 jobs SUCCESS。Jest 445 suites / 3748 passed / 2 skipped。E2E 11 passed / 1 flaky（retry成功）/ 1 skipped。独立read-only監査2名PASS | **MERGED**、main merge commit `d636e713`（2026-09-06）。全コードの組合せCIはE行を参照 |
| PR-C 予約整合性 | 実装 `609c761`、更新head `79c3a932d5448468b21af21d4097314aada83d43`、[PR #119](https://github.com/IFs1991/seikotsuin_no_saas/pull/119) | 更新headの[CI 34008756777](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34008756777) 8 jobs SUCCESS、Jest 446 suites / 3775 passed / 2 skipped。初回[CI 34002601375](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34002601375)も8 jobs成功。独立read-only監査2名PASS | **MERGED**、main merge commit `f8dd988d65cb01df08acabd8f3ce02b83fbf16f6`（2026-09-06 12:32:04 JST）。全コードの組合せCIはE行を参照 |
| PR-D 通知耐久性 | 更新head `3a9cf4ad0ec7ca6bacd8bdd2c08450aa5e6e3ebc`、[PR #121](https://github.com/IFs1991/seikotsuin_no_saas/pull/121)。C #119への依存PRとして作成。C / D統合 `61de7312`、grant fixture追補 `916a4637` | [CI 34008810877](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34008810877) 8 jobs SUCCESS。Jest 448 suites / 3797 passed / 2 skipped。DB 21 files / 858 tests PASS、App E2E 12 passed / 0 flaky / 1 skipped。統合回帰17 suites / 229 tests、release-tooling 46 tests、独立read-only監査2名PASS | **MERGED**、main merge commit `fcb64ec03a3894988617e6e1b726a7b083485ad4`（2026-09-06 12:33:50 JST）。配備先migration適用・実通知・worker停止復帰は未実施 |
| PR-E production CSP | 更新head `fda08bdd1aa1a62c01bc837e8015891b9e3eba93`、[PR #120](https://github.com/IFs1991/seikotsuin_no_saas/pull/120)。初回修正 `4bb46947` / `cdf0e12c` | [CI 34008902307](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34008902307) 8 jobs SUCCESS。Jest 448 suites / 3798 passed / 2 skipped。DB 21 files / 858 tests、Build内production CSPブラウザ1 passed、App E2E 11 passed / 1 flaky（retry成功）/ 1 skipped。全コードの組合せ回帰17 suites / 229 tests、独立read-only監査2名PASS | **MERGED**、main merge commit `1d95419e918b8748ac45c69b6b3ee84e3a369579`（2026-09-06 12:34:46 JST）。実認証後のproduction相当CSPは実Redis / 信頼proxy不足でBLOCKED |
| PR-F 文書・証跡 | 初版 `3fd6acd`、[PR #122](https://github.com/IFs1991/seikotsuin_no_saas/pull/122)。文書最終版・統合状態・merge commitはPR履歴を参照 | コード変更前の再分類を保持し、4文書へユーザーPreview確認とA〜Eの統合結果を記録。更新前の独立read-only監査2名PASS。今回追記の再監査・CI結果は本PRに記録する | 本書自身のmerge SHAは埋め込まない。本PRのCIとmerge後main CIはGitHub checksを参照し、完了を先取りしない。容量・運用の完了へ読み替えない |

8 jobsは Quality Checks / Build / Database Contract / Security Tests / Supabase Types Contract / Fixture Preflight (Static) / Full Jest Regression / App E2E (Local Supabase + Chromium)。skipは未実行、flakyはretry成功として明記し、初回成功件数へ加えない。mainの既存CIと、各修正commitのCIは別の証跡である。

Eの更新head `fda08bdd1aa1a62c01bc837e8015891b9e3eba93` はA / B / C / D / Eの全コードを含み、上表の8 jobs成功後にmainへmergeした。source inventoryの競合はgenerator再生成で解消し、route / source / security（132 mutations / 9 GET例外）/ mobile assetsのcheck、focused17 suites / 229 tests、独立read-only監査2名がPASSした。コード組合せのCI成功と、merge後mainのCIは区別して記録する。

Dの実装時head `5f7c77017d218fc18e44242d5c84f274d978d976` の[CI 34005318786](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34005318786)も8 jobs成功（Jest 447 suites / 3773 passed / 2 skipped、DB 21 files / 858 tests、E2E 11 passed / 1 flaky / 1 skipped）。deferred経路・招待同時実行・GoTrue・生成型diffの成功を含む。E初回の[CI 34003531144](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34003531144)も8 jobs成功した。これらの実装段階の証跡を、上表の更新head・merge commitの結果へ読み替えない。

PR-Dの初回 `8602f6e9` / [CI 34003707831](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34003707831) はsource inventoryの生成漏れでQuality ChecksがFAIL、他7 jobsはSKIPPEDだった。Cとの統合時にinventoryを更新し、`61de7312` / [CI 34004238530](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34004238530)のQuality Checksは成功した。同runでは新migration再生・D通知SQL・C CAS SQLは成功したが、既存の完全grant行列fixtureに新private関数service_role 1組が未登録のためDatabase Contractが1 failed / 858 testsとなり、型の後段とE2Eは未実行だった。過去の失敗を後続検証のPASSへ書き換えない。

`916a4637` は実権限を変えずに完全grant行列の期待値1組を補完した。[CI 34004618455](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34004618455) はreplay・pgTAPと6 jobsが成功（Jest 447 suites / 3773 passed / 2 skipped）。続くdeferred PR-11検証が以前のrecovery migrationを最新headと固定していたため、新しいappend-only migration適用後の履歴比較で失敗した。E2Eは未実行であり、このrun全体を成功と数えない。検証スクリプトの互換修正と最終合否はPR-Dの進捗表・CIで管理する。

## A. 修正済みの内容

以下のcommit / PR / 最終検証状態は「基準とPR進捗」の同名行に対応する。コード修正と各PRのCI成功は、main統合・実配備・業務受入の完了とは分離する。

### PR-A: 患者PATCHの省略値保持

- 原因: `mapCustomerUpdateToRow()` が省略されたemail / notesを `?? null` へ変換し、name / phoneだけのPATCHでも既存データを消していた。
- 修正: 未指定・undefinedはUPDATE payloadにキーを含めない。非空文字はtrimして変更し、null / 空文字 / 空白のみはemail / notesの明示削除と定義した。name / phoneのnull・空文字は検証エラーを維持する。
- 変更ファイル: `src/app/api/customers/schema.ts`、`src/__tests__/api/customers-route.test.ts`、`docs/stabilization/spec-post-core100-customer-patch.md`。
- テスト: 新規9件RED / 既存13件PASSから22件PASS。名前だけ・電話だけの更新後に保存済みemail / notes等が残ること、明示変更・削除、manager拒否・他院拒否を確認する。POSTとcustomAttributesの契約は変更していない。

### PR-B: 日報の全件集計・収益の実額と未算出

- 原因: 日報一覧の `.limit(30)` をsummary・平均・月別トレンドにも流用していた。Revenueの6データソースは1,000行上限の影響を受け、前年売上は丸めた成長率から逆算していた。110%予測と32.5%人件費率には算出元データがなかった。
- 修正: 一覧30件を維持し、同じclinic / date条件でsummaryをDB aggregate、月別用の必要列を順序付きでページ取得する。Revenueの6データソースも既存 `fetchAllRows()` で取得し、後続pageのエラーでは部分集計を返さない。前年実額をAPIで返し、前年日報なしと実額0円を区別する。算出不能な予測・人件費率・成長率はnull、画面は「未算出」とする。
- 変更ファイル: `src/lib/daily-reports/read-model.ts`、`src/app/api/revenue/route.ts`、`src/types/api.ts`、`src/hooks/useRevenue.ts`、`src/app/(app)/revenue/page.tsx`、`src/__tests__/api/reporting-correctness.test.ts`と既存API / hook / page回帰、`docs/stabilization/spec-post-core100-revenue-correctness.md`、生成inventory。
- テスト: server初回8 failed / 1 passed、client初回4 failed / 37 passed。修正後server 7 suites / 43 tests、client 2 suites / 41 tests PASS。31件・1,001件、他院・期間外除外、空集合、aggregate無効・後続page失敗、前年なし / 0円 / 333円、UI未算出を検証した。実Supabase JS clientのfetch fixtureであり、実DB・RLSや容量試験の代替ではない。

### PR-C: 予約保存と表示取得失敗の分離・同時更新拒否

- 原因: 通常 / mobileのPOST・PATCHがDB保存後のviewエラー・0件を500とし、保存済み操作の再送を促していた。PATCHは読取後のversionを確認せず、同じ旧状態を読んだ別更新を上書きできた。
- 修正: `readCommittedReservation()` はview取得失敗を `projectionStatus: 'unavailable'` 付きの保存成功として返す。保存済みの選択列だけを既存mapperで変換し、内部列・生DBエラーを公開しない。UI / mobile bridgeは再保存不要の案内を出す。PATCHはDBから返るupdated_at文字列の精度を維持してid / clinic_id / updated_atでUPDATEし、0件なら通知前に409、version欠落なら503を返す。
- 変更ファイル: `src/app/api/reservations/route.ts`、`src/app/api/mobile-uiux/reservations/route.ts`、`src/lib/reservations/mutation-result.ts` / `mutation-messages.ts` / `read-model.ts`、予約画面のform / hook / page / API型、`src/lib/mobile-uiux/bridge-manifest.ts`、`src/__tests__/api/reservations-commit-boundary.test.ts`等、`supabase/tests/reservation_optimistic_concurrency_test.sql`、`docs/stabilization/spec-post-core100-reservation-consistency.md`、生成inventory。
- テスト: 新規API14件REDから、既存を含む6 suites / 127 tests PASS。UI初回1 failed / 12 passedから、追加回帰を含む2 suites / 39 tests PASS。SQL testは8項目でversion精度・既存trigger・旧version更新0件・clinic条件・先行保存の維持を検証する構成。実DBでの合否はPR進捗表のDatabase Contract証跡に従う。SQL testの成功を2接続の実同時試験の実施済み証跡とはしない。

### PR-D: 通知の永続化待機・claimとoutbox・停止workerの回収

- 原因: 通常 / mobile予約のenqueueがawaitされず、response後のserverless終了で失われ得た。通知claimとoutbox insertの別書込の間で停止すると再試行がduplicate扱いになった。emailのprocessingにはlease回収がなく、staff参照先とResend冪等キー指定も不整合だった。
- 修正内容: response前に永続handoffをawaitし、provider送信はworkerに残す。通知intentのclaimとoutbox insertを同一DB transactionで扱い、途中失敗はclaimもrollbackする。email processingはrevisionによるlease / CAS、stale回収・回数上限・旧worker拒否を追加する。resourcesをclinic付きで参照し、ResendのHTTP idempotencyKeyはSDK第2引数へ渡す。曖昧な長時間経過配送を無条件再送しない。
- 対象ファイル: 通常 / mobile予約route、`src/lib/notifications/reservation-notifications.ts`、`src/lib/notifications/line-outbox.ts`、`src/lib/notifications/email/processor.ts` / `reservation-enqueue.ts` / `resend-provider.ts`、関連Jest、`supabase/migrations/20260906003219_post_core100_notification_durability.sql`と対応rollback / DB test、`docs/stabilization/spec-post-core100-notification-durability-v0.1.md`。
- 検証互換の追補: `supabase/tests/commercial_function_execution_test.sql`に実migrationの最小grant 1組を登録。`scripts/commercial-hardening/verify-pr11-deferred-production-path.mjs`と`deferred-migration-history.mjs`は固定の復旧条件を保ち、後続migrationを含むrepo全履歴との厳密一致を検証する。`scripts/release/__tests__/deferred-migration-history.test.mjs`は旧判定で3 failed / 4 passedを確認後、既存を含むrelease-tooling 46 tests PASS、既存deferred契約5 tests PASS。未知・欠落・重複の拒否とCLI pin / loopback / 明示承認 / rollback guard / cleanupを維持した。
- テスト対象: response前handoff完了、enqueue失敗と予約成功の区別、worker未実行、provider failure、crash後回収、fresh lease、旧worker拒否、retry上限、tenant境界とatomic enqueue。実施済み件数・DB結果・最終commitはPR進捗表で管理する。新しいqueue製品は導入しない。
- Cとの統合: `61de7312`で通常 / mobileの保存成功、clinic付きupdated_at CAS、通知失敗後のdegraded成功を保った。`reservations-commit-boundary.test.ts` の新規4件はPOST / PATCHごとに通知handoff決着前のprojection読取・responseを禁止し、通知失敗後も保存1回・projection読取1回の成功応答を確認する。統合回帰は17 suites / 229 tests PASS、独立read-only監査2名PASS。実DB・配備先・最終CIの合否は上表と区別する。

### PR-E: production buildでのmiddleware・nonce・Trusted Types

- 原因: rootの `middleware.ts` が `src/app` と同階層でなくNext 15のproduction buildに登録されず、生成manifestのmiddlewareが空、loginのCSP headerも欠落していた。登録後はrequest CSPからのSSR nonce伝播と動的renderingが必要だった。Next Imageの既定inline style属性と、Next chunk loaderの `nextjs#bundler` policyもfull-enforceと不整合だった。
- 修正内容: `src/middleware.ts` のre-export入口と静的解析用literal matcher、request側へのnonce / CSP伝播、RootLayoutの `connection()` を追加する。再現したlogin / admin login / headerのNext Imageで不要な `color:transparent` 属性を出さない。Trusted Typesは `require-trusted-types-for 'script'` を保持し、Nextが使う正確なpolicy名だけを許可する。unsafe-inline / unsafe-eval / unsafe-hashesの追加で回避しない。
- 対象ファイル: `src/middleware.ts`、`middleware.ts`、`src/app/layout.tsx`、`src/app/(public)/login/page.tsx`、`src/app/(public)/admin/login/page.tsx`、`src/components/navigation/header.tsx`、`src/lib/security/csp-config.ts`、middleware / CSP回帰、`playwright.production.config.ts`、`src/__tests__/e2e-playwright/production-csp.spec.ts`。
- テスト対象: `npm run build` / `npm run start` によるSSR script nonce、CSP console違反、Reactのpassword表示toggle、入力維持、client navigationと追加chunk読込。表示されたHTMLだけをhydration成功と判定せず、hard reloadによる見かけ上の遷移成功も除外する。REDログは `post-core100-e-runtime.log` / `post-core100-e-navigation-red.log` に保存。最終合否はPR進捗表で管理する。
- 新たに実行される境界: middleware登録により既存の認証確認とAPI rate limitが実際に動く。実Redis / 信頼proxyがないproduction相当環境ではAPIを503で拒否する。これを迂回して認証後CSPをPASSにしない。

### PR-F: 修正前再分類・release証跡・branch protection提案

- 原因: Core100 release resultに作業途中のcommit / CIが現状として残り、既存解消項目・追加修正・容量 / 運用の未検証を分けて読む必要があった。mainのbranch protection / rulesetも未適用だった。
- 修正内容: 最初にコード変更なしでFindingを再分類し、既存解消項目を再実装対象から除外した。Core100のmain統合SHAとCI事実を歴史的ログから分離し、本書ではFindingごとの修正・証跡と8領域判定を整理する。成功した8 CI gateをrequired check候補として文書化し、repository settingsは変更しない。
- 対象ファイル: `docs/stabilization/post-core100-audit-status.md`、`core100-release-result.md`、`post-core100-branch-protection.md`、`post-core100-remediation-result.md`。
- 確認: コード / 既存仕様・各担当検証記録と照合し、文書内のローカルリンク切れ0件を確認した。更新前の4文書は独立read-only監査2名PASS。初版は `3fd6acd`、今回更新の再監査・CI・統合状態はPR #122のchecksと履歴を参照する。文書確認のためにアプリテストや負荷試験を再実行したとは主張しない。

## B. 既に解消済みだった項目

[修正前再分類](post-core100-audit-status.md)はコード変更前の証跡として保持する。先行監査のF番号と今回のFindingは別物である。

- F-01〜F-19は、先行指摘の対象となるコード・migration・rollbackの存在を現行mainで確認した。LINE identity、manager拒否、予約返却列、患者フォーム、scope、onboarding、ICS、billing secret / audit、CSP report validation、通知権限 / FK等を一括再実装しない。F-15の監視受信・source-map artifactやF-19の実復元安全性まで確認した意味ではない。
- F-14等のmiddleware内rate limitをRESOLVEDとした記録は、helperの実装確認までである。PR-Eで判明した入口未登録により、productionで実行されることの証明は別途必要になった。既存helperを再設計せず、PR-Eの入口修正と実Redis / proxyによる環境検証へ関連付ける。
- Core100の実ログイン制限、Redis Luaのaccount / IP原子性、予約keyset paginationと全page取得、JST、manager exact count、本部aggregate、課金判定、監視、E2E / GoTrue revocation、replay / pgTAP / 生成型gate、seed / load / verify tooling、Next 15.5.21を維持する。
- 公開予約・公開cancelは既にenqueueをawaitしており、重ねて実装しない。PR-Dでは共通通知処理の回帰対象として維持する。
- F-20は対象any除去済みだが、`src/lib/api-client.ts` のgeneric成功payloadの `as T` に実行時検証が残るためPARTIALLY_CONFIRMED。今回の変更対象契約の検証を維持し、全API型再設計へ広げない。

## C. 未検証・BLOCKED

| 項目 | 状態 | 解除に必要な環境・証跡 |
| --- | --- | --- |
| 10社100院容量、200 / 400 VU | BLOCKED | 承認された専用app / DB、外部送信遮断、plan / region / 上限 / 100院IP構成を確定。既存toolingでseed / load / verifyし、件数・金額照合とrequest count / p50 / p95 / p99 / CPU / DB接続 / PostgREST latencyを保存 |
| 実Redisと信頼proxy | BLOCKED | 使用許可されたRedis RESTとproxy条件。IP / account閾値、原子性、TTL、復帰、Auth側制限を実証。設定不足時の503維持は業務成功の証拠ではない |
| production相当の認証後CSP | BLOCKED | 実Redis / 信頼proxyと検証用accountを用意。dashboard、reservationsと作成 / 更新、daily report、manager/dashboardをfull-enforceのproduction buildで検証 |
| Preview受入 | USER_CONFIRMED | 2026-09-06、ユーザーがPreview確認とmergeを依頼。CIの自動E2E、実Redisや配備先DB設定の検証とは区別する |
| 配備先DB / PostgREST設定 | BLOCKED | migration / 生成型 / 権限 / aggregate有効設定を照合。PR-D migrationは承認済み対象で適用・検証してからアプリ展開。CIのreplay成功を配備先適用へ読み替えない |
| backup restore / RPO / RTO | BLOCKED | 承認されたbackupと隔離復元先。Storage / 鍵 / Auth設定を含め復元し、会社分離、件数・金額、RPO / RTOを測定 |
| LINE / email実通知 | BLOCKED | 承認されたtest宛先 / provider / workerでoutbox保持、停止・再開、再試行、重複、受信を確認。provider failureとenqueue failureを区別 |
| Stripe test environment | BLOCKED | test契約 / 価格 / webhook、数量変更・並行操作の証跡。実課金は行わない |
| monitoring alert delivery | BLOCKED | client / server DSN、release / source map、alert設定、担当通知先と受信event ID・時刻を確認 |
| production configuration / 運用準備 | BLOCKED | 本番設定・契約数量・通知範囲・復旧目標・担当体制・手順・出荷承認を確定。branch protectionは別途明示承認後に設定し、required checksがmergeを拒否することを確認 |

## D. 運用開始前に残るリスク

- ユーザーPreview確認後、A〜Eを依存順にmainへ統合した。Eの全コード組合せCIは成功し、PR-C / Dの保存成功・競合409・通知待機の順序も回帰と独立監査で確認済み。Fの文書更新とmerge後main CIはPR履歴・GitHub checksを参照し、組合せbranchのCIとは区別する。
- 日報 / Revenueの複数ページ取得は同一transactionのsnapshotではない。取得中の過去データ編集まで厳密な同時点整合性を保証しない。managerの50院countはコード上200 HEAD要求だが、実測前のRPC化・性能PASSは行わない。
- PR-CのCASはAPIの読取から保存までの競合を対象とする。画面を長時間開いた編集開始時点まで遡ったversion管理や、全予約経路の直列化は保証しない。
- PR-Dの最小境界では予約commitと通知handoffは別transactionであり、その間のprocess停止は残る。lease / provider冪等性も無期限のexactly-onceを保証しない。曖昧な配送を照合する運用と、実worker停止・復帰試験が必要である。
- F-20のgeneric payload未検証は限定した残リスクとして記録する。型の広範囲再設計を今回の完了条件へ追加しない。
- 既存 [Core100 release result](core100-release-result.md) のsharp条件付き実行時リスク、実Redis、配備設定、容量・復元・実通知・監視の未確認gateは継続する。新しいコード修正によって免除しない。
- mainのbranch protection / rulesetは未適用。[推奨設定](post-core100-branch-protection.md)の存在は保護が有効な証拠ではない。repository settings、本番DB / Auth、有料設定は変更していない。

## E. Release判定

| 領域 | 判定 | 根拠・完了条件 |
| --- | --- | --- |
| Code readiness | IMPLEMENTED / A〜E MERGED | 各更新headと全コードを含むEのCI8 jobs成功、独立監査2名PASS、Previewはユーザー確認済み。コード統合mainは `1d95419e`。Fの文書統合状態とmerge後main CIは本PR履歴・GitHub checksを参照 |
| Data correctness | PARTIALLY VERIFIED | 患者PATCH・日報 / Revenue・予約保存 / CAS・通知境界は各PRと全コード組合せのCIで確認。最新DB 21 files / 858 tests PASS、ユーザーPreview確認済み。配備先DB・実環境の検証は未完了 |
| Security | PARTIALLY VERIFIED | 基準mainとPR-A〜EのSecurity / Database Contractは成功。Eのproduction CSPブラウザgateはCI Build内でも成功。実認証後CSP、実Redis / proxy、配備設定確認が残る |
| Capacity | BLOCKED | 10社100院大規模試験、200 / 400 VUとDB資源実測は未実行 |
| Recovery | BLOCKED | backup restoreとRPO / RTO未実測 |
| Notifications | BLOCKED | PR-Dのコード・DB / CI検証範囲は進捗表を参照。実LINE / email配送・worker停止復帰・受信確認と配備先migration適用は未完了 |
| Production configuration | BLOCKED | 配備先migration / PostgREST / Auth / Redis / Stripe test / 公開設定の一致未検証。本番・有料設定変更は未実施 |
| Operational readiness | BLOCKED | alert受信・復旧 / 配送照合の担当手順・branch protection・出荷承認が未完了 |

コード修正の完了、容量検証の完了、運用準備の完了は別々に更新する。現時点で「10社100院運用可能」「製品版出荷可能」とは判定しない。

DoD対応: [DoD-v0.1](DoD-v0.1.md)のDOD-06 / 07（E2E）、DOD-08 / 09（認可・clinic境界）、DOD-10 / 11（build / Jest）、DB変更時のDOD-02 / 04 / 12（replay / drift / 生成型）。歴史的PASSを今回の証拠へ流用せず、[Change DoD](../quality/change-dod-v1.0.md)、[Pilot Release Gate](../releases/pilot-release-gate-v1.0.md)、[Commercial Release Qualification](../releases/commercial-release-qualification-v1.0.md)の出荷判定と照合する。

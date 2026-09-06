# core-100 実装・検証結果

判定: **NO_GO / 出荷未判定**。コード変更とローカル検証、100院容量、運用準備を混同しない。

- current main SHA（2026-09-06 JST読取確認）: `c028573d089cb6085ab3e29121fa9fe4d2f923c0`。[PR #116](https://github.com/IFs1991/seikotsuin_no_saas/pull/116)は2026-09-06 07:36 JSTにmerge済み。
- mainの[CI run 33996399702](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/33996399702): **8 jobs PASS**。Quality Checks / Build / Database Contract / Security Tests / Supabase Types Contract / Fixture Preflight (Static) / Full Jest Regression / App E2E (Local Supabase + Chromium)。
- Full Jest: **444 suites passed / 3733 tests passed / 2既存skipped**。CI E2E: **9 passed / 3 flaky（retry成功）/ 1既存skipped**。skipとretryは初回成功に算入しない。
- local E2E: 実施未完了。CIの使い捨てSupabaseでのE2E成功と区別する。Previewはlogin表示・未認証redirectを確認済み、認証後業務操作は検証用account未提供で **BLOCKED**。
- 過去のlocal検証対象は `806a5afab8e976a48cf2ecb771a1bc277bb53500` + 当時の作業ツリー、実装commitは `7dca4a530a0308f5b5baf55caac579c9b140a794`。下記と85ファイルのハッシュはその時点の履歴として保持し、最新mainのハッシュや新規修正のCIへ読み替えない。
- コード: **IMPLEMENTED**。TASK-01/02A/02B/03/04/05/06。TASK-07は提供範囲・既存契約影響の確定待ち **BLOCKED**。
- 容量: **BLOCKED**。大規模データ投入、200/400VU、実Redis、DB照合の実測は未実行。
- 運用: **BLOCKED**。復元、実通知受信、本番設定、branch protection/required checks、出荷承認は未完了。
- 詳細: [実装差分](core100-release-changes.md)、[運用runbook](../operations/CORE100_RUNBOOK.md)、[機械可読結果](evidence/core100/result.json)。既存のTiramisuLPの読取不能/削除状態、入れ子worktree、先行未追跡文書は本タスクの変更に含めていない。

## Post-Core100追加修正の現在状態

Core100のmain実績と追加修正PRの証跡は分離する。A / B / Cは各CI8 jobs成功、独立read-only監査2名PASS。AはJest 444 suites / 3742 passed / 2 skipped・E2E 11 passed / 1 flaky / 1 skipped、Bは445 / 3748 / 2・E2E 11 / 1 flaky / 1 skipped、Cは445 / 3751 / 2・E2E 12 passed / 1 skipped。対象commitとCIへのリンクは [Post-Core100修正結果](post-core100-remediation-result.md) を正本とする。

E（PR #120、`4bb46947` / `cdf0e12c`）は[CI 34003531144](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34003531144)の8 jobsがSUCCESS。Jest 444 suites / 3734 passed / 2 skipped、Build内production CSPブラウザ1 passed、App E2E 11 passed / 1 flaky（retry成功）/ 1 skipped、独立read-only監査2名PASS。ローカルproduction build、loginからadmin loginへのReact操作・reloadなし遷移のブラウザ1件、Jest 9 suites / 116 tests、型、lint（0 errors / 129 warnings）、source inventoryも成功した。

Dは `61de7312`でCの予約保存 / CASと通知handoffを統合し、競合解消後の17 suites / 229 tests、型・lint・inventory、独立read-only監査2名PASS。PR #121はC #119をbaseにした通知差分であり、CIの失敗履歴・最新結果は [Post-Core100修正結果](post-core100-remediation-result.md) のD行を参照する。Fは初版 `3fd6acd`、文書最終版は本PR HEAD。4文書の独立read-only監査2名PASS、CI結果は本PR checksを参照する。A〜Fはmain未統合であり、冒頭のcurrent main SHAは変わっていない。

修正前のmiddleware入口未登録とnonce / style / Trusted Types不整合は、EでRED再現後に修正した。認証後dashboard / reservations / daily report / managerのproduction相当CSPは実Redis・信頼proxy不足でBLOCKED。Core100業務E2E、production login局所試験、Preview固有の認証後業務受入を同じPASSとして扱わない。

## 実行した検証

以下はCore100実装中のlocal履歴。最新mainのCIは冒頭に別記した。後日同じコマンドが通る保証ではない。

| コマンド / 条件 | 結果・範囲 |
| --- | --- |
| `npm run type-check` / `type-check:commercial` / `lint:commercial` | PASS。入れ子worktreeの混入を除いた本アプリを検査 |
| `npm run lint:ci` | PASS、0 errors / 129 warnings。警告上限を緩めていない |
| `npm run test:release-tooling` | PASS、39 tests。Redis実機や大規模DBの検証ではない |
| Next15.5.21更新後の最終focused Jest | PASS、22 suites / 183 tests。認証・予約・集計・課金・監視・E2E接続先ガードをUTC/CI環境で検査 |
| TASK-01の実認証入口・middleware・guard関連 | 6 suites / 72 tests PASS（LuaはRedis mock） |
| TASK-02B予約API・pagination・履歴 | 5 suites / 65 tests PASS。UTC時刻回帰は追加で3 suites / 37 tests PASS |
| 設定・課金・manager・招待・API権限focused | 7 suites / 40 tests PASS。招待はCIと同じ `E2E_INVITE_MODE=disabled` |
| Sentry・health・公開DSN初期化 | 5 suites / 20 tests PASS。さらに日報503と期限付きflush追加後3 suites / 13 tests PASS |
| Core100 E2E target safety | 1 suite / 2 tests PASS。実効Playwright URLがremoteならseed/login前に拒否 |
| `npm run test -- --ci --testPathIgnorePatterns e2e red-contracts` | 初回 FAIL: 410 suites PASS / 3 FAIL、3488 tests PASS / 4 FAIL / 2既存skip。原因と再検証は下記 |
| `npm run security:verify-mutating-routes` | PASS、121 mutation / 9 side-effect GET。認可policyは変更していない |
| `npm run commercial:verify:migrations` | PASS、50 frozen / 10 appended。migration適用はしていない |
| `npm run scan:secrets` / `commercial:inventory:source:check` | PASS。新規参照を理由付き登録、生成台帳更新 |
| `npm run mobile-uiux:check-production-assets` | PASS。専用mobile API/生成assetは変更なし |
| `E2E_SKIP_DB_CHECK=1`で `npm run e2e:validate-fixtures` | staticのみPASS。DB検証のskipはDB PASSではない |
| `npm run release:seed -- --config scripts/release/core100.example.json` | offline dry-run PASS。投入0件 |
| `npm run release:load:plan -- --config scripts/release/core100.example.json` | offline plan PASS。負荷リクエスト0件 |
| `node scripts/release/preflight.mjs` | BLOCKED。process設定なしで必須キー/flags/proxy不足を列挙。秘密値非表示 |
| `npm run build` | Next15.5.21でPASS。pilot OFF / billing ON、localhost接続先・架空buildキー、Sentry送信/アップロード無効のprocess環境。配備済み公開flagsの確認ではない |
| `mutating-route-inventory.test.ts`最終再実行 | PASS、4 tests。policy本体125 testsも再実行PASS。台帳の変更後driftを解消 |

初回全体Jestの失敗分類: 招待2件はローカル.envのE2E送信skipがunitへ混入したもの（CI既存設定で再実行PASS）。policy件数1件は旧117を最新の121へ修正。ルート台帳1件はGET追加による行番号と検証検出情報のdriftで再生成した。途中の2-suite再実行は監視の追加中に台帳を比較したため1件FAIL/128件PASSとなった。変更確定後の再検証を記録し、全体Jestを「最終版全件PASS」とは表記しない。ファイルパス誤指定の回はPASS数へ含めていない。

DB/Auth/billingの新しい条件はREDを先に確認。例えば本部aggregate失敗2件、予約pagination切断、3実認証入口、JST保存/翌日終了、browser publicDSN、日報503/flushの失敗を再現してから修正した。read-only独立監査は2名以上で実施し、実装者自身の確認だけでPASSにしていない。指摘された時刻ずれ、マイクロ秒順序、価格条件、browser init、API監視、transport待ち、実効E2E URL、容量の誤PASSを修正し再監査した。

容量runnerの最終API照合では、managerの患者閲覧が禁止されている実装に対し、試験用APIが誤って200を返していた点も修正した。mockを実権限に合わせてRED403を確認し、会社境界・取消後の拒否は通常閲覧できる既知予約IDで検証するよう変更。患者403は独立した役職制限の確認に分け、取消の証拠へ流用しない。修正後も39 tooling tests PASS。

## 未実行・BLOCKEDと必要条件

| 項目 | 解除に必要な最小条件 |
| --- | --- |
| 実Redis/Auth集中 | 承認されたRedis REST/信頼proxy環境で単一IPとaccount双方の閾値・原子性・TTL・復帰を確認。Supabase Auth側制限も確認 |
| 本部aggregate | 対象PostgRESTでaggregate有効設定を確認。無効なら正しく500になるが業務受入は不合格。設定変更は未実施 |
| 配備環境のDB一致 | CIのreplay/pgTAP/生成型/GoTrue gateは基準mainでPASS。配備先のmigration・設定一致は未検証。既存local DBに対するreset/applyは未実施 |
| Preview認証後E2E | CIでは使い捨てlocal Supabaseで実ログイン・患者・予約・日報・本部・manager・他社scopeを実行済み。Preview固有の認証後業務QAは検証accountが必要 |
| Stripe test mode | 対象test環境の契約/価格/webhookを供給し、既存状態機械・数量並行操作を実サービスで確認。実課金禁止 |
| 容量A/B | 専用ターゲット、外部送信遮断、app/DBプラン・region・上限・100院IP構成を確定して標準seed/load/verify。CPU/接続/ロック/転送量等の外部計測も保存 |
| 未払会社の通常session試験 | 主容量datasetの10社はactive。未払会社の別fixtureと期待402、通常負荷とは分けた実証を追加実行。unitの状態判定だけで実証済みにしない |
| Backup/restore | 承認済みbackupと隔離復元先。Storage/鍵/Auth設定を含め、復元後の会社分離・件数/金額・RPO/RTOを測定 |
| 監視 | client/serverのビルドDSN、alert設定、担当通知先で受信したイベントIDと時刻を確認 |
| 本番・リリース | 本番設定/契約数量、owner RPO/RTO、通知範囲、既存gate適用差分、branch protection、出荷承認 |

ローカルread-onlyで `max_rows=1000`、Auth `sign_in_sign_ups=30`、`token_refresh=150`、最新migration `20260820060700` を確認した。本番設定・本番性能の証明ではない。実Redis評価、本番操作、有料変更、reset/migration apply、実患者投入、通知送信、restoreは行っていない。

GitHub読取（2026-09-06 JST）: mainは上記SHA、CI33996399702はSUCCESS。古いCI33370878657のFAILは以前の基準beb0978に対する履歴。mainはprotected=false、rulesets=[]。推奨設定は [branch protection提案](post-core100-branch-protection.md) に分離し、repository settingsは変更していない。

## 運用開始に向けた判定

| 領域 | 判定・範囲 |
| --- | --- |
| Code readiness | Core100はmain統合・CI成功。追加A / B / C / Eは各CI8 jobsと独立監査2名PASS。C / D統合回帰・監査とF文書監査もPASS。Dの最終CIは[修正結果](post-core100-remediation-result.md)、FのCI結果は本PR checksを参照。A〜Fのmain統合・統合後Previewは未完了 |
| Data correctness | Core100回帰とA / B / Cの患者PATCH・日報集計・予約保存 / CAS回帰はPASS。C / D統合後の保存・通知境界もfocused回帰PASS。A〜F全体の業務受入・配備先DBの検証は未完了 |
| Security | 基準mainとA / B / C / EのSecurity / Database Contract PASS。Eのproduction CSPブラウザgateもCI Build内でPASS、実認証後CSP・実Redis・配備済み設定は未検証 |
| Capacity | BLOCKED。10社100院大規模データ・200/400VU・実Redis未実測 |
| Recovery | BLOCKED。backup restoreとRPO/RTO未実測 |
| Notifications | NOT VERIFIED。LINE/email実通知とprovider障害時の実環境動作未確認 |
| Production configuration | BLOCKED。本番設定、PostgREST aggregate有効化、Stripe test environment未検証 |
| Operational readiness | BLOCKED。monitoring alert delivery・担当体制・承認未完了 |

この文書更新は出荷判定の引き上げではない。本番DB・Auth・有料設定・branch protectionの変更は実施していない。

## 依存脆弱性

ユーザー許可後の `npm audit --omit=dev --json` は9 packages（High8/Moderate1、脆弱性の個別件数ではない）を報告。公開Server Actionsを使うNext15.5.19のDoSは到達可能と判定し、公式修正版15.5.21へ限定更新した。実攻撃の再現はしていない。[Next公式勧告](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj)。

残る分類:

- sharp0.34.5: **条件付き実行時リスク**。画像最適化と広いSupabase公開storage許可があり、自前ホスティングでは未信頼画像を処理し得る。実ホスティング方式と0.35以上への対応可否を確認するまで出荷blocker。今回、推移依存を互換範囲外へ強制更新していない。[sharp公式勧告](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj)。
- brace-expansion/browserslist/fast-uri/nanoid/PostCSS: Sentry bundler/Webpack/CSS処理の推移依存。アプリから未信頼入力を渡す公開経路は確認していない。
- DOMPurify: インストールされているがアプリの利用/該当hookを確認できない。undiciはJest利用を確認、jsdom経由にも存在するためdevだけとは断定しない。

Next更新後の再照会も9 packages（High8/Moderate1）だが、Nextの `via` はPostCSS/sharpの推移依存だけになり、直接のServer Actions勧告は消えた。更新後lockの独立監査ではpackage pathの追加/削除0、Next/env/SWCと既存fseventsのdevメタデータだけの変更を確認した。warning件数を消す全依存更新は行っていない。最終ビルド/対象回帰の結果は `evidence/core100/result.json` に集約する。過去PR-11 benchmark FAIL、未確認の運用gateは免除していない。

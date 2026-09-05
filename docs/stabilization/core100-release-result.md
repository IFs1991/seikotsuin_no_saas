# core-100 実装・検証結果

判定: **NO_GO / 出荷未判定**。コード変更とローカル検証、100院容量、運用準備を混同しない。

- 検証対象: `806a5afab8e976a48cf2ecb771a1bc277bb53500` + 検証時の作業ツリーの変更（検証時は未commit、未push、未deploy）。Windows / PowerShell / Node24.19.0 / npm11.7.0、2026-09-05〜06 JST。
- 実装コミット: `7dca4a530a0308f5b5baf55caac579c9b140a794`（`codex/line-crm-data-foundation`）。commit前に85ファイルのSHA256が検証記録と一致することを確認した。以降は文書のcommit情報のみ更新。新しいcommitに対するCI成功・実環境検証を意味しない。
- コード: **IMPLEMENTED**。TASK-01/02A/02B/03/04/05/06。TASK-07は提供範囲・既存契約影響の確定待ち **BLOCKED**。
- 容量: **BLOCKED**。大規模データ投入、200/400VU、実Redis、DB照合の実測は未実行。
- 運用: **BLOCKED**。復元、実通知受信、本番設定、branch protection/required checks、出荷承認は未完了。
- 詳細: [実装差分](core100-release-changes.md)、[運用runbook](../operations/CORE100_RUNBOOK.md)、[機械可読結果](evidence/core100/result.json)。既存のTiramisuLPの読取不能/削除状態、入れ子worktree、先行未追跡文書は本タスクの変更に含めていない。

## 実行した検証

以下はすべてlocal。後日同じコマンドが通る保証やCI成功の代用ではない。

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
| DB replay/pgTAP/生成型/招待競合/GoTrue | 使い捨てlocal/専用stagingと実行承認。既存CIのコマンドを省略せず実行。local DBに起動済みstackがあることは実行承認ではない |
| 実E2E | 承認済みfixture seedと使い捨て環境。実ログイン→患者→予約→日報→本部、manager担当院、他社scopeを実行 |
| Stripe test mode | 対象test環境の契約/価格/webhookを供給し、既存状態機械・数量並行操作を実サービスで確認。実課金禁止 |
| 容量A/B | 専用ターゲット、外部送信遮断、app/DBプラン・region・上限・100院IP構成を確定して標準seed/load/verify。CPU/接続/ロック/転送量等の外部計測も保存 |
| 未払会社の通常session試験 | 主容量datasetの10社はactive。未払会社の別fixtureと期待402、通常負荷とは分けた実証を追加実行。unitの状態判定だけで実証済みにしない |
| Backup/restore | 承認済みbackupと隔離復元先。Storage/鍵/Auth設定を含め、復元後の会社分離・件数/金額・RPO/RTOを測定 |
| 監視 | client/serverのビルドDSN、alert設定、担当通知先で受信したイベントIDと時刻を確認 |
| 本番・リリース | 本番設定/契約数量、owner RPO/RTO、通知範囲、既存gate適用差分、branch protection、出荷承認 |

ローカルread-onlyで `max_rows=1000`、Auth `sign_in_sign_ups=30`、`token_refresh=150`、最新migration `20260820060700` を確認した。本番設定・本番性能の証明ではない。実Redis評価、本番操作、有料変更、reset/migration apply、実患者投入、通知送信、restoreは行っていない。

GitHub読取: 最新確認時の[CI run33370878657](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/33370878657)は基準beb0978のFAIL。今回の未commit変更のCIは存在しない。`main` protection取得は404 `Branch not protected`。設定は変更していない。

## 依存脆弱性

ユーザー許可後の `npm audit --omit=dev --json` は9 packages（High8/Moderate1、脆弱性の個別件数ではない）を報告。公開Server Actionsを使うNext15.5.19のDoSは到達可能と判定し、公式修正版15.5.21へ限定更新した。実攻撃の再現はしていない。[Next公式勧告](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj)。

残る分類:

- sharp0.34.5: **条件付き実行時リスク**。画像最適化と広いSupabase公開storage許可があり、自前ホスティングでは未信頼画像を処理し得る。実ホスティング方式と0.35以上への対応可否を確認するまで出荷blocker。今回、推移依存を互換範囲外へ強制更新していない。[sharp公式勧告](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj)。
- brace-expansion/browserslist/fast-uri/nanoid/PostCSS: Sentry bundler/Webpack/CSS処理の推移依存。アプリから未信頼入力を渡す公開経路は確認していない。
- DOMPurify: インストールされているがアプリの利用/該当hookを確認できない。undiciはJest利用を確認、jsdom経由にも存在するためdevだけとは断定しない。

Next更新後の再照会も9 packages（High8/Moderate1）だが、Nextの `via` はPostCSS/sharpの推移依存だけになり、直接のServer Actions勧告は消えた。更新後lockの独立監査ではpackage pathの追加/削除0、Next/env/SWCと既存fseventsのdevメタデータだけの変更を確認した。warning件数を消す全依存更新は行っていない。最終ビルド/対象回帰の結果は `evidence/core100/result.json` に集約する。過去PR-11 benchmark FAIL、未確認の運用gateは免除していない。

# Audit v2 実行台帳

更新日: 2026-09-09 (JST)。対象: `IFs1991/seikotsuin_no_saas`。

## 固定した開始点・入力

- 開始HEAD: `2f1434e0ffa410e97672ea8956e65231843ff250`。
- 開始branch: `codex/line-crm-data-foundation`。今回branch: `codex/audit-v2-u01`。
- 読取可能なローカル `origin/main`: `4f7794402400790afffb0c41db5538c9f97884a3`。開始HEADより64 commits先。fetch/push/PR/CI起動/merge/deployは未実施。
- ユーザー指定: **開始HEADを維持し、未取り込みの既存修正は別途記録する**。監査基準へのcheckout/resetやmainの取り込みは行わない。
- 開始時の追跡済みソース変更・staged変更なし。`TiramisuLP/` はアクセス拒否でgit statusに17件のD表示（実削除とは判断しない）。既存の未追跡 `.w/`、別worktree、設計資料、ZIPを保持する。今回分だけ個別stageする。
- Windows / PowerShell / Node `v24.19.0` / npm `11.7.0`。対象アプリのlockは `package-lock.json`。別アプリ/別worktreeのnpm lockは混在として扱わない。依存更新なし。

読了した実パス（次のパスは全て `C:/Users/seekf/Desktop/seikotsuin_management_saas/` 基準）:

| 入力 | 実パス | 文書ID / SHA256 |
| --- | --- | --- |
| 実行指示全文 | `docs/stabilization/audit-v2-originals/codex_execution_prompt_v2.md` | 同梱ZIPから無変更抽出、全10節読了 |
| 監査全文 (905行) | `docs/stabilization/audit-v2-originals/tiramisu_os_technical_audit_2026-09-06_v2.md` | `TIRAMISU-OS-AUDIT-V2-4f77944` / `50e24ab5790851f6b3ddbc92e43b5e1553d51f56aaf46a3ddfe462d494801cfe` |
| backlog全文 (439行) | `docs/stabilization/audit-v2-originals/remediation_backlog.md` | `TIRAMISU-OS-BACKLOG-V2-4f77944` / `fb7146befa1f21da72a305774d718388a7717f3cbf944a0a5c51e55c17dacd4d` |

ZIP: `docs/stabilization/tiramisu_os_codex_execution_v2_2026-09-06.zip`。原本基準SHAは両方 `4f7794402400790afffb0c41db5538c9f97884a3`。抽出ファイルのSHA256は `input_manifest.json` と一致。原本は実行順序・受入条件の根拠であり、過去PASSを今回の証拠には使わない。

## 全IDの対応

以下のF/N/Vはすべて **AUDIT-V2** のID。repo別監査のF-番号とは別。R1=F06、R2=F09。
「原本CODE_FIXED・base未取込」は退行でも今回の修正済みでもない。

| ID | 原本状態 | 開始HEADの再確認 / 実行状態 | 単位・証拠・残件 / 次の最小作業 |
| --- | --- | --- | --- |
| AUDIT-V2:F01 | PARTIAL | base未取込あり | `src/middleware.ts` とproduction CSP試験がHEADにない。rootのnonce request伝播も監査基準との差分あり。既存修正の取り込みは別途。ENV-02未実施 |
| AUDIT-V2:F02 | CODE_FIXED | 対象ルーティング維持 | `getPathRateLimit` はlogin画面GET/HEADを除外。実認証Luaを変更しない。U01関連回帰 / ENV-01 |
| AUDIT-V2:F03 | OPEN | 原因残存、U01着手 | `RateLimiter.checkRateLimit/handleEscalation/getRateLimitStats` にobjectへのJSON.parse。SDK object/旧文字列/破損状態のREDを追加 |
| AUDIT-V2:F04 | OPEN | 原因残存、U01着手 | `applyRateLimits` とroot middlewareが許可NextResponseで早期return。許可＋headers/拒否を分離 |
| AUDIT-V2:F05 | CODE_FIXED | base未取込あり | revenue API/hook/UIが監査基準と異なる。既存Post-Core100修正を再実装しない。U02で影響範囲を記録 |
| AUDIT-V2:F06 (R1) | OPEN | 未深掘り | U02、role/codeの期間合計API・実UI回帰 |
| AUDIT-V2:F07 | CODE_FIXED | base未取込あり | `daily-reports/read-model.ts` が監査基準と異なる。期間summary分離の既存変更は別途取り込み対象 / ENV-01 |
| AUDIT-V2:F08 | CODE_FIXED | base未取込あり | revenue/予約API・UIに既存Post-Core100との差分。U02対象のページング前提を確認 / ENV-04 |
| AUDIT-V2:F09 (R2) | OPEN | 未深掘り | U03、実hookの要求世代と全状態更新 |
| AUDIT-V2:F10 | OPEN | 未深掘り | U04、sanitize呼出元と出力文脈、round-trip |
| AUDIT-V2:F11 | OPEN | 未深掘り | U05、web/確認済みLINE照合・仮患者方式 |
| AUDIT-V2:F12 | PARTIAL | base未取込あり | 通知/予約APIが監査基準と異なる。既存await/claim/outbox変更の取り込みと、追加保証を区別。U07/ENV-03 |
| AUDIT-V2:F13 | CODE_FIXED | base未取込 | `reservations/mutation-result.ts` が開始HEADにない。既存修正の取り込みは別途 |
| AUDIT-V2:F14 | PARTIAL | base未取込あり | reservation route/schemaが監査基準と異なる。既存server CASと追加expected version要求を分離。U08 |
| AUDIT-V2:F15 | OPEN | 未深掘り | U06、既存削除権限と実clinicのscope/billing |
| AUDIT-V2:F16 | VERIFY_FIRST | 計測未実施 | PERF-01、最終scope確認を維持。F10と同時に認可再解決を削除しない |
| AUDIT-V2:F17 | CONDITIONAL | baseにchat workerなし、提供範囲未確認 | U09、既存LINEチャット実装は未取込。機能対象外/PASSにしない |
| AUDIT-V2:F18 | VERIFY_FIRST | 未深掘り | VERIFY-02、internal replay/resyncの安全な復旧確認 |
| AUDIT-V2:F19 | VERIFY_FIRST | 仕様確認待ち | VERIFY-03、catalog/正当な任意調整の分離 |
| AUDIT-V2:F20 | VERIFY_FIRST | 未深掘り | U05/VERIFY-04へ集約。患者補償と他予約参照 |
| AUDIT-V2:F21 | CODE_FIXED | 新SHAでのCI未確認 | 既存image retry/生成型gateを維持。過去CIは転用しない |
| AUDIT-V2:F22 | DEFERRED | 保留 | DEFER-01、今回を妨げるinventory不足だけ補完 |
| AUDIT-V2:F23 | ENV_PENDING | BLOCKED | ENV-01、専用対象・migration適用履歴・lock/サイズ証拠なし |
| AUDIT-V2:F24 | DEFERRED | 保留、未計測 | PERF-01/DEFER-01、全面API/hook刷新なし |
| AUDIT-V2:N01 | CODE_FIXED | base未取込あり | customers schema/testが監査基準と異なる。U04で省略値契約との関係を記録 |
| AUDIT-V2:N02 | CODE_FIXED | base未取込あり | email processor/provider/通知migrationが監査基準と異なる。U07/ENV-03 |
| AUDIT-V2:N03 | ENV_PENDING | BLOCKED | ENV-01/02、対象origin/project・実Redis/proxy・aggregate/build flags未確認 |
| AUDIT-V2:N04 | ENV_PENDING | BLOCKED | ENV-05、保護設定の実確認/変更未実施 |
| AUDIT-V2:V01 | VERIFY_FIRST | 未確認 | VERIFY-01、日報/明細正本とoverride |
| AUDIT-V2:V02 | VERIFY_FIRST | 未確認 | VERIFY-01、soft delete/履歴 |
| AUDIT-V2:V03 | VERIFY_FIRST | 未確認 | VERIFY-01、公開予約料金/指名料snapshot |
| AUDIT-V2:V04 | ENV_PENDING | BLOCKED | ENV-01、実Redis/proxyの専用対象・試験承認なし |
| AUDIT-V2:V05 | VERIFY_FIRST | 未確認 | VERIFY-05、現lockfile/公式勧告の到達性確認。依存追加/更新は別承認 |
| AUDIT-V2:V06 | VERIFY_FIRST | 未確認 | VERIFY-01、JST/日付/金額/精度 |
| AUDIT-V2:V07 | ENV_PENDING | BLOCKED | ENV-03/04/05、実通知・監視到達・容量・隔離復元の対象/承認なし |

## 実行環境・承認境界

- ローカルコード・テスト・文書・今回差分のみのcommitは許可範囲。push/PR/新CI/merge/deployは未承認・未実施。
- 起動済みlocalhost DBを使い捨てとみなさない。DB/Auth変更、外部Redis操作、通知、Stripe、seed/load/restoreを実行していない。
- U01のJestはRedis/認証/監視の通信境界をmockし、実効設定は合成値・外部送信遮断で実行する。mockの成功を実Redis/DB/RLS/配備先受入へ読み替えない。
- DoD対応: DOD-11 (Jest)、DOD-10 (型/lint/build)、DOD-06/07 (production browser、未実施は明記)、DOD-08/09 (scope/認証保護を維持)。現在の変更完了判定は `docs/quality/change-dod-v1.0.md`。出荷判定とは分離。

## PR-U01 実行記録（更新中）

base: 開始HEAD。対象: AUDIT-V2:F03/F04。DB/migration/依存変更なし。
RED/GREEN・関連回帰・独立レビュー・commitは実行後にここへ追記する。現時点で完了判定なし。

## 個別判定

Code: 作業中 / Data correctness: 未完了 / Security: 作業中、実環境未検証 /
Capacity: NOT_RUN / Recovery: NOT_RUN / Notifications: NOT_RUN /
Production configuration: NOT_RUN / Operational readiness: NOT_RUN。

次の最小作業: U01の本体回帰RED→最小修正→GREEN→関連品質gate→独立2段階レビュー。その後U02へ進む。

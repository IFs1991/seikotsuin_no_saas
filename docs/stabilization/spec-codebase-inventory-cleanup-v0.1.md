# spec: コードベース棚卸し解消計画 v0.1

- 作成日: 2026-07-03
- 対象ブランチ: `claude/saas-codebase-inventory-zwqt4y`（Wave単位で子ブランチ/PRに分割可）
- 目的: 棚卸し調査（2026-07-03実施）で判明した重複・レガシー・死蔵資産を解消し、SSOTを一本化する
- 前提: 最大6体のサブエージェント（Sonnet 5）による並列実行を想定したタスク分割

## 背景

棚卸し調査の結果、以下の問題が確認された。

1. **SQLスキーマの三重管理**: `src/database/` / `sql/` / `src/api/database/` が `supabase/migrations/`（SSOT）と併存
2. **ドキュメントの完全二重化**: ルート直下の歴史的レポート約48ファイルの多くが `docs/reports/` 等と重複
3. **無関係な別プロジェクトの同居**: `src/legacy/Reservation/`（独立Vite+React SPA）
4. **多世代仕様書の蓄積**: `docs/stabilization/` に100件超の旧版spec
5. **細かな重複・死蔵**: 重複スクリプト、examples コンポーネント、グループ外ルート、未使用依存疑い

フェーズ0.1.0-pilotの安定化方針に沿い、**ランタイムコードの挙動を変えない削除・移動のみ**を原則とする。

## 原則（全タスク共通）

- **削除前に参照チェック必須**: `Grep` でリポジトリ全体から対象パスへの import / require / 相対パス参照 / npm scripts / CI（`.github/workflows/`）/ tsconfig / jest.config / next.config の参照を確認。参照が残る場合は削除せず報告
- **削除はアーカイブ経由にしない**: git履歴が保全するため、原則 `git rm`。ただし「唯一の情報源になっている文書」は削除ではなく `docs/archive/` へ移動
- **1 Wave = 1 コミット以上、Conventional Commits**（`chore(cleanup): ...` / `docs: ...`）
- **検証ゲート**: 各Wave完了後に `npm run lint` / `npm run type-check` / `npm run build` / `npm run test:pr05:focused` がPASSすること。ランタイムコードに触れないWaveは lint + type-check のみで可
- 判断に迷うファイルは削除せず「保留リスト」として最終レポートに記載（fail-closed）

## タスク分割（サブエージェント最大6体）

### 並列実行プラン

| Wave | Agent | タスク | 依存 |
|------|-------|--------|------|
| 1 | A1 | T1: SQL三重管理の差分調査（読み取りのみ） | なし |
| 1 | A2 | T2: ルート直下ドキュメントの重複判定（読み取りのみ） | なし |
| 1 | A3 | T3: `src/legacy/` の参照調査と削除 | なし |
| 1 | A4 | T4: docs/stabilization 多世代specの世代整理案作成 | なし |
| 1 | A5 | T5: 小粒クリーンアップ（スクリプト重複・examples・logoutルート） | なし |
| 1 | A6 | T6: 依存関係調査（ioredis/@upstash/redis, ts-node, undici, aspect-ratio） | なし |
| 2 | A1 | T7: T1の結果に基づくSQL残骸の削除/参照資料化 | T1 |
| 2 | A2 | T8: T2の結果に基づくルート直下ファイルの削除/移動 | T2 |
| 2 | A4 | T9: T4の整理案に基づくアーカイブ移動 | T4承認 |
| 2 | 親 | T10: 検証ゲート実行・最終レポート・CLAUDE.md/README更新 | 全Wave |

Wave 1は全て独立しており6体同時起動可。Wave 2はWave 1の調査結果（およびT9はユーザー承認）を受けて実行する。

---

### T1: SQL三重管理の差分調査（Agent A1 / 読み取りのみ）

対象: `src/database/`（schemas 6ファイル+policies+seed_data+functions）、`sql/`（migrations/seeds/cleanup）、`src/api/database/`（schema.sql, rls-policies.sql, functions.sql, supabase-client.ts）

1. 各SQL群のテーブル・関数・ポリシー定義を抽出し、`supabase/migrations/`（squashed baseline + 後続39ファイル）に同等定義が存在するかを対照表にする
2. `src/api/database/supabase-client.ts` への import 参照を全検索（残っていれば `@/lib/supabase` への移行要否を判定）
3. `docs/database/DBスキーマ複線化_解消計画書.md` を読み、既存計画との整合を確認
4. 成果物: 対照表 + 「migrations未収載の定義（=消すと情報が失われるもの）」のリスト

**判定基準**: migrationsに同等定義があるSQLは削除可。未収載定義は `docs/database/` へ参照資料として移動。

### T2: ルート直下ドキュメントの重複判定（Agent A2 / 読み取りのみ）

対象: ルート直下の `.md` 約30ファイル（`README.md` / `AGENTS.md` / `CLAUDE.md` / `SECURITY.md` を除く全て）

1. 各ファイルについて `docs/` 配下の同名・類似ファイルと diff を取り、「完全一致」「docs側が新しい」「ルート側にしかない」に分類
2. `RLS_DEPLOYMENT_MANUAL.md` / `DEPLOYMENT_CHECKLIST.md` / `BACKEND_SETUP.md` 等、運用文書に見えるものは `docs/operations/` の現行文書と内容比較し、現役かを判定
3. 成果物: ファイルごとの処遇表（削除 / docs/archive/へ移動 / 保留）

### T3: src/legacy/ の削除（Agent A3）

1. `src/legacy/Reservation/` への参照を全検索（import、tsconfig paths、jest/eslint設定の除外指定、next.config、CI）
2. 参照が「lint/型チェック除外指定のみ」であることを確認後、`git rm -r src/legacy/` し、除外設定側の記述も除去
3. 検証: `npm run lint` / `npm run type-check` / `npm run build`
4. コミット: `chore(cleanup): remove legacy Reservation SPA (src/legacy)`

### T4: docs/stabilization 世代整理案（Agent A4 / 読み取りのみ）

1. `docs/stabilization/` 全ファイルを列挙し、同一トピックの多世代ファイル（`*-v0.1/v0.2/...`、日付違い）をグルーピング
2. 各グループの最新版を特定。CLAUDE.md/AGENTS.md/CIから参照されるファイル（`DoD-v0.1.md` 等）は現役として除外
3. 成果物: 「現役リスト」「`docs/stabilization/archive/` へ移動するリスト」の2表。**移動はユーザー承認後（T9）**

### T5: 小粒クリーンアップ（Agent A5）

1. `scripts/insurance-fees/validate-master.{mjs,ts}`: npm scripts が参照する側を残し、他方を削除
2. `src/components/examples/`: 全ファイルへの import 参照を検索。ゼロなら削除、あれば保留報告
3. `src/app/logout/page.tsx` / `src/app/admin/logout/page.tsx`: middleware の `PROTECTED_ROUTE_PREFIXES` との整合を確認し、挙動を変えない範囲で `(public)`/`(app)` グループへの移動可否を判定（**移動が挙動に影響する場合は現状維持で報告のみ**）
4. Windows用 `.ps1` 3本（`create_booking_design_worktrees.ps1` 等）: 参照確認の上、個人作業用と判定できれば削除
5. `src/lib/database/*.sql` 3ファイル: migrations収載状況を確認し、T1の対照表に追記依頼 or 収載済みなら削除
6. 検証: lint + type-check + build。コミット: `chore(cleanup): remove duplicate scripts and dead assets`

### T6: 依存関係調査（Agent A6 / 読み取りのみ→軽微削除）

1. `ioredis` と `@upstash/redis` の実利用箇所を全検索し、用途分離（例: rate-limiting=Upstash、他=ioredis）が意図的かを判定。統一提案のみ（本specでは統一実装しない）
2. `ts-node` / `undici` / `@tailwindcss/aspect-ratio` の利用箇所検索。**リポジトリ内で参照ゼロかつCI・scripts経由の間接利用もない**と確認できたもののみ `package.json` から削除
3. 検証: `npm install` 後に build + test:pr05:focused
4. コミット: `chore(deps): remove unused dependencies`（削除がある場合のみ）

### T7: SQL残骸の解消（Agent A1 / T1の結果待ち）

1. T1対照表に基づき、migrations収載済みのSQL群を `git rm`
2. 未収載定義は `docs/database/schema-reference/` へ移動し、冒頭に「参照資料・適用禁止・SSOTはsupabase/migrations」の注記を付す
3. `src/api/database/supabase-client.ts` は参照ゼロ確認後に削除
4. `src/database/README.md` は残し、移動先への案内に書き換え
5. コミット: `chore(cleanup): consolidate SQL sources into supabase/migrations SSOT`

### T8: ルート直下ドキュメント解消（Agent A2 / T2の結果待ち）

1. T2処遇表に基づき、完全重複は `git rm`、ルート側にしかない歴史的文書は `docs/archive/root-reports/` へ移動
2. `README.md` 等からの相対リンク切れがないか検索
3. コミット: `docs: deduplicate root-level historical reports into docs/`

### T9: stabilization アーカイブ移動（Agent A4 / **ユーザー承認必須**）

T4の2表をユーザーに提示し、承認された範囲のみ `docs/stabilization/archive/` へ `git mv`。
コミット: `docs: archive superseded stabilization specs`

### T10: 最終検証・レポート（親エージェント）

1. 全ゲート実行: `npm run lint` / `npm run type-check` / `npm run build` / `npm run scan:secrets` / `npm run test:pr05:focused` / `npm run e2e:validate-fixtures`
2. CLAUDE.md「ドキュメントマップ」「落とし穴」の記述と現状の整合を更新（`src/legacy/` 削除に伴う記述除去等）
3. 最終レポート: 削除/移動ファイル数、保留リスト、フォローアップ提案（RLSテスト増強、フィーチャーフラグ整理、Redisクライアント統一）を本spec末尾に追記

## スコープ外（本specでは実施しない）

- RLSテストの増強（別spec推奨: 医療系マルチテナントとして優先度高）
- 環境変数・フィーチャーフラグ（Billing 6個 / Mobile UIUX 8個）の整理
- Redisクライアントの統一実装
- `docs/` 配下全体（stabilization以外）の再編

## ロールバック

全変更は削除・移動のみでDBマイグレーションを含まないため、`git revert` で完全に復元可能。ロールバックSQLは不要。

## 完了条件（DoD）

- [ ] SQL定義の実行正本が `supabase/migrations/` の1系統のみになっている
- [ ] ルート直下の `.md` が README / AGENTS / CLAUDE / SECURITY（+承認された保留分）のみ
- [ ] `src/legacy/` が存在しない
- [ ] CIゲート5項目 + test:pr05:focused がPASS
- [ ] 保留リストと判断理由が最終レポートに記録されている

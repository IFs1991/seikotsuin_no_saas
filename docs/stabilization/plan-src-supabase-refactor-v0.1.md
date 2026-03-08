# src / supabase リファクタリング計画書 v0.1

- 作成日: 2026-03-05
- 最終更新: 2026-03-05（spec-schema-frontend-alignment-v0.2 完了後のベースライン固定）
- 対象: `src`, `supabase`
- 目的: 機能追加ではなく、安定化（Supabase/Docker/Playwright/RLS）に直結する構造整理
- 前提: `1 task = 1 PR`、非破壊、決定論的な変更

## 0. 現在のベースライン（2026-03-05 計測）

| 指標 | 結果 | 備考 |
|------|------|------|
| `tsc --noEmit` | 301 errors（44ファイル） | 大半は Supabase 生成型に未登録テーブル（`blocks`, `reservations`, `mfa_*`, `security_events` 等）の `never` 型起因。spec-v0.2 で回帰なし（変更前後同数） |
| `npm run build` | FAIL（lint: prettier `\r\n`） | 型エラーではなく CRLF 改行の prettier 違反が主因。実ビルドロジックのエラーではない |
| `jest --ci` | 21 suites failed / 80 passed / 3 skipped（929 tests, 70 failed） | 変更前 25 failed → 変更後 21 failed（+4 stabilization test suites 追加分で改善）。回帰なし |
| `supabase:types` | OK（正常生成） | `export type Json` で始まる正常な型ファイル |

### TS エラー内訳

| エラーコード | 件数 | 主因 |
|-------------|------|------|
| TS2339 | 181 | `.from('table')` が `never` 型 → プロパティアクセス不可 |
| TS2769 | 44 | `.insert()` / `.upsert()` に `never` 型不一致 |
| TS2345 | 42 | `.update()` 引数が `never` に代入不可 |
| TS18047 | 33 | null チェック漏れ |
| TS2698 | 1 | spread 型エラー（`server.ts`） |

**根本原因**: `src/types/supabase.ts`（自動生成）に `blocks`, `reservations`, `mfa_setup_sessions`, `user_mfa_settings`, `security_events` 等のテーブル定義が含まれていない。R-07（types 生成安定化）で解決予定。

### 失敗テストスイートの分類

| カテゴリ | 件数 | 原因 |
|---------|------|------|
| session-management | 4 | タイムアウト系（10s超） |
| security / failsafe | 2 | Supabase mock 不整合 |
| hooks (useNotifications, useAccessibleClinics, useSystemStatus) | 3 | モジュール未存在 |
| api (notifications, system-status, clinics-accessible, csp) | 4 | API mock 不整合 |
| integration (auth-flow, api-staging-data) | 2 | Supabase 接続 mock |
| rls (notifications-rls) | 1 | mock 不整合 |
| lib (audit-logger-types, supabase-guards) | 2 | 型テスト / mock 不整合 |
| api (multi-store-kpi) | 1 | タイムアウト |
| components (admin-settings) | 1 | DOM 期待値不一致 |
| pages (blocks) | 1 | createBlock mock 未呼出 |

## 1. ゴール

1. `src` と `supabase` の「正本（Source of Truth）」を明確化し、運用ミスを減らす。
2. 重複実装・未使用実装を段階的に整理し、変更コストを下げる。
3. `docs/stabilization/DoD-v0.1.md` の達成確度を上げる。

## 2. スコープ

### In Scope

- `src/legacy/Reservation` と `src/app/reservations` の重複整理
- Supabase クライアント実装の統一
- system settings 周辺フックの一本化
- SQL 参照先の整理（実行正本と参照資料の切り分け）
- `supabase/.temp` など管理対象外にすべきファイルの是正
- `supabase:types` の安定化

### Out of Scope

- 新機能開発
- 仕様変更を伴う DB スキーマ改修
- 仕様書なしの migration 変更

## 3. 根拠（ファイル + 設定/関数）

| 論点 | 根拠 | 影響 |
| --- | --- | --- |
| DB 正本が分散 | `supabase/config.toml` の `[db.migrations].schema_paths = []` (`supabase/config.toml`) と、SQL 群が `src/api/database/*.sql`, `src/database/**` にも存在 | 変更適用先の誤認、ドリフト |
| migration 実体が1本 | `supabase/migrations/00000000000001_squashed_baseline.sql` | 差分運用の見通しが悪い |
| 予約UIの二重実装 | `src/legacy/Reservation/components/AppointmentBlock.tsx` と `src/app/reservations/components/AppointmentBlock.tsx` が同一ハッシュ（他 `NotificationsModal.tsx`, `utils/time.ts` も同様） | 修正漏れ・重複修正 |
| フックの重複系統 | `useSystemSettings` (`src/hooks/useSystemSettings.ts`) と `useSystemSettingsV2` (`src/hooks/useSystemSettingsV2.ts`) が併存、`export { useSystemSettingsV2 as useSystemSettings }` あり | 参照先の曖昧化 |
| Supabase client 実装の分散 | `createSupabaseClient` 系 (`src/lib/supabase-browser.ts`), `createBrowserClient` 系 (`src/lib/supabase/client.ts`), server client (`src/lib/supabase/server.ts`) が併存 | 接続方式の不一致 |
| 未使用候補 | `src/api/database/supabase-client.ts`（`dbHelpers`, `subscribeToTable`）が参照されていない | 死蔵コード |
| 一時ファイルの追跡 | `supabase/.gitignore` に `.temp` 記載ありだが `supabase/.temp/*` が追跡済み | ノイズ差分 |
| 型生成の汚染リスク | `package.json` の `supabase:types` が直接リダイレクト（`> src/types/supabase.ts`） | DoD-12 失敗要因 |

## 4. DoD マッピング

- DOD-04: Local schema drift の可視化
- DOD-08: Tenant boundary + RLS の一貫性
- DOD-09: Tenant table access guard の一貫性
- DOD-10: Build/Type/Lint の再現性
- DOD-12: Supabase type generation の健全性

## 4.1 実装方針（部分TDD）

- 対象（TDD実施）: R-02, R-03, R-04, R-07, R-08
- 対象外（TDD不要）: R-01, R-05, R-06（Docs/運用整理中心）
- 進め方: `Red -> Green -> Refactor` を 1 変更単位で実施する
- 共通完了条件:
  - 追加/更新したテストが先に失敗する（Redの証跡をPR本文に記録）
  - 実装後に対象テストが成功する
  - `npm run type-check` / `npm run lint` / `npm run build` が成功する

## 5. 実行計画（1タスク = 1PR）

### 先行完了: spec-schema-frontend-alignment-v0.2（F-01〜F-04）

以下の4件はリファクタリング計画に先行して完了済み。テストで検証済み。

| ID | 内容 | 状態 | テスト |
|----|------|------|--------|
| F-01 | blocks/reservations snake_case 化 | 完了 | 15 tests pass |
| F-02 | MFA security_events payload 契約修正 | 完了 | 8 tests pass |
| F-03 | admin/tables 旧RPC依存排除 + 静的定義化 | 完了 | 12 tests pass |
| F-04 | daily_reports report_date 参照修正 | 完了 | 2 tests pass |

変更ファイル: `block-service.ts`, `reservation-service.ts`, `api/blocks/route.ts`, `mfa-manager.ts`, `backup-codes.ts`, `table-metadata.ts`, `table-schemas.ts`, `supabase-client.ts`
テストファイル: `src/__tests__/stabilization/F01〜F04-*.test.ts`

---

## R-01 正本定義の明文化（Docs only）

- 目的: DB実行正本を `supabase/migrations/**` に明確化。
- 変更対象:
  - `docs/stabilization/final-schema-inventory.md`
  - `docs/stabilization/migration-inventory-2026-03-02.md`
  - `docs/supabaseローカル計画.md`
  - `src/database/README.md`（参照資料としての位置づけを明記）
- 変更内容:
  - 「実行正本」「参照資料」「非推奨」を明記。
  - `src/api/database/*.sql` は適用手順から外し、用途を注釈化。
- 検証:
  - docs整合の目視レビュー
  - `rg -n "正のスキーマ|source of truth|schema.sql" docs src/database/README.md`
- DoD: DOD-04, DOD-08
- ロールバック: 当該 docs 変更を revert。

## R-02 予約 Legacy 重複の隔離

- 目的: `src/legacy/Reservation` と現行実装の二重管理を解消。
- 変更対象:
  - `src/legacy/Reservation/**`
  - `src/app/reservations/**`
  - 必要なら `docs/stabilization/spec-reservations-*.md`
- 変更内容:
  - 参照ゼロを再確認後、同一内容ファイルを legacy から段階削除。
  - legacy 残置が必要な場合は `README` で「参照禁止」を明記。
- TDD:
  - Red: 予約画面の主要表示/操作の回帰テスト（既存Jest or Playwright）を先に追加し、legacy依存のまま失敗を確認。
  - Green: 参照を現行実装に寄せ、テストを通す最小変更のみ適用。
  - Refactor: 不要import/重複ファイルを整理し、挙動不変を維持。
- 検証:
  - `rg -n "legacy/Reservation|src/legacy/Reservation" src`
  - `npm run type-check`
  - `npm run lint`
  - `npm run build`
  - `npm run test:e2e:pw -- --grep reservations`（実行環境が整っている場合の最小スモーク）
- DoD: DOD-09, DOD-10
- ロールバック: 削除ファイルを復元。

## R-03 Supabase Client 実装の統一

- 優先度: **高** — TS エラー 301件中大半が Supabase 型 `never` 起因。R-07 と合わせて解消する主要経路。
- 目的: client 生成経路を用途別に1系統へ整理。
- 変更対象:
  - `src/lib/supabase/client.ts`（browser）
  - `src/lib/supabase/server.ts`（server）
  - `src/lib/supabase-browser.ts`（互換レイヤー化または廃止）
  - `src/api/database/supabase-client.ts`（未使用確認後削除）
- 変更内容:
  - 新規参照を `src/lib/supabase/{client,server}.ts` に統一。
  - 未使用 export を削除し import を置換。
  - `src` 以外（`scripts`, `test`, `docs`）の参照有無を確認してから削除する。
- TDD:
  - Red: client factory の呼び出し契約（browser/server）を検証するユニットテストを追加し、現状差異で失敗を確認。
  - Green: client 経路を一本化してテストを成功させる。
  - Refactor: 互換レイヤーを最小化し、未使用APIを段階削除。
- 検証:
  - `rg -n "supabase-browser|api/database/supabase-client|createBrowserClient|createClient\\(" src scripts test docs`
  - `npm run type-check`
  - `npm run test -- --ci --testPathIgnorePatterns=e2e`
  - `npm run build`
- DoD: DOD-09, DOD-10
- ロールバック: 互換 shim を一時復活。

## R-04 System Settings フックの一本化

- 目的: `useSystemSettings` 系の責務を明確化。
- 変更対象:
  - `src/hooks/useSystemSettings.ts`
  - `src/hooks/useSystemSettingsV2.ts`
  - `src/hooks/useAdminMaster.ts`
  - 呼び出し側 hooks/components
- 変更内容:
  - 正式API名を1つに決定（推奨: `useSystemSettings`）。
  - 旧実装は thin wrapper に縮退、段階的廃止注記を追加。
- TDD:
  - Red: filter更新・CRUD・error state の既存期待値をテスト化し、統合前に失敗を確認。
  - Green: 正式APIへ統一して既存期待値を満たす。
  - Refactor: wrapper化/非推奨注記で移行コストを下げる。
- 検証:
  - `rg -n "useSystemSettingsV2|useSystemSettings" src`
  - `npm run type-check`
  - `npm run lint`
  - `npm run build`
- DoD: DOD-10
- ロールバック: wrapper 経由で旧実装を復帰。

## R-05 SQL 配置の運用ルール固定（Docs + ガード）

- 目的: SQL の置き場混在を運用で固定し、誤適用を防止。
- 変更対象:
  - `docs/stabilization/DoD-v0.1.md`（必要なら注釈）
  - `docs/SETUP_VERCEL_SUPABASE.md`
  - `docs/stabilization/spec-tenant-table-api-guard-v0.1.md`
- 変更内容:
  - `supabase/migrations/**` 以外は「直接適用禁止」を明記。
  - `src/api/database/*.sql` は reference-only として注釈。
- 検証:
  - `rg -n "手動実行|直接適用|migrations" docs`
- DoD: DOD-04, DOD-08
- ロールバック: ドキュメント記述を revert。

## R-06 `supabase/.temp` 追跡解除

- 目的: ローカル状態ファイルの差分ノイズを解消。
- 変更対象:
  - `supabase/.temp/*`（追跡解除）
  - `supabase/.gitignore`（必要時のみ追記）
- 変更内容:
  - `.gitignore` に従い `.temp` を追跡対象から除外。
- 検証:
  - `git ls-files supabase/.temp/*`
  - `git status --short`
- DoD: DOD-12（周辺整備）
- ロールバック: 必要ファイルのみ再追跡。

## R-07 `supabase:types` 生成の安定化

- 優先度: **最高** — TS エラー 301件の根本原因。`blocks`, `reservations`, `mfa_setup_sessions`, `user_mfa_settings`, `security_events` 等のテーブルが生成型に含まれていない。ローカル Supabase にこれらのテーブルが存在する状態で再生成すれば大幅に解消する見込み。
- 目的: `src/types/supabase.ts` へのログ混入を防止 + 全テーブル網羅。
- 変更対象:
  - `package.json` (`supabase:types`)
  - `scripts/`（必要なら生成ラッパー追加）
- 変更内容:
  - 型定義行のみ出力するラッパーへ置換。
  - 生成後検証（先頭が `export type Json`）を標準化。
- TDD:
  - Red: 生成物の先頭行/不要ログ混入を検出する検証テストを先に追加し失敗を確認。
  - Green: 生成ラッパー導入で検証テストを成功させる。
  - Refactor: スクリプト責務を分離し、運用手順を簡素化。
- 検証:
  - `npm run supabase:types`
  - `node -e "const fs=require('fs');const v=fs.readFileSync('src/types/supabase.ts','utf8');if(!v.startsWith('export type Json'))process.exit(1)"`
- DoD: DOD-12
- ロールバック: 旧スクリプトに戻し、手動生成手順を暫定採用。

## R-08 未使用コードの最終清掃

- 目的: 追跡済みの死蔵コードを整理し保守負債を削減。
- 候補:
  - `src/lib/error-handler-enhanced.ts`（`SecurityErrorHandler`, `GlobalErrorHandler`）
  - R-03/R-04 実施後に未参照化したファイル
- 変更内容:
  - 参照ゼロ確認後に削除、または明示的に `@deprecated` 化。
- TDD:
  - Red: 参照APIが必要であることを示すテスト（ある場合）を追加し、削除時に失敗することを確認。
  - Green: 代替経路へ置換後にテストを成功させる。
  - Refactor: 未使用コードを削除し、テストと実装の責務を一致させる。
- 検証:
  - `rg -n "error-handler-enhanced|SecurityErrorHandler|GlobalErrorHandler" src`
  - `npm run type-check`
  - `npm run lint`
  - `npm run build`
- DoD: DOD-10
- ロールバック: 削除ファイルを復元。

## 6. 承認ゲート（運用ルール）

以下は実行前に明示承認を取る。

- `supabase db reset`（`--local` 有無を問わず）
- `supabase db push`（`--local` / `--dry-run` 有無を問わず）
- `supabase migration up`
- Docker volume/container 削除
- 破壊的 git / rm コマンド

注記: 本計画は原則 Docs/構造整理で進め、DB変更が必要な場合は別途「仕様書 + rollback SQL」を先に作成する。

## 7. 依存関係と実施順

> **ベースライン計測からの推奨**: R-07 を早期に実施すると TS エラー 301件の大半が解消し、後続タスクの検証精度が上がる。R-06 → R-07 → R-03 の順に前倒しを検討。

1. R-01（正本明文化）
2. R-05（SQL運用ルール固定、関連spec同期）
3. R-06（.temp 追跡解除） ← 前倒し推奨
4. R-07（types 生成安定化） ← 前倒し推奨（TS 301 errors 解消の鍵）
5. R-03（supabase client 統一）
6. R-02（legacy隔離）
7. R-04（hooks 一本化）
8. R-08（未使用コード清掃）

## 8. 完了条件（この計画の DoD）

- 各PRが単一目的で説明可能。
- 主要変更が DOD-04/08/09/10/12 のいずれかに紐付く。
- 変更の根拠に「ファイルパス + 設定/関数名」が記録されている。
- 破壊的操作・Supabase操作は承認ログが残る。
- 最終的な品質目標（全タスク完了時）:
  - `tsc --noEmit`: 0 errors（ベースライン 301 → 目標 0）
  - `npm run build`: SUCCESS
  - `jest --ci`: 0 failed suites（ベースライン 21 failed → 目標 0）
  - `supabase:types`: 全テーブル網羅、ログ混入なし

# スキーマ/フロント整合性 改修計画書

**作成日**: 2026-03-05  
**バージョン**: v0.2  
**目的**: `src` 実装と Supabase スキーマの不整合を解消し、stabilization の再現性を回復する。  
**適用範囲**: `src/app/api`, `src/lib/services`, `src/lib/mfa`, `src/lib/table-metadata.ts`, `src/lib/validation/table-schemas.ts`, `src/api/database/supabase-client.ts`

---

## 0. 実施方針

- 1 task = 1 PR を厳守する。
- 機能追加は行わず、整合性修復のみ実施する。
- 原則として migration 変更は行わない（アプリ側修正で整合を取る）。
- 各PRで「対象ファイル + 関数名/設定名」をエビデンスとして残す。
- Supabase CLIを使う検証コマンドは承認フローに従って実施する。

---

## 1. 検知した不整合（2026-03-05 時点）

### F-01: `blocks`/`reservations` で camelCase カラムをDBキーとして使用

- 証跡:
  - `src/app/api/blocks/route.ts` `GET/POST` で `resourceId/startTime/endTime/createdAt/updatedAt/createdBy`
  - `src/lib/services/block-service.ts` `createBlock/getBlocksByResource/checkBlockConflict`
  - `src/lib/services/reservation-service.ts` `getReservationsByDateRange/getReservationsByStaff/createReservation/validateTimeSlot`
- スキーマSSOT:
  - `supabase/migrations/00000000000001_squashed_baseline.sql` の `public.blocks` は `resource_id/start_time/end_time/created_at/updated_at/created_by`
  - `public.reservations` は `customer_id/staff_id/menu_id/start_time/end_time/created_at/updated_at`
- 影響:
  - 型推論が `never` 化し、`npm run type-check` 失敗を増幅。
- DoD関連:
  - `DOD-09`, `DOD-10`

### F-02: MFAイベント記録が `security_events` スキーマ契約と不一致

- 証跡:
  - `src/lib/mfa/mfa-manager.ts` `logMFAEvent`
  - `src/lib/mfa/backup-codes.ts` `logBackupCodeEvent`
  - 上記で `event_details` を挿入
- スキーマSSOT:
  - `public.security_events` は `event_category`, `event_description`, `event_data` を使用
- 影響:
  - セキュリティイベント記録の挿入失敗リスク、型不整合。
- DoD関連:
  - `DOD-08`, `DOD-10`

### F-03: 管理テーブルAPIが存在しないRPCと旧テーブル名に依存

- 証跡:
  - `src/lib/table-metadata.ts` `getManageableTables` が `rpc('get_manageable_tables')`
  - `src/lib/table-metadata.ts` `getTableConfig` が `rpc('get_table_columns')`
  - `src/lib/validation/table-schemas.ts` が `treatment_menus/staff_members/patient_profiles` を前提
- スキーマSSOT:
  - 現行は `menus/staff/patients/resources/clinic_settings` など
  - `get_manageable_tables/get_table_columns` は baseline migration と `src/types/supabase.ts` に定義なし
- 影響:
  - `/api/admin/tables` 経路が不安定、型崩れの起点になる。
- DoD関連:
  - `DOD-04`, `DOD-10`, `DOD-12`

### F-04: `daily_reports` 取得ヘルパーの列名ミス

- 証跡:
  - `src/api/database/supabase-client.ts` `dbHelpers.getDailyReports` が `.eq('date', date)`
- スキーマSSOT:
  - `public.daily_reports` は `report_date`
- 影響:
  - 常時0件/取得失敗の可能性。
- DoD関連:
  - `DOD-10`

---

## 2. 改修計画（1 task = 1 PR）

## Task 1 / PR-1: DBキーのsnake_case統一（blocks/reservations）

- 対象:
  - `src/app/api/blocks/route.ts`
  - `src/lib/services/block-service.ts`
  - `src/lib/services/reservation-service.ts`
- 実施:
  - Supabaseクエリキーを `snake_case` に統一。
  - API入出力の `camelCase` はDTO変換層で吸収（DBアクセス層には持ち込まない）。
- 受け入れ条件:
  - `rg -n "\\.(eq|gte|lte|lt|gt|order)\\('(resourceId|startTime|endTime|createdAt|updatedAt|createdBy|customerId|staffId|menuId)'" src/app/api/blocks src/lib/services` が0件。
  - `blocks/reservations` への `insert/update` ペイロードで camelCase DBキーを使っていないことをコードレビューで確認。
  - Task対象ファイルの Supabase 型エラーが解消。
- DoD:
  - `DOD-09`, `DOD-10`

## Task 2 / PR-2: MFAイベント挿入ペイロードの正規化

- 対象:
  - `src/lib/mfa/mfa-manager.ts`
  - `src/lib/mfa/backup-codes.ts`
- 実施:
  - `event_details` を廃止し、`event_category/event_description/event_data` に統一。
  - 必須項目を満たす共通ビルダー関数を導入（重複防止）。
- 受け入れ条件:
  - `rg -n "event_details" src/lib/mfa` が0件。
  - `security_events` 挿入で required列欠落がない。
- DoD:
  - `DOD-08`, `DOD-10`

## Task 3 / PR-3: `/api/admin/tables` を現行スキーマ準拠へ再構成

- 対象:
  - `src/lib/table-metadata.ts`
  - `src/lib/validation/table-schemas.ts`
  - `src/app/api/admin/tables/route.ts`
- 実施:
  - 未定義RPC依存（`get_manageable_tables/get_table_columns`）を排除。
  - 管理対象テーブルを現行スキーマ名で明示定義（例: `menus/resources/customers/clinic_settings`）。
  - 旧テーブル名（`treatment_menus/staff_members/patient_profiles`）を除去。
- 受け入れ条件:
  - `rg -n "get_manageable_tables|get_table_columns|treatment_menus|staff_members|patient_profiles" src/lib src/app/api/admin/tables` が0件。
  - `/api/admin/tables` の GET/POST/PUT/DELETE が型安全に通る。
- DoD:
  - `DOD-04`, `DOD-10`, `DOD-12`

## Task 4 / PR-4: `daily_reports` 参照列修正

- 対象:
  - `src/api/database/supabase-client.ts`
- 実施:
  - `.eq('date', date)` を `.eq('report_date', date)` に修正。
  - 既存呼び出しとの整合確認。
- 受け入れ条件:
  - `rg -n "eq\\('date'" src/api/database/supabase-client.ts` が0件。
  - 該当ヘルパーの型エラーなし。
- DoD:
  - `DOD-10`

## Task 5 / PR-5: 型整合の最終収束

- 対象:
  - 上記PRで触れたファイル群
  - `src/types/supabase.ts`（再生成対象）
- 実施:
  - `npm run type-check` を通すための残差修正。
  - `npm run supabase:types` を必ず実行し型を再同期。
  - 生成ファイル検証コマンドを必ず実行する。
- 受け入れ条件:
  - `npm run type-check` 成功。
  - `npm run build` 成功。
  - `node -e "const fs=require('fs');const v=fs.readFileSync('src/types/supabase.ts','utf8'); if(!v.startsWith('export type Json')){process.exit(1)}"` 成功。
- DoD:
  - `DOD-10`, `DOD-12`

---

## 3. 検証手順（各PR共通）

1. `npm run type-check`
2. `npm run build`
3. `npm run test -- --ci --testPathIgnorePatterns=e2e`
4. `supabase db push --local --dry-run`
5. `npm run supabase:types`
6. `node -e "const fs=require('fs');const v=fs.readFileSync('src/types/supabase.ts','utf8'); if(!v.startsWith('export type Json')){process.exit(1)}"`
7. `rg -n "from\\('blocks'\\)|from\\('reservations'\\)|event_details|get_manageable_tables|get_table_columns" src`

補足:
- Supabase CLIを使う検証は事前承認フローに従って実施する。

---

## 4. リスクとロールバック方針

- リスク:
  - APIレスポンス契約（camelCase）を壊すとフロント画面で回帰する。
  - `/api/admin/tables` の再構成で管理UIの編集対象が一時的に減る可能性。
- ロールバック:
  - 本計画はアプリコード修正のみを前提とし、各PR単位で `git revert` 可能。
  - migration変更を伴う場合は別途仕様書を起票し、`docs/stabilization/rollbacks/` にSQLロールバックを同時追加する。

---

## 5. 完了定義

- F-01〜F-04 の証跡が解消されている。
- `docs/stabilization/DoD-v0.1.md` の `DOD-04`, `DOD-08`, `DOD-09`, `DOD-10`, `DOD-12` を満たす。
- すべてのPRに、対象ファイル・検証結果・ロールバック手順が記録されている。

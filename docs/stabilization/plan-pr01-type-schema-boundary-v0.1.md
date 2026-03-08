# Plan PR-01: Type / Schema Boundary v0.1

## 1. 目的

`build` / `type-check` を止めている問題のうち、`src/types/supabase.ts` の再生成で解決する範囲と、コード修正または別 spec が必要な範囲を切り分ける。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 2 に対応する。

## 2. 現状

- 型生成スクリプトは正常化済み
  - `package.json` `scripts.supabase:types`
  - `scripts/generate-supabase-types.mjs`
  - `src/types/supabase.ts`
- `src/types/supabase.ts` は現時点で `export type Json =` から始まっており、生成物自体に CLI ログ混入は見えていない
- 2026-03-08 時点では `npm run type-check` は成功しており、`ts-errors-current.txt` は現状を反映していない
- 一方で `npm run supabase:types` は `supabase gen types typescript --local --schema public` 実行時にタイムアウトし、`supabase status` では `supabase_db_seikotsuin_management_saas container is not ready: unhealthy` を返す
- 旧 `system_settings` 契約は型エラーとしては顕在化していないが、廃止済み API を呼ぶ実装が残っている
  - `src/app/api/admin/master-data/route.ts` `GET/POST/PUT/DELETE`
  - `src/hooks/queries/useSystemSettingsQuery.ts` `systemSettingsApi.getAll/create/update/delete`
  - `src/lib/api/admin/master-data-client.ts` `listMasterData/createMasterData/updateMasterData/deleteMasterData`

このため、PR-01 の現時点の論点は「型生成物の欠落」よりも、「DOD-12 再検証のためのローカル Supabase 環境復旧」と「旧 schema / 旧 API 契約の隔離」が主体になる。

参考として、過去の代表エラー群は以下だったが、現ブランチでは source-of-truth にしない:

- `src/hooks/queries/useSystemSettingsQuery.ts`
- `src/hooks/useChat.ts`
- `src/hooks/useDailyReports.ts`
- `src/lib/error-handler-enhanced.ts`
- `src/lib/middleware-optimizer.ts`
- `src/lib/rate-limiting/middleware.ts`

## 3. 対象

- `package.json` `scripts.supabase:types`, `scripts.type-check`, `scripts.build`
- `scripts/generate-supabase-types.mjs`
- `src/types/supabase.ts`
- `ts-errors-current.txt`
- `supabase/config.toml`
- `src/hooks/**`
- `src/lib/**`
- `src/app/api/**`
- `src/database/**`

## 4. 切り分け方針

### A. typegen 再生成で解決する範囲

- `src/types/supabase.ts` にテーブル/ビュー/関数定義が欠落している
- `Insert` / `Update` / `Row` の差分が schema 実体と不一致
- 生成物にログ混入がある

現時点の判定:

- 現ブランチでは `src/types/supabase.ts` 自体に欠落やログ混入は確認できていない
- したがって、`supabase:types` だけで直ると確認できたアプリ側不整合は、現時点では **なし**
- 未解決なのは DOD-12 の再実行不能であり、これは schema 差分ではなくローカル Supabase 環境 (`supabase status`) 側の問題として扱う

### B. コード修正で解決する範囲

- `unknown` / `ReactNode` / `Promise` / `NextRequest` などアプリコード由来の型不整合
- 旧 API 契約の残骸
- hook の戻り型不一致
- private method / property 名不一致

現時点の判定:

- `src/hooks/queries/useSystemSettingsQuery.ts` は `systemSettingsApi.getAll/create/update/delete` がすべて廃止済み `/api/admin/master-data` を呼ぶ
- `src/hooks/useSystemSettingsV2.ts` は上記 hook に依存するため、型ではなく実行時契約の不整合を抱える
- `src/lib/api/admin/master-data-client.ts`, `src/hooks/useMasterData.ts`, `src/hooks/useAdminMaster.ts`, `src/lib/constants.ts` も同じ旧 API 契約に依存する
- これらは `supabase:types` では直らず、コード修正で `clinic_settings` / `/api/admin/settings` 系へ寄せるか、呼び出し自体を撤去する必要がある

### C. 別 spec が必要な範囲

- `system_settings` から `clinic_settings` への移行残骸
- schema 追加/変更が必要なケース
- migration 変更を伴うケース

現時点の判定:

- `src/database/schemas/02_master_data.sql` は `public.system_settings` を定義している一方、生成済み `src/types/supabase.ts` は `clinic_settings` を持ち `system_settings` を持たない
- `src/database/seed_data/01_initial_data.sql` と `src/database/policies/auth_policies.sql` に `system_settings` 残骸がある
- migration 変更なしで吸収するのか、`system_settings` を正式に廃止するのかは rollback plan 付きの別 spec が必要
- この論点は `docs/stabilization/spec-schema-frontend-alignment-v0.1.md` / `docs/stabilization/spec-schema-frontend-alignment-v0.2.md` の継続タスクとして扱う

## 5. 実行手順

1. `supabase status` を確認し、DOD-12 を妨げているローカル DB unhealthy を解消する。
2. `npm run supabase:types` を再実行し、`src/types/supabase.ts` の再生成可否を確認する。
3. `ts-errors-current.txt` は stale 扱いとし、必要なら現ブランチで再生成したエラー一覧を新しい source-of-truth にする。
4. 旧 `master-data` 契約の参照を以下の3分類へ振り分ける。
   - Typegen で解決
   - コード修正で解決
   - schema spec が必要
5. `system_settings` 依存を棚卸しする。
   - 対象: `src/hooks/queries/useSystemSettingsQuery.ts`
   - 追加対象: `src/lib/api/admin/master-data-client.ts`, `src/hooks/useMasterData.ts`, `src/hooks/useAdminMaster.ts`, `src/lib/constants.ts`
   - 参照ドキュメント: `docs/stabilization/triage.md` `CC-13 Schema/type drift (P2)`
6. PR-01 のスコープ外になる schema 問題は別 spec にエスカレーションする。

## 6. 作業分割

### Track 1: 型生成の健全性確認

- `package.json` `scripts.supabase:types`
- `scripts/generate-supabase-types.mjs`
- `src/types/supabase.ts`

### Track 2: アプリコード由来エラーの解消

- `src/components/ui/form-field.tsx`
- `src/components/ui/responsive-table.tsx`
- `src/hooks/useChat.ts`
- `src/hooks/useDailyReports.ts`
- `src/lib/error-handler-enhanced.ts`
- `src/lib/middleware-optimizer.ts`
- `src/lib/rate-limiting/middleware.ts`

注記:

- 上記は過去の type-check クラスタであり、現時点では `npm run type-check` が通っている
- PR-01 の現行コード修正候補としては、まず `master-data` / `system_settings` 契約の残骸を優先する

### Track 3: schema drift 候補の隔離

- `src/hooks/queries/useSystemSettingsQuery.ts`
- `src/hooks/useMasterData.ts`
- `src/hooks/useAdminMaster.ts`
- `src/lib/api/admin/master-data-client.ts`
- `src/lib/constants.ts`
- `src/hooks/useSystemSettingsV2.ts`
- `src/database/schemas/02_master_data.sql`
- `src/database/seed_data/01_initial_data.sql`
- `src/database/policies/auth_policies.sql`

## 7. 受け入れ条件

- `supabase status` が healthy を返したうえで `npm run supabase:types` が成功する
- `src/types/supabase.ts` が `export type Json =` で始まる
- stale な `ts-errors-current.txt` を source-of-truth として扱わない
- 現行の `system_settings` / `master-data` 参照に、解決手段の分類が付いている
- schema 変更が必要な項目が、PR-01 本体から明示的に切り離されている
- `npm run type-check` が継続して成功する

## 8. DoD

- `docs/stabilization/DoD-v0.1.md` `DOD-10`
- `docs/stabilization/DoD-v0.1.md` `DOD-12`

## 9. 依存とリスク

- migration 変更は本計画の対象外
- schema spec が必要と判定された場合は、別ファイルで spec + rollback plan を作成する
- `system_settings` 系は PR-04 の導線整理と衝突する可能性があるため、削除ではなく隔離を優先する

## 10. 完了証跡

- `npm run supabase:types`
- `supabase status`
- `npm run type-check`
- 必要に応じて更新したエラー一覧
- 必要に応じて `docs/stabilization/triage.md` への追記

## 11. 2026-03-08 時点の暫定切り分け

### `supabase:types` で直る範囲

- 現時点では確認できた項目なし
- `src/types/supabase.ts` はすでに clean で、アプリ側の不整合を直接説明する差分は見えていない

### コード修正で直す範囲

- `src/hooks/queries/useSystemSettingsQuery.ts`
- `src/hooks/useSystemSettingsV2.ts`
- `src/hooks/useMasterData.ts`
- `src/hooks/useAdminMaster.ts`
- `src/lib/api/admin/master-data-client.ts`
- `src/lib/constants.ts`

理由:

- いずれも `system_settings` / `master-data` の旧 API 契約に依存しており、生成型よりも実装境界の問題だから

2026-03-08 実装方針:

- 本 PR では旧契約を `clinic_settings` へ機械的に変換しない
- `src/app/admin/(protected)/master/page.tsx` は `/admin/settings` への導線に置き換える
- `src/hooks/useSystemSettings.ts`, `src/hooks/queries/useSystemSettingsQuery.ts`, `src/lib/api/admin/master-data-client.ts` は旧 endpoint を叩かず、明示的な deprecation error を返す
- SQL / migration / seed / policy の `system_settings` 整理は別 spec に残す

### 別 spec が必要な範囲

- `src/database/schemas/02_master_data.sql` `public.system_settings`
- `src/database/seed_data/01_initial_data.sql` `INSERT INTO public.system_settings`
- `src/database/policies/auth_policies.sql` `ON public.system_settings`

理由:

- 生成済み型・現行 API・旧 SQL 資産の source-of-truth が分裂しており、migration / rollback を伴う判断が必要だから

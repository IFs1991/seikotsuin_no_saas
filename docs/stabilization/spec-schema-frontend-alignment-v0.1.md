# スキーマ/フロント整合性 是正指示書

**作成日**: 2026-03-04  
**バージョン**: v0.1  
**目的**: Supabaseテーブルスキーマとフロント/API実装の乖離を解消し、stabilization DoDを満たす。  
**適用範囲**: `supabase/migrations`, `src/app/api`, `src/hooks`, `src/lib/supabase`, `src/types/supabase.ts`

---

## 0. 実施ルール

- 1 task = 1 PR（本書の Task 1-4 を順番に実施）。
- 機能追加は行わず、整合性修復に限定する。
- migration変更時は、同PRにロールバックSQLを必ず同梱する。
- Evidenceは必ず「ファイルパス + 関数名/設定名」で記録する。

---

## 1. 現状の不整合（証跡）

## F-01: Onboarding seed が旧テーブルに書き込み

- 証跡:
  - `POST` 実装: `src/app/api/onboarding/seed/route.ts:67` `supabase.from('master_treatment_menus').insert(...)`
  - 失敗時継続: `src/app/api/onboarding/seed/route.ts:76` `// 続行`
  - 完了更新: `src/app/api/onboarding/seed/route.ts:110` `current_step: 'completed'`
  - 旧テーブル削除済み: `supabase/migrations/20251224000300_migrate_menu_data.sql:168` `DROP TABLE IF EXISTS public.master_treatment_menus`
- 影響: 初期投入失敗を検知できず、オンボーディングが成功扱いになる。
- DoD関連: `DOD-03`, `DOD-10`

## F-02: `system_settings` / `temporary_data` 依存が残存

- 証跡:
  - TODO明記: `src/app/api/admin/master-data/route.ts:13` `system_settings テーブルは clinic_settings に統合`
  - 旧テーブル参照: `src/app/api/admin/master-data/route.ts:128` `from('system_settings')`
  - 一時テーブル参照: `src/app/api/admin/master-data/export/route.ts:132` `from('temporary_data')`
  - 現行設定テーブル: `supabase/migrations/20251231000100_clinic_settings_table.sql:12` `CREATE TABLE IF NOT EXISTS public.clinic_settings`
  - 型定義上も `clinic_settings` のみ: `src/types/supabase.ts:577`
- 影響: スキーマSSOTとAPI実装が二重化し、環境差で実行時エラー化する。
- DoD関連: `DOD-03`, `DOD-04`, `DOD-12`

## F-03: CSP/セキュリティ系が migration 管理外テーブルを参照

- 証跡:
  - 書き込み参照: `src/app/api/security/csp-report/route.ts:127` `from('csp_violations')`
  - 参照API: `src/app/api/admin/security/csp-stats/route.ts:36` `from('csp_violations')`
  - 通知保存: `src/lib/notifications/security-alerts.ts:225` `from('security_alerts')`
  - ただし `supabase/migrations` に `csp_violations` / `security_alerts` の `CREATE TABLE` は存在しない（ローカル走査結果）。
  - 管理外SQL定義: `src/lib/database/csp-violations-schema.sql:7`, `src/lib/database/security-alerts-schema.sql:7`
  - 同SQL内の不整合:
    - `type` 制約: `src/lib/database/security-alerts-schema.sql:11`
    - `'system'` INSERT: `src/lib/database/security-alerts-schema.sql:155`
    - `clinic_users` 依存: `src/lib/database/csp-violations-schema.sql:100`, `src/lib/database/security-alerts-schema.sql:101`
- 影響: ローカル再現性・本番再現性が担保できない。
- DoD関連: `DOD-04`, `DOD-08`, `DOD-12`

## F-04: 型境界が弱く、不整合が型で止まらない

- 証跡:
  - サーバークライアント未ジェネリクス: `src/lib/supabase/server.ts:12` `createServerClient(...)`
  - 別クライアント未ジェネリクス: `src/lib/supabase-browser.ts:12`
  - `as any` による回避: `src/app/api/admin/master-data/route.ts:128`
- 影響: `npm run type-check` 通過でも実行時不整合が残る。
- DoD関連: `DOD-10`, `DOD-12`

---

## 2. 修正指示（1 task = 1 PR）

## Task 1 / PR-1: Onboarding seed のSSOT統一

- 対象:
  - `src/app/api/onboarding/seed/route.ts` (`POST`)
- 指示:
  - `master_treatment_menus` へのINSERTを廃止し、現行SSOTである `menus` へ投入する。
  - メニュー投入に1件でも失敗した場合は `current_step='completed'` へ進めない。
  - 成功/失敗件数をレスポンスに含め、部分成功を禁止（all-or-nothing相当）する。
- 受け入れ条件:
  - 旧テーブル書き込みが `src` から消える。
  - seed失敗時に `completed` へ遷移しない。
- DoD:
  - `DOD-03`, `DOD-10`
- ロールバック:
  - 本PRで変更した `onboarding/seed` のみを戻す（migration変更なし）。

## Task 2 / PR-2: Legacy master-data導線の停止または移行

- 対象:
  - `src/app/api/admin/master-data/route.ts` (`GET/POST/PUT/DELETE`)
  - `src/app/api/admin/master-data/export/route.ts` (`GET`)
  - `src/app/api/admin/master-data/import/route.ts` (`POST`)
  - `src/app/api/admin/master-data/rollback/route.ts` (`POST`)
  - `src/app/master-data/page.tsx`
- 指示:
  - stabilization優先のため、まず legacy導線を停止（`410 Gone`）し、`/api/admin/settings` へ統一する。
  - 併せて `/master-data` 画面は運用導線から外す（非公開またはリダイレクト）。
  - `system_settings` / `temporary_data` の直接参照を `src/app/api` からゼロにする。
- 受け入れ条件:
  - `rg -n "from\\('system_settings'\\)|from\\('temporary_data'\\)" src/app/api` が0件。
  - 管理設定の本線は `clinic_settings` 経由（`/api/admin/settings`）のみ。
- DoD:
  - `DOD-03`, `DOD-04`, `DOD-09`, `DOD-12`
- ロールバック:
  - 停止した各routeを元のレスポンス仕様へ戻す（DB migrationは触らない）。

## Task 3 / PR-3: CSP/セキュリティテーブルを migration SSOT に編入

- 対象:
  - `supabase/migrations`（新規migration）
  - `src/lib/database/csp-violations-schema.sql`
  - `src/lib/database/security-alerts-schema.sql`
  - `src/app/api/security/csp-report/route.ts`
  - `src/app/api/admin/security/csp-stats/route.ts`
  - `src/app/api/admin/security/csp-violations/route.ts`
  - `src/lib/notifications/security-alerts.ts`
- 指示:
  - `csp_violations` / `security_alerts` を `supabase/migrations` に移し、再現可能な構築経路を一本化する。
  - RLSは `clinic_users` 依存を禁止し、現行認可系（`user_permissions` + `can_access_clinic`）に合わせる。
  - `security_alerts.type` の制約と `'system'` INSERT の矛盾を解消する。
  - migration追加時は必ず rollback SQL を同PRに同梱する。
- 受け入れ条件:
  - `supabase db reset --local --no-seed` で当該テーブル・policy・triggerが再現される。
  - `supabase/migrations` 管理外SQLにテーブル定義が残らない（または archive明記）。
- DoD:
  - `DOD-04`, `DOD-08`, `DOD-12`
- ロールバック:
  - 新規migrationに対する `DROP POLICY/TRIGGER/FUNCTION/VIEW/TABLE` を順序付きで用意。

## Task 4 / PR-4: 型境界の強化（不整合を型で検知）

- 対象:
  - `src/lib/supabase/server.ts`
  - `src/lib/supabase-browser.ts`
  - `src/types/supabase.ts`
  - Task 1-3で触れたAPIの `as any`
- 指示:
  - Supabaseクライアントを `Database` ジェネリクスで統一する。
  - `as any` 回避を削除し、型エラーは修正で解消する。
  - `npm run supabase:types` を実行し、生成ファイルを最新化する。
- 受け入れ条件:
  - `npm run type-check` 成功。
  - `src/app/api` で `as any` によるSupabaseクエリ回避が残らない。
- DoD:
  - `DOD-10`, `DOD-12`
- ロールバック:
  - 型付け変更のみを戻す（DB変更なし）。

---

## 3. 検証コマンド（実行順）

1. `npm run type-check`  
2. `npm run build`  
3. `supabase db push --local --dry-run`  
4. `npm run test -- --ci --testPathIgnorePatterns=e2e`  
5. `rg -n "createClient\\(|from\\('blocks'\\)|from\\('reservations'\\)" src`  

補足: `supabase` 系コマンドは事前承認ルールに従うこと。

---

## 4. 完了定義（この指示書のDone）

- F-01〜F-04 の証跡に挙げた参照が解消されること。
- `docs/stabilization/DoD-v0.1.md` の `DOD-03`, `DOD-04`, `DOD-08`, `DOD-09`, `DOD-10`, `DOD-12` を満たすこと。
- 変更の全PRに、対象範囲・検証結果・ロールバック手順が記載されていること。

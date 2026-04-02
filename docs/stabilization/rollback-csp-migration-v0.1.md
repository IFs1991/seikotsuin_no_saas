# CSP/Security Alerts Migration SSOT Rollback Plan v0.1

- 作成日: 2026-03-31
- バージョン: v0.1
- Forward migration: `20260304000100_csp_security_alerts_migration_ssot.sql`
- Rollback file: `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot_rollback.sql`
- 関連: `docs/stabilization/spec-csp-migration-v0.1.md`

---

## 1. 既存 Rollback Stub の問題点（重要）

`docs/stabilization/rollbacks/20260304000100_csp_security_alerts_migration_ssot_rollback.sql` には以下の DDL が含まれている:

```sql
-- 1. csp_violations: clinic_id カラム削除
ALTER TABLE public.csp_violations DROP COLUMN IF EXISTS clinic_id;

-- 2. security_alerts: clinic_id カラム削除
ALTER TABLE public.security_alerts DROP COLUMN IF EXISTS clinic_id;

-- 3. security_alerts: type CHECK を元に戻す（'system' なし）
ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_type_check;
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_type_check
    CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach'));
```

**これは誤りである。理由**:

1. `clinic_id` は squashed baseline（`00000000000001_squashed_baseline.sql` L1896, L2647）に既存であり、本 migration が追加したカラムではない
2. `'system'` も baseline の `security_alerts_type_check`（L2663）に既存
3. これらを DROP した場合、**アプリケーション全体が破壊される**（RLS、API、型定義が全て `clinic_id` を前提としているため）

**処置**: 既存 stub を `*.superseded` にリネームして無効化し、本文書の rollback SQL に差し替える。

---

## 2. Migration の性質

本 migration は **冪等な SSOT 宣言**であり、既存の DB（squashed baseline 適用済み）では **実質的に何も変更しない**:

- `CREATE TABLE IF NOT EXISTS` → テーブルが既存なら no-op
- `CREATE INDEX IF NOT EXISTS` → インデックスが既存なら no-op
- `DROP POLICY IF EXISTS` + `CREATE POLICY` → ポリシーを同一定義で再作成（機能的に同一）
- `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` → FK が既存なら no-op

**したがって rollback の主目的は「migration 記録の削除」であり、スキーマの巻き戻しは不要。**

---

## 3. Rollback シナリオ

### シナリオ A: 通常ケース（Baseline + この Migration が適用済み）

**状況**: squashed baseline が適用された DB に本 migration が適用された状態。

**Rollback で行うこと**:
- `supabase_migrations.schema_migrations` から本 migration の記録を削除する
- テーブル・インデックス・RLS ポリシー・FK は変更しない（全て baseline 由来のため）

**実行コマンド**:
```sql
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260304000100';
```

または Supabase CLI で:
```bash
supabase migration repair --status reverted 20260304000100
```

**リスク**: なし（スキーマ変更なし）

---

### シナリオ B: 理論上のケース（この Migration のみ、Baseline なし）

**状況**: 何らかの理由で squashed baseline が適用されていない DB に本 migration のみを適用した場合。

> **警告**: このシナリオは通常の開発・本番環境では発生しない。Scenario B の rollback SQL は手動確認後にのみ実行すること。

**Rollback で行うこと**: テーブル・ポリシー・インデックスの完全削除

**注意**: テーブル CASCADE は関連データも削除するため、実行前に必ずバックアップを取得すること。

---

## 4. Rollback SQL

`supabase/migrations/20260304000100_csp_security_alerts_migration_ssot_rollback.sql` の内容:

```sql
-- ================================================================
-- ROLLBACK: CSP/Security Alerts テーブル SSOT
-- ================================================================
-- 20260304000100_csp_security_alerts_migration_ssot.sql の逆操作
-- 関連: docs/stabilization/rollback-csp-migration-v0.1.md
-- ================================================================
--
-- 重要: 本 migration は冪等な SSOT 宣言であり、squashed baseline が
-- 適用済みの DB では実質的にスキーマ変更を行わない。
-- 通常のロールバックは migration 記録の削除のみで十分。
--
-- シナリオ A（通常）: migration 記録を削除するのみ
-- ================================================================

-- Scenario A: migration 記録を削除（Supabase CLI 推奨）
-- supabase migration repair --status reverted 20260304000100
--
-- または直接 SQL で:
-- DELETE FROM supabase_migrations.schema_migrations
-- WHERE version = '20260304000100';

-- ================================================================
-- シナリオ B（手動・緊急時のみ）: この Migration のみで Baseline がない場合の完全削除
-- 実行前にバックアップを取得し、チームレビューを受けること。
-- ================================================================

-- BEGIN;
--
-- -- RLS ポリシー削除
-- DROP POLICY IF EXISTS "csp_violations_insert_any"    ON public.csp_violations;
-- DROP POLICY IF EXISTS "csp_violations_select_admin"  ON public.csp_violations;
-- DROP POLICY IF EXISTS "csp_violations_update_admin"  ON public.csp_violations;
-- DROP POLICY IF EXISTS "security_alerts_insert_any"   ON public.security_alerts;
-- DROP POLICY IF EXISTS "security_alerts_select_admin" ON public.security_alerts;
-- DROP POLICY IF EXISTS "security_alerts_update_admin" ON public.security_alerts;
--
-- -- インデックス削除
-- DROP INDEX IF EXISTS public.idx_csp_violations_clinic_id;
-- DROP INDEX IF EXISTS public.idx_csp_violations_created_at;
-- DROP INDEX IF EXISTS public.idx_csp_violations_severity;
-- DROP INDEX IF EXISTS public.idx_security_alerts_clinic_id;
-- DROP INDEX IF EXISTS public.idx_security_alerts_created_at;
-- DROP INDEX IF EXISTS public.idx_security_alerts_severity;
-- DROP INDEX IF EXISTS public.idx_security_alerts_type;
--
-- -- テーブル削除（CASCADE で FK も削除）
-- DROP TABLE IF EXISTS public.csp_violations CASCADE;
-- DROP TABLE IF EXISTS public.security_alerts CASCADE;
--
-- COMMIT;
```

---

## 5. 実行後検証

### シナリオ A 検証

```sql
-- migration 記録が削除されたことを確認
SELECT count(*) FROM supabase_migrations.schema_migrations
WHERE version = '20260304000100';
-- 期待値: 0

-- テーブルが引き続き存在することを確認（baseline 由来のため）
SELECT count(*) FROM public.csp_violations;    -- エラーなし
SELECT count(*) FROM public.security_alerts;   -- エラーなし

-- RLS ポリシーが存在することを確認
SELECT policyname FROM pg_policies
WHERE tablename IN ('csp_violations', 'security_alerts')
ORDER BY tablename, policyname;
-- 期待値: 6 ポリシー（各テーブル 3 つ）
```

### シナリオ B 検証

```sql
-- テーブルが削除されたことを確認
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('csp_violations', 'security_alerts');
-- 期待値: 0
```

---

## 6. 既存 Stub の処置

`docs/stabilization/rollbacks/20260304000100_csp_security_alerts_migration_ssot_rollback.sql` を以下のようにリネームして無効化する:

```
20260304000100_csp_security_alerts_migration_ssot_rollback.sql
→ 20260304000100_csp_security_alerts_migration_ssot_rollback.sql.superseded
```

ファイルの先頭に以下のコメントを追記する:

```sql
-- SUPERSEDED: このファイルは誤りのある旧 rollback stub です。
-- 正本は docs/stabilization/rollback-csp-migration-v0.1.md および
-- supabase/migrations/20260304000100_csp_security_alerts_migration_ssot_rollback.sql を参照。
-- 誤り: DROP COLUMN clinic_id は baseline カラムを削除するため破壊的。
```

---

## 7. リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| シナリオ B を誤って本番実行 | テーブル削除でデータ消失 | コメントアウト、実行前バックアップ必須 |
| 旧 stub を誤って実行 | `clinic_id` 削除でアプリ破壊 | `.superseded` リネームで実行不可能に |
| シナリオ A の migration 記録削除後に再適用 | 冪等なので安全 | 問題なし |

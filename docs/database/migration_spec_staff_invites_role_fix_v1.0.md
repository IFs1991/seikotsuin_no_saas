# マイグレーション仕様書: staff_invites RLS強化 + MFA関数権限最小化

**作成日:** 2026-02-22  
**更新日:** 2026-02-22（v1.3）  
**対象マイグレーション:** `supabase/migrations/20260222000100_fix_staff_invites_role_mfa_permissions.sql`  
**優先度:** Critical（初回ユーザー登録/予約UI修正の前提）  
**リスク:** 中（RLS再作成 + 関数権限変更）  

---

## v1.3 修正要点

v1.1 から以下を修正。

1. 現状認識を更新  
   `staff_invites_role_check` と `staff_invites_clinic_admin_select` は既存マイグレーションで修正済みであり、  
   「未修正前提」の記述を削除。

2. ポリシー名整合  
   既存運用・他仕様書との整合を優先し、`staff_invites_clinic_admin_select` を維持。

3. RLS強化ポイントを明確化  
   追加修正の主眼を `staff_invites_creator_*` のロール制約追加に限定。

4. ロールバック方針を安全化  
   `clinic_manager`/旧profiles依存ポリシーへ戻す手順を廃止し、  
   2026-01-26時点の「`get_current_role()` + `can_access_clinic()`」系へ戻す手順に変更。

5. MFA関数権限のドリフト対策を追加  
   `REVOKE ALL ... FROM PUBLIC` を先行実行し、環境差分による実行権限残存を防止。

---

## 現状整理（2026-02-22 時点）

### 既に修正済み（再実装不要）

- `staff_invites_role_check` の `clinic_admin` 対応  
  参照: `supabase/migrations/20260110000300_fix_rls_clinic_manager_roles.sql`

- `staff_invites_clinic_admin_select` の `clinic_manager` 参照解消  
  参照: `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`

### 今回の実修正対象

1. `staff_invites_creator_insert/update/delete` にロール制約を追加  
   目的: `created_by` 一致だけでは防げない権限過剰を抑制。

2. `encrypt_mfa_secret(TEXT)` / `decrypt_mfa_secret(TEXT)` の実行権限を  
   `authenticated` から `service_role` のみに限定。

3. （ドリフト対策）`staff_invites.role='clinic_manager'` が残存する環境のみデータ移行。

---

## 変更設計

### 1. staff_invites CHECK 制約（正規形へ再定義）

`staff_invites_role_check` を以下に統一:

```sql
CHECK (role IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager'))
```

補足:
- 既にこの定義の環境でも `DROP ... IF EXISTS` + `ADD` で冪等に適用。
- `clinic_manager` 残存行がある環境を考慮し、制約再作成前にデータ移行を実施。

### 2. staff_invites RLS

ポリシー名は既存互換を維持する:
- `staff_invites_clinic_admin_select`（維持）
- `staff_invites_creator_select`（維持）
- `staff_invites_creator_insert`（維持）
- `staff_invites_creator_update`（維持）
- `staff_invites_creator_delete`（維持）

`staff_invites_clinic_admin_select`:
- `public.get_current_role() IN ('admin', 'clinic_admin', 'manager')`
- `public.can_access_clinic(clinic_id)`

`staff_invites_creator_*`:
- 共通で `created_by = auth.uid()` + `public.can_access_clinic(clinic_id)`
- `insert/update/delete` は追加で  
  `public.get_current_role() IN ('admin', 'clinic_admin', 'manager')`

設計理由:
- 「作成者のみ変更可」は維持しつつ、スタッフ系ロールからの直接更新を抑止。
- UI/APIガードを迂回した直接クエリ時もDB側で拒否。

### 3. MFA関数権限

対象:
- `public.encrypt_mfa_secret(TEXT)`
- `public.decrypt_mfa_secret(TEXT)`

変更:
- `REVOKE ALL ... FROM PUBLIC`（ドリフト環境対策）
- `REVOKE EXECUTE ... FROM authenticated`
- `GRANT EXECUTE ... TO service_role`

補足:
- `SECURITY DEFINER` でも呼び出し側の `EXECUTE` 権限は必要。
- `service_role` は `SUPERUSER` ではないため明示 `GRANT` が必要。

---

## 実装SQL（v1.3）

```sql
BEGIN;

-- ================================================================
-- Step 1: 既存データ健全性確認（未知ロール検出）
-- ================================================================
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    -- clinic_manager はドリフト環境を考慮して一時許可
    SELECT count(*)
    INTO invalid_count
    FROM public.staff_invites
    WHERE role NOT IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager', 'clinic_manager');

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'staff_invites に未知ロールが % 件あります。手動確認が必要です。', invalid_count;
    END IF;
END $$;

-- ================================================================
-- Step 2: CHECK制約を一旦削除
-- ================================================================
-- 重要: 旧制約が clinic_admin を許可しない環境でも安全に移行できるよう、
--       role 更新より前に DROP する。
ALTER TABLE public.staff_invites
    DROP CONSTRAINT IF EXISTS staff_invites_role_check;

-- ================================================================
-- Step 3: clinic_manager -> clinic_admin 移行（ドリフト環境向け）
-- ================================================================
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    UPDATE public.staff_invites
    SET role = 'clinic_admin'
    WHERE role = 'clinic_manager';

    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    IF migrated_count > 0 THEN
        RAISE WARNING 'staff_invites: clinic_manager -> clinic_admin を % 件移行しました。', migrated_count;
    END IF;
END $$;

-- ================================================================
-- Step 4: CHECK制約を正規形で再作成
-- ================================================================
ALTER TABLE public.staff_invites
    ADD CONSTRAINT staff_invites_role_check
    CHECK (role IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager'));

COMMENT ON CONSTRAINT staff_invites_role_check ON public.staff_invites IS
'有効ロール: admin, clinic_admin, manager, therapist, staff。clinic_manager は非推奨。';

-- ================================================================
-- Step 5: RLS再作成（ポリシー名は既存互換を維持）
-- ================================================================
DROP POLICY IF EXISTS "staff_invites_clinic_admin_select" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_select" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_insert" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_update" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_delete" ON public.staff_invites;

CREATE POLICY "staff_invites_clinic_admin_select"
ON public.staff_invites FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_invites_creator_select"
ON public.staff_invites FOR SELECT
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_invites_creator_insert"
ON public.staff_invites FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
);

CREATE POLICY "staff_invites_creator_update"
ON public.staff_invites FOR UPDATE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
)
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
);

CREATE POLICY "staff_invites_creator_delete"
ON public.staff_invites FOR DELETE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
);

-- ================================================================
-- Step 6: MFA関数のEXECUTE権限を service_role のみに制限
-- ================================================================
REVOKE ALL ON FUNCTION public.encrypt_mfa_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_mfa_secret(TEXT) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_mfa_secret(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_mfa_secret(TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.encrypt_mfa_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_mfa_secret(TEXT) TO service_role;

COMMENT ON FUNCTION public.encrypt_mfa_secret(TEXT) IS
'MFA秘密鍵暗号化関数。2026-02-22: EXECUTE を service_role 限定へ変更。';

COMMENT ON FUNCTION public.decrypt_mfa_secret(TEXT) IS
'MFA秘密鍵復号化関数。2026-02-22: EXECUTE を service_role 限定へ変更。';

COMMIT;
```

---

## 検証SQL

### Pre-migration（実態確認）

```sql
-- 1) CHECK制約の現行値
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.staff_invites'::regclass
  AND conname = 'staff_invites_role_check';

-- 2) policyの現行qual
SELECT policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'staff_invites'
ORDER BY policyname;

-- 3) clinic_manager残存データ（ドリフト検知）
SELECT count(*) AS clinic_manager_rows
FROM public.staff_invites
WHERE role = 'clinic_manager';

-- 4) MFA関数権限（authenticated残存確認）
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN ('encrypt_mfa_secret', 'decrypt_mfa_secret')
ORDER BY routine_name, grantee;
```

### Post-migration（期待値）

```sql
-- A) CHECK制約
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.staff_invites'::regclass
  AND conname = 'staff_invites_role_check';
-- Expected: ('admin','clinic_admin','therapist','staff','manager')

-- B) clinic_manager 残存0
SELECT count(*) FROM public.staff_invites WHERE role = 'clinic_manager';
-- Expected: 0

-- C) staff_invites policy確認（名前互換維持）
SELECT policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'staff_invites'
ORDER BY policyname;
-- Expected:
--   staff_invites_clinic_admin_select が存在し、
--   get_current_role() + can_access_clinic() を含む
--   creator_insert/update/delete が role 制約を含む

-- D) MFA関数権限
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN ('encrypt_mfa_secret', 'decrypt_mfa_secret')
ORDER BY routine_name, grantee;
-- Expected:
--   service_role の EXECUTE は存在
--   authenticated の EXECUTE は存在しない
```

---

## ロールバック方針（安全版）

原則:
- `clinic_manager` や `profiles` 直接参照の旧ポリシーには戻さない。
- 2026-01-26 時点（`get_current_role` + `can_access_clinic`）を下限として戻す。

```sql
BEGIN;

-- CHECK制約は canonical を維持（clinic_manager には戻さない）
ALTER TABLE public.staff_invites
    DROP CONSTRAINT IF EXISTS staff_invites_role_check;
ALTER TABLE public.staff_invites
    ADD CONSTRAINT staff_invites_role_check
    CHECK (role IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager'));

-- creator_* を 20260126000100 相当に戻す（role制約のみ解除）
DROP POLICY IF EXISTS "staff_invites_clinic_admin_select" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_select" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_insert" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_update" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_delete" ON public.staff_invites;

CREATE POLICY "staff_invites_clinic_admin_select"
ON public.staff_invites FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_invites_creator_select"
ON public.staff_invites FOR SELECT
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_invites_creator_insert"
ON public.staff_invites FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_invites_creator_update"
ON public.staff_invites FOR UPDATE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
)
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_invites_creator_delete"
ON public.staff_invites FOR DELETE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

COMMIT;
```

注意:
- MFA関数権限（`authenticated` 再付与）はセキュリティ後退のため、原則ロールバック対象外。
- どうしても戻す場合は別承認・別PRで実施する。

---

## アプリ側確認項目（本マイグレーション外）

`menus_select_public` により、公開系はアプリで `clinic_id` フィルタ必須。

確認対象:
- `src/hooks/useReservationFormData.ts`（`/api/menus` 呼び出し）
- `src/app/api/menus/route.ts`
- `src/app/api/public/menus/route.ts`
- `src/app/api/public/reservations/route.ts`（menu/resource の clinic_id スコープ）

---

## DoD 紐付け

- DOD-04: `supabase db push --local --dry-run` で差分確認
- DOD-08: `staff_invites` policy が `can_access_clinic` + 単一ヘルパー基準を満たすこと
- DOD-10: `npm run build` 回帰なし

参照: `docs/stabilization/DoD-v0.1.md`

---

## 変更ログ

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0 | 2026-02-22 | 初版 |
| v1.1 | 2026-02-22 | 制約更新順序/`GET DIAGNOSTICS`/service_role説明を修正 |
| v1.2 | 2026-02-22 | 前提を現行チェーンに合わせて更新。policy名互換維持。ロールバックを安全版へ再設計。 |
| v1.3 | 2026-02-22 | セルフレビュー反映。MFA関数権限のドリフト対策として `REVOKE ALL ... FROM PUBLIC` を追加。 |

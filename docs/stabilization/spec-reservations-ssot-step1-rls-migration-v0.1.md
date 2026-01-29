# Reservations SSOT Step 1 RLS/Permissions Migration Plan v0.1

## Goal
- `public.appointments` を read-only のまま維持しつつ、RLSの役割判定を統一する。
- DOD-08 の「単一のヘルパー関数」に合わせて `public.get_current_role()` を使う。

## Background
- Step 1 仕様: `docs/stabilization/spec-reservations-ssot-step1-v0.1.md`
- Read-only 既存マイグレーション: `supabase/migrations/20260126000200_appointments_read_only.sql`
  - `appointments_insert_service_role` が `auth.role()` を使用
- 役割判定の正: `public.get_current_role()` (`supabase/migrations/20251224001000_auth_helper_functions.sql`)

## Proposed Migration (Draft)
- 新規マイグレーション名（案）:
  - `supabase/migrations/20260126000300_appointments_read_only_role_alignment.sql`
- 変更内容:
  1) `appointments_insert_service_role` を再作成
  2) `auth.role()` ではなく `public.get_current_role()` を使用
  3) `appointments_select_for_staff` は既存のまま維持

## SQL (Draft)
```sql
BEGIN;

DROP POLICY IF EXISTS "appointments_insert_service_role" ON public.appointments;

CREATE POLICY "appointments_insert_service_role"
ON public.appointments FOR INSERT
WITH CHECK (public.get_current_role() = 'service_role');

COMMIT;
```

## Rollback Plan
- `appointments_insert_service_role` を `auth.role() = 'service_role'` で再作成。
- もしくは当該ポリシーを削除し、INSERT を完全禁止に戻す。

## Verification
- `pg_policies` で `appointments_insert_service_role` の `qual` が
  `public.get_current_role()` を使っていることを確認。
- `appointments_select_for_staff` が `public.can_access_clinic(appointments.clinic_id)`
  と `public.get_current_role()` を維持していることを確認。
- DOD-02: 再実行してもエラーが出ないことを確認。
- 実施結果（ローカル）:
  - `rg -n "from\(['\"]appointments['\"]\).*(insert|update|delete|upsert)" src` は該当なし。
  - staff の INSERT は RLS で拒否、service_role の INSERT は許可。
  - `pg_policies` 出力:
    ```text
                policyname            |  cmd   |                                                                             qual                                                                              |                 with_check                  
    ----------------------------------+--------+---------------------------------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------
     appointments_insert_service_role | INSERT |                                                                                                                                                               | (get_current_role() = 'service_role'::text)
     appointments_select_for_staff    | SELECT | ((get_current_role() = ANY (ARRAY['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])) AND can_access_clinic(clinic_id)) | 
    (2 rows)
    ```

## DoD Mapping (Stabilization)
- DOD-08: 役割判定のソースを `public.get_current_role()` に統一。
- DOD-02: マイグレーションが冪等であること。

-- ================================================================
-- Migration: Repair app_private RLS helper policy references
-- ================================================================
-- Purpose:
--   1. Repair already-applied policies whose helper functions remained
--      unqualified after 20260507000200_security_advisor_rpc_hardening.sql.
--   2. Keep RLS semantics unchanged while making policies call app_private
--      helpers whose EXECUTE grants remain available to authenticated users.
--   3. Preserve Supabase Advisor hardening by not restoring public RPC grants.
-- Related:
--   - docs/stabilization/spec-rls-policy-helper-rewrite-repair-2026-05-07.md
--   - docs/stabilization/DoD-v0.1.md DOD-08
-- ================================================================

begin;

create or replace function pg_temp.rewrite_app_private_policy_helpers(input_expr text)
returns text
language plpgsql
as $$
declare
  output_expr text;
begin
  if input_expr is null then
    return null;
  end if;

  output_expr := input_expr;

  output_expr := replace(output_expr, 'public.get_current_role()', 'app_private.get_current_role()');
  output_expr := replace(output_expr, '"public"."get_current_role"()', '"app_private"."get_current_role"()');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])get_current_role\(\)', '\1app_private.get_current_role()', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"get_current_role"\(\)', '\1"app_private"."get_current_role"()', 'g');

  output_expr := replace(output_expr, 'public.get_current_clinic_id()', 'app_private.get_current_clinic_id()');
  output_expr := replace(output_expr, '"public"."get_current_clinic_id"()', '"app_private"."get_current_clinic_id"()');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])get_current_clinic_id\(\)', '\1app_private.get_current_clinic_id()', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"get_current_clinic_id"\(\)', '\1"app_private"."get_current_clinic_id"()', 'g');

  output_expr := replace(output_expr, 'public.can_access_clinic(', 'app_private.can_access_clinic(');
  output_expr := replace(output_expr, '"public"."can_access_clinic"(', '"app_private"."can_access_clinic"(');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])can_access_clinic\(', '\1app_private.can_access_clinic(', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"can_access_clinic"\(', '\1"app_private"."can_access_clinic"(', 'g');

  output_expr := replace(output_expr, 'public.belongs_to_clinic(', 'app_private.belongs_to_clinic(');
  output_expr := replace(output_expr, '"public"."belongs_to_clinic"(', '"app_private"."belongs_to_clinic"(');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])belongs_to_clinic\(', '\1app_private.belongs_to_clinic(', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"belongs_to_clinic"\(', '\1"app_private"."belongs_to_clinic"(', 'g');

  output_expr := replace(output_expr, 'public.is_admin()', 'app_private.is_admin()');
  output_expr := replace(output_expr, '"public"."is_admin"()', '"app_private"."is_admin"()');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])is_admin\(\)', '\1app_private.is_admin()', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"is_admin"\(\)', '\1"app_private"."is_admin"()', 'g');

  output_expr := replace(output_expr, 'public.jwt_clinic_id()', 'app_private.jwt_clinic_id()');
  output_expr := replace(output_expr, '"public"."jwt_clinic_id"()', '"app_private"."jwt_clinic_id"()');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])jwt_clinic_id\(\)', '\1app_private.jwt_clinic_id()', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"jwt_clinic_id"\(\)', '\1"app_private"."jwt_clinic_id"()', 'g');

  output_expr := replace(output_expr, 'public.jwt_is_admin()', 'app_private.jwt_is_admin()');
  output_expr := replace(output_expr, '"public"."jwt_is_admin"()', '"app_private"."jwt_is_admin"()');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])jwt_is_admin\(\)', '\1app_private.jwt_is_admin()', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"jwt_is_admin"\(\)', '\1"app_private"."jwt_is_admin"()', 'g');

  output_expr := replace(output_expr, 'public.user_role()', 'app_private.user_role()');
  output_expr := replace(output_expr, '"public"."user_role"()', '"app_private"."user_role"()');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])user_role\(\)', '\1app_private.user_role()', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"user_role"\(\)', '\1"app_private"."user_role"()', 'g');

  output_expr := replace(output_expr, 'public.get_sibling_clinic_ids(', 'app_private.get_sibling_clinic_ids(');
  output_expr := replace(output_expr, '"public"."get_sibling_clinic_ids"(', '"app_private"."get_sibling_clinic_ids"(');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])get_sibling_clinic_ids\(', '\1app_private.get_sibling_clinic_ids(', 'g');
  output_expr := regexp_replace(output_expr, '(^|[^."[:alnum:]_])"get_sibling_clinic_ids"\(', '\1"app_private"."get_sibling_clinic_ids"(', 'g');

  return output_expr;
end;
$$;

do $$
declare
  rec record;
  new_qual text;
  new_with_check text;
begin
  for rec in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ '(get_current_role|get_current_clinic_id|can_access_clinic|belongs_to_clinic|is_admin|jwt_clinic_id|jwt_is_admin|user_role|get_sibling_clinic_ids)'
        or coalesce(with_check, '') ~ '(get_current_role|get_current_clinic_id|can_access_clinic|belongs_to_clinic|is_admin|jwt_clinic_id|jwt_is_admin|user_role|get_sibling_clinic_ids)'
      )
  loop
    new_qual := pg_temp.rewrite_app_private_policy_helpers(rec.qual);
    new_with_check := pg_temp.rewrite_app_private_policy_helpers(rec.with_check);

    if coalesce(new_qual, '') <> coalesce(rec.qual, '')
       or coalesce(new_with_check, '') <> coalesce(rec.with_check, '') then
      if new_qual is not null and new_with_check is not null then
        execute format(
          'alter policy %I on %I.%I using (%s) with check (%s)',
          rec.policyname,
          rec.schemaname,
          rec.tablename,
          new_qual,
          new_with_check
        );
      elsif new_qual is not null then
        execute format(
          'alter policy %I on %I.%I using (%s)',
          rec.policyname,
          rec.schemaname,
          rec.tablename,
          new_qual
        );
      elsif new_with_check is not null then
        execute format(
          'alter policy %I on %I.%I with check (%s)',
          rec.policyname,
          rec.schemaname,
          rec.tablename,
          new_with_check
        );
      end if;
    end if;
  end loop;
end
$$;

commit;

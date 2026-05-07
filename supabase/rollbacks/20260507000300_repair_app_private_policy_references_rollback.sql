-- ================================================================
-- Rollback: Repair app_private RLS helper policy references
-- ================================================================
-- Target: supabase/migrations/20260507000300_repair_app_private_policy_references.sql
-- Restores public helper policy references and the minimal public helper
-- EXECUTE grants needed for those policies to run.
-- ================================================================

begin;

create or replace function pg_temp.rewrite_public_policy_helpers(input_expr text)
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

  output_expr := replace(output_expr, 'app_private.get_current_role()', 'public.get_current_role()');
  output_expr := replace(output_expr, '"app_private"."get_current_role"()', '"public"."get_current_role"()');
  output_expr := replace(output_expr, 'app_private.get_current_clinic_id()', 'public.get_current_clinic_id()');
  output_expr := replace(output_expr, '"app_private"."get_current_clinic_id"()', '"public"."get_current_clinic_id"()');
  output_expr := replace(output_expr, 'app_private.can_access_clinic(', 'public.can_access_clinic(');
  output_expr := replace(output_expr, '"app_private"."can_access_clinic"(', '"public"."can_access_clinic"(');
  output_expr := replace(output_expr, 'app_private.belongs_to_clinic(', 'public.belongs_to_clinic(');
  output_expr := replace(output_expr, '"app_private"."belongs_to_clinic"(', '"public"."belongs_to_clinic"(');
  output_expr := replace(output_expr, 'app_private.is_admin()', 'public.is_admin()');
  output_expr := replace(output_expr, '"app_private"."is_admin"()', '"public"."is_admin"()');
  output_expr := replace(output_expr, 'app_private.jwt_clinic_id()', 'public.jwt_clinic_id()');
  output_expr := replace(output_expr, '"app_private"."jwt_clinic_id"()', '"public"."jwt_clinic_id"()');
  output_expr := replace(output_expr, 'app_private.jwt_is_admin()', 'public.jwt_is_admin()');
  output_expr := replace(output_expr, '"app_private"."jwt_is_admin"()', '"public"."jwt_is_admin"()');
  output_expr := replace(output_expr, 'app_private.user_role()', 'public.user_role()');
  output_expr := replace(output_expr, '"app_private"."user_role"()', '"public"."user_role"()');
  output_expr := replace(output_expr, 'app_private.get_sibling_clinic_ids(', 'public.get_sibling_clinic_ids(');
  output_expr := replace(output_expr, '"app_private"."get_sibling_clinic_ids"(', '"public"."get_sibling_clinic_ids"(');

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
        coalesce(qual, '') like '%app_private.%'
        or coalesce(qual, '') like '%"app_private"%'
        or coalesce(with_check, '') like '%app_private.%'
        or coalesce(with_check, '') like '%"app_private"%'
      )
  loop
    new_qual := pg_temp.rewrite_public_policy_helpers(rec.qual);
    new_with_check := pg_temp.rewrite_public_policy_helpers(rec.with_check);

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

grant execute on function public.jwt_clinic_id() to anon, authenticated;
grant execute on function public.jwt_is_admin() to anon, authenticated;
grant execute on function public.get_current_clinic_id() to anon, authenticated;
grant execute on function public.get_current_role() to anon, authenticated;
grant execute on function public.can_access_clinic(uuid) to anon, authenticated;
grant execute on function public.belongs_to_clinic(uuid) to anon, authenticated;
grant execute on function public.get_sibling_clinic_ids(uuid) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.user_role() to anon, authenticated;

commit;

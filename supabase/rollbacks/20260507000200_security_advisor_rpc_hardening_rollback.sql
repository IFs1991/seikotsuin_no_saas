-- ================================================================
-- Rollback: Security Advisor RPC Hardening
-- ================================================================
-- Target: supabase/migrations/20260507000200_security_advisor_rpc_hardening.sql
-- Restores public helper references and public RPC grants.
-- ================================================================

begin;

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
    new_qual := rec.qual;
    new_with_check := rec.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'app_private.get_current_role()', 'public.get_current_role()');
      new_qual := replace(new_qual, '"app_private"."get_current_role"()', '"public"."get_current_role"()');
      new_qual := replace(new_qual, 'app_private.get_current_clinic_id()', 'public.get_current_clinic_id()');
      new_qual := replace(new_qual, '"app_private"."get_current_clinic_id"()', '"public"."get_current_clinic_id"()');
      new_qual := replace(new_qual, 'app_private.can_access_clinic(', 'public.can_access_clinic(');
      new_qual := replace(new_qual, '"app_private"."can_access_clinic"(', '"public"."can_access_clinic"(');
      new_qual := replace(new_qual, 'app_private.belongs_to_clinic(', 'public.belongs_to_clinic(');
      new_qual := replace(new_qual, '"app_private"."belongs_to_clinic"(', '"public"."belongs_to_clinic"(');
      new_qual := replace(new_qual, 'app_private.is_admin()', 'public.is_admin()');
      new_qual := replace(new_qual, '"app_private"."is_admin"()', '"public"."is_admin"()');
      new_qual := replace(new_qual, 'app_private.jwt_clinic_id()', 'public.jwt_clinic_id()');
      new_qual := replace(new_qual, '"app_private"."jwt_clinic_id"()', '"public"."jwt_clinic_id"()');
      new_qual := replace(new_qual, 'app_private.jwt_is_admin()', 'public.jwt_is_admin()');
      new_qual := replace(new_qual, '"app_private"."jwt_is_admin"()', '"public"."jwt_is_admin"()');
      new_qual := replace(new_qual, 'app_private.user_role()', 'public.user_role()');
      new_qual := replace(new_qual, '"app_private"."user_role"()', '"public"."user_role"()');
    end if;

    if new_with_check is not null then
      new_with_check := replace(new_with_check, 'app_private.get_current_role()', 'public.get_current_role()');
      new_with_check := replace(new_with_check, '"app_private"."get_current_role"()', '"public"."get_current_role"()');
      new_with_check := replace(new_with_check, 'app_private.get_current_clinic_id()', 'public.get_current_clinic_id()');
      new_with_check := replace(new_with_check, '"app_private"."get_current_clinic_id"()', '"public"."get_current_clinic_id"()');
      new_with_check := replace(new_with_check, 'app_private.can_access_clinic(', 'public.can_access_clinic(');
      new_with_check := replace(new_with_check, '"app_private"."can_access_clinic"(', '"public"."can_access_clinic"(');
      new_with_check := replace(new_with_check, 'app_private.belongs_to_clinic(', 'public.belongs_to_clinic(');
      new_with_check := replace(new_with_check, '"app_private"."belongs_to_clinic"(', '"public"."belongs_to_clinic"(');
      new_with_check := replace(new_with_check, 'app_private.is_admin()', 'public.is_admin()');
      new_with_check := replace(new_with_check, '"app_private"."is_admin"()', '"public"."is_admin"()');
      new_with_check := replace(new_with_check, 'app_private.jwt_clinic_id()', 'public.jwt_clinic_id()');
      new_with_check := replace(new_with_check, '"app_private"."jwt_clinic_id"()', '"public"."jwt_clinic_id"()');
      new_with_check := replace(new_with_check, 'app_private.jwt_is_admin()', 'public.jwt_is_admin()');
      new_with_check := replace(new_with_check, '"app_private"."jwt_is_admin"()', '"public"."jwt_is_admin"()');
      new_with_check := replace(new_with_check, 'app_private.user_role()', 'public.user_role()');
      new_with_check := replace(new_with_check, '"app_private"."user_role"()', '"public"."user_role"()');
    end if;

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

alter function public.update_email_outbox_updated_at() reset search_path;
alter function public.validate_daily_report_items_clinic_refs() reset search_path;

do $$
declare
  target_functions text[] := array[
    'accept_invite',
    'aggregate_mfa_stats',
    'belongs_to_clinic',
    'can_access_clinic',
    'create_clinic_with_admin',
    'custom_access_token_hook',
    'decrypt_mfa_secret',
    'encrypt_mfa_secret',
    'get_clinic_settings',
    'get_current_clinic_id',
    'get_current_role',
    'get_invite_by_token',
    'get_sibling_clinic_ids',
    'is_admin',
    'jwt_clinic_id',
    'jwt_is_admin',
    'log_reservation_created',
    'log_reservation_deleted',
    'log_reservation_updated',
    'recalculate_daily_report_totals',
    'refresh_daily_stats',
    'rls_auto_enable',
    'sync_arrived_reservation_daily_report_item',
    'sync_daily_report_item_totals',
    'update_customer_stats',
    'update_email_outbox_updated_at',
    'upsert_clinic_settings',
    'user_role'
  ];
  rec record;
begin
  for rec in
    select p.oid::regprocedure as function_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_functions)
  loop
    execute format(
      'grant execute on function %s to anon, authenticated, service_role',
      rec.function_signature
    );
  end loop;
end
$$;

drop schema if exists app_private cascade;

commit;

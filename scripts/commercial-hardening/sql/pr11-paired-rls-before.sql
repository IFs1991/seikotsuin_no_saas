-- PR-11 local-only PR-10-equivalent authenticated RLS sample.
--
-- Seven target-table PR-11 indexes and six split write policies are replaced
-- by the two predicate-equivalent pre-PR-11 ALL policies only inside this
-- transaction. The canonical probe ends with ROLLBACK and restores PR-11.

\set ON_ERROR_STOP on
\pset pager off

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

do $pr11_paired_rls_preflight$
begin
  if current_database() <> 'postgres'
    or (select system_identifier::text from pg_control_system())
      <> '7662783869098430503'
    or current_setting('server_version_num') <> '170006'
  then
    raise exception 'PR-11 paired RLS baseline refused: local DB identity drift';
  end if;

  if (
    select max(version)
    from supabase_migrations.schema_migrations
  ) <> '20260716160402' then
    raise exception 'PR-11 paired RLS baseline refused: migration head drift';
  end if;

  if (
    select count(*)
    from unnest(array[
      'public.customer_insurance_coverages_created_by_idx'::regclass,
      'public.customer_insurance_coverages_updated_by_idx'::regclass,
      'public.customer_insurance_coverages_verified_by_idx'::regclass,
      'public.menu_billing_profiles_created_by_idx'::regclass,
      'public.menu_billing_profiles_revenue_context_code_idx'::regclass,
      'public.menu_billing_profiles_source_template_profile_id_idx'::regclass,
      'public.menu_billing_profiles_updated_by_idx'::regclass
    ]) expected(index_oid)
    join pg_index index_data on index_data.indexrelid = expected.index_oid
    where index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
  ) <> 7 then
    raise exception 'PR-11 paired RLS baseline refused: target index drift';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'customer_insurance_coverages_insert_for_clinic_pricing_admin',
        'customer_insurance_coverages_update_for_clinic_pricing_admin',
        'customer_insurance_coverages_delete_for_clinic_pricing_admin',
        'menu_billing_profiles_insert_for_clinic_pricing_admin',
        'menu_billing_profiles_update_for_clinic_pricing_admin',
        'menu_billing_profiles_delete_for_clinic_pricing_admin'
      )
  ) <> 6
    or exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'customer_insurance_coverages_write_for_clinic_pricing_admin',
          'menu_billing_profiles_write_for_clinic_pricing_admin'
        )
    )
  then
    raise exception 'PR-11 paired RLS baseline refused: policy drift';
  end if;
end
$pr11_paired_rls_preflight$;

drop index public.customer_insurance_coverages_created_by_idx;
drop index public.customer_insurance_coverages_updated_by_idx;
drop index public.customer_insurance_coverages_verified_by_idx;
drop index public.menu_billing_profiles_created_by_idx;
drop index public.menu_billing_profiles_revenue_context_code_idx;
drop index public.menu_billing_profiles_source_template_profile_id_idx;
drop index public.menu_billing_profiles_updated_by_idx;

drop policy customer_insurance_coverages_insert_for_clinic_pricing_admin
on public.customer_insurance_coverages;
drop policy customer_insurance_coverages_update_for_clinic_pricing_admin
on public.customer_insurance_coverages;
drop policy customer_insurance_coverages_delete_for_clinic_pricing_admin
on public.customer_insurance_coverages;

create policy customer_insurance_coverages_write_for_clinic_pricing_admin
on public.customer_insurance_coverages
for all
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

comment on policy customer_insurance_coverages_write_for_clinic_pricing_admin
on public.customer_insurance_coverages is
  'PR-03: authenticated-only ALL policy; authorization remains defined by the reviewed USING/WITH CHECK predicate. Server service_role flows use BYPASSRLS.';

drop policy menu_billing_profiles_insert_for_clinic_pricing_admin
on public.menu_billing_profiles;
drop policy menu_billing_profiles_update_for_clinic_pricing_admin
on public.menu_billing_profiles;
drop policy menu_billing_profiles_delete_for_clinic_pricing_admin
on public.menu_billing_profiles;

create policy menu_billing_profiles_write_for_clinic_pricing_admin
on public.menu_billing_profiles
for all
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

comment on policy menu_billing_profiles_write_for_clinic_pricing_admin
on public.menu_billing_profiles is
  'PR-03: authenticated-only ALL policy; authorization remains defined by the reviewed USING/WITH CHECK predicate. Server service_role flows use BYPASSRLS.';

do $pr11_paired_rls_baseline_guard$
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 179
    or (
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'customer_insurance_coverages_write_for_clinic_pricing_admin',
          'menu_billing_profiles_write_for_clinic_pricing_admin'
        )
        and cmd = 'ALL'
        and permissive = 'PERMISSIVE'
        and roles = array['authenticated']::name[]
        and md5(
          coalesce(qual, '<NULL>')
          || chr(10)
          || coalesce(with_check, '<NULL>')
        ) = '90836fd21bf2ea809a99a9fe167a69a5'
    ) <> 2
    or (
      select count(*)
      from pg_policy policy_catalog
      join pg_class table_catalog
        on table_catalog.oid = policy_catalog.polrelid
      join pg_namespace table_namespace
        on table_namespace.oid = table_catalog.relnamespace
      where table_namespace.nspname = 'public'
        and policy_catalog.polname in (
          'customer_insurance_coverages_write_for_clinic_pricing_admin',
          'menu_billing_profiles_write_for_clinic_pricing_admin'
        )
        and obj_description(policy_catalog.oid, 'pg_policy') =
          'PR-03: authenticated-only ALL policy; authorization remains defined by the reviewed USING/WITH CHECK predicate. Server service_role flows use BYPASSRLS.'
    ) <> 2
  then
    raise exception 'PR-11 paired RLS baseline refused: PR-10 policy shape drift';
  end if;
end
$pr11_paired_rls_baseline_guard$;

select jsonb_build_object(
  'phase', 'pr10_equivalent_before',
  'scope', 'transaction_only',
  'target_pr11_indexes_present', 0,
  'retired_all_policies_present', 2,
  'split_policies_present', 0,
  'captured_at_utc', clock_timestamp() at time zone 'UTC'
) as paired_phase;

\ir pr11-rls-plan-probe.sql

do $pr11_paired_rls_postrollback$
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 183
    or (
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'customer_insurance_coverages_insert_for_clinic_pricing_admin',
          'customer_insurance_coverages_update_for_clinic_pricing_admin',
          'customer_insurance_coverages_delete_for_clinic_pricing_admin',
          'menu_billing_profiles_insert_for_clinic_pricing_admin',
          'menu_billing_profiles_update_for_clinic_pricing_admin',
          'menu_billing_profiles_delete_for_clinic_pricing_admin'
        )
    ) <> 6
    or exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'customer_insurance_coverages_write_for_clinic_pricing_admin',
          'menu_billing_profiles_write_for_clinic_pricing_admin'
        )
    )
    or to_regclass('public.customer_insurance_coverages_created_by_idx') is null
    or to_regclass('public.customer_insurance_coverages_updated_by_idx') is null
    or to_regclass('public.customer_insurance_coverages_verified_by_idx') is null
    or to_regclass('public.menu_billing_profiles_created_by_idx') is null
    or to_regclass('public.menu_billing_profiles_revenue_context_code_idx') is null
    or to_regclass(
      'public.menu_billing_profiles_source_template_profile_id_idx'
    ) is null
    or to_regclass('public.menu_billing_profiles_updated_by_idx') is null
  then
    raise exception 'PR-11 paired RLS postflight failed: PR-11 not restored';
  end if;
end
$pr11_paired_rls_postrollback$;

select jsonb_build_object(
  'phase', 'pr11_restored_after_rollback',
  'target_pr11_indexes_present', 7,
  'retired_all_policies_present', 0,
  'split_policies_present', 6,
  'captured_at_utc', clock_timestamp() at time zone 'UTC'
) as paired_postrollback;

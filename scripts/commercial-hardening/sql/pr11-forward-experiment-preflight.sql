-- PR-11 transaction-only forward-fix experiment preflight.
-- Refuse any database other than the already-approved local PR-11 state.

\set ON_ERROR_STOP on
\pset pager off

do $pr11_forward_experiment_preflight$
declare
  trigger_definition_hash text;
  trigger_enabled "char";
  helper_definition_hash text;
  helper_acl_hash text;
begin
  if current_database() <> 'postgres'
    or (select system_identifier::text from pg_control_system())
      <> '7662783869098430503'
    or current_setting('server_version_num') <> '170006'
  then
    raise exception
      'PR-11 forward experiment refused: local database identity drift';
  end if;

  if (
    select max(version)
    from supabase_migrations.schema_migrations
  ) <> '20260716160402' then
    raise exception
      'PR-11 forward experiment refused: migration head drift';
  end if;

  if to_regclass(
      'public.customer_insurance_coverages_clinic_id_id_idx'
    ) is not null
    or to_regclass(
      'public.menu_billing_profiles_clinic_id_id_idx'
    ) is not null
  then
    raise exception
      'PR-11 forward experiment refused: candidate index already exists';
  end if;

  if to_regprocedure(
      'app_private.get_current_accessible_clinic_ids()'
    ) is not null
  then
    raise exception
      'PR-11 forward experiment refused: candidate scope helper already exists';
  end if;

  if (
    select count(*)
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and (policy_data.tablename, policy_data.policyname) in (
        values
          (
            'customer_insurance_coverages',
            'customer_insurance_coverages_select_for_staff'
          ),
          (
            'menu_billing_profiles',
            'menu_billing_profiles_select_for_staff'
          )
      )
      and policy_data.permissive = 'PERMISSIVE'
      and policy_data.roles = array['authenticated']::name[]
      and policy_data.cmd = 'SELECT'
      and md5(
        coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) = '4c75ea819ae329a56c37e0a1585cb63f'
  ) <> 2
  then
    raise exception
      'PR-11 forward experiment refused: retained SELECT policy drift';
  end if;

  select
    md5(pg_get_triggerdef(trigger_data.oid)),
    trigger_data.tgenabled
  into trigger_definition_hash, trigger_enabled
  from pg_trigger trigger_data
  where trigger_data.tgrelid = 'public.blocks'::regclass
    and trigger_data.tgname = 'blocks_clinic_ref_check'
    and not trigger_data.tgisinternal;

  if trigger_definition_hash is distinct from
      '39c16618a7c772d6b9ecd1a541d0c2a5'
    or trigger_enabled is distinct from 'O'::"char"
  then
    raise exception
      'PR-11 forward experiment refused: blocks trigger drift';
  end if;

  select
    md5(pg_get_functiondef(function_data.oid)),
    md5(coalesce(array_to_string(function_data.proacl, ','), '<NULL>'))
  into helper_definition_hash, helper_acl_hash
  from pg_proc function_data
  where function_data.oid =
    'public.validate_blocks_clinic_refs()'::regprocedure;

  if helper_definition_hash is distinct from
      'c7b71380054958e03ada965a5db5adc4'
    or helper_acl_hash is distinct from
      '8f838c64ac450430e53b33669676310e'
  then
    raise exception
      'PR-11 forward experiment refused: blocks helper drift';
  end if;

  if (
    select count(*)
    from pg_constraint constraint_data
    where constraint_data.conname = 'blocks_resource_id_fkey'
      and constraint_data.conrelid = 'public.blocks'::regclass
      and constraint_data.confrelid = 'public.resources'::regclass
      and constraint_data.contype = 'f'
      and constraint_data.convalidated
      and not constraint_data.condeferrable
      and constraint_data.confdeltype = 'c'
      and md5(pg_get_constraintdef(constraint_data.oid)) =
        'a3e490b595d9cf3153c16f482e053df3'
  ) <> 1
    or (
      select count(*)
      from pg_constraint constraint_data
      where constraint_data.conname = 'resources_id_clinic_unique'
        and constraint_data.conrelid = 'public.resources'::regclass
        and constraint_data.contype = 'u'
        and constraint_data.convalidated
        and md5(pg_get_constraintdef(constraint_data.oid)) =
          '6c2d9cf01a89532d7a688b7d4a43b242'
    ) <> 1
    or (
      select count(*)
      from pg_attribute attribute_data
      where attribute_data.attrelid = 'public.blocks'::regclass
        and attribute_data.attname in ('resource_id', 'clinic_id')
        and attribute_data.attnotnull
        and not attribute_data.attisdropped
    ) <> 2
  then
    raise exception
      'PR-11 forward experiment refused: blocks composite FK drift';
  end if;

  if exists (
    select 1
    from pg_class relation_data
    where relation_data.oid in (
      'public.customer_insurance_coverages'::regclass,
      'public.menu_billing_profiles'::regclass
    )
      and not relation_data.relrowsecurity
  ) then
    raise exception
      'PR-11 forward experiment refused: target RLS is not enabled';
  end if;
end
$pr11_forward_experiment_preflight$;

select jsonb_build_object(
  'kind', 'experiment_preflight',
  'database', current_database(),
  'server_version_num', current_setting('server_version_num'),
  'migration_head', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'candidate_indexes_present', 0,
  'candidate_scope_helper_present', false,
  'blocks_trigger_enabled', true,
  'contract_pass', true
) as preflight_result;

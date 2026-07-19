-- Deterministic logical/catalog snapshot for the 17 normalized relations.
-- Only counts and hashes are emitted; no row content or credential is printed.

\set ON_ERROR_STOP on
\pset pager off

with relation_rows(relation_name, row_count, row_hash) as (
  select 'auth.users', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from auth.users source
  union all
  select 'public.clinics', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.clinics source
  union all
  select 'public.profiles', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.profiles source
  union all
  select 'public.resources', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.resources source
  union all
  select 'public.shift_request_periods', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.shift_request_periods source
  union all
  select 'public.staff', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.staff source
  union all
  select 'public.user_permissions', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.user_permissions source
  union all
  select 'public.blocks', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.blocks source
  union all
  select 'public.customers', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.customers source
  union all
  select 'public.reservations', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.reservations source
  union all
  select 'public.reservation_history', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.reservation_history source
  union all
  select 'public.shift_requests', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.shift_requests source
  union all
  select 'public.patient_outreach_recipients', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.patient_outreach_recipients source
  union all
  select 'public.customer_insurance_coverages', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.customer_insurance_coverages source
  union all
  select 'public.menus', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.menus source
  union all
  select 'public.menu_billing_profiles', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.menu_billing_profiles source
  union all
  select 'public.patient_outreach_campaigns', count(*), md5(coalesce(string_agg(to_jsonb(source)::text, E'\n' order by to_jsonb(source)::text), '')) from public.patient_outreach_campaigns source
), target_relations(relation_oid) as (
  select unnest(array[
    'auth.users'::regclass,
    'public.clinics'::regclass,
    'public.profiles'::regclass,
    'public.resources'::regclass,
    'public.shift_request_periods'::regclass,
    'public.staff'::regclass,
    'public.user_permissions'::regclass,
    'public.blocks'::regclass,
    'public.customers'::regclass,
    'public.reservations'::regclass,
    'public.reservation_history'::regclass,
    'public.shift_requests'::regclass,
    'public.patient_outreach_recipients'::regclass,
    'public.customer_insurance_coverages'::regclass,
    'public.menus'::regclass,
    'public.menu_billing_profiles'::regclass,
    'public.patient_outreach_campaigns'::regclass
  ])
), column_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', attribute_data.attrelid::regclass::text,
      attribute_data.attnum::text, attribute_data.attname,
      format_type(attribute_data.atttypid, attribute_data.atttypmod),
      attribute_data.attnotnull::text, attribute_data.attidentity,
      attribute_data.attgenerated,
      coalesce(pg_get_expr(default_data.adbin, default_data.adrelid), '')),
    E'\n' order by attribute_data.attrelid::regclass::text,
      attribute_data.attnum
  ), '')) as value
  from pg_attribute attribute_data
  join target_relations on target_relations.relation_oid = attribute_data.attrelid
  left join pg_attrdef default_data
    on default_data.adrelid = attribute_data.attrelid
   and default_data.adnum = attribute_data.attnum
  where attribute_data.attnum > 0
    and not attribute_data.attisdropped
), constraint_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', constraint_data.conrelid::regclass::text,
      constraint_data.conname, constraint_data.contype::text,
      constraint_data.convalidated::text,
      constraint_data.condeferrable::text,
      constraint_data.condeferred::text,
      pg_get_constraintdef(constraint_data.oid)),
    E'\n' order by constraint_data.conrelid::regclass::text,
      constraint_data.conname
  ), '')) as value
  from pg_constraint constraint_data
  join target_relations on target_relations.relation_oid = constraint_data.conrelid
), index_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', index_data.indrelid::regclass::text,
      index_class.relname, pg_get_indexdef(index_data.indexrelid),
      index_data.indisunique::text, index_data.indisvalid::text,
      index_data.indisready::text, index_data.indislive::text,
      coalesce(obj_description(index_data.indexrelid, 'pg_class'), '')),
    E'\n' order by index_data.indrelid::regclass::text, index_class.relname
  ), '')) as value
  from pg_index index_data
  join target_relations on target_relations.relation_oid = index_data.indrelid
  join pg_class index_class on index_class.oid = index_data.indexrelid
), trigger_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', trigger_data.tgrelid::regclass::text,
      trigger_data.tgname, trigger_data.tgenabled::text,
      trigger_data.tgisinternal::text,
      coalesce(trigger_data.tgconstraint::regclass::text, ''),
      pg_get_triggerdef(trigger_data.oid)),
    E'\n' order by trigger_data.tgrelid::regclass::text,
      trigger_data.tgname
  ), '')) as value
  from pg_trigger trigger_data
  join target_relations on target_relations.relation_oid = trigger_data.tgrelid
), relation_security_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', relation_data.oid::regclass::text,
      owner_data.rolname, relation_data.relrowsecurity::text,
      relation_data.relforcerowsecurity::text,
      coalesce(array_to_string(relation_data.relacl, ','), '<NULL>')),
    E'\n' order by relation_data.oid::regclass::text
  ), '')) as value
  from pg_class relation_data
  join target_relations on target_relations.relation_oid = relation_data.oid
  join pg_roles owner_data on owner_data.oid = relation_data.relowner
), policy_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', policy_data.polrelid::regclass::text,
      policy_data.polname, policy_data.polcmd::text,
      policy_data.polpermissive::text,
      array_to_string(policy_data.polroles, ','),
      coalesce(pg_get_expr(policy_data.polqual, policy_data.polrelid), ''),
      coalesce(pg_get_expr(policy_data.polwithcheck, policy_data.polrelid), ''),
      coalesce(obj_description(policy_data.oid, 'pg_policy'), '')),
    E'\n' order by policy_data.polrelid::regclass::text, policy_data.polname
  ), '')) as value
  from pg_policy policy_data
  join target_relations on target_relations.relation_oid = policy_data.polrelid
), helper_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', function_data.oid::regprocedure::text,
      owner_data.rolname, language_data.lanname,
      function_data.provolatile::text, function_data.prosecdef::text,
      function_data.proleakproof::text,
      coalesce(array_to_string(function_data.proconfig, ','), '<NULL>'),
      coalesce(array_to_string(function_data.proacl, ','), '<NULL>'),
      pg_get_functiondef(function_data.oid)),
    E'\n' order by function_data.oid::regprocedure::text
  ), '')) as value
  from pg_proc function_data
  join pg_roles owner_data on owner_data.oid = function_data.proowner
  join pg_language language_data on language_data.oid = function_data.prolang
  where function_data.oid in (
    'public.validate_blocks_clinic_refs()'::regprocedure,
    'app_private.get_current_accessible_clinic_ids()'::regprocedure,
    'app_private.get_current_role()'::regprocedure,
    'app_private.can_access_clinic(uuid)'::regprocedure
  )
), migration_catalog as (
  select md5(coalesce(string_agg(
    concat_ws('|', version, name,
      coalesce(array_to_string(statements, E'\n'), '')),
    E'\n' order by version
  ), '')) as value
  from supabase_migrations.schema_migrations
)
select jsonb_build_object(
  'kind', 'logical_snapshot',
  'database', current_database(),
  'server_version_num', current_setting('server_version_num'),
  'system_identifier', (select system_identifier::text from pg_control_system()),
  'migration_head', (select max(version) from supabase_migrations.schema_migrations),
  'migration_count', (select count(*) from supabase_migrations.schema_migrations),
  'migration_hash', (select value from migration_catalog),
  'relations', (
    select jsonb_object_agg(
      relation_name,
      jsonb_build_object('rows', row_count, 'hash', row_hash)
      order by relation_name
    )
    from relation_rows
  ),
  'catalog', jsonb_build_object(
    'columns', (select value from column_catalog),
    'constraints', (select value from constraint_catalog),
    'indexes', (select value from index_catalog),
    'triggers', (select value from trigger_catalog),
    'relation_security', (select value from relation_security_catalog),
    'policies', (select value from policy_catalog),
    'helpers', (select value from helper_catalog)
  )
) as snapshot_row;

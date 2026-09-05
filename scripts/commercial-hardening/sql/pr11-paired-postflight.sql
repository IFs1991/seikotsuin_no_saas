-- PR-11 exact read-only postflight for every local paired benchmark sample.

\set ON_ERROR_STOP on
\pset pager off

with pr11_indexes as (
  select
    table_namespace.nspname as table_schema,
    table_catalog.relname as table_name,
    index_catalog.relname as index_name,
    pg_get_indexdef(index_catalog.oid) as index_definition,
    coalesce(pg_get_expr(index_data.indpred, index_data.indrelid), '')
      as predicate_definition,
    access_method.amname as access_method,
    index_data.indisunique,
    index_data.indisvalid,
    index_data.indisready,
    index_data.indislive,
    index_data.indexprs is null as has_no_expressions,
    coalesce(obj_description(index_catalog.oid, 'pg_class'), '')
      as intent_comment
  from pg_index index_data
  join pg_class index_catalog on index_catalog.oid = index_data.indexrelid
  join pg_class table_catalog on table_catalog.oid = index_data.indrelid
  join pg_namespace table_namespace
    on table_namespace.oid = table_catalog.relnamespace
  join pg_am access_method on access_method.oid = index_catalog.relam
  where table_namespace.nspname = 'public'
    and coalesce(obj_description(index_catalog.oid, 'pg_class'), '')
      like 'PR-11: supports %'
), target_policies as (
  select
    table_namespace.nspname as table_schema,
    table_catalog.relname as table_name,
    policy_catalog.polname as policy_name,
    policy_catalog.polcmd,
    policy_catalog.polpermissive,
    coalesce((
      select string_agg(
        coalesce(role_catalog.rolname, 'PUBLIC'),
        ',' order by coalesce(role_catalog.rolname, 'PUBLIC')
      )
      from unnest(policy_catalog.polroles) policy_role(role_oid)
      left join pg_roles role_catalog
        on role_catalog.oid = policy_role.role_oid
    ), '') as role_names,
    coalesce(pg_get_expr(policy_catalog.polqual, policy_catalog.polrelid), '')
      as using_definition,
    coalesce(
      pg_get_expr(policy_catalog.polwithcheck, policy_catalog.polrelid),
      ''
    ) as check_definition,
    coalesce(obj_description(policy_catalog.oid, 'pg_policy'), '')
      as intent_comment
  from pg_policy policy_catalog
  join pg_class table_catalog on table_catalog.oid = policy_catalog.polrelid
  join pg_namespace table_namespace
    on table_namespace.oid = table_catalog.relnamespace
  where table_namespace.nspname = 'public'
    and table_catalog.relname in (
      'customer_insurance_coverages',
      'menu_billing_profiles'
    )
), split_policies as (
  select *
  from target_policies
  where policy_name in (
    'customer_insurance_coverages_insert_for_clinic_pricing_admin',
    'customer_insurance_coverages_update_for_clinic_pricing_admin',
    'customer_insurance_coverages_delete_for_clinic_pricing_admin',
    'menu_billing_profiles_insert_for_clinic_pricing_admin',
    'menu_billing_profiles_update_for_clinic_pricing_admin',
    'menu_billing_profiles_delete_for_clinic_pricing_admin'
  )
), all_public_policies as (
  select
    table_namespace.nspname as table_schema,
    table_catalog.relname as table_name,
    policy_catalog.polname as policy_name,
    policy_catalog.polcmd,
    policy_catalog.polpermissive,
    coalesce((
      select string_agg(
        coalesce(role_catalog.rolname, 'PUBLIC'),
        ',' order by coalesce(role_catalog.rolname, 'PUBLIC')
      )
      from unnest(policy_catalog.polroles) policy_role(role_oid)
      left join pg_roles role_catalog
        on role_catalog.oid = policy_role.role_oid
    ), '') as role_names,
    coalesce(pg_get_expr(policy_catalog.polqual, policy_catalog.polrelid), '')
      as using_definition,
    coalesce(
      pg_get_expr(policy_catalog.polwithcheck, policy_catalog.polrelid),
      ''
    ) as check_definition,
    coalesce(obj_description(policy_catalog.oid, 'pg_policy'), '')
      as intent_comment
  from pg_policy policy_catalog
  join pg_class table_catalog on table_catalog.oid = policy_catalog.polrelid
  join pg_namespace table_namespace
    on table_namespace.oid = table_catalog.relnamespace
  where table_namespace.nspname = 'public'
), target_acl_rows as (
  select
    table_catalog.relname as table_name,
    grantor_role.rolname as grantor_name,
    coalesce(grantee_role.rolname, 'PUBLIC') as grantee_name,
    acl_row.privilege_type,
    acl_row.is_grantable
  from pg_class table_catalog
  join pg_namespace table_namespace
    on table_namespace.oid = table_catalog.relnamespace
  cross join lateral aclexplode(
    coalesce(table_catalog.relacl, acldefault('r', table_catalog.relowner))
  ) acl_row
  join pg_roles grantor_role on grantor_role.oid = acl_row.grantor
  left join pg_roles grantee_role on grantee_role.oid = acl_row.grantee
  where table_namespace.nspname = 'public'
    and table_catalog.relname in (
      'customer_insurance_coverages',
      'menu_billing_profiles'
    )
), snapshot as (
  select
    current_database() as database_name,
    current_setting('server_version_num') as server_version_num,
    (select system_identifier::text from pg_control_system())
      as system_identifier,
    (
      select max(version)
      from supabase_migrations.schema_migrations
    ) as migration_head,
    (
      select count(*)
      from supabase_migrations.schema_migrations
    ) as migration_count,
    (
      select md5(coalesce(
        string_agg(
          concat_ws(
            '|',
            version,
            name,
            coalesce(array_to_string(statements, E'\n'), '')
          ),
          E'\n' order by version
        ),
        ''
      ))
      from supabase_migrations.schema_migrations
    ) as migration_hash,
    (
      select count(*)
      from supabase_migrations.schema_migrations
      where version in ('20260716160342', '20260716160402')
    ) as migration_row_count,
    (select count(*) from pr11_indexes) as index_count,
    (
      select count(*) from pr11_indexes where predicate_definition <> ''
    ) as partial_index_count,
    (
      select count(*) from pr11_indexes where predicate_definition = ''
    ) as full_index_count,
    (
      select count(*)
      from pr11_indexes
      where access_method = 'btree'
        and not indisunique
        and indisvalid
        and indisready
        and indislive
        and has_no_expressions
    ) as healthy_index_count,
    (
      select md5(coalesce(
        string_agg(index_name, E'\n' order by index_name),
        ''
      ))
      from pr11_indexes
    ) as index_name_hash,
    (
      select md5(coalesce(
        string_agg(
          index_name || '=' || index_definition,
          E'\n' order by index_name
        ),
        ''
      ))
      from pr11_indexes
    ) as index_definition_hash,
    (
      select md5(coalesce(
        string_agg(
          concat_ws(
            '|',
            table_schema,
            table_name,
            index_name,
            index_definition,
            predicate_definition,
            access_method,
            indisunique::text,
            indisvalid::text,
            indisready::text,
            indislive::text,
            has_no_expressions::text,
            intent_comment
          ),
          E'\n' order by index_name
        ),
        ''
      ))
      from pr11_indexes
    ) as index_catalog_hash,
    (select count(*) from target_policies) as target_policy_count,
    (select count(*) from split_policies) as split_policy_count,
    (
      select count(*)
      from target_policies
      where policy_name in (
        'customer_insurance_coverages_write_for_clinic_pricing_admin',
        'menu_billing_profiles_write_for_clinic_pricing_admin'
      )
    ) as retired_policy_count,
    (
      select md5(coalesce(
        string_agg(
          concat_ws(
            '|',
            table_schema,
            table_name,
            policy_name,
            polcmd::text,
            polpermissive::text,
            role_names,
            using_definition,
            check_definition,
            intent_comment
          ),
          E'\n' order by table_name, policy_name
        ),
        ''
      ))
      from split_policies
    ) as split_policy_hash,
    (
      select md5(coalesce(
        string_agg(
          concat_ws(
            '|',
            table_schema,
            table_name,
            policy_name,
            polcmd::text,
            polpermissive::text,
            role_names,
            using_definition,
            check_definition,
            intent_comment
          ),
          E'\n' order by table_name, policy_name
        ),
        ''
      ))
      from target_policies
    ) as target_policy_hash,
    (select count(*) from all_public_policies) as public_policy_count,
    (
      select md5(coalesce(
        string_agg(
          concat_ws(
            '|',
            table_schema,
            table_name,
            policy_name,
            polcmd::text,
            polpermissive::text,
            role_names,
            using_definition,
            check_definition,
            intent_comment
          ),
          E'\n' order by table_name, policy_name
        ),
        ''
      ))
      from all_public_policies
    ) as public_policy_hash,
    (select count(*) from target_acl_rows) as acl_row_count,
    (
      select md5(coalesce(
        string_agg(
          concat_ws(
            '|',
            table_name,
            grantor_name,
            grantee_name,
            privilege_type,
            is_grantable::text
          ),
          E'\n' order by
            table_name,
            grantor_name,
            grantee_name,
            privilege_type,
            is_grantable
        ),
        ''
      ))
      from target_acl_rows
    ) as acl_hash,
    (
      select array_agg(id order by id) is not distinct from
        array['bbbbbbb1-0000-4000-8000-bbbbbbbb0001'::uuid]
      from auth.users
    ) as auth_users_baseline,
    (
      select array_agg(id order by id) is not distinct from
        array['11111111-1111-4111-8111-111111111111'::uuid]
      from public.clinics
    ) as clinics_baseline,
    (
      select array_agg(id order by id) is not distinct from
        array['ccccccc1-0000-4000-8000-cccccccc0001'::uuid]
      from public.profiles
    ) as profiles_baseline,
    (select count(*) from public.resources) as resources_rows,
    (select count(*) from public.shift_request_periods) as shift_period_rows,
    (select count(*) from public.staff) as staff_rows,
    (select count(*) from public.user_permissions) as permission_rows,
    (select count(*) from public.blocks) as blocks_rows,
    (select count(*) from public.customers) as customers_rows,
    (select count(*) from public.reservations) as reservations_rows,
    (select count(*) from public.reservation_history)
      as reservation_history_rows,
    (
      select count(*) from public.customer_insurance_coverages
    ) as coverage_rows,
    (select count(*) from public.menu_billing_profiles) as menu_profile_rows,
    (select count(*) from public.menus) as menus_rows,
    (
      select count(*) from public.patient_outreach_campaigns
    ) as campaign_rows,
    (
      select count(*) from public.patient_outreach_recipients
    ) as recipient_rows,
    (select count(*) from public.shift_requests) as shift_request_rows,
    (select count(*) from pg_extension where extname = 'pgtap')
      as pgtap_count,
    (
      select count(*)
      from pg_proc function_catalog
      join pg_namespace function_namespace
        on function_namespace.oid = function_catalog.pronamespace
      where function_catalog.proname like 'pr11\_%' escape '\'
        and function_namespace.nspname !~ '^pg_(temp|toast_temp)_'
    ) as persistent_helper_count
)
select
  database_name,
  server_version_num,
  system_identifier,
  migration_head,
  migration_count,
  migration_hash,
  migration_row_count,
  index_count,
  partial_index_count,
  full_index_count,
  healthy_index_count,
  index_name_hash,
  index_definition_hash,
  index_catalog_hash,
  target_policy_count,
  split_policy_count,
  retired_policy_count,
  split_policy_hash,
  target_policy_hash,
  public_policy_count,
  public_policy_hash,
  acl_row_count,
  acl_hash,
  auth_users_baseline,
  clinics_baseline,
  profiles_baseline,
  resources_rows,
  shift_period_rows,
  staff_rows,
  permission_rows,
  blocks_rows,
  customers_rows,
  reservations_rows,
  reservation_history_rows,
  coverage_rows,
  menu_profile_rows,
  menus_rows,
  campaign_rows,
  recipient_rows,
  shift_request_rows,
  pgtap_count,
  persistent_helper_count,
  database_name = 'postgres'
    and server_version_num = '170006'
    and system_identifier = '7662783869098430503'
    and migration_head = '20260716160402'
    and migration_count = 60
    and migration_hash = 'cd71ca524d4580eeb83db7414cfa6af7'
    and migration_row_count = 2
    and index_count = 41
    and partial_index_count = 36
    and full_index_count = 5
    and healthy_index_count = 41
    and index_name_hash = 'eebd882ea90236e22a239b2c31c00e1d'
    and index_definition_hash = '6615238a8ad144b2eb86089d0b86b215'
    and index_catalog_hash = 'fc1e9a9fff4bb74e860c100fcd2ed44a'
    and target_policy_count = 8
    and split_policy_count = 6
    and retired_policy_count = 0
    and split_policy_hash = '3a153bc62b15a8ee259b45b26429015e'
    and target_policy_hash = '98befc6f96ed3e232cd7de69d6215ee3'
    and public_policy_count = 183
    and public_policy_hash = 'b03aa579342a1d898d54330f82c6c3f5'
    and acl_row_count = 34
    and acl_hash = 'd6e4e9dc25789574182fa54ce3a98c41'
    and auth_users_baseline
    and clinics_baseline
    and profiles_baseline
    and resources_rows = 0
    and shift_period_rows = 0
    and staff_rows = 0
    and permission_rows = 0
    and blocks_rows = 0
    and customers_rows = 0
    and reservations_rows = 0
    and reservation_history_rows = 0
    and coverage_rows = 0
    and menu_profile_rows = 0
    and menus_rows = 0
    and campaign_rows = 0
    and recipient_rows = 0
    and shift_request_rows = 0
    and pgtap_count = 0
    and persistent_helper_count = 0
    as contract_pass
from snapshot
\gset pr11_

\if :pr11_contract_pass
  \echo PR11_PAIRED_POSTFLIGHT_PASS
\else
  \echo PR11_PAIRED_POSTFLIGHT_FAIL
  \quit 3
\endif

select jsonb_build_object(
  'captured_at_utc', clock_timestamp() at time zone 'UTC',
  'database', jsonb_build_object(
    'name', :'pr11_database_name',
    'version_num', :'pr11_server_version_num',
    'system_identifier', :'pr11_system_identifier'
  ),
  'migration_head', :'pr11_migration_head',
  'migration', jsonb_build_object(
    'count', :'pr11_migration_count'::integer,
    'hash', :'pr11_migration_hash'
  ),
  'pr11_indexes', jsonb_build_object(
    'count', :'pr11_index_count'::integer,
    'partial', :'pr11_partial_index_count'::integer,
    'full', :'pr11_full_index_count'::integer,
    'healthy', :'pr11_healthy_index_count'::integer,
    'name_hash', :'pr11_index_name_hash',
    'definition_hash', :'pr11_index_definition_hash',
    'catalog_hash', :'pr11_index_catalog_hash'
  ),
  'target_policies', jsonb_build_object(
    'count', :'pr11_target_policy_count'::integer,
    'split', :'pr11_split_policy_count'::integer,
    'retired', :'pr11_retired_policy_count'::integer,
    'split_hash', :'pr11_split_policy_hash',
    'catalog_hash', :'pr11_target_policy_hash'
  ),
  'public_policies', jsonb_build_object(
    'count', :'pr11_public_policy_count'::integer,
    'catalog_hash', :'pr11_public_policy_hash'
  ),
  'target_acl', jsonb_build_object(
    'rows', :'pr11_acl_row_count'::integer,
    'hash', :'pr11_acl_hash'
  ),
  'fixture_baseline', jsonb_build_object(
    'auth_users', :'pr11_auth_users_baseline'::boolean,
    'clinics', :'pr11_clinics_baseline'::boolean,
    'profiles', :'pr11_profiles_baseline'::boolean,
    'resources_rows', :'pr11_resources_rows'::integer,
    'shift_period_rows', :'pr11_shift_period_rows'::integer,
    'staff_rows', :'pr11_staff_rows'::integer,
    'permission_rows', :'pr11_permission_rows'::integer,
    'blocks_rows', :'pr11_blocks_rows'::integer,
    'customers_rows', :'pr11_customers_rows'::integer,
    'reservations_rows', :'pr11_reservations_rows'::integer,
    'reservation_history_rows', :'pr11_reservation_history_rows'::integer,
    'coverage_rows', :'pr11_coverage_rows'::integer,
    'menu_profile_rows', :'pr11_menu_profile_rows'::integer,
    'menus_rows', :'pr11_menus_rows'::integer,
    'campaign_rows', :'pr11_campaign_rows'::integer,
    'recipient_rows', :'pr11_recipient_rows'::integer,
    'shift_request_rows', :'pr11_shift_request_rows'::integer
  ),
  'contract_pass', :'pr11_contract_pass'::boolean
) as postflight_snapshot;

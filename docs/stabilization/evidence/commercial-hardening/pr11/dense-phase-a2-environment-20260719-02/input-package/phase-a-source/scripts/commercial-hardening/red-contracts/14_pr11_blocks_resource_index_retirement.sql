do $contract$
declare
  index_drift text;
  catalog_drift text;
begin
  perform pg_catalog.set_config(
    'search_path',
    'pg_catalog, extensions, public',
    true
  );

  if to_regclass('public.idx_blocks_resource_id') is not null then
    if (
      select count(*)
      from pg_index index_data
      join pg_class index_class on index_class.oid = index_data.indexrelid
      join pg_class table_class on table_class.oid = index_data.indrelid
      join pg_namespace namespace_data
        on namespace_data.oid = index_class.relnamespace
      join pg_am access_method on access_method.oid = index_class.relam
      where index_class.oid = to_regclass('public.idx_blocks_resource_id')
        and namespace_data.nspname = 'public'
        and index_class.relname = 'idx_blocks_resource_id'
        and index_class.relkind = 'i'
        and table_class.oid = 'public.blocks'::regclass
        and access_method.amname = 'btree'
        and not index_data.indisunique
        and not index_data.indisprimary
        and not index_data.indisexclusion
        and index_data.indisvalid
        and index_data.indisready
        and index_data.indislive
        and index_data.indexprs is null
        and index_data.indpred is null
        and index_data.indnkeyatts = 1
        and index_data.indnatts = 1
        and not index_data.indnullsnotdistinct
        and md5(pg_get_indexdef(index_data.indexrelid)) =
          '7a4092df4bfffa0e82d7936ba6384362'
        and obj_description(index_data.indexrelid, 'pg_class') is null
    ) <> 1 then
      raise exception
        'RED COMM-PERF-005: singleton blocks resource index preflight drift';
    end if;

    if exists (
      select 1
      from pg_constraint constraint_data
      where constraint_data.conindid =
        to_regclass('public.idx_blocks_resource_id')
    ) then
      raise exception
        'RED COMM-PERF-005: singleton blocks resource index is constraint-backed';
    end if;

    raise exception
      'RED COMM-PERF-005: redundant singleton blocks resource index remains';
  end if;

  with expected_indexes(
    index_name,
    definition_md5,
    is_unique,
    is_primary,
    key_count,
    has_predicate,
    intent_comment
  ) as (
    values
      (
        'blocks_created_by_idx',
        '5f624c3641d5a072b4ba31b8f55d7b66',
        false,
        false,
        1,
        true,
        'PR-11: supports blocks_created_by_fkey with reviewed partial B-tree coverage.'
      ),
      (
        'blocks_deleted_by_idx',
        'ea5d67f947607c944013ee74bbfc3e89',
        false,
        false,
        1,
        true,
        'PR-11: supports blocks_deleted_by_fkey with reviewed partial B-tree coverage.'
      ),
      (
        'blocks_pkey',
        '6402aea3cabc01c46abe24ca5c0c7e37',
        true,
        true,
        1,
        false,
        null
      ),
      (
        'blocks_resource_clinic_idx',
        '9901fe5e728a0fe29c3ca32c6759b736',
        false,
        false,
        2,
        false,
        null
      ),
      (
        'idx_blocks_clinic_id',
        '4580a4a6e6c32a839fed49967e419de0',
        false,
        false,
        1,
        false,
        null
      ),
      (
        'idx_blocks_clinic_time',
        '0a58b803eedf010dacb7150def44cf82',
        false,
        false,
        3,
        false,
        null
      ),
      (
        'idx_blocks_end_time',
        '9a9e11de00f110134b3308be3b82d829',
        false,
        false,
        1,
        false,
        null
      ),
      (
        'idx_blocks_is_active',
        '14d85b4af0f28f37f02740078496e4f6',
        false,
        false,
        1,
        true,
        null
      ),
      (
        'idx_blocks_resource_time',
        '1a97e824b3a7803be36164abb577192b',
        false,
        false,
        3,
        true,
        null
      ),
      (
        'idx_blocks_start_time',
        '6ce577adfe6bfcf4041badfdf38a848f',
        false,
        false,
        1,
        false,
        null
      )
  ), actual_indexes as (
    select
      index_class.relname::text as index_name,
      md5(pg_get_indexdef(index_data.indexrelid)) as definition_md5,
      index_data.indisunique as is_unique,
      index_data.indisprimary as is_primary,
      index_data.indnkeyatts::integer as key_count,
      index_data.indpred is not null as has_predicate,
      obj_description(index_data.indexrelid, 'pg_class') as intent_comment,
      access_method.amname,
      index_class.relkind,
      index_data.indisvalid,
      index_data.indisready,
      index_data.indislive,
      index_data.indisexclusion,
      index_data.indnullsnotdistinct,
      index_data.indexprs is null as has_no_expressions,
      index_data.indnkeyatts = index_data.indnatts as has_no_includes
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_am access_method on access_method.oid = index_class.relam
    where index_data.indrelid = 'public.blocks'::regclass
      and index_class.relnamespace = 'public'::regnamespace
  ), drift_rows as (
    select 'missing-or-changed:' || expected_indexes.index_name as finding
    from expected_indexes
    left join actual_indexes using (index_name)
    where actual_indexes.index_name is null
      or actual_indexes.definition_md5 <> expected_indexes.definition_md5
      or actual_indexes.is_unique <> expected_indexes.is_unique
      or actual_indexes.is_primary <> expected_indexes.is_primary
      or actual_indexes.key_count <> expected_indexes.key_count
      or actual_indexes.has_predicate <> expected_indexes.has_predicate
      or actual_indexes.intent_comment is distinct from
        expected_indexes.intent_comment
      or actual_indexes.amname <> 'btree'
      or actual_indexes.relkind <> 'i'
      or not actual_indexes.indisvalid
      or not actual_indexes.indisready
      or not actual_indexes.indislive
      or actual_indexes.indisexclusion
      or actual_indexes.indnullsnotdistinct
      or not actual_indexes.has_no_expressions
      or not actual_indexes.has_no_includes
    union all
    select 'unexpected:' || actual_indexes.index_name
    from actual_indexes
    left join expected_indexes using (index_name)
    where expected_indexes.index_name is null
  )
  select string_agg(finding, ', ' order by finding)
  into index_drift
  from drift_rows;

  if index_drift is not null then
    raise exception
      'RED COMM-PERF-005: exact candidate blocks index set drift: %',
      index_drift;
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
      and not constraint_data.condeferred
      and constraint_data.confmatchtype = 's'
      and constraint_data.confupdtype = 'a'
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
        and not constraint_data.condeferrable
        and not constraint_data.condeferred
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
    or (
      select count(*)
      from pg_trigger trigger_data
      join pg_constraint constraint_data
        on constraint_data.oid = trigger_data.tgconstraint
      where constraint_data.conname = 'blocks_resource_id_fkey'
        and constraint_data.conrelid = 'public.blocks'::regclass
        and trigger_data.tgisinternal
        and trigger_data.tgenabled = 'O'
    ) <> 4
  then
    raise exception
      'RED COMM-PERF-005: blocks composite FK enforcement drift';
  end if;

  if to_regprocedure('public.validate_blocks_clinic_refs()') is null then
    raise exception
      'RED COMM-PERF-005: blocks validation function is missing';
  end if;

  if (
    select count(*)
    from pg_proc function_data
    join pg_roles owner_data on owner_data.oid = function_data.proowner
    join pg_language language_data on language_data.oid = function_data.prolang
    where function_data.oid =
        'public.validate_blocks_clinic_refs()'::regprocedure
      and function_data.prokind = 'f'
      and function_data.pronargs = 0
      and function_data.pronargdefaults = 0
      and function_data.prorettype = 'pg_catalog.trigger'::regtype
      and not function_data.proretset
      and language_data.lanname = 'plpgsql'
      and owner_data.rolname = 'postgres'
      and function_data.provolatile = 'v'
      and function_data.proparallel = 'u'
      and not function_data.proisstrict
      and not function_data.prosecdef
      and not function_data.proleakproof
      and function_data.proconfig =
        array['search_path=public, auth, extensions']::text[]
      and md5(pg_get_functiondef(function_data.oid)) =
        'fe160976fe22dac01208d155ebf16984'
      and md5(function_data.prosrc) =
        '0fd20c5c75ffdb79d77363c1026063dc'
      and md5(coalesce(
        array_to_string(function_data.proacl, ','),
        '<NULL>'
      )) = '8f838c64ac450430e53b33669676310e'
  ) <> 1
    or (
      select count(*)
      from pg_trigger trigger_data
      where trigger_data.tgrelid = 'public.blocks'::regclass
        and trigger_data.tgname = 'blocks_clinic_ref_check'
        and not trigger_data.tgisinternal
        and trigger_data.tgenabled = 'O'
        and trigger_data.tgfoid =
          'public.validate_blocks_clinic_refs()'::regprocedure
        and md5(pg_get_triggerdef(trigger_data.oid)) =
          '39c16618a7c772d6b9ecd1a541d0c2a5'
    ) <> 1
  then
    raise exception
      'RED COMM-PERF-005: blocks trigger or validation function drift';
  end if;

  if (
    select count(*)
    from pg_class relation_data
    join pg_roles owner_data on owner_data.oid = relation_data.relowner
    where relation_data.oid = 'public.blocks'::regclass
      and relation_data.relkind = 'r'
      and owner_data.rolname = 'postgres'
      and relation_data.relrowsecurity
      and not relation_data.relforcerowsecurity
      and md5(coalesce(
        array_to_string(relation_data.relacl, ','),
        '<NULL>'
      )) = '0b0844aa406026a93c399db93c0307eb'
  ) <> 1
    or (select count(*) from pg_policies where schemaname = 'public') <> 183
  then
    raise exception
      'RED COMM-PERF-005: blocks ACL, RLS, owner, or policy inventory drift';
  end if;

  with required_relations(relation_name) as (
    values
      ('auth.users'),
      ('public.clinics'),
      ('public.profiles'),
      ('public.resources'),
      ('public.shift_request_periods'),
      ('public.staff'),
      ('public.user_permissions'),
      ('public.blocks'),
      ('public.customers'),
      ('public.reservations'),
      ('public.reservation_history'),
      ('public.shift_requests'),
      ('public.patient_outreach_recipients'),
      ('public.customer_insurance_coverages'),
      ('public.menus'),
      ('public.menu_billing_profiles'),
      ('public.patient_outreach_campaigns')
  )
  select string_agg(relation_name, ', ' order by relation_name)
  into catalog_drift
  from required_relations
  where to_regclass(relation_name) is null;

  if catalog_drift is not null then
    raise exception
      'RED COMM-PERF-005: normalized relation inventory is missing: %',
      catalog_drift;
  end if;

  if to_regprocedure(
      'app_private.get_current_accessible_clinic_ids()'
    ) is null
    or to_regprocedure('app_private.get_current_role()') is null
    or to_regprocedure('app_private.can_access_clinic(uuid)') is null
  then
    raise exception
      'RED COMM-PERF-005: PR-11 authority helper inventory is missing';
  end if;

  with target_relations(relation_oid) as (
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
      concat_ws(
        '|',
        attribute_data.attrelid::regclass::text,
        attribute_data.attnum::text,
        attribute_data.attname,
        format_type(attribute_data.atttypid, attribute_data.atttypmod),
        attribute_data.attnotnull::text,
        attribute_data.attidentity,
        attribute_data.attgenerated,
        coalesce(
          pg_get_expr(default_data.adbin, default_data.adrelid),
          ''
        )
      ),
      E'\n' order by attribute_data.attrelid::regclass::text,
        attribute_data.attnum
    ), '')) as value
    from pg_attribute attribute_data
    join target_relations
      on target_relations.relation_oid = attribute_data.attrelid
    left join pg_attrdef default_data
      on default_data.adrelid = attribute_data.attrelid
     and default_data.adnum = attribute_data.attnum
    where attribute_data.attnum > 0
      and not attribute_data.attisdropped
  ), constraint_catalog as (
    select md5(coalesce(string_agg(
      concat_ws(
        '|',
        constraint_data.conrelid::regclass::text,
        constraint_data.conname,
        constraint_data.contype::text,
        constraint_data.convalidated::text,
        constraint_data.condeferrable::text,
        constraint_data.condeferred::text,
        pg_get_constraintdef(constraint_data.oid)
      ),
      E'\n' order by constraint_data.conrelid::regclass::text,
        constraint_data.conname
    ), '')) as value
    from pg_constraint constraint_data
    join target_relations
      on target_relations.relation_oid = constraint_data.conrelid
  ), trigger_catalog as (
    select md5(coalesce(string_agg(
      concat_ws(
        '|',
        trigger_data.tgrelid::regclass::text,
        trigger_data.tgname,
        trigger_data.tgenabled::text,
        trigger_data.tgisinternal::text,
        coalesce(trigger_data.tgconstraint::regclass::text, ''),
        pg_get_triggerdef(trigger_data.oid)
      ),
      E'\n' order by trigger_data.tgrelid::regclass::text,
        trigger_data.tgname
    ), '')) as value
    from pg_trigger trigger_data
    join target_relations
      on target_relations.relation_oid = trigger_data.tgrelid
  ), relation_security_catalog as (
    select md5(coalesce(string_agg(
      concat_ws(
        '|',
        relation_data.oid::regclass::text,
        owner_data.rolname,
        relation_data.relrowsecurity::text,
        relation_data.relforcerowsecurity::text,
        coalesce(array_to_string(relation_data.relacl, ','), '<NULL>')
      ),
      E'\n' order by relation_data.oid::regclass::text
    ), '')) as value
    from pg_class relation_data
    join target_relations
      on target_relations.relation_oid = relation_data.oid
    join pg_roles owner_data on owner_data.oid = relation_data.relowner
  ), policy_catalog as (
    select md5(coalesce(string_agg(
      concat_ws(
        '|',
        policy_data.polrelid::regclass::text,
        policy_data.polname,
        policy_data.polcmd::text,
        policy_data.polpermissive::text,
        array_to_string(policy_data.polroles, ','),
        coalesce(
          pg_get_expr(policy_data.polqual, policy_data.polrelid),
          ''
        ),
        coalesce(
          pg_get_expr(policy_data.polwithcheck, policy_data.polrelid),
          ''
        ),
        coalesce(obj_description(policy_data.oid, 'pg_policy'), '')
      ),
      E'\n' order by policy_data.polrelid::regclass::text,
        policy_data.polname
    ), '')) as value
    from pg_policy policy_data
    join target_relations
      on target_relations.relation_oid = policy_data.polrelid
  ), helper_catalog as (
    select md5(coalesce(string_agg(
      concat_ws(
        '|',
        function_data.oid::regprocedure::text,
        owner_data.rolname,
        language_data.lanname,
        function_data.provolatile::text,
        function_data.prosecdef::text,
        function_data.proleakproof::text,
        coalesce(
          array_to_string(function_data.proconfig, ','),
          '<NULL>'
        ),
        coalesce(array_to_string(function_data.proacl, ','), '<NULL>'),
        pg_get_functiondef(function_data.oid)
      ),
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
  ), catalog_values(catalog_name, actual_hash, expected_hash) as (
    values
      (
        'columns',
        (select value from column_catalog),
        '3019ca607039201b5c8f73aad280424d'
      ),
      (
        'helpers',
        (select value from helper_catalog),
        'bbcc63179bc72b3cada981ebfc158553'
      ),
      (
        'policies',
        (select value from policy_catalog),
        'cf8d035d1b3ad5c1834b45794d5f1574'
      ),
      (
        'triggers',
        (select value from trigger_catalog),
        'bf45366a67070170d788938279dc36e8'
      ),
      (
        'constraints',
        (select value from constraint_catalog),
        '23922d2c0ddc8c7a0df144df722c43ca'
      ),
      (
        'relation_security',
        (select value from relation_security_catalog),
        'fc66b0426f2e950d2b5e9b3189466177'
      )
  )
  select string_agg(
    catalog_name || ':' || coalesce(actual_hash, '<NULL>'),
    ', ' order by catalog_name
  )
  into catalog_drift
  from catalog_values
  where actual_hash is distinct from expected_hash;

  if catalog_drift is not null then
    raise exception
      'RED COMM-PERF-005: protected PR-11 catalog hash drift: %',
      catalog_drift;
  end if;

  if (
    select count(*)
    from supabase_migrations.schema_migrations
  ) <> 61
    or (
      select max(version)
      from supabase_migrations.schema_migrations
    ) is distinct from '20260718011731'
    or (
      select md5(coalesce(string_agg(
        concat_ws(
          '|',
          version,
          name,
          coalesce(array_to_string(statements, E'\n'), '')
        ),
        E'\n' order by version
      ), ''))
      from supabase_migrations.schema_migrations
    ) is distinct from 'b3c029146da59fb99daee65de36e9657'
  then
    raise exception
      'RED COMM-PERF-005: PR-11 migration inventory drift';
  end if;
end
$contract$;

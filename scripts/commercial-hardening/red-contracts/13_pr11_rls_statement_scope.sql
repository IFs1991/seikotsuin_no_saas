do $contract$
declare
  helper_source text;
begin
  perform pg_catalog.set_config(
    'search_path',
    'pg_catalog, extensions, public',
    true
  );

  if to_regprocedure(
    'app_private.get_current_accessible_clinic_ids()'
  ) is null then
    raise exception
      'RED COMM-PERF-004: statement-stable clinic scope helper is missing';
  end if;

  select function_data.prosrc
  into helper_source
  from pg_proc function_data
  join pg_roles owner_data on owner_data.oid = function_data.proowner
  join pg_language language_data on language_data.oid = function_data.prolang
  where function_data.oid =
      'app_private.get_current_accessible_clinic_ids()'::regprocedure
    and function_data.prokind = 'f'
    and function_data.pronargs = 0
    and function_data.pronargdefaults = 0
    and function_data.prorettype = 'uuid[]'::regtype
    and not function_data.proretset
    and language_data.lanname = 'sql'
    and owner_data.rolname = 'postgres'
    and function_data.provolatile = 's'
    and function_data.proparallel = 'u'
    and not function_data.proisstrict
    and function_data.prosecdef
    and not function_data.proleakproof
    and function_data.proconfig = array['search_path=pg_catalog']::text[]
    and md5(pg_get_functiondef(function_data.oid)) =
      'bae22e5fdf92404e1202dd2f891a359a'
    and md5(function_data.prosrc) =
      '7c80cb36233e276a2e49cb67da480025'
    and md5(coalesce(array_to_string(function_data.proacl, ','), '<NULL>')) =
      'dd8ce70fc976f9580b16e8826c5ecaa0';

  if helper_source is null
    or position(
      'app_private.can_access_clinic(candidate_clinics.clinic_id)'
      in regexp_replace(lower(helper_source), '[[:space:]]+', ' ', 'g')
    ) = 0
    or position(
      'public.manager_clinic_assignments'
      in lower(helper_source)
    ) = 0
    or position('public.user_permissions' in lower(helper_source)) = 0
  then
    raise exception
      'RED COMM-PERF-004: clinic scope helper body or security metadata drift';
  end if;

  if has_function_privilege(
      'anon',
      'app_private.get_current_accessible_clinic_ids()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'app_private.get_current_accessible_clinic_ids()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'app_private.get_current_accessible_clinic_ids()',
      'EXECUTE'
    )
  then
    raise exception
      'RED COMM-PERF-004: clinic scope helper EXECUTE matrix drift';
  end if;

  if obj_description(
      'app_private.get_current_accessible_clinic_ids()'::regprocedure,
      'pg_proc'
    ) is distinct from
      'PR-11-FIX: statement-stable DB-authoritative clinic scope for the two reviewed SELECT policies.'
  then
    raise exception
      'RED COMM-PERF-004: clinic scope helper comment drift';
  end if;

  if (
    select count(*)
    from pg_policies policy_data
    join pg_class table_catalog
      on table_catalog.oid = format(
        '%I.%I',
        policy_data.schemaname,
        policy_data.tablename
      )::regclass
    join pg_policy policy_catalog
      on policy_catalog.polrelid = table_catalog.oid
     and policy_catalog.polname = policy_data.policyname
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
      and policy_data.with_check is null
      and md5(
        coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) = '633cd3f3b42e72d9ffdc0127f68b1a89'
      and md5(coalesce(
        obj_description(policy_catalog.oid, 'pg_policy'),
        '<NULL>'
      )) = '23ac1340b2a84c6433d151465d8cbbf2'
      and position(
        'app_private.get_current_accessible_clinic_ids()'
        in lower(policy_data.qual)
      ) > 0
      and position(
        'app_private.get_current_role()'
        in lower(policy_data.qual)
      ) > 0
      and position(
        'app_private.can_access_clinic'
        in lower(policy_data.qual)
      ) = 0
      and position(
        'array[''admin''::text, ''clinic_admin''::text, ''manager''::text, ''therapist''::text, ''staff''::text]'
        in lower(policy_data.qual)
      ) > 0
  ) <> 2 then
    raise exception
      'RED COMM-PERF-004: exact two statement-scope SELECT policies are absent';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public') <> 183 then
    raise exception
      'RED COMM-PERF-004: public policy inventory drift';
  end if;

  if (
    select count(*)
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_class table_class on table_class.oid = index_data.indrelid
    join pg_namespace namespace_data on namespace_data.oid = table_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    where namespace_data.nspname = 'public'
      and (
        (table_class.relname = 'customer_insurance_coverages'
          and index_class.relname =
            'customer_insurance_coverages_clinic_id_id_idx')
        or
        (table_class.relname = 'menu_billing_profiles'
          and index_class.relname =
            'menu_billing_profiles_clinic_id_id_idx')
      )
      and access_method.amname = 'btree'
      and not index_data.indisunique
      and index_data.indpred is null
      and index_data.indexprs is null
      and index_data.indnkeyatts = 2
      and index_data.indnatts = 2
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and obj_description(index_data.indexrelid, 'pg_class') =
        'PR-11-FIX: statement-scope SELECT support ordered by clinic_id and id.'
      and (
        select array_agg(attribute_data.attname::text order by key_data.ordinality)
        from unnest(index_data.indkey::smallint[])
          with ordinality key_data(attnum, ordinality)
        join pg_attribute attribute_data
          on attribute_data.attrelid = index_data.indrelid
         and attribute_data.attnum = key_data.attnum
      ) = array['clinic_id', 'id']::text[]
  ) <> 2 then
    raise exception
      'RED COMM-PERF-004: exact statement-scope indexes are absent';
  end if;
end
$contract$;

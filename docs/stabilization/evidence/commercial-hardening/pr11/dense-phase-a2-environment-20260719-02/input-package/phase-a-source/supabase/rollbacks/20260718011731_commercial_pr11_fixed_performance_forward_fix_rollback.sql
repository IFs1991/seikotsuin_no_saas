-- PR-11 pilot performance forward-fix recovery guard.
--
-- This is intentionally validation-only. Removing indexes, restoring the old
-- per-row SELECT predicates, or replacing either helper automatically would
-- weaken the reviewed forward-only recovery boundary.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

do $pr11_fix_recovery_guard$
declare
  unaffected_policy_count bigint;
  unaffected_policy_hash text;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260718011731'
  ) then
    raise exception
      'PR-11 forward-fix recovery refused: migration 20260718011731 is not recorded';
  end if;

  if (
    select count(*)
    from pg_proc function_data
    join pg_roles owner_data on owner_data.oid = function_data.proowner
    join pg_language language_data on language_data.oid = function_data.prolang
    where function_data.oid =
        'public.validate_blocks_clinic_refs()'::regprocedure
      and owner_data.rolname = 'postgres'
      and language_data.lanname = 'plpgsql'
      and function_data.provolatile = 'v'
      and function_data.proparallel = 'u'
      and not function_data.proisstrict
      and not function_data.prosecdef
      and not function_data.proleakproof
      and function_data.proconfig =
        array['search_path=public, auth, extensions']::text[]
      and md5(pg_get_functiondef(function_data.oid)) =
        'fe160976fe22dac01208d155ebf16984'
      and md5(coalesce(
        array_to_string(function_data.proacl, ','),
        '<NULL>'
      )) = '8f838c64ac450430e53b33669676310e'
  ) <> 1 then
    raise exception
      'PR-11 forward-fix recovery refused: blocks function definition, owner, invoker, search_path, or ACL drift';
  end if;

  if (
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
  ) <> 1 then
    raise exception
      'PR-11 forward-fix recovery refused: blocks trigger identity or binding drift';
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
      'PR-11 forward-fix recovery refused: blocks composite FK, parent unique, or NOT NULL drift';
  end if;

  if (
    select count(*)
    from pg_proc function_data
    join pg_roles owner_data on owner_data.oid = function_data.proowner
    join pg_language language_data on language_data.oid = function_data.prolang
    where function_data.oid =
        'app_private.get_current_accessible_clinic_ids()'::regprocedure
      and owner_data.rolname = 'postgres'
      and language_data.lanname = 'sql'
      and function_data.provolatile = 's'
      and function_data.proparallel = 'u'
      and not function_data.proisstrict
      and function_data.prosecdef
      and not function_data.proleakproof
      and function_data.proconfig =
        array['search_path=pg_catalog']::text[]
      and md5(pg_get_functiondef(function_data.oid)) =
        'bae22e5fdf92404e1202dd2f891a359a'
      and md5(function_data.prosrc) =
        '7c80cb36233e276a2e49cb67da480025'
      and md5(coalesce(
        array_to_string(function_data.proacl, ','),
        '<NULL>'
      )) = 'dd8ce70fc976f9580b16e8826c5ecaa0'
  ) <> 1
    or has_function_privilege(
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
    or obj_description(
      'app_private.get_current_accessible_clinic_ids()'::regprocedure,
      'pg_proc'
    ) is distinct from
      'PR-11-FIX: statement-stable DB-authoritative clinic scope for the two reviewed SELECT policies.'
  then
    raise exception
      'PR-11 forward-fix recovery refused: statement-scope helper definition, owner, config, comment, or EXECUTE matrix drift';
  end if;

  if md5(pg_get_functiondef(
      'app_private.get_current_role()'::regprocedure
    )) is distinct from '9a958630dac186149cb53585160a291f'
    or md5(pg_get_functiondef(
      'app_private.can_access_clinic(uuid)'::regprocedure
    )) is distinct from '32e8af7c8ec5a9422333a6a950f19a83'
    or (
      select count(*)
      from pg_proc function_data
      where function_data.oid in (
        'app_private.get_current_role()'::regprocedure,
        'app_private.can_access_clinic(uuid)'::regprocedure
      )
        and function_data.provolatile = 's'
        and function_data.prosecdef
        and function_data.proconfig =
          array['search_path=pg_catalog']::text[]
        and md5(coalesce(
          array_to_string(function_data.proacl, ','),
          '<NULL>'
        )) = '459a9d86166bce10d53119c4d08c5da6'
    ) <> 2
  then
    raise exception
      'PR-11 forward-fix recovery refused: source authority helper or ACL drift';
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
  ) <> 2
    or (select count(*) from pg_policies where schemaname = 'public') <> 183
  then
    raise exception
      'PR-11 forward-fix recovery refused: exact target policy or 183-policy inventory drift';
  end if;

  with unaffected as (
    select
      policy_data.schemaname,
      policy_data.tablename,
      policy_data.policyname,
      policy_data.permissive,
      policy_data.roles,
      policy_data.cmd,
      policy_data.qual,
      policy_data.with_check,
      obj_description(policy_catalog.oid, 'pg_policy') as intent_comment
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
      and (policy_data.tablename, policy_data.policyname) not in (
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
  )
  select
    count(*),
    md5(coalesce(string_agg(
      concat_ws(
        '|',
        schemaname,
        tablename,
        policyname,
        permissive,
        array_to_string(roles, ','),
        cmd,
        coalesce(qual, '<NULL>'),
        coalesce(with_check, '<NULL>'),
        coalesce(intent_comment, '<NULL>')
      ),
      chr(10) order by schemaname, tablename, policyname
    ), ''))
  into unaffected_policy_count, unaffected_policy_hash
  from unaffected;

  if unaffected_policy_count <> 181
    or unaffected_policy_hash is distinct from
      'de340ecaa55f2bc46858a3f37aa13ff7'
  then
    raise exception
      'PR-11 forward-fix recovery refused: unrelated 181-policy aggregate drift';
  end if;

  if (
    select count(*)
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_class table_class on table_class.oid = index_data.indrelid
    join pg_namespace namespace_data
      on namespace_data.oid = table_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    where namespace_data.nspname = 'public'
      and (
        (
          table_class.relname = 'customer_insurance_coverages'
          and index_class.relname =
            'customer_insurance_coverages_clinic_id_id_idx'
        )
        or (
          table_class.relname = 'menu_billing_profiles'
          and index_class.relname =
            'menu_billing_profiles_clinic_id_id_idx'
        )
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
        select array_agg(
          attribute_data.attname::text
          order by key_data.ordinality
        )
        from unnest(index_data.indkey::smallint[])
          with ordinality key_data(attnum, ordinality)
        join pg_attribute attribute_data
          on attribute_data.attrelid = index_data.indrelid
         and attribute_data.attnum = key_data.attnum
      ) = array['clinic_id', 'id']::text[]
  ) <> 2 then
    raise exception
      'PR-11 forward-fix recovery refused: exact candidate index identity, key order, comment, or validity drift';
  end if;

  if (
    select count(*)
    from pg_class relation_data
    join pg_roles owner_data on owner_data.oid = relation_data.relowner
    where relation_data.oid in (
      'public.blocks'::regclass,
      'public.resources'::regclass,
      'public.customer_insurance_coverages'::regclass,
      'public.menu_billing_profiles'::regclass
    )
      and owner_data.rolname = 'postgres'
      and relation_data.relrowsecurity
      and not relation_data.relforcerowsecurity
      and md5(coalesce(
        array_to_string(relation_data.relacl, ','),
        '<NULL>'
      )) = case relation_data.oid::regclass::text
        when 'blocks' then '0b0844aa406026a93c399db93c0307eb'
        when 'resources' then '154e740879ca25bedda730a662b910d8'
        when 'customer_insurance_coverages' then
          '5072a4e20a9c1ac291e24b287a6d3ce9'
        when 'menu_billing_profiles' then
          '5072a4e20a9c1ac291e24b287a6d3ce9'
        else '<UNEXPECTED>'
      end
  ) <> 4 then
    raise exception
      'PR-11 forward-fix recovery refused: table owner, ACL, RLS, or FORCE RLS drift';
  end if;

  if exists (
    select 1
    from public.blocks block_data
    left join public.resources resource_data
      on resource_data.id = block_data.resource_id
     and resource_data.clinic_id = block_data.clinic_id
    where resource_data.id is null
  )
    or exists (
      select 1
      from public.customer_insurance_coverages coverage_data
      left join public.customers customer_data
        on customer_data.id = coverage_data.customer_id
       and customer_data.clinic_id = coverage_data.clinic_id
      where customer_data.id is null
    )
    or exists (
      select 1
      from public.menu_billing_profiles profile_data
      left join public.menus menu_data
        on menu_data.id = profile_data.menu_id
       and menu_data.clinic_id = profile_data.clinic_id
      where menu_data.id is null
    )
  then
    raise exception
      'PR-11 forward-fix recovery refused: composite-FK data mismatch';
  end if;

  raise notice
    'PR-11 pilot performance forward-fix recovery is validation-only; no function, policy, ACL, index, constraint, or data was changed. Throttle or disable affected bulk writes and use a reviewed append-only forward-fix.';
end
$pr11_fix_recovery_guard$;

commit;

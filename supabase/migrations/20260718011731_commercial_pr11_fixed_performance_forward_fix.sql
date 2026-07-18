-- Commercial hardening PR-11: pilot performance forward-fix.
-- @spec docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md
-- @rollback supabase/rollbacks/20260718011731_commercial_pr11_fixed_performance_forward_fix_rollback.sql
-- @evidence docs/stabilization/evidence/commercial-hardening/pr11/pilot-performance-waiver.yaml
--
-- The four frozen local wall-clock gates remain FAIL and are accepted only by
-- the time-bounded pilot waiver. Security, tenant isolation, SQLSTATE/message,
-- WAL, natural plan, ACL, FK, restoration, clean replay, and CI stay hard.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

-- Freeze every catalog surface that this forward-fix is not allowed to alter.
create temporary table pr11_fix_unaffected_policy_snapshot on commit drop as
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
  );

create temporary table pr11_fix_source_helper_snapshot on commit drop as
select
  function_data.oid,
  function_data.oid::regprocedure::text as function_signature,
  owner_data.rolname as owner_name,
  language_data.lanname as language_name,
  function_data.provolatile,
  function_data.proparallel,
  function_data.proisstrict,
  function_data.prosecdef,
  function_data.proleakproof,
  function_data.proconfig,
  function_data.proacl,
  pg_get_functiondef(function_data.oid) as function_definition,
  obj_description(function_data.oid, 'pg_proc') as intent_comment
from pg_proc function_data
join pg_roles owner_data on owner_data.oid = function_data.proowner
join pg_language language_data on language_data.oid = function_data.prolang
where function_data.oid in (
  'app_private.get_current_role()'::regprocedure,
  'app_private.can_access_clinic(uuid)'::regprocedure
);

create temporary table pr11_fix_relation_security_snapshot on commit drop as
select
  relation_data.oid,
  relation_data.oid::regclass::text as relation_name,
  owner_data.rolname as owner_name,
  relation_data.relrowsecurity,
  relation_data.relforcerowsecurity,
  relation_data.relacl
from pg_class relation_data
join pg_roles owner_data on owner_data.oid = relation_data.relowner
where relation_data.oid in (
  'public.blocks'::regclass,
  'public.resources'::regclass,
  'public.customer_insurance_coverages'::regclass,
  'public.menu_billing_profiles'::regclass
);

create temporary table pr11_fix_other_index_snapshot on commit drop as
select
  index_data.indrelid,
  index_class.relname as index_name,
  pg_get_indexdef(index_data.indexrelid) as index_definition,
  index_data.indisunique,
  index_data.indisvalid,
  index_data.indisready,
  index_data.indislive,
  obj_description(index_data.indexrelid, 'pg_class') as intent_comment
from pg_index index_data
join pg_class index_class on index_class.oid = index_data.indexrelid
where index_data.indrelid in (
  'public.customer_insurance_coverages'::regclass,
  'public.menu_billing_profiles'::regclass
)
and index_class.relname not in (
  'customer_insurance_coverages_clinic_id_id_idx',
  'menu_billing_profiles_clinic_id_id_idx'
);

do $pr11_fix_preflight$
declare
  oversized text;
  long_transactions text;
begin
  if current_user <> 'postgres' then
    raise exception 'PR-11 forward-fix preflight: postgres is required';
  end if;

  if (
    select max(version)
    from supabase_migrations.schema_migrations
  ) is distinct from '20260716160402'
    or not exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '20260716160342'
    )
  then
    raise exception
      'PR-11 forward-fix preflight: exact PR-11 migration head is required';
  end if;

  if to_regprocedure(
      'app_private.get_current_accessible_clinic_ids()'
    ) is not null
    or to_regclass(
      'public.customer_insurance_coverages_clinic_id_id_idx'
    ) is not null
    or to_regclass(
      'public.menu_billing_profiles_clinic_id_id_idx'
    ) is not null
  then
    raise exception
      'PR-11 forward-fix preflight: helper or index identity collision';
  end if;

  if exists (
    select 1
    from pg_index index_data
    where index_data.indrelid in (
      'public.customer_insurance_coverages'::regclass,
      'public.menu_billing_profiles'::regclass
    )
      and index_data.indnkeyatts = 2
      and index_data.indnatts = 2
      and index_data.indexprs is null
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
  ) then
    raise exception
      'PR-11 forward-fix preflight: an equivalent clinic_id/id index already exists under another identity';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public') <> 183
    or (select count(*) from pr11_fix_unaffected_policy_snapshot) <> 181
  then
    raise exception
      'PR-11 forward-fix preflight: public policy inventory drift';
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
      and md5(
        coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) = '4c75ea819ae329a56c37e0a1585cb63f'
      and md5(coalesce(
        obj_description(policy_catalog.oid, 'pg_policy'),
        '<NULL>'
      )) = '23ac1340b2a84c6433d151465d8cbbf2'
  ) <> 2 then
    raise exception
      'PR-11 forward-fix preflight: exact retained SELECT policy drift';
  end if;

  if to_regprocedure('public.validate_blocks_clinic_refs()') is null
    or (
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
          'c7b71380054958e03ada965a5db5adc4'
        and md5(coalesce(
          array_to_string(function_data.proacl, ','),
          '<NULL>'
        )) = '8f838c64ac450430e53b33669676310e'
    ) <> 1
  then
    raise exception
      'PR-11 forward-fix preflight: blocks function definition or metadata drift';
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
      'PR-11 forward-fix preflight: blocks trigger drift';
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
      'PR-11 forward-fix preflight: blocks composite FK contract drift';
  end if;

  if (select count(*) from pr11_fix_source_helper_snapshot) <> 2
    or (
      select md5(pg_get_functiondef(
        'app_private.get_current_role()'::regprocedure
      ))
    ) is distinct from '9a958630dac186149cb53585160a291f'
    or (
      select md5(pg_get_functiondef(
        'app_private.can_access_clinic(uuid)'::regprocedure
      ))
    ) is distinct from '32e8af7c8ec5a9422333a6a950f19a83'
    or exists (
      select 1
      from pr11_fix_source_helper_snapshot helper_data
      where helper_data.owner_name <> 'postgres'
        or helper_data.provolatile <> 's'
        or not helper_data.prosecdef
        or helper_data.proconfig is distinct from
          array['search_path=pg_catalog']::text[]
        or md5(coalesce(
          array_to_string(helper_data.proacl, ','),
          '<NULL>'
        )) <> '459a9d86166bce10d53119c4d08c5da6'
    )
  then
    raise exception
      'PR-11 forward-fix preflight: source authority helper drift';
  end if;

  if (select count(*) from pr11_fix_relation_security_snapshot) <> 4
    or exists (
      select 1
      from pr11_fix_relation_security_snapshot relation_data
      where relation_data.owner_name <> 'postgres'
        or not relation_data.relrowsecurity
        or relation_data.relforcerowsecurity
        or md5(coalesce(
          array_to_string(relation_data.relacl, ','),
          '<NULL>'
        )) is distinct from case relation_data.relation_name
          when 'blocks' then '0b0844aa406026a93c399db93c0307eb'
          when 'resources' then '154e740879ca25bedda730a662b910d8'
          when 'customer_insurance_coverages' then
            '5072a4e20a9c1ac291e24b287a6d3ce9'
          when 'menu_billing_profiles' then
            '5072a4e20a9c1ac291e24b287a6d3ce9'
          else '<UNEXPECTED>'
        end
    )
  then
    raise exception
      'PR-11 forward-fix preflight: target table ACL or RLS drift';
  end if;

  select string_agg(
    relation_data.oid::regclass::text
      || '=' || pg_size_pretty(pg_total_relation_size(relation_data.oid)),
    ', ' order by relation_data.oid::regclass::text
  )
  into oversized
  from pg_class relation_data
  where relation_data.oid in (
    'public.customer_insurance_coverages'::regclass,
    'public.menu_billing_profiles'::regclass
  )
    and pg_total_relation_size(relation_data.oid) > 64 * 1024 * 1024;

  if oversized is not null then
    raise exception
      'PR-11 forward-fix preflight: regular index build limit exceeded (%); use a separately reviewed concurrent rollout',
      oversized;
  end if;

  select string_agg(pid::text, ', ' order by pid)
  into long_transactions
  from pg_stat_activity
  where pid <> pg_backend_pid()
    and backend_type = 'client backend'
    and xact_start < clock_timestamp() - interval '5 minutes'
    and state <> 'idle';

  if long_transactions is not null then
    raise exception
      'PR-11 forward-fix preflight: long-running transactions are active (pids=%)',
      long_transactions;
  end if;
end
$pr11_fix_preflight$;

-- Exact-compatible normal-path fast lookup. The slow error path preserves the
-- original SQLSTATE and message contract for null, missing, and cross-clinic.
create or replace function public.validate_blocks_clinic_refs()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path to public, auth, extensions
as $function$
begin
  if new.clinic_id is null then
    raise exception 'blocks.clinic_id is required' using errcode = '23514';
  end if;

  perform 1
  from public.resources r
  where r.id = new.resource_id
    and r.clinic_id = new.clinic_id;

  if found then
    return new;
  end if;

  perform 1
  from public.resources r
  where r.id = new.resource_id;

  if not found then
    raise exception 'resources.id not found' using errcode = '23503';
  end if;

  raise exception 'blocks.resource_id clinic mismatch'
    using errcode = '23514';
end
$function$;

-- Candidate enumeration is an optimization only. Every candidate is still
-- authorized by the existing PR-09 can_access_clinic(uuid) source of truth.
create function app_private.get_current_accessible_clinic_ids()
returns uuid[]
language sql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
  with current_authorities as (
    select distinct up.clinic_id as primary_clinic_id
    from public.user_permissions up
    join public.profiles profile_data
      on profile_data.user_id = up.staff_id
     and profile_data.is_active is true
    where up.staff_id = (select auth.uid())
  ), organization_roots as (
    select
      authority.primary_clinic_id,
      coalesce(clinic_data.parent_id, authority.primary_clinic_id)
        as root_clinic_id
    from current_authorities authority
    left join public.clinics clinic_data
      on clinic_data.id = authority.primary_clinic_id
  ), candidate_clinics as (
    select authority.primary_clinic_id as clinic_id
    from current_authorities authority
    where authority.primary_clinic_id is not null

    union

    select roots.root_clinic_id
    from organization_roots roots
    where roots.root_clinic_id is not null

    union

    select child_clinic.id
    from organization_roots roots
    join public.clinics child_clinic
      on child_clinic.parent_id = roots.root_clinic_id

    union

    select assignment.clinic_id
    from public.manager_clinic_assignments assignment
    where assignment.manager_user_id = (select auth.uid())
      and assignment.revoked_at is null
  )
  select coalesce(
    array_agg(candidate_clinics.clinic_id order by candidate_clinics.clinic_id),
    array[]::uuid[]
  )
  from candidate_clinics
  where app_private.can_access_clinic(candidate_clinics.clinic_id)
$function$;

alter function app_private.get_current_accessible_clinic_ids()
owner to postgres;

revoke all
on function app_private.get_current_accessible_clinic_ids()
from public, anon, authenticated, service_role;

grant execute
on function app_private.get_current_accessible_clinic_ids()
to authenticated;

comment on function app_private.get_current_accessible_clinic_ids() is
  'PR-11-FIX: statement-stable DB-authoritative clinic scope for the two reviewed SELECT policies.';

alter policy customer_insurance_coverages_select_for_staff
on public.customer_insurance_coverages
to authenticated
using (
  (select app_private.get_current_role()) = any (
    array[
      'admin'::text,
      'clinic_admin'::text,
      'manager'::text,
      'therapist'::text,
      'staff'::text
    ]
  )
  and customer_insurance_coverages.clinic_id = any (
    ((select app_private.get_current_accessible_clinic_ids()))::uuid[]
  )
);

alter policy menu_billing_profiles_select_for_staff
on public.menu_billing_profiles
to authenticated
using (
  (select app_private.get_current_role()) = any (
    array[
      'admin'::text,
      'clinic_admin'::text,
      'manager'::text,
      'therapist'::text,
      'staff'::text
    ]
  )
  and menu_billing_profiles.clinic_id = any (
    ((select app_private.get_current_accessible_clinic_ids()))::uuid[]
  )
);

create index customer_insurance_coverages_clinic_id_id_idx
on public.customer_insurance_coverages using btree (clinic_id, id);

create index menu_billing_profiles_clinic_id_id_idx
on public.menu_billing_profiles using btree (clinic_id, id);

comment on index public.customer_insurance_coverages_clinic_id_id_idx is
  'PR-11-FIX: statement-scope SELECT support ordered by clinic_id and id.';

comment on index public.menu_billing_profiles_clinic_id_id_idx is
  'PR-11-FIX: statement-scope SELECT support ordered by clinic_id and id.';

do $pr11_fix_postflight$
begin
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
      'PR-11 forward-fix postflight: blocks function exact contract drift';
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
      'PR-11 forward-fix postflight: blocks trigger drift';
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
    or exists (
      select 1
      from public.blocks block_data
      left join public.resources resource_data
        on resource_data.id = block_data.resource_id
       and resource_data.clinic_id = block_data.clinic_id
      where resource_data.id is null
    )
  then
    raise exception
      'PR-11 forward-fix postflight: blocks FK or data mismatch';
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
      'PR-11 forward-fix postflight: statement-scope helper exact contract drift';
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
      'PR-11 forward-fix postflight: exact target policy or inventory drift';
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
      'PR-11 forward-fix postflight: exact candidate index drift';
  end if;

  if exists (
    with actual as (
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
    ), drift_rows as (
      (select * from pr11_fix_unaffected_policy_snapshot except select * from actual)
      union all
      (select * from actual except select * from pr11_fix_unaffected_policy_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception
      'PR-11 forward-fix postflight: unrelated policy drift';
  end if;

  if exists (
    with actual as (
      select
        function_data.oid,
        function_data.oid::regprocedure::text as function_signature,
        owner_data.rolname as owner_name,
        language_data.lanname as language_name,
        function_data.provolatile,
        function_data.proparallel,
        function_data.proisstrict,
        function_data.prosecdef,
        function_data.proleakproof,
        function_data.proconfig,
        function_data.proacl,
        pg_get_functiondef(function_data.oid) as function_definition,
        obj_description(function_data.oid, 'pg_proc') as intent_comment
      from pg_proc function_data
      join pg_roles owner_data on owner_data.oid = function_data.proowner
      join pg_language language_data on language_data.oid = function_data.prolang
      where function_data.oid in (
        'app_private.get_current_role()'::regprocedure,
        'app_private.can_access_clinic(uuid)'::regprocedure
      )
    ), drift_rows as (
      (select * from pr11_fix_source_helper_snapshot except select * from actual)
      union all
      (select * from actual except select * from pr11_fix_source_helper_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception
      'PR-11 forward-fix postflight: source authority helper drift';
  end if;

  if exists (
    with actual as (
      select
        relation_data.oid,
        relation_data.oid::regclass::text as relation_name,
        owner_data.rolname as owner_name,
        relation_data.relrowsecurity,
        relation_data.relforcerowsecurity,
        relation_data.relacl
      from pg_class relation_data
      join pg_roles owner_data on owner_data.oid = relation_data.relowner
      where relation_data.oid in (
        'public.blocks'::regclass,
        'public.resources'::regclass,
        'public.customer_insurance_coverages'::regclass,
        'public.menu_billing_profiles'::regclass
      )
    ), drift_rows as (
      (select * from pr11_fix_relation_security_snapshot except select * from actual)
      union all
      (select * from actual except select * from pr11_fix_relation_security_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception
      'PR-11 forward-fix postflight: target relation owner, ACL, or RLS drift';
  end if;

  if exists (
    with actual as (
      select
        index_data.indrelid,
        index_class.relname as index_name,
        pg_get_indexdef(index_data.indexrelid) as index_definition,
        index_data.indisunique,
        index_data.indisvalid,
        index_data.indisready,
        index_data.indislive,
        obj_description(index_data.indexrelid, 'pg_class') as intent_comment
      from pg_index index_data
      join pg_class index_class on index_class.oid = index_data.indexrelid
      where index_data.indrelid in (
        'public.customer_insurance_coverages'::regclass,
        'public.menu_billing_profiles'::regclass
      )
      and index_class.relname not in (
        'customer_insurance_coverages_clinic_id_id_idx',
        'menu_billing_profiles_clinic_id_id_idx'
      )
    ), drift_rows as (
      (select * from pr11_fix_other_index_snapshot except select * from actual)
      union all
      (select * from actual except select * from pr11_fix_other_index_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception
      'PR-11 forward-fix postflight: pre-existing target index drift';
  end if;

  if exists (
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
      'PR-11 forward-fix postflight: target composite-FK data mismatch';
  end if;
end
$pr11_fix_postflight$;

commit;

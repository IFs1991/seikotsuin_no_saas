-- Validation-only rollback guard for function runtime contract remediation.
-- Restoring the previous definitions is intentionally forbidden because those
-- definitions contain confirmed runtime failures. Use a reviewed forward
-- migration if a later compatibility change is required.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $rollback_guard$
declare
  definition text;
  contract record;
  function_oid oid;
  actual_definer boolean;
  actual_search_path text;
  actual_execute_roles text[];
  expected_execute_roles text[];
  has_execute_grant_option boolean;
begin
  select pg_get_functiondef(
    'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure
  ) into definition;
  if definition not ilike '%on conflict on constraint revenue_estimates_unique_item%' then
    raise exception 'Refusing rollback: repaired pricing upsert is not present';
  end if;

  select pg_get_functiondef(
    'public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure
  ) into definition;
  if definition not ilike '%''reservation''::varchar%'
    or definition not ilike '%''block''::varchar%'
  then
    raise exception 'Refusing rollback: repaired conflict result casts are not present';
  end if;

  select pg_get_functiondef(
    'public.calculate_churn_risk_score(uuid)'::regprocedure
  ) into definition;
  if definition not ilike '%patient_visit_summary%'
    or definition ilike '%from visits%'
  then
    raise exception 'Refusing rollback: churn score is not using the current visit SSOT';
  end if;

  select pg_get_functiondef('public.get_invite_by_token(uuid)'::regprocedure)
  into definition;
  if definition not ilike '%clinic.name::text%' then
    raise exception 'Refusing rollback: invite clinic name cast is not present';
  end if;

  select pg_get_functiondef(
    'public.analyze_staff_efficiency(uuid,integer)'::regprocedure
  ) into definition;
  if definition not ilike '%analysis_period%'
    or definition not ilike '%Asia/Tokyo%'
    or definition not ilike '%public.reservations%'
  then
    raise exception 'Refusing rollback: period-scoped staff analysis is not present';
  end if;

  select pg_get_functiondef('public.predict_revenue(uuid,integer)'::regprocedure)
  into definition;
  if definition ~* 'day_counter[[:space:]]+integer[[:space:]]*;' then
    raise exception 'Refusing rollback: revenue loop variable is shadowed';
  end if;

  select pg_get_functiondef(
    'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure
  ) into definition;
  if definition not ilike '%PRAGMA:TABLE: shift_request_conversion_candidates%'
    or definition not ilike '%PRAGMA:TABLE: shift_request_conversion_map%'
  then
    raise exception 'Refusing rollback: temporary-table lint contracts are not present';
  end if;

  for contract in
    select *
    from (values
      ('public.analyze_staff_efficiency(uuid,integer)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.calculate_churn_risk_score(uuid)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)', true, 'search_path=public, auth, extensions', array['service_role']::text[]),
      ('public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)', true, 'search_path=public, auth, extensions', array['service_role']::text[]),
      ('public.get_invite_by_token(uuid)', true, 'search_path=public', array['service_role']::text[]),
      ('public.predict_revenue(uuid,integer)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[])
    ) as expected(signature, security_definer, search_path, execute_roles)
  loop
    function_oid := to_regprocedure(contract.signature);
    if function_oid is null then
      raise exception 'Refusing rollback: function contract missing: %', contract.signature;
    end if;

    select
      target_proc.prosecdef,
      (
        select setting
        from unnest(coalesce(target_proc.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
        limit 1
      )
    into actual_definer, actual_search_path
    from pg_proc target_proc
    where target_proc.oid = function_oid;

    if actual_definer is distinct from contract.security_definer then
      raise exception 'Refusing rollback: security mode drift for %', contract.signature;
    end if;

    if actual_search_path is distinct from contract.search_path then
      raise exception 'Refusing rollback: search_path drift for %', contract.signature;
    end if;

    if pg_get_userbyid((select proowner from pg_proc where oid = function_oid)) <> 'postgres' then
      raise exception 'Refusing rollback: owner drift for %', contract.signature;
    end if;

    select
      coalesce(
        array_agg(
          distinct actual_grant.role_name collate "C"
          order by actual_grant.role_name collate "C"
        ),
        array[]::text[]
      ),
      coalesce(bool_or(actual_grant.is_grantable), false)
    into actual_execute_roles, has_execute_grant_option
    from (
      select case
        when acl_entry.grantee = 0 then 'PUBLIC'
        else pg_get_userbyid(acl_entry.grantee)::text
      end as role_name,
      acl_entry.is_grantable
      from pg_proc target_proc
      cross join lateral aclexplode(
        coalesce(target_proc.proacl, acldefault('f', target_proc.proowner))
      ) acl_entry
      where target_proc.oid = function_oid
        and acl_entry.privilege_type = 'EXECUTE'
        and acl_entry.grantee <> target_proc.proowner
    ) actual_grant;

    select coalesce(
      array_agg(expected_role order by expected_role collate "C"),
      array[]::text[]
    )
    into expected_execute_roles
    from unnest(contract.execute_roles) expected_role;

    if actual_execute_roles is distinct from expected_execute_roles
      or has_execute_grant_option
    then
      raise exception 'Refusing rollback: exact function EXECUTE ACL drift for %',
        contract.signature;
    end if;
  end loop;
end;
$rollback_guard$;

commit;

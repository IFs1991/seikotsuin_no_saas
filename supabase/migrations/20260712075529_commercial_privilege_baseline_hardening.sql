begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- PR-02 changes ACLs plus the four shared-master read-policy units and the
-- clinic join used by the service-only legacy heatmap compatibility path. All
-- other RLS policies and existing routine EXECUTE grants remain for PR-03/PR-04.
do $preflight$
declare
  unexpected_column_acl text;
  unexpected_owner text;
begin
  if to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
    or to_regrole('postgres') is null
  then
    raise exception 'PR-02 preflight failed: required Supabase roles are missing';
  end if;

  if to_regprocedure('public.get_hourly_visit_pattern(uuid)') is null then
    raise exception
      'PR-02 preflight failed: required legacy heatmap function is missing';
  end if;

  with application_objects as (
    select
      c.oid as object_oid,
      'relation'::text as object_kind,
      c.relname as object_name,
      c.relowner as owner_oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.refclassid = 'pg_extension'::regclass
          and d.deptype = 'e'
      )

    union all

    select
      p.oid,
      'routine'::text,
      p.proname,
      p.proowner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass
          and d.deptype = 'e'
      )
  )
  select string_agg(
    format(
      'public.%I(kind=%s owner=%I)',
      application_objects.object_name,
      application_objects.object_kind,
      owner_role.rolname
    ),
    ', ' order by application_objects.object_kind, application_objects.object_name
  )
  into unexpected_owner
  from application_objects
  join pg_roles owner_role on owner_role.oid = application_objects.owner_oid
  where owner_role.rolname <> 'postgres';

  if unexpected_owner is not null then
    raise exception
      'PR-02 preflight failed: unreviewed public application object owner(s): %',
      unexpected_owner;
  end if;

  -- Inventory client column ACLs before the blanket table reset. PostgreSQL
  -- also removes corresponding column ACLs during the reset; the reviewed
  -- seven-column profile allowlist is granted back explicitly below.
  select string_agg(
    format(
      '%I.%I(%I) grantee=%I privilege=%s',
      n.nspname,
      c.relname,
      a.attname,
      coalesce(grantee.rolname, 'PUBLIC'),
      acl.privilege_type
    ),
    ', ' order by c.relname, a.attname, grantee.rolname, acl.privilege_type
  )
  into unexpected_column_acl
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(a.attacl) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'public'
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
    and not (
      c.relname = 'profiles'
      and grantee.rolname = 'authenticated'
      and acl.privilege_type = 'UPDATE'
      and a.attname in (
        'avatar_url',
        'full_name',
        'language_preference',
        'last_login_at',
        'phone_number',
        'timezone',
        'updated_at'
      )
    );

  if unexpected_column_acl is not null then
    raise exception
      'PR-02 preflight failed: unreviewed client column ACL(s): %',
      unexpected_column_acl;
  end if;

  if exists (
    select 1
    from pg_auth_members memberships
    join pg_roles member_role on member_role.oid = memberships.member
    where member_role.rolname in ('anon', 'authenticated')
  ) then
    raise exception
      'PR-02 preflight failed: client roles must not inherit relation privileges';
  end if;
end
$preflight$;

-- The legacy heatmap must use service_role after direct client access to
-- visits/revenues is quarantined. RLS no longer protects that execution path,
-- so require the joined revenue row to belong to the same clinic as its visit.
-- CREATE OR REPLACE preserves the existing function identity and ACLs; PR-04
-- remains responsible for the broader routine-EXECUTE cleanup.
create or replace function public.get_hourly_visit_pattern(clinic_uuid uuid)
returns table(
  hour_of_day integer,
  day_of_week integer,
  visit_count integer,
  avg_revenue numeric
)
language plpgsql
security invoker
set search_path = public, auth, extensions
as $function$
begin
  return query
  select
    extract(hour from v.visit_date)::integer as hour_of_day,
    extract(dow from v.visit_date)::integer as day_of_week,
    count(v.id)::integer as visit_count,
    avg(r.amount)::decimal(10, 2) as avg_revenue
  from public.visits v
  left join public.revenues r
    on r.visit_id = v.id
    and r.clinic_id = v.clinic_id
  where v.clinic_id = clinic_uuid
    and v.visit_date >= current_date - interval '30 days'
  group by
    extract(hour from v.visit_date),
    extract(dow from v.visit_date)
  order by day_of_week, hour_of_day;
end;
$function$;

-- Opt application-owned future objects out of Supabase's legacy automatic
-- Data API exposure. Function PUBLIC EXECUTE is a global built-in default, so
-- that revoke intentionally has no IN SCHEMA clause.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres
  revoke all privileges on tables from public, anon, authenticated;

alter default privileges for role postgres
  revoke all privileges on sequences from public, anon, authenticated;

-- supabase_admin owns extension-managed routines only. Hosted application
-- migrations cannot SET ROLE to that platform role, so its defaults are a
-- bounded platform exception and are intentionally identical on local/hosted.

-- Close the inherited baseline first. ON ALL TABLES includes ordinary tables,
-- partitioned tables, views, and materialized views.
revoke all privileges on all tables in schema public
  from public, anon, authenticated;

revoke all privileges on all sequences in schema public
  from public, anon, authenticated;

-- The four shared masters are the only PR-02 policy additions. Local replay
-- previously had RLS disabled while hosted had RLS enabled without policies;
-- applying grant + RLS + policy together makes the read-only contract stable.
alter table public.master_categories enable row level security;
alter table public.master_patient_types enable row level security;
alter table public.master_payment_methods enable row level security;
alter table public.menu_categories enable row level security;

drop policy if exists master_categories_authenticated_read
on public.master_categories;

create policy master_categories_authenticated_read
on public.master_categories
for select
to authenticated
using (true);

drop policy if exists master_patient_types_authenticated_read
on public.master_patient_types;

create policy master_patient_types_authenticated_read
on public.master_patient_types
for select
to authenticated
using (true);

drop policy if exists master_payment_methods_authenticated_read
on public.master_payment_methods;

create policy master_payment_methods_authenticated_read
on public.master_payment_methods
for select
to authenticated
using (true);

drop policy if exists menu_categories_authenticated_read
on public.menu_categories;

create policy menu_categories_authenticated_read
on public.menu_categories
for select
to authenticated
using (true);

-- Authenticated ACL matrix: only relation privileges proven by reachable
-- application call sites, plus the four reviewed shared masters. RLS remains
-- the row-level boundary on these directly exposed relations.
grant select on table
  public.ai_comments,
  public.audit_logs,
  public.beta_feedback,
  public.beta_usage_metrics,
  public.blocks,
  public.chat_messages,
  public.chat_sessions,
  public.clinic_feature_flags,
  public.clinic_settings,
  public.clinics,
  public.csp_violations,
  public.customer_insurance_coverages,
  public.customers,
  public.daily_report_items,
  public.daily_reports,
  public.improvement_backlog,
  public.master_categories,
  public.master_patient_types,
  public.master_payment_methods,
  public.menu_billing_profiles,
  public.menu_categories,
  public.menus,
  public.mfa_setup_sessions,
  public.notifications,
  public.onboarding_states,
  public.patients,
  public.profiles,
  public.registered_devices,
  public.reservations,
  public.resources,
  public.revenue_contexts,
  public.revenue_estimate_lines,
  public.revenue_estimate_warnings,
  public.revenue_estimates,
  public.security_events,
  public.session_policies,
  public.shift_request_periods,
  public.shift_requests,
  public.staff,
  public.staff_invites,
  public.staff_performance,
  public.staff_preferences,
  public.staff_profiles,
  public.staff_shifts,
  public.user_mfa_settings,
  public.user_permissions,
  public.user_sessions,
  public.daily_report_revenue_breakdown_summary,
  public.daily_report_revenue_context_summary,
  public.daily_report_revenue_estimate_summary,
  public.daily_revenue_summary,
  public.patient_visit_summary,
  public.reservation_list_view,
  public.staff_performance_summary
to authenticated;

grant insert on table
  public.ai_comments,
  public.beta_feedback,
  public.blocks,
  public.chat_messages,
  public.chat_sessions,
  public.clinic_settings,
  public.daily_reports,
  public.improvement_backlog,
  public.menus,
  public.mfa_setup_sessions,
  public.onboarding_states,
  public.registered_devices,
  public.reservations,
  public.resources,
  public.security_events,
  public.shift_request_periods,
  public.shift_requests,
  public.staff,
  public.staff_invites,
  public.staff_preferences,
  public.staff_shifts,
  public.user_mfa_settings,
  public.user_sessions
to authenticated;

grant update on table
  public.ai_comments,
  public.beta_feedback,
  public.clinic_settings,
  public.csp_violations,
  public.daily_reports,
  public.improvement_backlog,
  public.menus,
  public.onboarding_states,
  public.registered_devices,
  public.reservations,
  public.resources,
  public.security_events,
  public.shift_request_periods,
  public.shift_requests,
  public.staff_shifts,
  public.user_mfa_settings,
  public.user_sessions
to authenticated;

grant delete on table
  public.blocks,
  public.daily_reports,
  public.improvement_backlog,
  public.mfa_setup_sessions
to authenticated;

-- Preserve the baseline's deliberately narrow self-service profile writes.
-- Table-wide UPDATE stays revoked, so authority fields remain server-only.
grant update (
  avatar_url,
  full_name,
  language_preference,
  last_login_at,
  phone_number,
  timezone,
  updated_at
)
on table public.profiles
to authenticated;

do $postflight$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and grantee.rolname in ('anon', 'authenticated')
      and acl.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) then
    raise exception 'PR-02 postflight failed: forbidden client relation privilege remains';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and acl.grantee = 0
  ) or exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and (
        grantee.rolname = 'anon'
        or (c.relkind = 'S' and grantee.rolname = 'authenticated')
      )
  ) then
    raise exception
      'PR-02 postflight failed: PUBLIC, anon, or authenticated sequence privilege remains';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and acl.is_grantable
  ) or exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and acl.is_grantable
  ) then
    raise exception 'PR-02 postflight failed: client or PUBLIC grant option remains';
  end if;

  if exists (
    select 1
    from pg_auth_members memberships
    join pg_roles member_role on member_role.oid = memberships.member
    where member_role.rolname in ('anon', 'authenticated')
  ) then
    raise exception 'PR-02 postflight failed: client role membership remains';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'master_categories',
        'master_patient_types',
        'master_payment_methods',
        'menu_categories'
      )
  ) <> 4 or (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (tablename, policyname) in (
        values
          ('master_categories', 'master_categories_authenticated_read'),
          ('master_patient_types', 'master_patient_types_authenticated_read'),
          ('master_payment_methods', 'master_payment_methods_authenticated_read'),
          ('menu_categories', 'menu_categories_authenticated_read')
      )
      and permissive = 'PERMISSIVE'
      and roles::text = '{authenticated}'
      and cmd = 'SELECT'
      and qual = 'true'
      and with_check is null
  ) <> 4 or (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'master_categories',
        'master_patient_types',
        'master_payment_methods',
        'menu_categories'
      )
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  ) <> 4 then
    raise exception 'PR-02 postflight failed: shared-master RLS policy unit drifted';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'clinic_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'is_active', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE')
  then
    raise exception 'PR-02 postflight failed: profile authority columns remain client-writable';
  end if;

  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and not (
        c.relname = 'profiles'
        and grantee.rolname = 'authenticated'
        and acl.privilege_type = 'UPDATE'
        and a.attname in (
          'avatar_url',
          'full_name',
          'language_preference',
          'last_login_at',
          'phone_number',
          'timezone',
          'updated_at'
        )
      )
  ) then
    raise exception 'PR-02 postflight failed: unexpected client column ACL remains';
  end if;

  if exists (
    select 1
    from pg_default_acl d
    join pg_roles owner_role on owner_role.oid = d.defaclrole
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where owner_role.rolname = 'postgres'
      and (n.nspname = 'public' or d.defaclnamespace = 0)
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and d.defaclobjtype in ('r', 'S', 'f')
  ) then
    raise exception 'PR-02 postflight failed: unsafe postgres explicit default remains';
  end if;

  if exists (
    select 1
    from pg_roles owner_role
    left join pg_default_acl d
      on d.defaclrole = owner_role.oid
     and d.defaclnamespace = 0
     and d.defaclobjtype = 'f'
    cross join lateral aclexplode(
      coalesce(d.defaclacl, acldefault('f', owner_role.oid))
    ) acl
    where owner_role.rolname = 'postgres'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PR-02 postflight failed: postgres functions still default to PUBLIC EXECUTE';
  end if;
end
$postflight$;

commit;

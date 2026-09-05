-- PR-11 authenticated RLS SELECT plan probe.
--
-- Run unchanged before and after the PR-11 RLS migration. All fixtures and
-- measurements are transaction-local and are rolled back. The clinic-admin
-- actor intentionally exercises the redundant ALL+SELECT overlap before the
-- split; after the split only the retained broader SELECT policy is eligible.

begin;

set local search_path = pg_catalog, extensions, public, auth;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local role postgres;

insert into public.clinics (id, name, parent_id)
values
  ('fb110000-0000-4000-8000-000000004001', '__pr11_rls_plan_a__', null),
  ('fb110000-0000-4000-8000-000000004002', '__pr11_rls_plan_b__', null);

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) values (
  'fb110000-0000-4000-8000-000000004010',
  'commercial-pr11-rls-plan@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  'authenticated'
);

insert into public.profiles (
  user_id,
  clinic_id,
  email,
  full_name,
  role,
  is_active
) values (
  'fb110000-0000-4000-8000-000000004010',
  'fb110000-0000-4000-8000-000000004001',
  'commercial-pr11-rls-plan@example.invalid',
  'PR11 RLS Plan Actor',
  'clinic_admin',
  true
);

insert into public.staff (id, clinic_id, name, role, email, password_hash)
values (
  'fb110000-0000-4000-8000-000000004010',
  'fb110000-0000-4000-8000-000000004001',
  'PR11 RLS Plan Actor',
  'clinic_admin',
  'commercial-pr11-rls-plan@example.invalid',
  'not-used'
);

insert into public.user_permissions (
  staff_id,
  username,
  hashed_password,
  role,
  clinic_id
) values (
  'fb110000-0000-4000-8000-000000004010',
  'commercial-pr11-rls-plan',
  'not-used',
  'clinic_admin',
  'fb110000-0000-4000-8000-000000004001'
);

insert into public.customers (id, name, phone, clinic_id)
select
  md5('pr11-rls-customer-' || fixture_number::text)::uuid,
  'PR11 RLS Customer ' || fixture_number::text,
  '050' || lpad(fixture_number::text, 8, '0'),
  case
    when fixture_number <= 1000
      then 'fb110000-0000-4000-8000-000000004001'::uuid
    else 'fb110000-0000-4000-8000-000000004002'::uuid
  end
from generate_series(1, 2000) fixture(fixture_number);

insert into public.menus (
  id,
  name,
  price,
  duration_minutes,
  clinic_id,
  is_active,
  is_deleted
)
select
  md5('pr11-rls-menu-' || fixture_number::text)::uuid,
  'PR11 RLS Menu ' || fixture_number::text,
  1000,
  30,
  case
    when fixture_number <= 1000
      then 'fb110000-0000-4000-8000-000000004001'::uuid
    else 'fb110000-0000-4000-8000-000000004002'::uuid
  end,
  true,
  false
from generate_series(1, 2000) fixture(fixture_number);

insert into public.customer_insurance_coverages (
  id,
  clinic_id,
  customer_id,
  patient_burden_rate,
  effective_from,
  verification_status
)
select
  md5('pr11-rls-coverage-' || fixture_number::text)::uuid,
  case
    when fixture_number <= 1000
      then 'fb110000-0000-4000-8000-000000004001'::uuid
    else 'fb110000-0000-4000-8000-000000004002'::uuid
  end,
  md5('pr11-rls-customer-' || fixture_number::text)::uuid,
  10,
  date '2099-10-01' + fixture_number,
  'needs_review'
from generate_series(1, 2000) fixture(fixture_number);

insert into public.menu_billing_profiles (
  id,
  clinic_id,
  menu_id,
  revenue_context_code,
  calculation_method,
  effective_from
)
select
  md5('pr11-rls-profile-' || fixture_number::text)::uuid,
  case
    when fixture_number <= 1000
      then 'fb110000-0000-4000-8000-000000004001'::uuid
    else 'fb110000-0000-4000-8000-000000004002'::uuid
  end,
  md5('pr11-rls-menu-' || fixture_number::text)::uuid,
  'private',
  'manual_estimate',
  date '2099-10-01' + fixture_number
from generate_series(1, 2000) fixture(fixture_number);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000004010',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000004001')
    )
  )::text,
  true
);

set local role authenticated;

create function pg_temp.pr11_explain_analyze(statement_text text)
returns jsonb
language plpgsql
as $function$
declare
  result_data jsonb;
begin
  execute 'explain (analyze, buffers, wal, timing off, format json) '
    || statement_text
    into result_data;
  return result_data;
end
$function$;

create temporary table pr11_rls_plan_result (
  probe_name text primary key,
  plan_data jsonb not null
) on commit drop;

insert into pr11_rls_plan_result values
  (
    'customer_insurance_coverages',
    pg_temp.pr11_explain_analyze($query$
      select id, clinic_id, customer_id
      from public.customer_insurance_coverages
      where clinic_id = 'fb110000-0000-4000-8000-000000004001'
      order by id
      limit 250
    $query$)
  ),
  (
    'menu_billing_profiles',
    pg_temp.pr11_explain_analyze($query$
      select id, clinic_id, menu_id
      from public.menu_billing_profiles
      where clinic_id = 'fb110000-0000-4000-8000-000000004001'
      order by id
      limit 250
    $query$)
  );

select jsonb_build_object(
  'probe', probe_name,
  'execution_ms', (plan_data #>> '{0,Execution Time}')::numeric,
  'planning_ms', (plan_data #>> '{0,Planning Time}')::numeric,
  'actual_rows', (plan_data #>> '{0,Plan,Actual Rows}')::bigint,
  'shared_hit_blocks', (plan_data #>> '{0,Plan,Shared Hit Blocks}')::bigint,
  'index_name', jsonb_path_query_first(plan_data, '$.**."Index Name"'),
  'rls_filter', jsonb_path_query_first(plan_data, '$.**."Filter"'),
  'raw_plan_md5', md5(plan_data::text),
  'raw_plan', plan_data
) as plan_summary
from pr11_rls_plan_result
order by probe_name;

reset role;

select
  tablename,
  count(*) filter (where cmd in ('ALL', 'SELECT')) as select_policy_count,
  string_agg(policyname, '+' order by policyname)
    filter (where cmd in ('ALL', 'SELECT')) as select_policy_names
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customer_insurance_coverages',
    'menu_billing_profiles'
  )
group by tablename
order by tablename;

rollback;

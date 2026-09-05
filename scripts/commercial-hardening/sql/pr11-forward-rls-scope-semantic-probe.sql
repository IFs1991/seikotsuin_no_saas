-- Admin and fail-closed JWT scope semantic probe for the two protected tables.
-- The caller may create candidate indexes in an outer transaction. This file
-- changes no persistent schema or data and always ends with ROLLBACK.

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, extensions, public, auth;

grant insert, update, delete
on table
  public.customer_insurance_coverages,
  public.menu_billing_profiles
to authenticated;

insert into public.clinics (id, name, parent_id)
values
  ('fb110000-0000-4000-8000-000000007001', '__pr11_scope_root_a__', null),
  ('fb110000-0000-4000-8000-000000007002', '__pr11_scope_a__', 'fb110000-0000-4000-8000-000000007001'),
  ('fb110000-0000-4000-8000-000000007003', '__pr11_scope_root_b__', null),
  ('fb110000-0000-4000-8000-000000007004', '__pr11_scope_b__', 'fb110000-0000-4000-8000-000000007003');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
) values (
  'fb110000-0000-4000-8000-000000007010',
  'commercial-pr11-admin-scope@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
);

insert into public.profiles (
  user_id, clinic_id, email, full_name, role, is_active
) values (
  'fb110000-0000-4000-8000-000000007010',
  'fb110000-0000-4000-8000-000000007002',
  'commercial-pr11-admin-scope@example.invalid',
  'PR11 Admin Scope',
  'admin',
  true
);

insert into public.staff (id, clinic_id, name, role, email, password_hash)
values (
  'fb110000-0000-4000-8000-000000007010',
  'fb110000-0000-4000-8000-000000007002',
  'PR11 Admin Scope',
  'admin',
  'commercial-pr11-admin-scope@example.invalid',
  'not-used'
);

insert into public.user_permissions (
  staff_id, username, hashed_password, role, clinic_id
) values (
  'fb110000-0000-4000-8000-000000007010',
  'commercial-pr11-admin-scope',
  'not-used',
  'admin',
  'fb110000-0000-4000-8000-000000007002'
);

insert into public.customers (id, name, phone, clinic_id)
values
  ('fb110000-0000-4000-8000-000000007100', 'PR11 Scope Customer A', '03000007100', 'fb110000-0000-4000-8000-000000007002'),
  ('fb110000-0000-4000-8000-000000007200', 'PR11 Scope Customer B', '03000007200', 'fb110000-0000-4000-8000-000000007004');

insert into public.menus (
  id, name, price, duration_minutes, clinic_id, is_active, is_deleted
) values
  ('fb110000-0000-4000-8000-000000007300', 'PR11 Scope Menu A', 1000, 30, 'fb110000-0000-4000-8000-000000007002', true, false),
  ('fb110000-0000-4000-8000-000000007400', 'PR11 Scope Menu B', 1000, 30, 'fb110000-0000-4000-8000-000000007004', true, false);

insert into public.customer_insurance_coverages (
  id, clinic_id, customer_id, patient_burden_rate,
  effective_from, verification_status
) values
  ('fb110000-0000-4000-8000-000000007500', 'fb110000-0000-4000-8000-000000007002', 'fb110000-0000-4000-8000-000000007100', 10, '2102-01-01', 'needs_review'),
  ('fb110000-0000-4000-8000-000000007600', 'fb110000-0000-4000-8000-000000007004', 'fb110000-0000-4000-8000-000000007200', 10, '2102-01-01', 'needs_review');

insert into public.menu_billing_profiles (
  id, clinic_id, menu_id, revenue_context_code,
  calculation_method, effective_from
) values
  ('fb110000-0000-4000-8000-000000007700', 'fb110000-0000-4000-8000-000000007002', 'fb110000-0000-4000-8000-000000007300', 'private', 'manual_estimate', '2102-01-01'),
  ('fb110000-0000-4000-8000-000000007800', 'fb110000-0000-4000-8000-000000007004', 'fb110000-0000-4000-8000-000000007400', 'private', 'manual_estimate', '2102-01-01');

set local role authenticated;

create temporary table pr11_scope_semantic_result (
  sequence_number integer primary key,
  case_name text not null,
  actual text not null,
  passed boolean not null
) on commit drop;

create function pg_temp.pr11_scope_record_visibility(
  sequence_number integer,
  case_name text,
  expected_coverage uuid[],
  expected_profiles uuid[]
)
returns void
language plpgsql
security invoker
as $function$
declare
  actual_coverage uuid[];
  actual_profiles uuid[];
begin
  select coalesce(array_agg(id order by id), array[]::uuid[])
  into actual_coverage
  from public.customer_insurance_coverages;

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into actual_profiles
  from public.menu_billing_profiles;

  if actual_coverage is distinct from expected_coverage
    or actual_profiles is distinct from expected_profiles
  then
    raise exception
      'PR-11 scope visibility % drift: coverage %, profiles %',
      case_name,
      actual_coverage,
      actual_profiles;
  end if;

  insert into pr11_scope_semantic_result values (
    sequence_number,
    case_name,
    format('coverage=%s;profiles=%s', actual_coverage, actual_profiles),
    true
  );
end
$function$;

create function pg_temp.pr11_scope_expect_dml(
  sequence_number integer,
  case_name text,
  statement_text text,
  expected_allowed boolean
)
returns void
language plpgsql
security invoker
as $function$
declare
  affected_rows bigint := 0;
  actual_sqlstate text := '00000';
  actual_allowed boolean := false;
begin
  begin
    execute statement_text;
    get diagnostics affected_rows = row_count;
    actual_allowed := affected_rows = 1;
  exception when others then
    actual_sqlstate := sqlstate;
    actual_allowed := false;
  end;

  if actual_allowed is distinct from expected_allowed then
    raise exception
      'PR-11 scope DML % expected allowed %, got rows %, SQLSTATE %',
      case_name,
      expected_allowed,
      affected_rows,
      actual_sqlstate;
  end if;

  insert into pr11_scope_semantic_result values (
    sequence_number,
    case_name,
    format('allowed=%s;rows=%s;sqlstate=%s',
      actual_allowed, affected_rows, actual_sqlstate),
    true
  );
end
$function$;

-- Valid tenant-A scope for a database-authoritative admin.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000007010',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000007002')
    )
  )::text,
  true
);

select pg_temp.pr11_scope_record_visibility(
  1,
  'valid_scope_reads_tenant_a_only',
  array['fb110000-0000-4000-8000-000000007500'::uuid],
  array['fb110000-0000-4000-8000-000000007700'::uuid]
);

select pg_temp.pr11_scope_expect_dml(2, 'valid_scope_insert_coverage_a',
  $$insert into public.customer_insurance_coverages
    (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status)
    values ('fb110000-0000-4000-8000-000000007510',
      'fb110000-0000-4000-8000-000000007002',
      'fb110000-0000-4000-8000-000000007100', 10, '2102-02-01', 'needs_review')$$,
  true);
select pg_temp.pr11_scope_expect_dml(3, 'valid_scope_insert_coverage_b',
  $$insert into public.customer_insurance_coverages
    (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status)
    values ('fb110000-0000-4000-8000-000000007610',
      'fb110000-0000-4000-8000-000000007004',
      'fb110000-0000-4000-8000-000000007200', 10, '2102-02-01', 'needs_review')$$,
  false);
select pg_temp.pr11_scope_expect_dml(4, 'valid_scope_update_coverage_a',
  $$update public.customer_insurance_coverages set notes = 'allowed'
    where id = 'fb110000-0000-4000-8000-000000007500'$$, true);
select pg_temp.pr11_scope_expect_dml(5, 'valid_scope_update_coverage_b',
  $$update public.customer_insurance_coverages set notes = 'blocked'
    where id = 'fb110000-0000-4000-8000-000000007600'$$, false);
select pg_temp.pr11_scope_expect_dml(6, 'valid_scope_delete_coverage_a',
  $$delete from public.customer_insurance_coverages
    where id = 'fb110000-0000-4000-8000-000000007510'$$, true);
select pg_temp.pr11_scope_expect_dml(7, 'valid_scope_delete_coverage_b',
  $$delete from public.customer_insurance_coverages
    where id = 'fb110000-0000-4000-8000-000000007600'$$, false);

select pg_temp.pr11_scope_expect_dml(8, 'valid_scope_insert_profile_a',
  $$insert into public.menu_billing_profiles
    (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from)
    values ('fb110000-0000-4000-8000-000000007710',
      'fb110000-0000-4000-8000-000000007002',
      'fb110000-0000-4000-8000-000000007300', 'private', 'manual_estimate', '2102-02-01')$$,
  true);
select pg_temp.pr11_scope_expect_dml(9, 'valid_scope_insert_profile_b',
  $$insert into public.menu_billing_profiles
    (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from)
    values ('fb110000-0000-4000-8000-000000007810',
      'fb110000-0000-4000-8000-000000007004',
      'fb110000-0000-4000-8000-000000007400', 'private', 'manual_estimate', '2102-02-01')$$,
  false);
select pg_temp.pr11_scope_expect_dml(10, 'valid_scope_update_profile_a',
  $$update public.menu_billing_profiles set profession_type = 'allowed'
    where id = 'fb110000-0000-4000-8000-000000007700'$$, true);
select pg_temp.pr11_scope_expect_dml(11, 'valid_scope_update_profile_b',
  $$update public.menu_billing_profiles set profession_type = 'blocked'
    where id = 'fb110000-0000-4000-8000-000000007800'$$, false);
select pg_temp.pr11_scope_expect_dml(12, 'valid_scope_delete_profile_a',
  $$delete from public.menu_billing_profiles
    where id = 'fb110000-0000-4000-8000-000000007710'$$, true);
select pg_temp.pr11_scope_expect_dml(13, 'valid_scope_delete_profile_b',
  $$delete from public.menu_billing_profiles
    where id = 'fb110000-0000-4000-8000-000000007800'$$, false);

-- Explicit empty scope must deny reads and writes.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000007010',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('clinic_scope_ids', '[]'::jsonb)
  )::text,
  true
);

select pg_temp.pr11_scope_record_visibility(
  14, 'empty_scope_reads_nothing', array[]::uuid[], array[]::uuid[]
);
select pg_temp.pr11_scope_expect_dml(15, 'empty_scope_insert_coverage_a',
  $$insert into public.customer_insurance_coverages
    (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status)
    values ('fb110000-0000-4000-8000-000000007520',
      'fb110000-0000-4000-8000-000000007002',
      'fb110000-0000-4000-8000-000000007100', 10, '2102-03-01', 'needs_review')$$,
  false);
select pg_temp.pr11_scope_expect_dml(16, 'empty_scope_update_coverage_a',
  $$update public.customer_insurance_coverages set notes = 'blocked-empty'
    where id = 'fb110000-0000-4000-8000-000000007500'$$, false);
select pg_temp.pr11_scope_expect_dml(17, 'empty_scope_delete_coverage_a',
  $$delete from public.customer_insurance_coverages
    where id = 'fb110000-0000-4000-8000-000000007500'$$, false);
select pg_temp.pr11_scope_expect_dml(18, 'empty_scope_insert_profile_a',
  $$insert into public.menu_billing_profiles
    (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from)
    values ('fb110000-0000-4000-8000-000000007720',
      'fb110000-0000-4000-8000-000000007002',
      'fb110000-0000-4000-8000-000000007300', 'private', 'manual_estimate', '2102-03-01')$$,
  false);
select pg_temp.pr11_scope_expect_dml(19, 'empty_scope_update_profile_a',
  $$update public.menu_billing_profiles set profession_type = 'blocked-empty'
    where id = 'fb110000-0000-4000-8000-000000007700'$$, false);
select pg_temp.pr11_scope_expect_dml(20, 'empty_scope_delete_profile_a',
  $$delete from public.menu_billing_profiles
    where id = 'fb110000-0000-4000-8000-000000007700'$$, false);

-- A malformed UUID element must also fail closed.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000007010',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids', jsonb_build_array('not-a-uuid')
    )
  )::text,
  true
);

select pg_temp.pr11_scope_record_visibility(
  21, 'malformed_scope_reads_nothing', array[]::uuid[], array[]::uuid[]
);
select pg_temp.pr11_scope_expect_dml(22, 'malformed_scope_insert_coverage_a',
  $$insert into public.customer_insurance_coverages
    (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status)
    values ('fb110000-0000-4000-8000-000000007530',
      'fb110000-0000-4000-8000-000000007002',
      'fb110000-0000-4000-8000-000000007100', 10, '2102-04-01', 'needs_review')$$,
  false);
select pg_temp.pr11_scope_expect_dml(23, 'malformed_scope_update_coverage_a',
  $$update public.customer_insurance_coverages set notes = 'blocked-malformed'
    where id = 'fb110000-0000-4000-8000-000000007500'$$, false);
select pg_temp.pr11_scope_expect_dml(24, 'malformed_scope_delete_coverage_a',
  $$delete from public.customer_insurance_coverages
    where id = 'fb110000-0000-4000-8000-000000007500'$$, false);
select pg_temp.pr11_scope_expect_dml(25, 'malformed_scope_insert_profile_a',
  $$insert into public.menu_billing_profiles
    (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from)
    values ('fb110000-0000-4000-8000-000000007730',
      'fb110000-0000-4000-8000-000000007002',
      'fb110000-0000-4000-8000-000000007300', 'private', 'manual_estimate', '2102-04-01')$$,
  false);
select pg_temp.pr11_scope_expect_dml(26, 'malformed_scope_update_profile_a',
  $$update public.menu_billing_profiles set profession_type = 'blocked-malformed'
    where id = 'fb110000-0000-4000-8000-000000007700'$$, false);
select pg_temp.pr11_scope_expect_dml(27, 'malformed_scope_delete_profile_a',
  $$delete from public.menu_billing_profiles
    where id = 'fb110000-0000-4000-8000-000000007700'$$, false);

select jsonb_build_object(
  'kind', 'scope_semantic_case',
  'sequence', sequence_number,
  'case', case_name,
  'actual', actual,
  'pass', passed
) as semantic_result
from pr11_scope_semantic_result
order by sequence_number;

select jsonb_build_object(
  'kind', 'scope_semantic_summary',
  'cases', count(*),
  'passed', bool_and(passed)
) as semantic_summary
from pr11_scope_semantic_result;

reset role;
rollback;

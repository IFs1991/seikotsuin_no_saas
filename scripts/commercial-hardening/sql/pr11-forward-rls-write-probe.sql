-- PR-11 2,000-row write amplification probe for the two candidate full indexes.
-- The caller decides whether candidate indexes exist in the outer transaction.

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;
set local jit = off;

create temporary table pr11_forward_write_result (
  probe_name text primary key,
  plan_data jsonb not null,
  inserted_rows bigint not null
) on commit drop;

create function pg_temp.pr11_forward_explain_analyze(statement_text text)
returns jsonb
language plpgsql
as $function$
declare
  result_data jsonb;
begin
  execute
    'explain (analyze, buffers, wal, timing off, summary on, format json) '
      || statement_text
    into result_data;
  return result_data;
end
$function$;

insert into public.clinics (id, name, parent_id)
values
  ('fb110000-0000-4000-8000-000000005001', '__pr11_write_a__', null),
  ('fb110000-0000-4000-8000-000000005002', '__pr11_write_b__', null);

insert into public.customers (id, name, phone, clinic_id)
select
  md5('pr11-forward-write-customer-' || fixture_number::text)::uuid,
  'PR11 Forward Write Customer ' || fixture_number::text,
  '040' || lpad(fixture_number::text, 8, '0'),
  case when fixture_number <= 1000
    then 'fb110000-0000-4000-8000-000000005001'::uuid
    else 'fb110000-0000-4000-8000-000000005002'::uuid
  end
from generate_series(1, 2000) fixture(fixture_number);

insert into public.menus (
  id, name, price, duration_minutes, clinic_id, is_active, is_deleted
)
select
  md5('pr11-forward-write-menu-' || fixture_number::text)::uuid,
  'PR11 Forward Write Menu ' || fixture_number::text,
  1000,
  30,
  case when fixture_number <= 1000
    then 'fb110000-0000-4000-8000-000000005001'::uuid
    else 'fb110000-0000-4000-8000-000000005002'::uuid
  end,
  true,
  false
from generate_series(1, 2000) fixture(fixture_number);

insert into pr11_forward_write_result (probe_name, plan_data, inserted_rows)
select
  'coverage_insert_2000',
  pg_temp.pr11_forward_explain_analyze($statement$
    insert into public.customer_insurance_coverages (
      id,
      clinic_id,
      customer_id,
      patient_burden_rate,
      effective_from,
      verification_status
    )
    select
      md5('pr11-forward-write-coverage-' || fixture_number::text)::uuid,
      case when fixture_number <= 1000
        then 'fb110000-0000-4000-8000-000000005001'::uuid
        else 'fb110000-0000-4000-8000-000000005002'::uuid
      end,
      md5('pr11-forward-write-customer-' || fixture_number::text)::uuid,
      10,
      date '2100-01-01' + fixture_number,
      'needs_review'
    from generate_series(1, 2000) fixture(fixture_number)
  $statement$),
  0;

-- SQL expression evaluation order is not a row-count contract. Record the
-- result only after the EXPLAIN ANALYZE function has completed its INSERT.
update pr11_forward_write_result
set inserted_rows = (
  select count(*) from public.customer_insurance_coverages
)
where probe_name = 'coverage_insert_2000';

insert into pr11_forward_write_result (probe_name, plan_data, inserted_rows)
select
  'menu_profile_insert_2000',
  pg_temp.pr11_forward_explain_analyze($statement$
    insert into public.menu_billing_profiles (
      id,
      clinic_id,
      menu_id,
      revenue_context_code,
      calculation_method,
      effective_from
    )
    select
      md5('pr11-forward-write-profile-' || fixture_number::text)::uuid,
      case when fixture_number <= 1000
        then 'fb110000-0000-4000-8000-000000005001'::uuid
        else 'fb110000-0000-4000-8000-000000005002'::uuid
      end,
      md5('pr11-forward-write-menu-' || fixture_number::text)::uuid,
      'private',
      'manual_estimate',
      date '2100-01-01' + fixture_number
    from generate_series(1, 2000) fixture(fixture_number)
  $statement$),
  0;

update pr11_forward_write_result
set inserted_rows = (
  select count(*) from public.menu_billing_profiles
)
where probe_name = 'menu_profile_insert_2000';

select
  probe_name,
  nullif(plan_data #>> '{0,Execution Time}', '')::numeric,
  nullif(plan_data #>> '{0,Plan,WAL Records}', '')::bigint,
  nullif(plan_data #>> '{0,Plan,WAL Bytes}', '')::bigint,
  nullif(plan_data #>> '{0,Plan,Shared Dirtied Blocks}', '')::bigint,
  plan_data #>> '{0,Plan,Node Type}',
  md5(plan_data::text),
  plan_data::text
from pr11_forward_write_result
order by probe_name;

select jsonb_build_object(
  'kind', 'write_row_count',
  'probe', probe_name,
  'inserted_rows', inserted_rows
) as row_count_result
from pr11_forward_write_result
order by probe_name;

rollback;

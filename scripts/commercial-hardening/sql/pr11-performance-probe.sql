begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;
set local jit = off;

create temporary table pr11_performance_probe_result (
  probe_name text primary key,
  plan_data jsonb not null
) on commit drop;

create function pg_temp.pr11_explain_analyze(statement_text text)
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

create function pg_temp.pr11_explain(statement_text text)
returns jsonb
language plpgsql
as $function$
declare
  result_data jsonb;
begin
  execute 'explain (costs off, format json) ' || statement_text
    into result_data;
  return result_data;
end
$function$;

insert into public.clinics (id, name, parent_id)
values (
  'fb110000-0000-4000-8000-000000000001',
  '__commercial_pr11_performance_probe__',
  null
);

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
)
values
  (
    'fb110000-0000-4000-8000-000000000010',
    'commercial-pr11-probe-a@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'fb110000-0000-4000-8000-000000000020',
    'commercial-pr11-probe-b@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

insert into public.resources (id, name, type, clinic_id)
values
  (
    'fb110000-0000-4000-8000-000000000100',
    'Commercial PR11 Probe Room',
    'room',
    'fb110000-0000-4000-8000-000000000001'
  ),
  (
    'fb110000-0000-4000-8000-000000000110',
    'Commercial PR11 Probe Staff',
    'staff',
    'fb110000-0000-4000-8000-000000000001'
  );

insert into public.shift_request_periods (
  id,
  clinic_id,
  title,
  period_start,
  period_end,
  submission_deadline,
  status,
  created_by
) values (
  'fb110000-0000-4000-8000-000000000200',
  'fb110000-0000-4000-8000-000000000001',
  'Commercial PR11 Probe Period',
  '2093-01-01',
  '2094-12-31',
  '2092-12-31 00:00:00+00',
  'open',
  'fb110000-0000-4000-8000-000000000010'
);

insert into public.menus (
  id,
  name,
  price,
  duration_minutes,
  clinic_id,
  is_active,
  is_deleted
) values (
  'fb110000-0000-4000-8000-000000000300',
  'Commercial PR11 Probe Menu',
  1000,
  30,
  'fb110000-0000-4000-8000-000000000001',
  true,
  false
);

insert into public.customers (id, name, phone, clinic_id)
select
  md5('pr11-performance-customer-' || series.number::text)::uuid,
  'Commercial PR11 Probe Customer ' || series.number::text,
  '060' || lpad(series.number::text, 8, '0'),
  'fb110000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 2000) series(number);

insert into public.reservations (
  id,
  clinic_id,
  customer_id,
  menu_id,
  staff_id,
  start_time,
  end_time,
  status
)
select
  md5('pr11-performance-reservation-' || series.number::text)::uuid,
  'fb110000-0000-4000-8000-000000000001'::uuid,
  md5('pr11-performance-customer-' || series.number::text)::uuid,
  'fb110000-0000-4000-8000-000000000300'::uuid,
  'fb110000-0000-4000-8000-000000000110'::uuid,
  '2095-01-01 00:00:00+00'::timestamptz
    + series.number * interval '45 minutes',
  '2095-01-01 00:30:00+00'::timestamptz
    + series.number * interval '45 minutes',
  'cancelled'
from generate_series(1, 2000) series(number);

insert into public.patient_outreach_campaigns (
  id,
  clinic_id,
  name,
  status,
  message_body,
  created_by
) values (
  'fb110000-0000-4000-8000-000000000400',
  'fb110000-0000-4000-8000-000000000001',
  'Commercial PR11 Probe Campaign',
  'draft',
  'Synthetic performance probe only',
  'fb110000-0000-4000-8000-000000000010'
);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'sparse_insert_10000',
  pg_temp.pr11_explain_analyze($statement$
    insert into public.blocks (
      resource_id,
      start_time,
      end_time,
      clinic_id,
      created_by,
      deleted_by
    )
    select
      'fb110000-0000-4000-8000-000000000100'::uuid,
      '2091-01-01 00:00:00+00'::timestamptz
        + series.number * interval '2 minutes',
      '2091-01-01 00:01:00+00'::timestamptz
        + series.number * interval '2 minutes',
      'fb110000-0000-4000-8000-000000000001'::uuid,
      null::uuid,
      null::uuid
    from generate_series(1, 10000) series(number)
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'dense_insert_10000',
  pg_temp.pr11_explain_analyze($statement$
    insert into public.blocks (
      resource_id,
      start_time,
      end_time,
      clinic_id,
      created_by,
      deleted_by
    )
    select
      'fb110000-0000-4000-8000-000000000100'::uuid,
      '2092-01-01 00:00:00+00'::timestamptz
        + series.number * interval '2 minutes',
      '2092-01-01 00:01:00+00'::timestamptz
        + series.number * interval '2 minutes',
      'fb110000-0000-4000-8000-000000000001'::uuid,
      case
        when series.number <= 100
          then 'fb110000-0000-4000-8000-000000000010'::uuid
        else 'fb110000-0000-4000-8000-000000000020'::uuid
      end,
      null::uuid
    from generate_series(1, 10000) series(number)
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'shift_full_only_insert_2000',
  pg_temp.pr11_explain_analyze($statement$
    insert into public.shift_requests (
      clinic_id,
      period_id,
      staff_id,
      request_type,
      start_time,
      end_time,
      status,
      submitted_by,
      submitted_for_role,
      reviewed_by
    )
    select
      'fb110000-0000-4000-8000-000000000001'::uuid,
      'fb110000-0000-4000-8000-000000000200'::uuid,
      'fb110000-0000-4000-8000-000000000110'::uuid,
      'available',
      '2093-01-01 00:00:00+00'::timestamptz
        + series.number * interval '15 minutes',
      '2093-01-01 00:10:00+00'::timestamptz
        + series.number * interval '15 minutes',
      'submitted',
      'fb110000-0000-4000-8000-000000000010'::uuid,
      'staff',
      null::uuid
    from generate_series(1, 2000) series(number)
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'shift_full_plus_partial_insert_2000',
  pg_temp.pr11_explain_analyze($statement$
    insert into public.shift_requests (
      clinic_id,
      period_id,
      staff_id,
      request_type,
      start_time,
      end_time,
      status,
      submitted_by,
      submitted_for_role,
      reviewed_by
    )
    select
      'fb110000-0000-4000-8000-000000000001'::uuid,
      'fb110000-0000-4000-8000-000000000200'::uuid,
      'fb110000-0000-4000-8000-000000000110'::uuid,
      'available',
      '2094-01-01 00:00:00+00'::timestamptz
        + series.number * interval '15 minutes',
      '2094-01-01 00:10:00+00'::timestamptz
        + series.number * interval '15 minutes',
      'submitted',
      'fb110000-0000-4000-8000-000000000010'::uuid,
      'staff',
      'fb110000-0000-4000-8000-000000000020'::uuid
    from generate_series(1, 2000) series(number)
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'recipient_sparse_composite_insert_1000',
  pg_temp.pr11_explain_analyze($statement$
    insert into public.patient_outreach_recipients (
      campaign_id,
      clinic_id,
      customer_id,
      line_user_id,
      booked_reservation_id
    )
    select
      'fb110000-0000-4000-8000-000000000400'::uuid,
      'fb110000-0000-4000-8000-000000000001'::uuid,
      md5('pr11-performance-customer-' || series.number::text)::uuid,
      'pr11-line-sparse-' || series.number::text,
      null::uuid
    from generate_series(1, 1000) series(number)
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'recipient_dense_composite_insert_1000',
  pg_temp.pr11_explain_analyze($statement$
    insert into public.patient_outreach_recipients (
      campaign_id,
      clinic_id,
      customer_id,
      line_user_id,
      booked_reservation_id
    )
    select
      'fb110000-0000-4000-8000-000000000400'::uuid,
      'fb110000-0000-4000-8000-000000000001'::uuid,
      md5('pr11-performance-customer-' || series.number::text)::uuid,
      'pr11-line-dense-' || series.number::text,
      md5('pr11-performance-reservation-' || series.number::text)::uuid
    from generate_series(1001, 2000) series(number)
  $statement$);

analyze public.blocks;

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'created_by_read_100_of_20000',
  pg_temp.pr11_explain_analyze($statement$
    select count(*)
    from public.blocks
    where created_by = 'fb110000-0000-4000-8000-000000000010'::uuid
  $statement$);

set local enable_seqscan = off;

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'existing_recipient_customer_path',
  pg_temp.pr11_explain($statement$
    select customer_id, clinic_id
    from public.patient_outreach_recipients
    where customer_id = 'fb110000-0000-4000-8000-000000000010'::uuid
      and clinic_id = 'fb110000-0000-4000-8000-000000000001'::uuid
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'existing_recipient_campaign_path',
  pg_temp.pr11_explain($statement$
    select campaign_id, clinic_id
    from public.patient_outreach_recipients
    where campaign_id = 'fb110000-0000-4000-8000-000000000010'::uuid
  $statement$);

insert into pr11_performance_probe_result (probe_name, plan_data)
select
  'existing_reservation_campaign_path',
  pg_temp.pr11_explain($statement$
    select campaign_id, clinic_id
    from public.reservations
    where campaign_id = 'fb110000-0000-4000-8000-000000000010'::uuid
      and clinic_id = 'fb110000-0000-4000-8000-000000000001'::uuid
  $statement$);

reset enable_seqscan;

select
  probe_name,
  nullif(plan_data #>> '{0,Execution Time}', '')::numeric
    as execution_time_ms,
  nullif(plan_data #>> '{0,Plan,WAL Records}', '')::bigint
    as wal_records,
  nullif(plan_data #>> '{0,Plan,WAL Bytes}', '')::bigint
    as wal_bytes,
  nullif(plan_data #>> '{0,Plan,Shared Dirtied Blocks}', '')::bigint
    as shared_dirtied_blocks,
  plan_data #>> '{0,Plan,Node Type}' as root_node,
  md5(plan_data::text) as raw_plan_md5,
  plan_data::text as plan_json
from pr11_performance_probe_result
order by probe_name;

rollback;

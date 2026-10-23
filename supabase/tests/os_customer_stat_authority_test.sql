-- Spec: docs/stabilization/spec-os-customer-stat-authority-v0.1.md (Issue #147)
-- customers.total_visits / total_revenue / last_visit_date are a cache of the
-- clinic-consistent, non-deleted, completed reservations of the customer.
-- Expected values are literals (and, in G1, an independent correlated
-- aggregate); nothing here calls the implementation to compute expectations.
-- Part A reproduces the counterexamples of the pre-fix increment trigger,
-- Part B pins the catalog contract and the unchanged boundaries, Part T the
-- tenant/role/inactive/stale negatives. Two-connection races are verified by
-- scripts/customers/verify-customer-stat-races.mjs.
begin;

set local search_path = pg_catalog, extensions, public, auth;
set local timezone = 'UTC';

select plan(70);

-- ---------------------------------------------------------------- fixtures
insert into public.clinics (id, name)
values
  ('f1470000-0000-4000-8000-000000000001', 'OS-F1 clinic A'),
  ('f1470000-0000-4000-8000-000000000002', 'OS-F1 clinic B');

insert into public.staff (id, clinic_id, name, role, email, password_hash)
values
  ('f1470000-0000-4000-8000-000000000021', 'f1470000-0000-4000-8000-000000000001',
   'OS-F1 user A', 'staff', 'os-f1-user-a@example.invalid', 'not-used'),
  ('f1470000-0000-4000-8000-000000000022', 'f1470000-0000-4000-8000-000000000002',
   'OS-F1 user B', 'staff', 'os-f1-user-b@example.invalid', 'not-used'),
  ('f1470000-0000-4000-8000-000000000023', 'f1470000-0000-4000-8000-000000000001',
   'OS-F1 inactive', 'staff', 'os-f1-user-inactive@example.invalid', 'not-used'),
  ('f1470000-0000-4000-8000-000000000024', 'f1470000-0000-4000-8000-000000000002',
   'OS-F1 stale', 'staff', 'os-f1-user-stale@example.invalid', 'not-used');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, aud, role
)
select
  user_id::uuid, email, extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  'authenticated', 'authenticated'
from (values
  ('f1470000-0000-4000-8000-000000000021', 'os-f1-user-a@example.invalid'),
  ('f1470000-0000-4000-8000-000000000022', 'os-f1-user-b@example.invalid'),
  ('f1470000-0000-4000-8000-000000000023', 'os-f1-user-inactive@example.invalid'),
  ('f1470000-0000-4000-8000-000000000024', 'os-f1-user-stale@example.invalid')
) fixture(user_id, email);

insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
values
  ('f1470000-0000-4000-8000-000000000021', 'f1470000-0000-4000-8000-000000000001',
   'os-f1-user-a@example.invalid', 'OS-F1 user A', 'staff', true),
  ('f1470000-0000-4000-8000-000000000022', 'f1470000-0000-4000-8000-000000000002',
   'os-f1-user-b@example.invalid', 'OS-F1 user B', 'staff', true),
  ('f1470000-0000-4000-8000-000000000023', 'f1470000-0000-4000-8000-000000000001',
   'os-f1-user-inactive@example.invalid', 'OS-F1 inactive', 'staff', false),
  ('f1470000-0000-4000-8000-000000000024', 'f1470000-0000-4000-8000-000000000002',
   'os-f1-user-stale@example.invalid', 'OS-F1 stale', 'staff', true);

-- The stale user now belongs to clinic B in the database but still presents
-- an old JWT scoped to clinic A.
insert into public.user_permissions (staff_id, username, hashed_password, role, clinic_id)
values
  ('f1470000-0000-4000-8000-000000000021', 'os-f1-user-a', 'not-used', 'staff',
   'f1470000-0000-4000-8000-000000000001'),
  ('f1470000-0000-4000-8000-000000000022', 'os-f1-user-b', 'not-used', 'staff',
   'f1470000-0000-4000-8000-000000000002'),
  ('f1470000-0000-4000-8000-000000000023', 'os-f1-user-inactive', 'not-used', 'staff',
   'f1470000-0000-4000-8000-000000000001'),
  ('f1470000-0000-4000-8000-000000000024', 'os-f1-user-stale', 'not-used', 'staff',
   'f1470000-0000-4000-8000-000000000002');

insert into public.menus (id, clinic_id, name, price, duration_minutes)
values
  ('f1470000-0000-4000-8000-000000000031', 'f1470000-0000-4000-8000-000000000001',
   'OS-F1 menu A', 1000, 60),
  ('f1470000-0000-4000-8000-000000000032', 'f1470000-0000-4000-8000-000000000002',
   'OS-F1 menu B', 1000, 60);

insert into public.resources (id, clinic_id, name, type)
values
  ('f1470000-0000-4000-8000-000000000041', 'f1470000-0000-4000-8000-000000000001',
   'OS-F1 staff resource A', 'staff'),
  ('f1470000-0000-4000-8000-000000000042', 'f1470000-0000-4000-8000-000000000002',
   'OS-F1 staff resource B', 'staff');

-- One customer per scenario keeps every expectation a hand-computed literal.
insert into public.customers (id, clinic_id, name, phone, lifetime_value)
select
  ('f1470000-0000-4000-8000-0000000000' || suffix)::uuid,
  case when suffix like '6%' then 'f1470000-0000-4000-8000-000000000002'
       else 'f1470000-0000-4000-8000-000000000001' end::uuid,
  'OS-F1 customer ' || suffix, '000-0000-0000',
  case when suffix = '51' then 12345.67 else 0 end
from unnest(array['51', '52', '53', '54', '55', '56', '57', '58', '59',
                  '5a', '5b', '5c', '61']) suffix;

create temporary table os_f1_jwt(user_key text primary key, claims text not null)
  on commit drop;
grant select on os_f1_jwt to authenticated, anon;
insert into os_f1_jwt
select key, jsonb_build_object(
  'sub', sub, 'role', 'authenticated',
  'app_metadata', jsonb_build_object('user_role', 'staff',
    'clinic_scope_ids', jsonb_build_array(scope)))::text
from (values
  ('a', 'f1470000-0000-4000-8000-000000000021', 'f1470000-0000-4000-8000-000000000001'),
  ('inactive', 'f1470000-0000-4000-8000-000000000023', 'f1470000-0000-4000-8000-000000000001'),
  ('stale', 'f1470000-0000-4000-8000-000000000024', 'f1470000-0000-4000-8000-000000000001')
) claims(key, sub, scope);

-- The cache of one customer as text: visits|revenue|last_visit (UTC) or null.
create function pg_temp.os_f1_cache(p_customer_id uuid)
returns text
language sql
stable
as $$
  select concat_ws('|',
    coalesce(customer.total_visits::text, 'null'),
    coalesce(customer.total_revenue::text, 'null'),
    coalesce(to_char(customer.last_visit_date at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'null'))
  from public.customers customer
  where customer.id = p_customer_id
$$;

create function pg_temp.os_f1_ctid(p_customer_id uuid)
returns tid
language sql
stable
as $$
  select customer.ctid from public.customers customer where customer.id = p_customer_id
$$;

-- Runs one write as the current role (SECURITY INVOKER, RLS applies) and
-- returns the number of rows it changed.
create function pg_temp.os_f1_rows(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on function pg_temp.os_f1_rows(text) to authenticated;

-- Reservation fixture: hour slot on the given UTC day, status confirmed.
create function pg_temp.os_f1_reserve(
  p_id text, p_customer text, p_day text, p_price numeric,
  p_status text default 'confirmed', p_clinic text default 'A'
)
returns void
language sql
as $$
  insert into public.reservations (
    id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, price
  )
  values (
    ('f1470000-0000-4000-8000-000000000' || p_id)::uuid,
    case p_clinic when 'A' then 'f1470000-0000-4000-8000-000000000001'
                  else 'f1470000-0000-4000-8000-000000000002' end::uuid,
    ('f1470000-0000-4000-8000-0000000000' || p_customer)::uuid,
    case p_clinic when 'A' then 'f1470000-0000-4000-8000-000000000031'
                  else 'f1470000-0000-4000-8000-000000000032' end::uuid,
    case p_clinic when 'A' then 'f1470000-0000-4000-8000-000000000041'
                  else 'f1470000-0000-4000-8000-000000000042' end::uuid,
    (p_day || ' 01:00:00+00')::timestamptz,
    (p_day || ' 02:00:00+00')::timestamptz,
    p_status,
    p_price
  )
$$;

-- --------------------------------------------- Part A: counterexamples
-- A1-A3: completed -> cancelled -> completed is counted once.
select pg_temp.os_f1_reserve('101', '51', '2096-03-01', 1000);
update public.reservations set status = 'completed'
where id = 'f1470000-0000-4000-8000-000000000101';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000051'),
  '1|1000.00|2096-03-01T02:00:00Z', 'A1: completing a reservation caches one visit');

update public.reservations set status = 'cancelled'
where id = 'f1470000-0000-4000-8000-000000000101';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000051'),
  '0|0.00|null', 'A2: cancelling the only completed reservation resets the cache to 0/0/NULL');

update public.reservations set status = 'completed'
where id = 'f1470000-0000-4000-8000-000000000101';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000051'),
  '1|1000.00|2096-03-01T02:00:00Z',
  'A3: completed -> cancelled -> completed does not double count');

-- A4-A6: retrying the same status (API retry) and unrelated edits change nothing.
create temporary table os_f1_before on commit drop as
select pg_temp.os_f1_ctid('f1470000-0000-4000-8000-000000000051') as row_ctid;

update public.reservations set status = 'completed'
where id = 'f1470000-0000-4000-8000-000000000101';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000051'),
  '1|1000.00|2096-03-01T02:00:00Z', 'A4: re-sending completed keeps the cache');

update public.reservations set notes = 'OS-F1 retry note', payment_status = 'paid'
where id = 'f1470000-0000-4000-8000-000000000101';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000051'),
  '1|1000.00|2096-03-01T02:00:00Z', 'A5: notes/payment edits of a completed reservation keep the cache');

select is(pg_temp.os_f1_ctid('f1470000-0000-4000-8000-000000000051'),
  (select row_ctid from os_f1_before),
  'A6: an unchanged cache is not rewritten (no customers row version, no updated_at churn)');

select is(
  (select lifetime_value from public.customers where id = 'f1470000-0000-4000-8000-000000000051'),
  12345.67::numeric,
  'A7: lifetime_value is a separate column and is never written by the cache maintenance'
);

-- A8-A10: completing an older reservation later never moves last_visit_date back.
select pg_temp.os_f1_reserve('201', '52', '2096-03-10', 2000, 'completed');
select pg_temp.os_f1_reserve('202', '52', '2096-02-10', 3000);
update public.reservations set status = 'completed'
where id = 'f1470000-0000-4000-8000-000000000202';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000052'),
  '2|5000.00|2096-03-10T02:00:00Z',
  'A8: completing an older reservation later keeps the latest end_time');

update public.reservations set end_time = '2096-03-10 03:00:00+00'
where id = 'f1470000-0000-4000-8000-000000000201';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000052'),
  '2|5000.00|2096-03-10T03:00:00Z', 'A9: rescheduling the latest completed visit follows its end_time');

update public.reservations set status = 'no_show'
where id = 'f1470000-0000-4000-8000-000000000201';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000052'),
  '1|3000.00|2096-02-10T02:00:00Z',
  'A10: removing the latest completed visit falls back to the remaining latest one');

-- A11-A15: price corrections and option repricing are reflected exactly once.
select pg_temp.os_f1_reserve('301', '53', '2096-04-01', 1000, 'completed');
update public.reservations set actual_price = 800
where id = 'f1470000-0000-4000-8000-000000000301';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000053'),
  '1|800.00|2096-04-01T02:00:00Z', 'A11: actual_price correction replaces the cached revenue');

update public.reservations set actual_price = null
where id = 'f1470000-0000-4000-8000-000000000301';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000053'),
  '1|1000.00|2096-04-01T02:00:00Z', 'A12: clearing actual_price falls back to price');

-- The PATCH API sends the repriced snapshot together with selected_options
-- (src/app/api/reservations/schema.ts mapReservationUpdateToRow) as service_role.
set local role service_role;
update public.reservations
set selected_options = '[{"optionId":"os-f1-option","name":"OS-F1 option","priceDelta":500,"durationDeltaMinutes":0}]'::jsonb,
    is_staff_requested = false,
    staff_nomination_fee = 0,
    price = 1500
where id = 'f1470000-0000-4000-8000-000000000301'
  and clinic_id = 'f1470000-0000-4000-8000-000000000001';
reset role;
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000053'),
  '1|1500.00|2096-04-01T02:00:00Z', 'A13: option repricing replaces the cached revenue');

set local role service_role;
update public.reservations
set selected_options = '[{"optionId":"os-f1-option","name":"OS-F1 option","priceDelta":500,"durationDeltaMinutes":0}]'::jsonb,
    is_staff_requested = false,
    staff_nomination_fee = 0,
    price = 1500
where id = 'f1470000-0000-4000-8000-000000000301'
  and clinic_id = 'f1470000-0000-4000-8000-000000000001';
reset role;
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000053'),
  '1|1500.00|2096-04-01T02:00:00Z', 'A14: retrying the same repricing does not double count');

select pg_temp.os_f1_reserve('302', '53', '2096-04-02', null, 'completed');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000053'),
  '2|1500.00|2096-04-02T02:00:00Z', 'A15: a completed visit without price counts as a visit with 0 revenue');

-- A16-A20: logical delete / restore / NULL is_deleted / zero reset.
select pg_temp.os_f1_reserve('401', '54', '2096-05-01', 1000, 'completed');
select pg_temp.os_f1_reserve('402', '54', '2096-05-02', 2000, 'completed');
update public.reservations
set is_deleted = true, deleted_at = now()
where id = 'f1470000-0000-4000-8000-000000000402';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000054'),
  '1|1000.00|2096-05-01T02:00:00Z', 'A16: a logically deleted completed reservation is excluded');

update public.reservations
set is_deleted = false, deleted_at = null
where id = 'f1470000-0000-4000-8000-000000000402';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000054'),
  '2|3000.00|2096-05-02T02:00:00Z', 'A17: restoring it counts it once again');

update public.reservations set is_deleted = null
where id = 'f1470000-0000-4000-8000-000000000402';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000054'),
  '1|1000.00|2096-05-01T02:00:00Z', 'A18: only is_deleted = false counts (NULL is excluded)');

update public.reservations set is_deleted = false
where id = 'f1470000-0000-4000-8000-000000000402';
-- One statement cancelling both rows of the customer.
update public.reservations set status = 'cancelled'
where id in ('f1470000-0000-4000-8000-000000000401', 'f1470000-0000-4000-8000-000000000402');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000054'),
  '0|0.00|null', 'A19: when no completed reservation remains the cache is 0/0/NULL');

select is(
  (select row(total_visits, total_revenue, last_visit_date is null)::text
   from public.customers where id = 'f1470000-0000-4000-8000-000000000054'),
  '(0,0.00,t)', 'A20: the empty cache keeps the column types (integer 0, numeric 0.00, NULL)');

-- A21-A23: arrived is not cached; patient_visit_summary keeps arrived + completed.
select pg_temp.os_f1_reserve('501', '55', '2096-06-01', 1200, 'arrived');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000055'),
  '0|0.00|null', 'A21: an arrived-only reservation is not added to the completed cache');
select is(
  (select row(visit_count, total_revenue, last_visit_date)::text
   from public.patient_visit_summary where patient_id = 'f1470000-0000-4000-8000-000000000055'),
  '(1,1200.00,2096-06-01)',
  'A22: patient_visit_summary still counts arrived visits (start_time JST date)');
update public.reservations set status = 'completed'
where id = 'f1470000-0000-4000-8000-000000000501';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000055'),
  '1|1200.00|2096-06-01T02:00:00Z', 'A23: arrived -> completed is cached');

-- A24-A25: moving a completed reservation to another customer of the clinic.
select pg_temp.os_f1_reserve('601', '56', '2096-07-01', 1000, 'completed');
update public.reservations set customer_id = 'f1470000-0000-4000-8000-000000000057'
where id = 'f1470000-0000-4000-8000-000000000601';
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000056'),
  '0|0.00|null', 'A24: the previous customer no longer counts the moved visit');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000057'),
  '1|1000.00|2096-07-01T02:00:00Z', 'A25: the new customer counts the moved visit');

-- A26-A27: one statement completing reservations of two customers.
select pg_temp.os_f1_reserve('901', '59', '2096-08-01', 1100);
select pg_temp.os_f1_reserve('902', '5a', '2096-08-02', 2200);
select pg_temp.os_f1_reserve('903', '59', '2096-08-03', 3300);
update public.reservations set status = 'completed'
where id in ('f1470000-0000-4000-8000-000000000901', 'f1470000-0000-4000-8000-000000000902',
             'f1470000-0000-4000-8000-000000000903');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000059'),
  '2|4400.00|2096-08-03T02:00:00Z', 'A26: a multi-row statement caches every row of the first customer');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-00000000005a'),
  '1|2200.00|2096-08-02T02:00:00Z', 'A27: and of the second customer');

-- A28-A30: physical DELETE is rejected today; if it ever succeeds the cache follows.
select pg_temp.os_f1_reserve('701', '58', '2096-09-01', 700, 'completed');
set local role service_role;
select throws_ok(
  $$delete from public.reservations where id = 'f1470000-0000-4000-8000-000000000701'$$,
  '23503', null,
  'A28: physical reservation delete stays rejected (reservation history validation)'
);
reset role;
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000058'),
  '1|700.00|2096-09-01T02:00:00Z', 'A29: the rejected delete leaves the cache unchanged');
alter table public.reservations disable trigger reservation_deleted_log;
delete from public.reservations where id = 'f1470000-0000-4000-8000-000000000701';
alter table public.reservations enable trigger reservation_deleted_log;
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000058'),
  '0|0.00|null', 'A30: a reservation that is physically removed is no longer cached');

-- A31: a stale cache value is replaced by the reservation set on the next write.
update public.customers
set total_visits = 99, total_revenue = 99999.99, last_visit_date = '2001-01-01 00:00:00+00'
where id = 'f1470000-0000-4000-8000-00000000005b';
select pg_temp.os_f1_reserve('801', '5b', '2096-10-01', 1000, 'completed');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-00000000005b'),
  '1|1000.00|2096-10-01T02:00:00Z',
  'A31: the cache is rebuilt from the reservation set, not incremented from a stale value');

-- ----------------------------------------- Part B: catalog contract
select is(
  (select count(*)::integer from pg_trigger
   where tgrelid = 'public.reservations'::regclass and tgname = 'update_customer_stats_trigger'),
  0, 'B1: the increment-only update_customer_stats_trigger is gone'
);
select is(to_regprocedure('public.update_customer_stats()'), null,
  'B2: public.update_customer_stats() is gone');

select is(
  (select string_agg(pg_get_triggerdef(trigger_row.oid), E'\n' order by trigger_row.tgname)
   from pg_trigger trigger_row
   where trigger_row.tgrelid = 'public.reservations'::regclass
     and trigger_row.tgname like 'reservations_customer_visit_stats_%'),
  'CREATE TRIGGER reservations_customer_visit_stats_delete AFTER DELETE ON public.reservations REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION app_private.sync_customer_visit_stats()' || E'\n' ||
  'CREATE TRIGGER reservations_customer_visit_stats_insert AFTER INSERT ON public.reservations REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION app_private.sync_customer_visit_stats()' || E'\n' ||
  'CREATE TRIGGER reservations_customer_visit_stats_update AFTER UPDATE ON public.reservations REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION app_private.sync_customer_visit_stats()',
  'B3: insert/update/delete statement triggers maintain the cache from transition tables'
);
select is(
  (select count(*)::integer from pg_trigger
   where tgrelid = 'public.reservations'::regclass
     and tgname like 'reservations_customer_visit_stats_%' and tgenabled = 'O'),
  3, 'B4: the three cache triggers are enabled'
);

select is(
  (select string_agg(
     proc.proname || ':' || proc.prosecdef::text || ':' || coalesce(array_to_string(proc.proconfig, ','), '')
       || ':' || pg_get_userbyid(proc.proowner),
     ',' order by proc.proname)
   from pg_proc proc
   where proc.oid in (
     coalesce(to_regprocedure('app_private.refresh_customer_visit_stats(uuid[])'), 0::oid),
     coalesce(to_regprocedure('app_private.sync_customer_visit_stats()'), 0::oid)
   )),
  'refresh_customer_visit_stats:true:search_path="":postgres,sync_customer_visit_stats:true:search_path="":postgres',
  'B5: both functions are SECURITY DEFINER with an empty search_path, owned by postgres'
);
select is(
  (select count(*)::integer
   from pg_proc proc
   cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
   where proc.oid in (
       coalesce(to_regprocedure('app_private.refresh_customer_visit_stats(uuid[])'), 0::oid),
       coalesce(to_regprocedure('app_private.sync_customer_visit_stats()'), 0::oid))
     and acl.privilege_type = 'EXECUTE'
     and acl.grantee <> proc.proowner),
  0, 'B6: no role other than the owner (not PUBLIC, anon, authenticated or service_role) can EXECUTE them'
);

select is(md5(pg_get_viewdef('public.patient_visit_summary'::regclass, true)),
  'e6500768e9f52db16517534f0f504f7b', 'B7: patient_visit_summary definition is unchanged');
select is(
  (select array_to_string(reloptions, ',') from pg_class
   where oid = 'public.patient_visit_summary'::regclass),
  'security_invoker=true', 'B8: patient_visit_summary stays security_invoker');

select is(
  (select md5(string_agg(
     tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' ||
     coalesce(qual, '') || ':' || coalesce(with_check, ''), E'\n' order by tablename, policyname))
   from pg_policies
   where schemaname = 'public' and tablename in ('customers', 'reservations')),
  'f2ac7dc62c1fc1bbf348df00f19884d0', 'B9: customers/reservations RLS policies are unchanged');
select is(
  (select string_agg(relname || ':' || relrowsecurity::text || ':' || relforcerowsecurity::text, ','
     order by relname)
   from pg_class where oid in ('public.customers'::regclass, 'public.reservations'::regclass)),
  'customers:true:false,reservations:true:false', 'B10: RLS stays enabled on customers and reservations');
select is(
  (select string_agg(table_name || ':' || grantee || ':' || privilege_type, ','
     order by table_name, grantee, privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('customers', 'reservations')
     and grantee in ('anon', 'authenticated', 'service_role')),
  'customers:authenticated:SELECT,customers:service_role:DELETE,customers:service_role:INSERT,customers:service_role:REFERENCES,customers:service_role:SELECT,customers:service_role:TRIGGER,customers:service_role:TRUNCATE,customers:service_role:UPDATE,reservations:authenticated:INSERT,reservations:authenticated:SELECT,reservations:authenticated:UPDATE,reservations:service_role:DELETE,reservations:service_role:INSERT,reservations:service_role:REFERENCES,reservations:service_role:SELECT,reservations:service_role:TRIGGER,reservations:service_role:TRUNCATE,reservations:service_role:UPDATE',
  'B11: table grants on customers/reservations are unchanged'
);
select is(
  (select string_agg(column_name || ':' || data_type || coalesce('(' || numeric_precision || ',' || numeric_scale || ')', '')
     || ':' || coalesce(column_default, 'null'), ',' order by column_name)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'customers'
     and column_name in ('last_visit_date', 'lifetime_value', 'total_revenue', 'total_visits')),
  'last_visit_date:timestamp with time zone:null,lifetime_value:numeric(10,2):0,total_revenue:numeric(10,2):0,total_visits:integer(32,0):0',
  'B12: cache column types and defaults are unchanged'
);

-- ------------------------------------- Part T: tenant / role negatives
select pg_temp.os_f1_reserve('a01', '5c', '2096-11-01', 1000);
select pg_temp.os_f1_reserve('a02', '5c', '2096-11-02', 2000, 'completed');
select pg_temp.os_f1_reserve('b01', '61', '2096-11-01', 5000, 'completed', 'B');

create temporary table os_f1_tenant_before on commit drop as
select
  pg_temp.os_f1_cache('f1470000-0000-4000-8000-00000000005c') as cache_a,
  pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000061') as cache_b,
  pg_temp.os_f1_ctid('f1470000-0000-4000-8000-000000000061') as ctid_b;

select is((select cache_a from os_f1_tenant_before), '1|2000.00|2096-11-02T02:00:00Z',
  'T1: fixture cache of the clinic A customer');
select is((select cache_b from os_f1_tenant_before), '1|5000.00|2096-11-01T02:00:00Z',
  'T2: fixture cache of the clinic B customer');

-- Staff A (clinic A) through RLS: allowed inside clinic A.
select set_config('request.jwt.claims', (select claims from os_f1_jwt where user_key = 'a'), true);
set local role authenticated;
select lives_ok(
  $$update public.reservations set status = 'completed'
    where id = 'f1470000-0000-4000-8000-000000000a01'$$,
  'T3: staff A completes a clinic A reservation through RLS'
);
reset role;
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-00000000005c'),
  '2|3000.00|2096-11-02T02:00:00Z', 'T4: the SECURITY DEFINER trigger maintains the cache for an RLS writer');

set local role authenticated;
select lives_ok(
  $$update public.reservations set status = 'cancelled'
    where id = 'f1470000-0000-4000-8000-000000000a02'$$,
  'T5: staff A cancels a completed clinic A reservation through RLS'
);
reset role;
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-00000000005c'),
  '1|1000.00|2096-11-01T02:00:00Z', 'T6: cancelling through RLS removes the visit from the cache');

-- Staff A cannot reach clinic B.
set local role authenticated;
select is(
  pg_temp.os_f1_rows($$update public.reservations set status = 'cancelled'
    where id = 'f1470000-0000-4000-8000-000000000b01'$$),
  0, 'T7: staff A cannot update a clinic B reservation (RLS USING)'
);
select throws_ok(
  $$update public.reservations set customer_id = 'f1470000-0000-4000-8000-000000000061'
    where id = 'f1470000-0000-4000-8000-000000000a01'$$,
  '23503', null,
  'T8: staff A cannot attach a clinic B customer to a clinic A reservation'
);
select throws_ok(
  $$update public.reservations set clinic_id = 'f1470000-0000-4000-8000-000000000002'
    where id = 'f1470000-0000-4000-8000-000000000a01'$$,
  '23514', null,
  'T9: staff A cannot move a clinic A reservation to clinic B'
);
select throws_ok(
  $$update public.customers set total_visits = 0 where id = 'f1470000-0000-4000-8000-00000000005c'$$,
  '42501', null,
  'T10: authenticated cannot write the cache directly (customers has SELECT only)'
);
select throws_ok(
  $$select app_private.refresh_customer_visit_stats(array['f1470000-0000-4000-8000-000000000061'::uuid])$$,
  '42501', null,
  'T11: authenticated cannot EXECUTE the cache rebuild function'
);
reset role;

-- Inactive profile and stale JWT scope are denied by the database helpers.
select set_config('request.jwt.claims', (select claims from os_f1_jwt where user_key = 'inactive'), true);
set local role authenticated;
select is(
  pg_temp.os_f1_rows($$update public.reservations set status = 'cancelled'
    where id = 'f1470000-0000-4000-8000-000000000a01'$$),
  0, 'T12: an inactive profile cannot update reservations'
);
reset role;

select set_config('request.jwt.claims', (select claims from os_f1_jwt where user_key = 'stale'), true);
set local role authenticated;
select is(
  pg_temp.os_f1_rows($$update public.reservations set status = 'cancelled'
    where id in ('f1470000-0000-4000-8000-000000000a01', 'f1470000-0000-4000-8000-000000000b01')$$),
  0, 'T13: a stale JWT scope (moved to clinic B, token says A) updates nothing in A or B'
);
reset role;

set local role anon;
select throws_ok(
  $$update public.reservations set status = 'cancelled'
    where id = 'f1470000-0000-4000-8000-000000000a01'$$,
  '42501', null,
  'T14: anon cannot update reservations'
);
select throws_ok(
  $$select app_private.refresh_customer_visit_stats(array['f1470000-0000-4000-8000-000000000061'::uuid])$$,
  '42501', null,
  'T15: anon cannot EXECUTE the cache rebuild function'
);
reset role;

set local role service_role;
select throws_ok(
  $$select app_private.refresh_customer_visit_stats(array['f1470000-0000-4000-8000-000000000061'::uuid])$$,
  '42501', null,
  'T16: service_role (API) cannot EXECUTE the cache rebuild function either'
);
reset role;

select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-00000000005c'),
  '1|1000.00|2096-11-01T02:00:00Z', 'T17: denied attempts leave the clinic A cache unchanged');
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000061'),
  (select cache_b from os_f1_tenant_before), 'T18: denied attempts leave the clinic B cache unchanged');
select is(pg_temp.os_f1_ctid('f1470000-0000-4000-8000-000000000061'),
  (select ctid_b from os_f1_tenant_before), 'T19: the clinic B customer row is not even rewritten');
select is(
  (select status from public.reservations where id = 'f1470000-0000-4000-8000-000000000b01'),
  'completed', 'T20: the clinic B reservation is unchanged'
);
select is(
  (select row(customer_id, clinic_id, status)::text from public.reservations
   where id = 'f1470000-0000-4000-8000-000000000a01'),
  '(f1470000-0000-4000-8000-00000000005c,f1470000-0000-4000-8000-000000000001,completed)',
  'T21: the clinic A reservation keeps its customer, clinic and status'
);

-- An invalid customer reference never reaches the cache.
select throws_ok(
  $$insert into public.reservations (clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, price)
    values ('f1470000-0000-4000-8000-000000000001', 'f1470000-0000-4000-8000-0000000000ff',
            'f1470000-0000-4000-8000-000000000031', 'f1470000-0000-4000-8000-000000000041',
            '2096-12-01 01:00+00', '2096-12-01 02:00+00', 'completed', 1000)$$,
  '23503', null,
  'T22: a completed reservation for an unknown customer is rejected'
);
select throws_ok(
  $$insert into public.reservations (clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, price)
    values ('f1470000-0000-4000-8000-000000000001', 'f1470000-0000-4000-8000-000000000061',
            'f1470000-0000-4000-8000-000000000031', 'f1470000-0000-4000-8000-000000000041',
            '2096-12-02 01:00+00', '2096-12-02 02:00+00', 'completed', 1000)$$,
  '23514', null,
  'T23: a completed clinic A reservation for a clinic B customer is rejected'
);
select is(pg_temp.os_f1_cache('f1470000-0000-4000-8000-000000000061'),
  (select cache_b from os_f1_tenant_before), 'T24: rejected references leave the clinic B cache unchanged');

-- ------------------------------------------------ Part G: global checks
-- Independent formulation of the contract (correlated subqueries, IS FALSE).
select is(
  (select count(*)::integer
   from public.customers customer
   where customer.id::text like 'f1470000-%'
     and (customer.total_visits, customer.total_revenue, customer.last_visit_date)
       is distinct from (
         (select count(*) from public.reservations r
          where r.customer_id = customer.id and r.clinic_id = customer.clinic_id
            and r.status = 'completed' and r.is_deleted is false),
         (select coalesce(sum(coalesce(r.actual_price, r.price, 0)), 0) from public.reservations r
          where r.customer_id = customer.id and r.clinic_id = customer.clinic_id
            and r.status = 'completed' and r.is_deleted is false),
         (select max(r.end_time) from public.reservations r
          where r.customer_id = customer.id and r.clinic_id = customer.clinic_id
            and r.status = 'completed' and r.is_deleted is false))),
  0, 'G1: every fixture customer cache equals the independently computed completed-set aggregate'
);
select is(
  (select count(*)::integer from public.customers customer
   where customer.id::text not like 'f1470000-%' and customer.updated_at >= now()),
  0, 'G2: no customer outside the fixtures was rewritten'
);
select is(
  (select count(*)::integer from public.customers customer
   where customer.id::text like 'f1470000-%' and customer.lifetime_value <> case
     when customer.id = 'f1470000-0000-4000-8000-000000000051' then 12345.67 else 0 end),
  0, 'G3: lifetime_value of every fixture customer is untouched'
);

select * from finish();
rollback;

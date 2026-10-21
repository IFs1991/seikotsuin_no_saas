-- Spec: docs/stabilization/spec-os-daily-report-aggregate-authority-v0.1.md (Issue #146)
-- Part A reproduces the stale-browser overwrite through the pre-fix upsert
-- statement and must fail on a schema without the aggregate authority guard.
-- Part B pins the new explicit manual/items contract, the atomic save RPC,
-- tenant/staff/inactive negatives and function privileges. Part M pins the
-- manual-only save used by the mobile form (p_require_manual).
begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(81);

-- ---------------------------------------------------------------- fixtures
insert into public.clinics (id, name)
values
  ('f1460000-0000-4000-8000-000000000001', 'OS-F2 clinic A'),
  ('f1460000-0000-4000-8000-000000000002', 'OS-F2 clinic B');

insert into public.staff (id, clinic_id, name, role, email, password_hash)
values
  ('f1460000-0000-4000-8000-000000000011', 'f1460000-0000-4000-8000-000000000001',
   'OS-F2 staff A', 'staff', 'os-f2-staff-a@example.invalid', 'not-used'),
  ('f1460000-0000-4000-8000-000000000012', 'f1460000-0000-4000-8000-000000000002',
   'OS-F2 staff B', 'staff', 'os-f2-staff-b@example.invalid', 'not-used'),
  ('f1460000-0000-4000-8000-000000000021', 'f1460000-0000-4000-8000-000000000001',
   'OS-F2 user A', 'staff', 'os-f2-user-a@example.invalid', 'not-used'),
  ('f1460000-0000-4000-8000-000000000022', 'f1460000-0000-4000-8000-000000000002',
   'OS-F2 user B', 'staff', 'os-f2-user-b@example.invalid', 'not-used'),
  ('f1460000-0000-4000-8000-000000000023', 'f1460000-0000-4000-8000-000000000001',
   'OS-F2 inactive', 'staff', 'os-f2-user-inactive@example.invalid', 'not-used');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, aud, role
)
values
  ('f1460000-0000-4000-8000-000000000021', 'os-f2-user-a@example.invalid',
   extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   'authenticated', 'authenticated'),
  ('f1460000-0000-4000-8000-000000000022', 'os-f2-user-b@example.invalid',
   extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   'authenticated', 'authenticated'),
  ('f1460000-0000-4000-8000-000000000023', 'os-f2-user-inactive@example.invalid',
   extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   'authenticated', 'authenticated');

insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
values
  ('f1460000-0000-4000-8000-000000000021', 'f1460000-0000-4000-8000-000000000001',
   'os-f2-user-a@example.invalid', 'OS-F2 user A', 'staff', true),
  ('f1460000-0000-4000-8000-000000000022', 'f1460000-0000-4000-8000-000000000002',
   'os-f2-user-b@example.invalid', 'OS-F2 user B', 'staff', true),
  ('f1460000-0000-4000-8000-000000000023', 'f1460000-0000-4000-8000-000000000001',
   'os-f2-user-inactive@example.invalid', 'OS-F2 inactive', 'staff', false);

insert into public.user_permissions (staff_id, username, hashed_password, role, clinic_id)
values
  ('f1460000-0000-4000-8000-000000000021', 'os-f2-user-a', 'not-used', 'staff',
   'f1460000-0000-4000-8000-000000000001'),
  ('f1460000-0000-4000-8000-000000000022', 'os-f2-user-b', 'not-used', 'staff',
   'f1460000-0000-4000-8000-000000000002'),
  ('f1460000-0000-4000-8000-000000000023', 'os-f2-user-inactive', 'not-used', 'staff',
   'f1460000-0000-4000-8000-000000000001');

-- R_items: clinic A 2095-01-01 (detail rows attached below)
-- R_manual: clinic A 2095-01-02 (legacy hand-entered totals, no detail rows)
-- R_B: clinic B 2095-01-01
insert into public.daily_reports (
  id, clinic_id, report_date, total_patients, new_patients, total_revenue,
  insurance_revenue, private_revenue, report_text
)
values
  ('f1460000-0000-4000-8000-000000000101', 'f1460000-0000-4000-8000-000000000001',
   '2095-01-01', 0, 0, 0, 0, 0, '明細行から自動作成'),
  ('f1460000-0000-4000-8000-000000000102', 'f1460000-0000-4000-8000-000000000001',
   '2095-01-02', 10, 3, 50000, 20000, 30000, 'manual legacy'),
  ('f1460000-0000-4000-8000-000000000103', 'f1460000-0000-4000-8000-000000000002',
   '2095-01-01', 7, 1, 7000, 0, 7000, 'clinic B report');

insert into public.daily_report_items (
  id, clinic_id, daily_report_id, report_date, patient_name, treatment_name,
  fee, billing_type, revenue_context_code
)
values
  ('f1460000-0000-4000-8000-000000000201', 'f1460000-0000-4000-8000-000000000001',
   'f1460000-0000-4000-8000-000000000101', '2095-01-01', 'Synthetic 1', 'Fixture',
   3000, 'insurance', 'insurance'),
  ('f1460000-0000-4000-8000-000000000202', 'f1460000-0000-4000-8000-000000000001',
   'f1460000-0000-4000-8000-000000000101', '2095-01-01', 'Synthetic 2', 'Fixture',
   2000, 'private', 'private');

create temporary table os_f2_jwt(user_key text primary key, claims text not null)
  on commit drop;
grant select on os_f2_jwt to authenticated, anon;
insert into os_f2_jwt values
  ('a', jsonb_build_object(
    'sub', 'f1460000-0000-4000-8000-000000000021', 'role', 'authenticated',
    'app_metadata', jsonb_build_object('user_role', 'staff',
      'clinic_scope_ids', jsonb_build_array('f1460000-0000-4000-8000-000000000001'))
  )::text),
  ('inactive', jsonb_build_object(
    'sub', 'f1460000-0000-4000-8000-000000000023', 'role', 'authenticated',
    'app_metadata', jsonb_build_object('user_role', 'staff',
      'clinic_scope_ids', jsonb_build_array('f1460000-0000-4000-8000-000000000001'))
  )::text);

-- ------------------------------------------- Part A: stale browser totals
-- The exact statement the pre-fix write-model sent through PostgREST upsert.
select set_config('request.jwt.claims', (select claims from os_f2_jwt where user_key = 'a'), true);
set local role authenticated;

insert into public.daily_reports (
  clinic_id, staff_id, report_date, total_patients, new_patients, total_revenue,
  insurance_revenue, private_revenue, report_text
)
values (
  'f1460000-0000-4000-8000-000000000001', null, '2095-01-01', 10, 1, 99999,
  50000, 49999, 'stale tab save'
)
on conflict (clinic_id, report_date) do update set
  staff_id = excluded.staff_id,
  total_patients = excluded.total_patients,
  new_patients = excluded.new_patients,
  total_revenue = excluded.total_revenue,
  insurance_revenue = excluded.insurance_revenue,
  private_revenue = excluded.private_revenue,
  report_text = excluded.report_text;

select is(
  (select row(total_patients, total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(2,5000.00,3000.00,2000.00)',
  'A1: stale browser total_* sent through the legacy upsert do not overwrite item-derived totals'
);

select is(
  (select report_text from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  'stale tab save',
  'A2: human-edited report_text is still saved through the legacy upsert'
);

reset role;
delete from public.daily_report_items
where daily_report_id = 'f1460000-0000-4000-8000-000000000101';

select is(
  (select row(total_patients, total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(0,0.00,0.00,0.00)',
  'A3: deleting the last detail row derives zero totals'
);

set local role authenticated;
insert into public.daily_reports (
  clinic_id, staff_id, report_date, total_patients, new_patients, total_revenue,
  insurance_revenue, private_revenue, report_text
)
values (
  'f1460000-0000-4000-8000-000000000001', null, '2095-01-01', 2, 1, 5000,
  3000, 2000, 'stale tab save'
)
on conflict (clinic_id, report_date) do update set
  total_patients = excluded.total_patients,
  total_revenue = excluded.total_revenue,
  insurance_revenue = excluded.insurance_revenue,
  private_revenue = excluded.private_revenue;

select is(
  (select row(total_patients, total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(0,0.00,0.00,0.00)',
  'A4: stale browser totals cannot resurrect totals after the last detail row is deleted'
);
reset role;

-- --------------------------------------------- Part B: explicit contract
select has_column('public', 'daily_reports', 'aggregate_source',
  'B1: daily_reports has the explicit aggregate_source boundary');
select col_not_null('public', 'daily_reports', 'aggregate_source',
  'B2: aggregate_source is not null');
select col_default_is('public', 'daily_reports', 'aggregate_source', 'manual'::text,
  'B3: rows default to the legacy manual contract');
select throws_ok(
  $$update public.daily_reports set aggregate_source = 'derived'
    where id = 'f1460000-0000-4000-8000-000000000102'$$,
  '23514', null,
  'B4: aggregate_source only accepts manual or items'
);

select is(
  (select aggregate_source from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  'items',
  'B5: a report stays itemized after its last detail row is deleted (no implicit revert)'
);
select is(
  (select new_patients from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  1,
  'B6: new_patients is not silently clamped when the derived total drops below it'
);
select throws_ok(
  $$update public.daily_reports set aggregate_source = 'manual'
    where id = 'f1460000-0000-4000-8000-000000000101'$$,
  '23514', 'DAILY_REPORT_AGGREGATE_SOURCE_IMMUTABLE',
  'B7: an itemized report cannot be turned back into a manual report'
);

-- Function and trigger catalog
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=""']::text[]
   from pg_proc p
   where p.oid = 'public.save_daily_report(uuid,date,integer,integer,numeric,numeric,numeric,uuid,uuid,text,boolean)'::regprocedure),
  'B8: save_daily_report is SECURITY INVOKER with an empty search_path'
);
select ok(
  has_function_privilege('authenticated',
    'public.save_daily_report(uuid,date,integer,integer,numeric,numeric,numeric,uuid,uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.save_daily_report(uuid,date,integer,integer,numeric,numeric,numeric,uuid,uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.save_daily_report(uuid,date,integer,integer,numeric,numeric,numeric,uuid,uuid,text,boolean)', 'EXECUTE'),
  'B9: only authenticated can execute save_daily_report'
);
select is(
  (select count(*)
   from pg_proc p
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
   where p.oid = 'public.save_daily_report(uuid,date,integer,integer,numeric,numeric,numeric,uuid,uuid,text,boolean)'::regprocedure
     and acl.grantee = 0),
  0::bigint,
  'B10: save_daily_report has no PUBLIC EXECUTE'
);
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""']::text[]
   from pg_proc p
   where p.oid = 'app_private.enforce_daily_report_aggregate_authority()'::regprocedure),
  'B11: aggregate guard is SECURITY DEFINER with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'app_private.enforce_daily_report_aggregate_authority()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.enforce_daily_report_aggregate_authority()', 'EXECUTE')
  and not has_function_privilege('service_role', 'app_private.enforce_daily_report_aggregate_authority()', 'EXECUTE'),
  'B12: no API role can execute the aggregate guard directly'
);
select is(
  (select pg_get_triggerdef(t.oid)
   from pg_trigger t
   where t.tgrelid = 'public.daily_reports'::regclass
     and t.tgname = 'daily_reports_aggregate_authority'
     and t.tgenabled = 'O'),
  'CREATE TRIGGER daily_reports_aggregate_authority BEFORE INSERT OR UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION app_private.enforce_daily_report_aggregate_authority()',
  'B13: aggregate guard trigger is enabled for every insert and update'
);
select is(
  (select pg_get_triggerdef(t.oid)
   from pg_trigger t
   where t.tgrelid = 'public.daily_reports'::regclass
     and t.tgname = 'daily_reports_staff_clinic_check'
     and t.tgenabled = 'O'),
  'CREATE TRIGGER daily_reports_staff_clinic_check AFTER INSERT OR UPDATE OF staff_id, clinic_id ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION app_private.enforce_daily_report_staff_clinic()',
  'B13b: the staff clinic check runs AFTER the row (after RLS WITH CHECK admitted it)'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.daily_reports'::regclass)
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'daily_reports') = 4,
  'B14: daily_reports RLS and its four policies are unchanged'
);

-- Atomic save on an itemized report whose last detail row was deleted
select set_config('request.jwt.claims', (select claims from os_f2_jwt where user_key = 'a'), true);
set local role authenticated;

select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 2, p_new_patients => 1, p_total_revenue => 5000,
      p_insurance_revenue => 3000, p_private_revenue => 2000,
      p_report_id => 'f1460000-0000-4000-8000-000000000101', p_report_text => 'retry')$$,
  '23514', 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL',
  'B15: after the last detail row is deleted, an over-total new_patients must be re-entered'
);
select lives_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 2, p_new_patients => 0, p_total_revenue => 5000,
      p_insurance_revenue => 3000, p_private_revenue => 2000,
      p_report_id => 'f1460000-0000-4000-8000-000000000101', p_report_text => 're-entered')$$,
  'B16: re-entered new_patients within the derived total is accepted'
);
select is(
  (select row(total_patients, new_patients, total_revenue, aggregate_source, report_text)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(0,0,0.00,items,re-entered)',
  'B17: stale request totals stay ignored and the report remains itemized at zero'
);
reset role;

insert into public.daily_report_items (
  id, clinic_id, daily_report_id, report_date, patient_name, treatment_name,
  fee, billing_type, revenue_context_code
)
values
  ('f1460000-0000-4000-8000-000000000203', 'f1460000-0000-4000-8000-000000000001',
   'f1460000-0000-4000-8000-000000000101', '2095-01-01', 'Synthetic 3', 'Fixture',
   3000, 'insurance', 'insurance'),
  ('f1460000-0000-4000-8000-000000000204', 'f1460000-0000-4000-8000-000000000001',
   'f1460000-0000-4000-8000-000000000101', '2095-01-01', 'Synthetic 4', 'Fixture',
   2000, 'private', 'private');

set local role authenticated;
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 10, p_new_patients => 5, p_total_revenue => 99999,
      p_insurance_revenue => 0, p_private_revenue => 0)$$,
  '23514', 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL',
  'B18: two real detail rows + client total 10 + new_patients 5 is rejected against the DB total'
);
select is(
  (select new_patients from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  0,
  'B19: the rejected save leaves the report unchanged'
);

with saved as (
  select * from public.save_daily_report(
    p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
    p_total_patients => 1, p_new_patients => 2, p_total_revenue => 100,
    p_insurance_revenue => 0, p_private_revenue => 100, p_report_text => 'stale low total')
)
select is(
  (select row(id, total_patients, new_patients, total_revenue, insurance_revenue, private_revenue)::text from saved),
  '(f1460000-0000-4000-8000-000000000101,2,2,5000.00,3000.00,2000.00)',
  'B20: DB-valid new_patients is accepted although the stale client total is lower, and the response carries DB totals'
);
select is(
  (select row(id, total_patients, new_patients, total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(f1460000-0000-4000-8000-000000000101,2,2,5000.00,3000.00,2000.00)',
  'B21: re-reading the report returns the same DB totals as the save response'
);

update public.daily_reports
set total_patients = 99, total_revenue = 1, insurance_revenue = 1, private_revenue = 0
where id = 'f1460000-0000-4000-8000-000000000101';
select is(
  (select row(total_patients, total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(2,5000.00,3000.00,2000.00)',
  'B22: direct PostgREST-style table updates cannot overwrite itemized totals'
);
select throws_ok(
  $$update public.daily_reports set new_patients = 3
    where id = 'f1460000-0000-4000-8000-000000000101'$$,
  '23514', 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL',
  'B23: direct table updates cannot set new_patients above the derived total'
);

-- Manual (legacy) reports keep their contract
select lives_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 12, p_new_patients => 2, p_total_revenue => 60000,
      p_insurance_revenue => 25000, p_private_revenue => 35000,
      p_report_id => 'f1460000-0000-4000-8000-000000000102',
      p_staff_id => 'f1460000-0000-4000-8000-000000000011', p_report_text => 'manual edit')$$,
  'B24: a manual report save is accepted'
);
select is(
  (select row(total_patients, new_patients, total_revenue, insurance_revenue, private_revenue,
              staff_id, aggregate_source)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  '(12,2,60000.00,25000.00,35000.00,f1460000-0000-4000-8000-000000000011,manual)',
  'B25: manual reports keep the hand-entered totals and stay manual without detail rows'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 1, p_new_patients => 3, p_total_revenue => 10000,
      p_insurance_revenue => 5000, p_private_revenue => 5000)$$,
  '23514', 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL',
  'B26: manual reports keep the new_patients <= total_patients rule'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 3, p_new_patients => 1, p_total_revenue => 1000,
      p_insurance_revenue => 800, p_private_revenue => 800)$$,
  '23514', 'DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL',
  'B27: manual reports keep the revenue breakdown <= total_revenue rule'
);
select is(
  (select row(total_patients, new_patients, total_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  '(12,2,60000.00)',
  'B28: rejected manual saves leave the report unchanged'
);

with saved as (
  select * from public.save_daily_report(
    p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-03',
    p_total_patients => 4, p_new_patients => 1, p_total_revenue => 8000,
    p_insurance_revenue => 3000, p_private_revenue => 5000, p_report_text => 'first save of the day')
)
select is(
  (select row(clinic_id, report_date, total_patients, new_patients, total_revenue, aggregate_source)::text from saved),
  '(f1460000-0000-4000-8000-000000000001,2095-01-03,4,1,8000.00,manual)',
  'B29: the first save of a day creates a manual report with the hand-entered totals'
);
select is(
  (select count(*) from public.daily_reports
   where clinic_id = 'f1460000-0000-4000-8000-000000000001' and report_date = '2095-01-03'),
  1::bigint,
  'B30: the first save creates exactly one report for the clinic and date'
);

-- Tenant, staff and report-id negatives
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000002', p_report_date => '2095-01-01',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1, p_report_text => 'cross clinic')$$,
  '42501', null,
  'B31: clinic A user cannot write a clinic B report through the RPC'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_report_id => 'f1460000-0000-4000-8000-000000000103', p_report_text => 'foreign id')$$,
  '42501', 'DAILY_REPORT_NOT_ACCESSIBLE',
  'B32: a clinic B report_id cannot be written through a clinic A request'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_staff_id => 'f1460000-0000-4000-8000-000000000012')$$,
  '42501', 'DAILY_REPORT_STAFF_NOT_ACCESSIBLE',
  'B33: a clinic B staff_id cannot be assigned through a clinic A request'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_report_id => 'f1460000-0000-4000-8000-000000000101')$$,
  '42501', 'DAILY_REPORT_NOT_ACCESSIBLE',
  'B34: a report_id whose date differs from the request is rejected'
);
with changed as (
  update public.daily_reports set total_patients = 99, report_text = 'cross'
  where id = 'f1460000-0000-4000-8000-000000000103'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'B35: clinic A user cannot update the clinic B report directly'
);
reset role;

select is(
  (select row(total_patients, new_patients, total_revenue, report_text)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000103'),
  '(7,1,7000.00,"clinic B report")',
  'B36: clinic B report is unchanged by every clinic A attempt'
);
select is(
  (select row(total_patients, new_patients, staff_id)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  '(12,2,f1460000-0000-4000-8000-000000000011)',
  'B37: rejected staff and report-id writes leave the clinic A report unchanged'
);

-- Inactive authority
select set_config('request.jwt.claims', (select claims from os_f2_jwt where user_key = 'inactive'), true);
set local role authenticated;
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_report_id => 'f1460000-0000-4000-8000-000000000102')$$,
  '42501', null,
  'B38: an inactive profile cannot save through the RPC'
);
reset role;
select is(
  (select total_patients from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  12,
  'B39: the inactive attempt leaves the report unchanged'
);

-- anon cannot execute
set local role anon;
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1)$$,
  '42501', null,
  'B40: anon cannot execute save_daily_report'
);
reset role;

-- Cross-clinic oracles: errors before RLS must not depend on other clinics' data.
select set_config('request.jwt.claims', (select claims from os_f2_jwt where user_key = 'a'), true);
set local role authenticated;
select throws_ok(
  $$insert into public.daily_reports (id, clinic_id, report_date, aggregate_source, new_patients)
    values ('f1460000-0000-4000-8000-000000000103', 'f1460000-0000-4000-8000-000000000002', '2095-02-09', 'items', 7)$$,
  '23514', 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS',
  'O1: an insert reusing a clinic B report id gets a data-independent error (new_patients 7)'
);
select throws_ok(
  $$insert into public.daily_reports (id, clinic_id, report_date, aggregate_source, new_patients)
    values ('f1460000-0000-4000-8000-000000000103', 'f1460000-0000-4000-8000-000000000002', '2095-02-09', 'items', 8)$$,
  '23514', 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS',
  'O2: the same error for new_patients 8, so the clinic B patient count is not observable'
);
select throws_ok(
  $$insert into public.daily_reports (id, clinic_id, report_date, new_patients)
    values ('f1460000-0000-4000-8000-000000000103', 'f1460000-0000-4000-8000-000000000002', '2095-02-09', 1000000)$$,
  '42501', null,
  'O3: a manual insert into clinic B is stopped by RLS'
);
select throws_ok(
  $$update public.daily_reports set id = 'f1460000-0000-4000-8000-000000000103', new_patients = 1000000
    where id = 'f1460000-0000-4000-8000-000000000101'$$,
  '23514', 'DAILY_REPORT_ID_IMMUTABLE',
  'O4: re-pointing an own report at a clinic B report id is rejected before any read'
);
select throws_ok(
  $$insert into public.daily_reports (clinic_id, report_date, staff_id)
    values ('f1460000-0000-4000-8000-000000000002', '2095-02-10', 'f1460000-0000-4000-8000-000000000012')$$,
  '42501', null,
  'O5: clinic B staff in a clinic B insert gets the RLS error'
);
select throws_ok(
  $$insert into public.daily_reports (clinic_id, report_date, staff_id)
    values ('f1460000-0000-4000-8000-000000000002', '2095-02-10', 'f1460000-0000-4000-8000-000000000011')$$,
  '42501', null,
  'O6: a non-member staff id gets the same RLS error (no staff membership oracle)'
);
reset role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'f1460000-0000-4000-8000-000000000099', 'role', 'authenticated'
)::text, true);
set local role authenticated;
select throws_ok(
  $$insert into public.daily_reports (id, clinic_id, report_date, aggregate_source, new_patients)
    values ('f1460000-0000-4000-8000-000000000103', 'f1460000-0000-4000-8000-000000000002', '2095-02-09', 'items', 1000000)$$,
  '23514', 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS',
  'O7: a user without any profile or permission gets the same data-independent error'
);
select throws_ok(
  $$insert into public.daily_reports (clinic_id, report_date)
    values ('f1460000-0000-4000-8000-000000000001', '2095-02-11')$$,
  '42501', null,
  'O8: a user without any profile or permission cannot create a report'
);
reset role;

-- Stale JWT: the token's clinic scope no longer includes clinic A.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'f1460000-0000-4000-8000-000000000021', 'role', 'authenticated',
  'app_metadata', jsonb_build_object('user_role', 'staff',
    'clinic_scope_ids', jsonb_build_array('f1460000-0000-4000-8000-000000000002'))
)::text, true);
set local role authenticated;
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-02',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_report_id => 'f1460000-0000-4000-8000-000000000102')$$,
  '42501', null,
  'O9: a JWT whose clinic scope excludes the report clinic cannot save it'
);
reset role;
select is(
  (select row(total_patients, new_patients, total_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  '(12,2,60000.00)',
  'O10: oracle and stale-JWT attempts leave clinic A data unchanged'
);

select ok(
  not has_function_privilege('anon', 'public.recalculate_daily_report_totals(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.recalculate_daily_report_totals(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.recalculate_daily_report_totals(uuid)', 'EXECUTE'),
  'P1: recalculate_daily_report_totals keeps its EXECUTE grants (service_role only)'
);
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""']::text[]
   from pg_proc p
   where p.oid = 'app_private.enforce_daily_report_staff_clinic()'::regprocedure)
  and not has_function_privilege('anon', 'app_private.enforce_daily_report_staff_clinic()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.enforce_daily_report_staff_clinic()', 'EXECUTE')
  and not has_function_privilege('service_role', 'app_private.enforce_daily_report_staff_clinic()', 'EXECUTE'),
  'P2: staff clinic guard is SECURITY DEFINER with an empty search_path and no API EXECUTE'
);
select is(
  (select md5(string_agg(concat_ws('|', tablename, policyname, cmd, roles::text,
                                   coalesce(qual, ''), coalesce(with_check, '')),
                         ';' order by tablename, policyname))
   from pg_policies
   where schemaname = 'public' and tablename in ('daily_reports', 'daily_report_items', 'staff')),
  '73ed99f1413965963bce7ed6ae47b6d4',
  'P3: RLS policy definitions on daily_reports, daily_report_items and staff are unchanged from main'
);

-- Every write path: service role and arrived-reservation style inserts
set local role service_role;
select throws_ok(
  $$update public.daily_reports set staff_id = 'f1460000-0000-4000-8000-000000000012'
    where id = 'f1460000-0000-4000-8000-000000000102'$$,
  '23514', 'DAILY_REPORT_STAFF_CLINIC_MISMATCH',
  'B41: even service role cannot attach a staff member from another clinic'
);
select throws_ok(
  $$insert into public.daily_reports (clinic_id, report_date, staff_id)
    values ('f1460000-0000-4000-8000-000000000001', '2095-01-09',
            'f1460000-0000-4000-8000-000000000012')$$,
  '23514', 'DAILY_REPORT_STAFF_CLINIC_MISMATCH',
  'B42: a new report cannot reference a staff member from another clinic'
);
select throws_ok(
  $$insert into public.daily_reports (clinic_id, report_date, new_patients, total_patients, aggregate_source)
    values ('f1460000-0000-4000-8000-000000000001', '2095-01-10', 1, 5, 'items')$$,
  '23514', 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS',
  'B43: a report cannot be created itemized; it starts manual until a detail row is attached'
);
select throws_ok(
  $$update public.daily_reports set aggregate_source = 'items'
    where id = 'f1460000-0000-4000-8000-000000000102'$$,
  '23514', 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS',
  'B44: a manual report without detail rows cannot be flipped to items (no silent loss of hand-entered totals)'
);
select is(
  (select row(aggregate_source, total_patients, total_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  '(manual,12,60000.00)',
  'B45: rejected flips leave the hand-entered totals untouched'
);
reset role;

-- manual -> items happens only when a detail row is attached
insert into public.daily_report_items (
  id, clinic_id, daily_report_id, report_date, patient_name, treatment_name,
  fee, billing_type, revenue_context_code
)
values (
  'f1460000-0000-4000-8000-000000000205', 'f1460000-0000-4000-8000-000000000001',
  'f1460000-0000-4000-8000-000000000102', '2095-01-02', 'Synthetic 5', 'Fixture',
  1500, 'private', 'private'
);
select is(
  (select row(aggregate_source, total_patients, total_revenue, insurance_revenue, private_revenue, new_patients)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000102'),
  '(items,1,1500.00,0.00,1500.00,2)',
  'B46: attaching the first detail row makes the report itemized with derived totals and keeps new_patients'
);

-- Moving a detail row recalculates both parents and itemizes the target
update public.daily_report_items
set daily_report_id = 'f1460000-0000-4000-8000-000000000101', report_date = '2095-01-01'
where id = 'f1460000-0000-4000-8000-000000000205';
select is(
  (select string_agg(row(id, aggregate_source, total_patients, total_revenue)::text, ';' order by id)
   from public.daily_reports
   where id in ('f1460000-0000-4000-8000-000000000101', 'f1460000-0000-4000-8000-000000000102')),
  '(f1460000-0000-4000-8000-000000000101,items,3,6500.00);(f1460000-0000-4000-8000-000000000102,items,0,0.00)',
  'B47: moving a detail row re-derives both parents and neither reverts to manual'
);

-- Fee correction is reflected without any report save
update public.daily_report_items set fee = 4000
where id = 'f1460000-0000-4000-8000-000000000203';
select is(
  (select row(total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(7500.00,4000.00,3500.00)',
  'B48: a fee correction on a detail row is reflected in the parent totals'
);

-- The DB-derived totals are what the save response and re-read report
select set_config('request.jwt.claims', (select claims from os_f2_jwt where user_key = 'a'), true);
set local role authenticated;
with saved as (
  select * from public.save_daily_report(
    p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
    p_total_patients => 2, p_new_patients => 3, p_total_revenue => 5000,
    p_insurance_revenue => 3000, p_private_revenue => 2000,
    p_report_id => 'f1460000-0000-4000-8000-000000000101', p_report_text => 'old tab after correction')
)
select is(
  (select row(total_patients, new_patients, total_revenue, insurance_revenue, private_revenue)::text from saved),
  '(3,3,7500.00,4000.00,3500.00)',
  'B49: an old tab saved after add/correct/move keeps the DB totals and validates against them'
);
select is(
  (select row(total_patients, new_patients, total_revenue, insurance_revenue, private_revenue)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  '(3,3,7500.00,4000.00,3500.00)',
  'B50: re-read after the old-tab save matches the save response'
);
reset role;

-- Clinic B user sees none of clinic A's reports and cannot itemize them
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'f1460000-0000-4000-8000-000000000022', 'role', 'authenticated',
  'app_metadata', jsonb_build_object('user_role', 'staff',
    'clinic_scope_ids', jsonb_build_array('f1460000-0000-4000-8000-000000000002'))
)::text, true);
set local role authenticated;
select is(
  (select count(*) from public.daily_reports
   where clinic_id = 'f1460000-0000-4000-8000-000000000001'),
  0::bigint,
  'B51: clinic B user cannot read clinic A reports'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_report_id => 'f1460000-0000-4000-8000-000000000101')$$,
  '42501', null,
  'B52: clinic B user cannot save a clinic A report even with its exact id'
);
reset role;

-- Arrived-reservation trigger paths (created manual -> itemized in one transaction)
insert into public.customers (id, clinic_id, name, phone)
values ('f1460000-0000-4000-8000-000000000301', 'f1460000-0000-4000-8000-000000000001', 'Synthetic customer', '0000000000');
insert into public.menus (id, clinic_id, name, price, duration_minutes)
values ('f1460000-0000-4000-8000-000000000302', 'f1460000-0000-4000-8000-000000000001', 'Synthetic menu', 4000, 30);
insert into public.resources (id, clinic_id, name, type)
values ('f1460000-0000-4000-8000-000000000303', 'f1460000-0000-4000-8000-000000000001', 'Synthetic resource', 'staff');
insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status)
values ('f1460000-0000-4000-8000-000000000304', 'f1460000-0000-4000-8000-000000000001',
        'f1460000-0000-4000-8000-000000000301', 'f1460000-0000-4000-8000-000000000302',
        'f1460000-0000-4000-8000-000000000303', '2095-01-20T01:00:00Z', '2095-01-20T01:30:00Z', 'arrived');
select is(
  (select row(aggregate_source, total_patients, total_revenue, report_text)::text
   from public.daily_reports
   where clinic_id = 'f1460000-0000-4000-8000-000000000001' and report_date = '2095-01-20'),
  '(items,1,4000.00,"自動作成: 来院済み予約")',
  'AR1: an arrived reservation creates the report and itemizes it in the same transaction'
);
update public.daily_reports set new_patients = 1
where clinic_id = 'f1460000-0000-4000-8000-000000000001' and report_date = '2095-01-20';
select lives_ok(
  $$update public.reservations set notes = 'arrived again'
    where id = 'f1460000-0000-4000-8000-000000000304'$$,
  'AR2: re-syncing an arrived reservation (INSERT ... ON CONFLICT DO UPDATE on the itemized report) succeeds'
);
select lives_ok(
  $$update public.reservations set status = 'completed'
    where id = 'f1460000-0000-4000-8000-000000000304'$$,
  'AR3: leaving arrived deletes the pending detail row without failing although new_patients > derived total'
);
select is(
  (select row(aggregate_source, total_patients, total_revenue, new_patients)::text
   from public.daily_reports
   where clinic_id = 'f1460000-0000-4000-8000-000000000001' and report_date = '2095-01-20'),
  '(items,0,0.00,1)',
  'AR4: the report stays itemized at zero and new_patients is kept for re-entry'
);
set local role service_role;
select lives_ok(
  $$update public.daily_report_items set notes = 'no aggregate change'
    where clinic_id = 'f1460000-0000-4000-8000-000000000001' and report_date = '2095-01-01'$$,
  'AR5: detail updates that do not touch aggregate inputs still pass the guard'
);
reset role;

-- ------------------------------------------- Part M: manual-only saves
-- The mobile form edits hand-entered totals only. With p_require_manual the
-- RPC refuses an item-derived report under the row lock, before any column
-- (staff_id, new_patients, report_text) is written.
create temp table os_f2_manual_only_before on commit drop as
select row(staff_id, new_patients, report_text, total_patients, total_revenue,
           insurance_revenue, private_revenue, aggregate_source, updated_at)::text as snapshot
from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101';

select set_config('request.jwt.claims', (select claims from os_f2_jwt where user_key = 'a'), true);
set local role authenticated;
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 3, p_new_patients => 0, p_total_revenue => 9000,
      p_insurance_revenue => 0, p_private_revenue => 9000,
      p_require_manual => true)$$,
  '55000', 'DAILY_REPORT_ITEMIZED',
  'M1: a manual-only (mobile) save is refused on an item-derived report'
);
with saved as (
  select * from public.save_daily_report(
    p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-04',
    p_total_patients => 3, p_new_patients => 0, p_total_revenue => 9000,
    p_insurance_revenue => 0, p_private_revenue => 9000, p_require_manual => true)
)
select is(
  (select row(report_date, total_patients, total_revenue, aggregate_source)::text from saved),
  '(2095-01-04,3,9000.00,manual)',
  'M4: a manual-only save creates the first report of the day as manual'
);
with saved as (
  select * from public.save_daily_report(
    p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-04',
    p_total_patients => 4, p_new_patients => 1, p_total_revenue => 12000,
    p_insurance_revenue => 0, p_private_revenue => 12000, p_require_manual => true)
)
select is(
  (select row(total_patients, new_patients, total_revenue, aggregate_source)::text from saved),
  '(4,1,12000.00,manual)',
  'M3: a manual-only save keeps the hand-entered totals on an existing manual report'
);
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-04',
      p_total_patients => 3, p_new_patients => 0, p_total_revenue => 9000,
      p_insurance_revenue => 0, p_private_revenue => 9000,
      p_require_manual => null)$$,
  '22023', 'DAILY_REPORT_INVALID_ARGUMENT',
  'M5: a null manual-only flag is rejected instead of being treated as false'
);
reset role;
select is(
  (select row(staff_id, new_patients, report_text, total_patients, total_revenue,
              insurance_revenue, private_revenue, aggregate_source, updated_at)::text
   from public.daily_reports where id = 'f1460000-0000-4000-8000-000000000101'),
  (select snapshot from os_f2_manual_only_before),
  'M2: the refused manual-only save left every column of the itemized report unchanged'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'f1460000-0000-4000-8000-000000000022', 'role', 'authenticated',
  'app_metadata', jsonb_build_object('user_role', 'staff',
    'clinic_scope_ids', jsonb_build_array('f1460000-0000-4000-8000-000000000002'))
)::text, true);
set local role authenticated;
select throws_ok(
  $$select public.save_daily_report(
      p_clinic_id => 'f1460000-0000-4000-8000-000000000001', p_report_date => '2095-01-01',
      p_total_patients => 1, p_new_patients => 0, p_total_revenue => 1,
      p_insurance_revenue => 0, p_private_revenue => 1,
      p_report_id => 'f1460000-0000-4000-8000-000000000101', p_require_manual => true)$$,
  '42501', 'DAILY_REPORT_NOT_ACCESSIBLE',
  'M6: another clinic cannot learn that a report is itemized through the manual-only error'
);
reset role;

select * from finish();
rollback;

begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(8);

-- CI の使い捨て DB 内で、API が読み取った版の比較と既存トリガーを検証する。
insert into public.clinics (id, name)
values ('fc030000-0000-4000-8000-000000000001', 'PR-C CAS fixture');
insert into public.customers (id, clinic_id, name, phone)
values ('fc030000-0000-4000-8000-000000000010', 'fc030000-0000-4000-8000-000000000001', 'CAS fixture', '0000000000');
insert into public.menus (id, clinic_id, name, price, duration_minutes)
values ('fc030000-0000-4000-8000-000000000020', 'fc030000-0000-4000-8000-000000000001', 'CAS fixture', 1000, 30);
insert into public.resources (id, clinic_id, name, type)
values
  ('fc030000-0000-4000-8000-000000000030', 'fc030000-0000-4000-8000-000000000001', 'CAS fixture A', 'staff'),
  ('fc030000-0000-4000-8000-000000000031', 'fc030000-0000-4000-8000-000000000001', 'CAS fixture B', 'staff');
insert into public.reservations (
  id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, updated_at
)
values (
  'fc030000-0000-4000-8000-000000000100',
  'fc030000-0000-4000-8000-000000000001',
  'fc030000-0000-4000-8000-000000000010',
  'fc030000-0000-4000-8000-000000000020',
  'fc030000-0000-4000-8000-000000000030',
  '2095-06-06T00:00:00Z', '2095-06-06T00:30:00Z', 'confirmed',
  '2020-01-01T01:00:00.123456+00:00'
);

select is(
  (select updated_at from public.reservations where id = 'fc030000-0000-4000-8000-000000000100'),
  '2020-01-01T01:00:00.123456+00:00'::timestamptz,
  '読み取り版はマイクロ秒の精度を保持する'
);

with changed as (
  update public.reservations set notes = 'first writer'
  where id = 'fc030000-0000-4000-8000-000000000100'
    and clinic_id = 'fc030000-0000-4000-8000-000000000001'
    and updated_at = '2020-01-01T01:00:00.123456+00:00'::timestamptz
  returning id
)
select is((select count(*) from changed), 1::bigint, '現在の版での更新は一度成功する');

select isnt(
  (select updated_at from public.reservations where id = 'fc030000-0000-4000-8000-000000000100'),
  '2020-01-01T01:00:00.123456+00:00'::timestamptz,
  '既存トリガーが保存時に版を進める'
);

-- 先行更新より前に同じ版を読んだ後続リクエストは、変更種別によらず保存できない。
with changed as (
  update public.reservations set status = 'cancelled'
  where id = 'fc030000-0000-4000-8000-000000000100'
    and clinic_id = 'fc030000-0000-4000-8000-000000000001'
    and updated_at = '2020-01-01T01:00:00.123456+00:00'::timestamptz
  returning id
)
select is((select count(*) from changed), 0::bigint, '古い版でのキャンセルは保存されない');

with changed as (
  update public.reservations set start_time = '2095-06-06T01:00:00Z', end_time = '2095-06-06T01:30:00Z'
  where id = 'fc030000-0000-4000-8000-000000000100'
    and clinic_id = 'fc030000-0000-4000-8000-000000000001'
    and updated_at = '2020-01-01T01:00:00.123456+00:00'::timestamptz
  returning id
)
select is((select count(*) from changed), 0::bigint, '古い版での時間変更は保存されない');

with changed as (
  update public.reservations set staff_id = 'fc030000-0000-4000-8000-000000000031'
  where id = 'fc030000-0000-4000-8000-000000000100'
    and clinic_id = 'fc030000-0000-4000-8000-000000000001'
    and updated_at = '2020-01-01T01:00:00.123456+00:00'::timestamptz
  returning id
)
select is((select count(*) from changed), 0::bigint, '古い版での担当変更は保存されない');

with changed as (
  update public.reservations set notes = 'wrong clinic'
  where id = 'fc030000-0000-4000-8000-000000000100'
    and clinic_id = 'fc030000-0000-4000-8000-000000000002'
    and updated_at = now()
  returning id
)
select is((select count(*) from changed), 0::bigint, '版が一致しても別院の更新は保存されない');

select ok(
  (select notes = 'first writer'
      and status = 'confirmed'
      and start_time = '2095-06-06T00:00:00Z'::timestamptz
      and staff_id = 'fc030000-0000-4000-8000-000000000030'::uuid
    from public.reservations where id = 'fc030000-0000-4000-8000-000000000100'),
  '後続の競合更新は先行保存の内容を上書きしない'
);

select * from finish();
rollback;

-- Spec: docs/stabilization/spec-os-customer-stat-authority-v0.1.md (Issue #147)
-- Rollback: supabase/rollbacks/20261023064851_os_customer_stat_authority_rollback.sql
--   (blocked by design; forward-fix only, see spec §9)
-- No data is rewritten here: an existing cache changes only when a later
-- write changes a counted reservation of that customer (spec §8).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 0. Preflight: the increment trigger (enabled, baseline body) and the cache
--    columns are as reviewed; the spec §9.1 replay assumes exactly this rule.
do $preflight$
begin
  if to_regprocedure('public.update_customer_stats()') is null
     or not exists (
       select 1
       from pg_catalog.pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.reservations'::regclass
         and trigger_row.tgname = 'update_customer_stats_trigger'
         and trigger_row.tgfoid = to_regprocedure('public.update_customer_stats()')
         and trigger_row.tgenabled = 'O'
         and not trigger_row.tgisinternal
     )
     or not exists (
       select 1
       from pg_catalog.pg_proc proc
       where proc.oid = to_regprocedure('public.update_customer_stats()')
         and proc.prosecdef
         and pg_catalog.md5(proc.prosrc) = 'f23956bd4e689a6f1003c7ddab8a8e11'
     ) then
    raise exception 'OS-F1 preflight failed: update_customer_stats_trigger is not in the reviewed state';
  end if;

  if (
    select pg_catalog.string_agg(
      column_row.attname || ':' || pg_catalog.format_type(column_row.atttypid, column_row.atttypmod),
      ',' order by column_row.attname)
    from pg_catalog.pg_attribute column_row
    where column_row.attrelid = 'public.customers'::regclass
      and column_row.attname in ('last_visit_date', 'total_revenue', 'total_visits')
      and not column_row.attisdropped
  ) is distinct from
    'last_visit_date:timestamp with time zone,total_revenue:numeric(10,2),total_visits:integer'
  then
    raise exception 'OS-F1 preflight failed: customers cache columns drifted';
  end if;
end
$preflight$;

-- 1. Rebuild primitive. The cache of each customer is derived from its
--    clinic-consistent, non-deleted, completed reservations:
--    total_visits = count, total_revenue = sum(coalesce(actual_price, price, 0)),
--    last_visit_date = max(end_time); no such reservation -> 0 / 0 / NULL.
create function app_private.refresh_customer_visit_stats(p_customer_ids pg_catalog.uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_customer_ids is null or pg_catalog.cardinality(p_customer_ids) = 0 then
    return;
  end if;

  -- The rebuild needs a statement snapshot taken after the customer lock. A
  -- REPEATABLE READ / SERIALIZABLE snapshot is fixed at transaction start and
  -- can miss a commit that left the (possibly stale) cache unchanged, so such
  -- writers are refused before anything is locked or written.
  if pg_catalog.current_setting('transaction_isolation')
     not in ('read committed', 'read uncommitted') then
    raise exception 'CUSTOMER_VISIT_STATS_REQUIRES_READ_COMMITTED'
      using errcode = '0A000',
            hint = 'Write reservations that change completed visits under READ COMMITTED.';
  end if;

  -- Serialize writers per customer before reading. Locks are taken in id
  -- order so two statements touching the same customers cannot deadlock here.
  perform 1
  from public.customers customer
  where customer.id = any (p_customer_ids)
  order by customer.id
  for no key update;

  -- New statement: under READ COMMITTED its snapshot includes every writer
  -- that held the customer lock before us. Unchanged caches are not
  -- rewritten (no row version, no updated_at change).
  update public.customers customer
  set
    total_visits = visit.total_visits,
    total_revenue = visit.total_revenue,
    last_visit_date = visit.last_visit_date
  from (
    select
      target.id,
      pg_catalog.count(reservation.id)::integer as total_visits,
      coalesce(
        pg_catalog.sum(coalesce(reservation.actual_price, reservation.price, 0)),
        0
      )::numeric(10,2) as total_revenue,
      pg_catalog.max(reservation.end_time) as last_visit_date
    from public.customers target
    left join public.reservations reservation
      on reservation.customer_id = target.id
     and reservation.clinic_id = target.clinic_id
     and reservation.status = 'completed'
     and reservation.is_deleted = false
    where target.id = any (p_customer_ids)
    group by target.id
  ) visit
  where customer.id = visit.id
    and (customer.total_visits, customer.total_revenue, customer.last_visit_date)
      is distinct from (visit.total_visits, visit.total_revenue, visit.last_visit_date);
end;
$$;

revoke all on function app_private.refresh_customer_visit_stats(uuid[])
  from public, anon, authenticated, service_role;

comment on function app_private.refresh_customer_visit_stats(uuid[]) is
  'OS-F1: rebuilds customers.total_visits/total_revenue/last_visit_date from the completed, non-deleted reservations of the same clinic. READ COMMITTED only (0A000 otherwise). Owner-only EXECUTE; called by the reservation triggers and by approved maintenance (spec §9).';

-- 2. Statement-level maintenance from transition tables. A reservation
--    matters when it was or is counted and a column of the contract changed.
create function app_private.sync_customer_visit_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_ids pg_catalog.uuid[];
begin
  if tg_op = 'INSERT' then
    select pg_catalog.array_agg(distinct inserted.customer_id)
    into v_customer_ids
    from new_rows inserted
    where inserted.status = 'completed'
      and inserted.is_deleted = false;
  elsif tg_op = 'DELETE' then
    select pg_catalog.array_agg(distinct removed.customer_id)
    into v_customer_ids
    from old_rows removed
    where removed.status = 'completed'
      and removed.is_deleted = false;
  else
    select pg_catalog.array_agg(distinct affected.customer_id)
    into v_customer_ids
    from old_rows before_row
    full join new_rows after_row on after_row.id = before_row.id
    cross join lateral (
      select before_row.customer_id
      where before_row.status = 'completed'
        and before_row.is_deleted = false
      union all
      select after_row.customer_id
      where after_row.status = 'completed'
        and after_row.is_deleted = false
    ) affected(customer_id)
    where before_row.id is null
       or after_row.id is null
       or (before_row.status, before_row.is_deleted, before_row.customer_id,
           before_row.clinic_id, before_row.price, before_row.actual_price,
           before_row.end_time)
          is distinct from
          (after_row.status, after_row.is_deleted, after_row.customer_id,
           after_row.clinic_id, after_row.price, after_row.actual_price,
           after_row.end_time);
  end if;

  perform app_private.refresh_customer_visit_stats(v_customer_ids);
  return null;
end;
$$;

revoke all on function app_private.sync_customer_visit_stats()
  from public, anon, authenticated, service_role;

comment on function app_private.sync_customer_visit_stats() is
  'OS-F1: recomputes the visit cache of every customer whose counted reservations changed in the statement. Runs after RLS admitted the rows; reads only the transition tables and the affected customers'' reservations.';

comment on column public.customers.total_visits is
  'OS-F1 cache: number of completed, non-deleted reservations of this customer in its clinic. Maintained by reservations_customer_visit_stats_*.';
comment on column public.customers.total_revenue is
  'OS-F1 cache: sum of coalesce(actual_price, price, 0) over the same reservations. Not lifetime_value.';
comment on column public.customers.last_visit_date is
  'OS-F1 cache: max(end_time) of the same reservations, NULL when none. patient_visit_summary.last_visit_date (arrived + completed, start_time JST date) is a different metric.';

-- 3. Replace the increment-only trigger in the same transaction (the
--    reservations lock is taken last to keep it short).
drop trigger update_customer_stats_trigger on public.reservations;
drop function public.update_customer_stats();

create trigger reservations_customer_visit_stats_insert
after insert on public.reservations
referencing new table as new_rows
for each statement execute function app_private.sync_customer_visit_stats();

create trigger reservations_customer_visit_stats_update
after update on public.reservations
referencing old table as old_rows new table as new_rows
for each statement execute function app_private.sync_customer_visit_stats();

create trigger reservations_customer_visit_stats_delete
after delete on public.reservations
referencing old table as old_rows
for each statement execute function app_private.sync_customer_visit_stats();

-- 4. Postflight.
do $postflight$
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.reservations'::regclass
      and trigger_row.tgname in (
        'reservations_customer_visit_stats_insert',
        'reservations_customer_visit_stats_update',
        'reservations_customer_visit_stats_delete'
      )
      and trigger_row.tgfoid = 'app_private.sync_customer_visit_stats()'::regprocedure
      and trigger_row.tgenabled = 'O'
  ) <> 3
     or exists (
       select 1 from pg_catalog.pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.reservations'::regclass
         and trigger_row.tgname = 'update_customer_stats_trigger'
     ) then
    raise exception 'OS-F1 postflight failed: cache triggers are not installed as reviewed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    ) acl
    where proc.oid in (
        'app_private.refresh_customer_visit_stats(uuid[])'::regprocedure,
        'app_private.sync_customer_visit_stats()'::regprocedure
      )
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> proc.proowner
  ) then
    raise exception 'OS-F1 postflight failed: cache functions are executable by a non-owner role';
  end if;
end
$postflight$;

commit;

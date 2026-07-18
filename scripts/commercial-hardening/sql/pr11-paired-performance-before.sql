-- PR-11 local-only PR-10-equivalent write/read performance sample.
--
-- The six measured PR-11 indexes are absent only inside this transaction.
-- The canonical probe ends with ROLLBACK, restoring all six indexes even when
-- psql exits early because ON_ERROR_STOP closes the connection.

\set ON_ERROR_STOP on
\pset pager off

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

do $pr11_paired_write_preflight$
begin
  if current_database() <> 'postgres'
    or (select system_identifier::text from pg_control_system())
      <> '7662783869098430503'
    or current_setting('server_version_num') <> '170006'
  then
    raise exception 'PR-11 paired write baseline refused: local DB identity drift';
  end if;

  if (
    select max(version)
    from supabase_migrations.schema_migrations
  ) <> '20260716160402' then
    raise exception 'PR-11 paired write baseline refused: migration head drift';
  end if;

  if (
    select count(*)
    from unnest(array[
      'public.blocks_created_by_idx'::regclass,
      'public.blocks_deleted_by_idx'::regclass,
      'public.shift_requests_reviewed_by_idx'::regclass,
      'public.shift_requests_staff_id_idx'::regclass,
      'public.shift_requests_submitted_by_idx'::regclass,
      'public.patient_outreach_recipients_booked_reservation_clinic_idx'::regclass
    ]) expected(index_oid)
    join pg_index index_data on index_data.indexrelid = expected.index_oid
    where index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
  ) <> 6 then
    raise exception 'PR-11 paired write baseline refused: measured index drift';
  end if;
end
$pr11_paired_write_preflight$;

drop index public.blocks_created_by_idx;
drop index public.blocks_deleted_by_idx;
drop index public.shift_requests_reviewed_by_idx;
drop index public.shift_requests_staff_id_idx;
drop index public.shift_requests_submitted_by_idx;
drop index public.patient_outreach_recipients_booked_reservation_clinic_idx;

do $pr11_paired_write_baseline_guard$
begin
  if to_regclass('public.blocks_created_by_idx') is not null
    or to_regclass('public.blocks_deleted_by_idx') is not null
    or to_regclass('public.shift_requests_reviewed_by_idx') is not null
    or to_regclass('public.shift_requests_staff_id_idx') is not null
    or to_regclass('public.shift_requests_submitted_by_idx') is not null
    or to_regclass(
      'public.patient_outreach_recipients_booked_reservation_clinic_idx'
    ) is not null
  then
    raise exception 'PR-11 paired write baseline refused: temporary DROP drift';
  end if;
end
$pr11_paired_write_baseline_guard$;

select jsonb_build_object(
  'phase', 'pr10_equivalent_before',
  'scope', 'transaction_only',
  'measured_pr11_indexes_present', 0,
  'captured_at_utc', clock_timestamp() at time zone 'UTC'
) as paired_phase;

\ir pr11-performance-probe.sql

do $pr11_paired_write_postrollback$
begin
  if to_regclass('public.blocks_created_by_idx') is null
    or to_regclass('public.blocks_deleted_by_idx') is null
    or to_regclass('public.shift_requests_reviewed_by_idx') is null
    or to_regclass('public.shift_requests_staff_id_idx') is null
    or to_regclass('public.shift_requests_submitted_by_idx') is null
    or to_regclass(
      'public.patient_outreach_recipients_booked_reservation_clinic_idx'
    ) is null
  then
    raise exception 'PR-11 paired write postflight failed: index not restored';
  end if;
end
$pr11_paired_write_postrollback$;

select jsonb_build_object(
  'phase', 'pr11_restored_after_rollback',
  'measured_pr11_indexes_present', 6,
  'captured_at_utc', clock_timestamp() at time zone 'UTC'
) as paired_postrollback;

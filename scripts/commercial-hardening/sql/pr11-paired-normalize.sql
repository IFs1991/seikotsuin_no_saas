-- PR-11 local-only paired benchmark physical-state normalization.
--
-- This script intentionally changes only local physical storage/statistics.
-- It does not change rows, schema identity, policies, grants, or migration
-- history. Run the read-only postflight before and after every sample.

\set ON_ERROR_STOP on
\pset pager off

set lock_timeout = '5s';
set statement_timeout = '120s';

do $pr11_normalize_preflight$
declare
  active_queries text;
begin
  if current_database() <> 'postgres'
    or (select system_identifier::text from pg_control_system())
      <> '7662783869098430503'
    or current_setting('server_version_num') <> '170006'
  then
    raise exception 'PR-11 paired normalization refused: local DB identity drift';
  end if;

  if (
    select max(version)
    from supabase_migrations.schema_migrations
  ) <> '20260716160402' then
    raise exception 'PR-11 paired normalization refused: migration head drift';
  end if;

  if (select array_agg(id order by id) from auth.users) is distinct from
      array['bbbbbbb1-0000-4000-8000-bbbbbbbb0001'::uuid]
    or (select array_agg(id order by id) from public.clinics) is distinct from
      array['11111111-1111-4111-8111-111111111111'::uuid]
    or (select array_agg(id order by id) from public.profiles) is distinct from
      array['ccccccc1-0000-4000-8000-cccccccc0001'::uuid]
    or (select count(*) from public.resources) <> 0
    or (select count(*) from public.shift_request_periods) <> 0
    or (select count(*) from public.staff) <> 0
    or (select count(*) from public.user_permissions) <> 0
    or (select count(*) from public.blocks) <> 0
    or (select count(*) from public.customers) <> 0
    or (select count(*) from public.reservations) <> 0
    or (select count(*) from public.reservation_history) <> 0
    or (select count(*) from public.shift_requests) <> 0
    or (select count(*) from public.patient_outreach_recipients) <> 0
    or (select count(*) from public.customer_insurance_coverages) <> 0
    or (select count(*) from public.menus) <> 0
    or (select count(*) from public.menu_billing_profiles) <> 0
    or (select count(*) from public.patient_outreach_campaigns) <> 0
  then
    raise exception
      'PR-11 paired normalization refused: local fixture baseline drift';
  end if;

  select string_agg(
    format('%s:%s:%s', pid, usename, left(query, 80)),
    E'\n' order by pid
  )
  into active_queries
  from pg_stat_activity
  where pid <> pg_backend_pid()
    and datname = current_database()
    and backend_type = 'client backend'
    and state = 'active';

  if active_queries is not null then
    raise exception
      'PR-11 paired normalization refused: concurrent active client query:%',
      E'\n' || active_queries;
  end if;
end
$pr11_normalize_preflight$;

-- The probes roll back their logical fixture rows, but PostgreSQL keeps the
-- resulting physical dead tuples. Normalize both measured tables and the
-- fixture-owner tables observed in the rehearsal physical snapshots.
vacuum (analyze) auth.users;
vacuum (analyze) public.clinics;
vacuum (analyze) public.profiles;
vacuum (analyze) public.resources;
vacuum (analyze) public.shift_request_periods;
vacuum (analyze) public.staff;
vacuum (analyze) public.user_permissions;
vacuum (analyze) public.blocks;
vacuum (analyze) public.customers;
vacuum (analyze) public.reservations;
vacuum (analyze) public.reservation_history;
vacuum (analyze) public.shift_requests;
vacuum (analyze) public.patient_outreach_recipients;
vacuum (analyze) public.customer_insurance_coverages;
vacuum (analyze) public.menus;
vacuum (analyze) public.menu_billing_profiles;
vacuum (analyze) public.patient_outreach_campaigns;

reindex table auth.users;
reindex table public.clinics;
reindex table public.profiles;
reindex table public.resources;
reindex table public.shift_request_periods;
reindex table public.staff;
reindex table public.user_permissions;
reindex table public.blocks;
reindex table public.customers;
reindex table public.reservations;
reindex table public.reservation_history;
reindex table public.shift_requests;
reindex table public.patient_outreach_recipients;
reindex table public.customer_insurance_coverages;
reindex table public.menus;
reindex table public.menu_billing_profiles;
reindex table public.patient_outreach_campaigns;

select
  clock_timestamp() at time zone 'UTC' as captured_at_utc,
  relation_name,
  pg_relation_size(relation_name) as heap_bytes,
  pg_indexes_size(relation_name) as index_bytes
from unnest(array[
  'auth.users'::regclass,
  'public.clinics'::regclass,
  'public.profiles'::regclass,
  'public.resources'::regclass,
  'public.shift_request_periods'::regclass,
  'public.staff'::regclass,
  'public.user_permissions'::regclass,
  'public.blocks'::regclass,
  'public.customers'::regclass,
  'public.reservations'::regclass,
  'public.reservation_history'::regclass,
  'public.shift_requests'::regclass,
  'public.patient_outreach_recipients'::regclass,
  'public.customer_insurance_coverages'::regclass,
  'public.menus'::regclass,
  'public.menu_billing_profiles'::regclass,
  'public.patient_outreach_campaigns'::regclass
]) normalized(relation_name)
order by relation_name::text;

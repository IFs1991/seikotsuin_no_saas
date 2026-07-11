select
  n.nspname as schema,
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  exists (
    select 1
    from information_schema.columns ic
    where ic.table_schema = n.nspname
      and ic.table_name = c.relname
      and ic.column_name = 'clinic_id'
  ) as has_clinic_id,
  (
    select ic.is_nullable
    from information_schema.columns ic
    where ic.table_schema = n.nspname
      and ic.table_name = c.relname
      and ic.column_name = 'clinic_id'
  ) as clinic_id_nullable,
  coalesce((
    select count(*)
    from pg_policies p
    where p.schemaname = n.nspname
      and p.tablename = c.relname
  ), 0) as policy_count,
  has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT') as anon_select,
  has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'INSERT,UPDATE,DELETE') as anon_write_any,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'INSERT,UPDATE,DELETE') as authenticated_write_any,
  'UNCLASSIFIED'::text as classification,
  'UNDECIDED'::text as expected,
  'UNKNOWN'::text as difference
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'app_private')
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname;

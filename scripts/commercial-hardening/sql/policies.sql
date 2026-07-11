select
  schemaname as schema,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  'UNCLASSIFIED'::text as classification,
  'UNDECIDED'::text as expected,
  'UNKNOWN'::text as difference
from pg_policies
where schemaname in ('public', 'app_private')
order by schemaname, tablename, policyname;

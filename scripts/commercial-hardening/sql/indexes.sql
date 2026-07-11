select
  ns.nspname as schema,
  tbl.relname as table_name,
  idx.relname as index_name,
  ind.indisprimary as is_primary,
  ind.indisunique as is_unique,
  ind.indisvalid as is_valid,
  ind.indisready as is_ready,
  pg_get_indexdef(ind.indexrelid) as definition,
  'UNCLASSIFIED'::text as classification,
  'UNDECIDED'::text as expected,
  'UNKNOWN'::text as difference
from pg_index ind
join pg_class idx on idx.oid = ind.indexrelid
join pg_class tbl on tbl.oid = ind.indrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname in ('public', 'app_private')
order by ns.nspname, tbl.relname, idx.relname;

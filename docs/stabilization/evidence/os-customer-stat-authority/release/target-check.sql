select pg_catalog.md5(pg_catalog.string_agg(item, E'\n' order by item))
from (
  select 'fn|' || p.oid::pg_catalog.regprocedure::text || '|' || p.prosecdef::text || '|' ||
         p.provolatile::text || '|' || (select l.lanname::text from pg_catalog.pg_language l where l.oid = p.prolang) || '|' ||
         coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') || '|' ||
         pg_catalog.pg_get_userbyid(p.proowner) || '|' || coalesce(p.proacl::text, 'default') || '|' ||
         pg_catalog.md5(p.prosrc) || '|' || coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '')
  from pg_catalog.pg_proc p
  where p.oid in (pg_catalog.to_regprocedure('app_private.refresh_customer_visit_stats(uuid[])'),
                  pg_catalog.to_regprocedure('app_private.sync_customer_visit_stats()'))
  union all
  select 'tg|' || t.tgname || '|' || t.tgenabled::text || '|' || pg_catalog.pg_get_triggerdef(t.oid)
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.reservations'::pg_catalog.regclass
    and t.tgname like 'reservations_customer_visit_stats_%'
  union all
  select 'col|' || a.attname || '|' || pg_catalog.format_type(a.atttypid, a.atttypmod) || '|' ||
         coalesce(pg_catalog.col_description(a.attrelid, a.attnum), '')
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.customers'::pg_catalog.regclass
    and a.attname in ('total_visits', 'total_revenue', 'last_visit_date')
    and not a.attisdropped
  union all
  select 'old|' || pg_catalog.count(*)::text
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.reservations'::pg_catalog.regclass
    and t.tgname = 'update_customer_stats_trigger'
  union all
  select 'oldfn|' || (pg_catalog.to_regprocedure('public.update_customer_stats()') is null)::text
  union all
  select 'hist|' || m.version || '|' || m.name || '|' || pg_catalog.array_length(m.statements, 1)::text || '|' ||
         pg_catalog.md5(pg_catalog.array_to_string(m.statements, E'\n'))
  from supabase_migrations.schema_migrations m
  where m.version = '20261023064851'
) target(item);

do $commercial_red$
declare
  unsafe_tables text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
  into unsafe_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'graphql_public')
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if unsafe_tables is not null then
    raise exception 'RED COMM-RLS-001: exposed tables without RLS: %', unsafe_tables;
  end if;
end
$commercial_red$;

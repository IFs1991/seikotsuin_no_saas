do $commercial_red$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'normalize_customer_phone'
      and (
        p.proconfig is null
        or not exists (
          select 1
          from unnest(p.proconfig) setting
          where setting like 'search_path=%'
        )
      )
  ) then
    raise exception 'RED COMM-FUNCTION-002: normalize_customer_phone has mutable search_path';
  end if;
end
$commercial_red$;

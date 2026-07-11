do $commercial_red$
declare
  unsafe_functions text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
  into unsafe_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'update_reservation_notifications_updated_at',
      'validate_shift_requests_clinic_refs'
    )
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if unsafe_functions is not null then
    raise exception 'RED COMM-FUNCTION-001: client EXECUTE remains: %', unsafe_functions;
  end if;
end
$commercial_red$;

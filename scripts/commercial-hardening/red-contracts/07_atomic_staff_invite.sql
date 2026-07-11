do $commercial_red$
declare
  function_oid oid;
begin
  function_oid := to_regprocedure(
    'public.accept_staff_invite_atomic(uuid,uuid,text)'
  );

  if function_oid is null then
    raise exception 'RED COMM-INVITE-001: atomic staff invite function is absent';
  end if;

  if has_function_privilege('anon', function_oid, 'EXECUTE')
    or has_function_privilege('authenticated', function_oid, 'EXECUTE') then
    raise exception 'RED COMM-INVITE-002: atomic staff invite function is client-executable';
  end if;
end
$commercial_red$;

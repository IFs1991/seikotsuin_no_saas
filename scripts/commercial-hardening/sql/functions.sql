with client_roles(role_name) as (
  values ('PUBLIC'::text), ('anon'), ('authenticated'), ('service_role')
)
select
  n.nspname as schema,
  p.oid::regprocedure::text as signature,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  pg_get_userbyid(p.proowner) as owner,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  coalesce(array_to_string(p.proconfig, ';'), '') as config,
  client_roles.role_name as grantee,
  case
    when client_roles.role_name = 'PUBLIC'
      then has_function_privilege('public', p.oid, 'EXECUTE')
    else has_function_privilege(client_roles.role_name, p.oid, 'EXECUTE')
  end as can_execute,
  'SEE function-callers inventory; dynamic callers UNKNOWN'::text as runtime_callers,
  'UNCLASSIFIED'::text as classification,
  'UNDECIDED'::text as expected,
  'UNKNOWN'::text as difference
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
cross join client_roles
where n.nspname in ('public', 'app_private')
order by n.nspname, p.oid::regprocedure::text, client_roles.role_name;

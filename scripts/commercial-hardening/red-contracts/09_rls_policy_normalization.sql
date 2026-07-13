do $commercial_red$
declare
  unsafe_policy_count bigint;
  unsafe_policies text;
begin
  select count(*), string_agg(
    format('%I.%I:%I', schemaname, tablename, policyname),
    ', ' order by schemaname, tablename, policyname
  )
  into unsafe_policy_count, unsafe_policies
  from pg_policies
  where schemaname = 'public'
    and (
      roles && array['public', 'anon', 'service_role']::name[]
      or policyname ~* 'service[_ ]role'
      or coalesce(qual, '') ~* 'service_role'
      or coalesce(with_check, '') ~* 'service_role'
      or coalesce(qual, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
      or coalesce(qual, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
      or coalesce(with_check, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
      or coalesce(with_check, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
    );

  if unsafe_policy_count <> 0 then
    raise exception
      'RED COMM-RLS-003: % policies retain implicit/public/service or tautological authorization: %',
      unsafe_policy_count,
      unsafe_policies;
  end if;
end
$commercial_red$;

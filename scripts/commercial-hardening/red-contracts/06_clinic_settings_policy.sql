do $commercial_red$
declare
  unsafe_policies text;
begin
  select string_agg(policyname, ', ' order by policyname)
  into unsafe_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'clinic_settings'
    and (
      coalesce(qual, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
      or coalesce(qual, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
      or coalesce(with_check, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
      or coalesce(with_check, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
    );

  if unsafe_policies is not null then
    raise exception 'RED COMM-RLS-002: clinic_settings tautological policies: %', unsafe_policies;
  end if;
end
$commercial_red$;

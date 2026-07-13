-- PR-03 removes implicit/public and service-role RLS policies. Restoring them
-- would reintroduce the authorization ambiguity this migration closes.
--
-- Preconditions:
--   * Explicit operator approval is required before running this file.
-- Data loss: none. This file performs catalog checks only.
-- Security regression: none. It never recreates a policy, restores PUBLIC as
-- a target role, or disables RLS on the legacy deny-all tables.
-- Forward-fix: disable the affected route, preserve PR-02 relation ACLs, and
-- ship a new reviewed forward migration. Never restore tautological or
-- service_role policies.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $security_preserving_rollback$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        roles <> array['authenticated']::name[]
        or policyname ~* 'service[_ ]role'
        or coalesce(qual, '') ~* 'service_role'
        or coalesce(with_check, '') ~* 'service_role'
        or coalesce(qual, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
        or coalesce(qual, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
        or coalesce(with_check, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
        or coalesce(with_check, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
      )
  ) then
    raise exception
      'PR-03 rollback refused: hardened policy-role invariants are absent';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('treatment_menu_records', 'treatments')
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ) then
    raise exception
      'PR-03 rollback refused: legacy deny-all RLS has been disabled';
  end if;

  raise notice
    'PR-03 rollback is intentionally security-preserving; no policy was changed. Use a reviewed forward-fix.';
end
$security_preserving_rollback$;

commit;

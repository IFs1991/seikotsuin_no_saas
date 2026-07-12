-- PR-02 is a security boundary and cannot be reversed to the baseline's
-- client-facing GRANT ALL/default privileges.
--
-- Preconditions:
--   * Explicit operator approval is required before running this file.
--   * Keep the PR-02 application code deployed. Older code expects direct
--     authenticated access to legacy/shared-master writes and is incompatible.
-- Data loss: none. This file performs no data or schema mutation.
-- Security regression: none. It checks selected high-risk hardened invariants
-- and never restores client or PUBLIC privileges.
-- Lock risk: catalog reads only; lock_timeout is defensive.
-- Forward-fix: disable the affected admin/analysis route if needed, then ship a
-- new least-privilege migration and matching application change. Never restore
-- the squashed baseline's GRANT ALL/default ACLs.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $security_preserving_rollback$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and (
        acl.grantee = 0
        or grantee.rolname = 'anon'
        or (
          grantee.rolname = 'authenticated'
          and acl.privilege_type in (
            'TRUNCATE',
            'REFERENCES',
            'TRIGGER',
            'MAINTAIN'
          )
        )
      )
  ) then
    raise exception
      'PR-02 rollback refused: hardened client relation ACL invariants are absent';
  end if;

  if exists (
    select 1
    from pg_roles owner_role
    left join pg_default_acl d
      on d.defaclrole = owner_role.oid
     and d.defaclnamespace = 0
     and d.defaclobjtype = 'f'
    cross join lateral aclexplode(
      coalesce(d.defaclacl, acldefault('f', owner_role.oid))
    ) acl
    where owner_role.rolname = 'postgres'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception
      'PR-02 rollback refused: postgres functions again default to PUBLIC EXECUTE';
  end if;

  raise notice
    'PR-02 rollback is intentionally security-preserving; no ACL was changed. Use a reviewed forward-fix.';
end
$security_preserving_rollback$;

commit;

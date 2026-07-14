# PR-04 `btree_gist` extension preflight

## Local-before catalog

- Captured: 2026-07-13 JST
- Target: local database on port 54332
- Local migration state: stale before PR-02/PR-03; not GREEN evidence
- Extension: `btree_gist`
- Schema: `public`
- Version: `1.7`
- Owner: `supabase_admin`
- `extrelocatable=true`

The query was read-only:

```sql
select
  e.extname,
  n.nspname as schema_name,
  e.extversion,
  e.extrelocatable,
  pg_get_userbyid(e.extowner) as owner
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'btree_gist';
```

## Hosted-before evidence

The 2026-07-11 Security Advisor snapshot reports `btree_gist` in the `public`
schema. Hosted `extrelocatable`, extension owner, dependency catalog, lock
behavior, and after state are `UNVERIFIED`.

## Dependency

`supabase/migrations/20260705000100_reservations_no_overlap.sql` creates the
extension and the validated `public.reservations.reservations_no_overlap` GiST
exclusion constraint. A move must prove that clean replay, inserts, overlap
rejection, introspection, and restore behavior remain unchanged.

## Decision

PR-04 does not move or drop the extension. Relocation is deferred to a
separate reviewed migration because hosted catalog and staging dependency
validation are missing. That future change must:

1. confirm `extrelocatable=true` on the target;
2. capture all extension-owned and dependent objects;
3. use a bounded-lock `ALTER EXTENSION btree_gist SET SCHEMA extensions` only;
4. run reservation overlap allow/deny tests and a clean replay;
5. never drop the extension or move it back to `public` in rollback;
6. capture Advisor-before/after and staging evidence.

Until that migration is approved and verified, the extension-in-public Advisor
finding remains an explicit residual risk.

# Archived SQL Reference Assets

This directory contains historical SQL and database reference files that must not
be applied to any Supabase environment.

The database source of truth is `supabase/migrations/`, with regression coverage
in `supabase/tests/` and seed data in `supabase/seed.sql`.

Archived contents:

- `src-api-database/`: old `src/api/database/*.sql` reference snapshots.
- `src-database/`: old design-reference SQL directory.
- `sql/`: old standalone SQL scripts and reports.
- `deploy_rls.sh`: old manual RLS deployment helper that referenced archived SQL.
- `stale-direct-apply-docs/`: old setup, deployment, production-migration, and
  handoff documents that instructed direct application of archived SQL.

Do not use these files for deployment, drift repair, or RLS changes. Any future
database change must use a written spec, a migration under `supabase/migrations/`,
and the required rollback plan.

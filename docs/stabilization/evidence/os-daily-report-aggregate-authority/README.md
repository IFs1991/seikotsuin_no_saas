# OS-F2 (#146) local real-DB evidence

Spec: [`spec-os-daily-report-aggregate-authority-v0.1.md`](../../spec-os-daily-report-aggregate-authority-v0.1.md)

These files come from an isolated, disposable PostgreSQL 17.6 cluster with a minimal Supabase role/auth shim, because Supabase Docker images could not be pulled in the authoring environment. They are supporting evidence only. The canonical gate is the CI `Database Contract` job (pinned Supabase CLI, clean replay, pgTAP, race verifier, generated-type diff).

| File                 | Database                                                       |
| -------------------- | -------------------------------------------------------------- |
| `catalog-before.txt` | `origin/main` `8e7ab4c` migrations + seed replayed from zero   |
| `catalog-after.txt`  | same plus `20261020170757_os_daily_report_aggregate_authority` |

Expected difference (and the only one): `daily_reports.aggregate_source` + its CHECK, triggers `daily_reports_aggregate_authority` (BEFORE) and `daily_reports_staff_clinic_check` (AFTER), functions `app_private.enforce_daily_report_aggregate_authority()` / `app_private.enforce_daily_report_staff_clinic()` / `public.save_daily_report(...)`, and `recalculate_daily_report_totals` `search_path` `public` → `""`. RLS, policies and table grants are unchanged.

Before applying to a shared or production database, capture the same snapshot with read-only catalog queries and compare (spec §9.1). The snapshot queries read only `information_schema`, `pg_catalog` and `pg_policies` plus `supabase_migrations.schema_migrations`.

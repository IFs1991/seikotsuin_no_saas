# PR-05 hosted database application evidence

Date: 2026-07-14 (Asia/Tokyo)

## Target and authorization

- Linked Supabase project: `seikotsuin-management` (`qnanuoqveidwvacvbhqp`),
  `ap-northeast-1`, PostgreSQL 17.6.
- The linked target is the hosted main project; no Supabase preview branch exists.
- The operator explicitly authorized the hosted/staging application and GitHub
  push in this task.
- Pinned Supabase CLI `2.109.0` was used. No roles, seed data, Auth settings,
  RLS policies, grants, functions, or application configuration were changed.

## Preflight and application

- Remote migration history matched local history through PR-04
  (`20260713004754`).
- `supabase db push --linked --dry-run` listed exactly one pending migration:
  `20260714041848_commercial_core_tenant_composite_fks.sql`.
- All seven relationships had zero nulls, orphans, and cross-clinic mismatches.
- Parent duplicate counts, ungranted target relation locks, and active
  transactions older than 30 seconds were all zero.
- All eight target tables had RLS enabled.
- `supabase db push --linked --yes` applied only migration `20260714041848` and
  completed successfully.

Preflight row and total-relation-size snapshot:

| Table | Rows | Total bytes |
|---|---:|---:|
| `blocks` | 0 | 73,728 |
| `care_episodes` | 0 | 32,768 |
| `customer_insurance_coverages` | 0 | 24,576 |
| `customers` | 17 | 229,376 |
| `menu_billing_profiles` | 1 | 49,152 |
| `menus` | 12 | 188,416 |
| `reservations` | 21 | 294,912 |
| `resources` | 9 | 147,456 |

## Postflight

| Check | Result |
|---|---|
| Remote migration history | PASS — local and remote match through `20260714041848` |
| Composite FK contract | PASS — exact 7; zero catalog/state drift |
| RI triggers | PASS — 28 present and 28 enabled |
| Parent tenant uniques | PASS — exact 3 |
| Child supporting indexes | PASS — exact 7 |
| Required UUID `NOT NULL` columns | PASS — all 18 |
| Data integrity | PASS — zero null/orphan/cross-clinic violations; row counts unchanged |
| RLS | PASS — all 8 target tables remain enabled |
| Generated types | PASS — hosted output matches `src/types/supabase.ts` exactly |
| Supabase security advisor | PASS for PR-05 scope — no finding concerns a PR-05 target FK or changed object |

The security advisor still reports pre-existing out-of-scope findings: twelve
RLS-enabled internal tables without policies (`INFO`), `btree_gist` in the
`public` schema (`WARN`), and leaked-password protection disabled (`WARN`).
PR-05 did not create or alter those objects or Auth settings.

## Release-boundary note

This evidence proves application to the linked hosted main database and its
immediate catalog/data/type postflight. It does not claim the separate PR-12
staging clone, canary observation, disaster-recovery drill, or production
release-qualification gates are complete.

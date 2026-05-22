# Insurance Fee System Master Phase 3A-1 Spec v0.9

## Target Repository

Phase 3A-1 targets this repository and workspace:

```txt
C:\Users\seekf\Desktop\seikotsuin_management_saas
```

Any v0.9 proposal assumption that the insurance fee system master is being
stabilized in another repository is superseded here. This repo-local spec must
fit the already landed contracts in:

- `docs/stabilization/spec-revenue-context-phase1-v0.5.md`
- `docs/stabilization/spec-revenue-estimates-phase3-v0.5.md`

## Boundary

Phase 3A-1 is for management revenue estimates, not claim-final billing.
Insurance fee system master values are estimate inputs or estimate provenance
only. They do not prove the amount that will be submitted, adjudicated, paid,
or finalized for a claim.

The Phase 3 estimate disclaimer remains fixed wherever a Phase 3A-1 master
value contributes to an estimate:

```txt
経営分析用の概算です。請求確定額ではありません。
```

Phase 3A-1 must not rename an estimate into a claim amount, expose a master
lookup as a claim-final price, or remove existing `needs_review` behavior to
make an estimate appear final.

## Agreed Traffic Accident Rule

For `revenue_context_code=traffic_accident`, an official insurance fee system
master must not auto-fill or auto-calculate a unit price. The prohibited path
includes automatic master-derived `unit_price`, `unit_amount`, estimate line
amount, daily report `fee`, or estimate total that would make traffic-accident
pricing look system-determined.

A manually entered `fee` may remain as a management estimate input for a
traffic-accident item. If that fee is retained in `revenue_estimates`, the
result must remain a `needs_review` estimate with the traffic-accident review
warning and the fixed Phase 3 disclaimer. A manual amount must not change the
status to `calculated` or remove the review warning.

## System Master Tables

Task 1 creates these six system master tables:

- `public.insurance_fee_sources`: source identity, publisher, source kind, and
  source-level metadata.
- `public.insurance_fee_source_snapshots`: captured source revisions used as
  schedule inputs.
- `public.insurance_fee_schedules`: effective schedule revisions derived from a
  source snapshot.
- `public.insurance_fee_items`: item-level amount and calculation-condition
  master entries and the traffic-accident automatic amount guard.
- `public.insurance_fee_warning_definitions`: warning definitions available to
  later estimate review logic.
- `public.insurance_fee_revision_diffs`: stored item-level differences between
  two schedule revisions.

## Task 1 Scope

Phase 3A-1 Task 1 is the repo-local migration step for the insurance fee system
master boundary. This PR owns:

- `supabase/migrations/20260521000100_insurance_fee_system_master_phase3a.sql`
  to create the six system master tables listed above;
- `supabase/rollbacks/20260521000100_insurance_fee_system_master_phase3a_rollback.sql`
  to drop those Task 1 objects in dependency order if rollback is approved;
- table constraints, foreign keys, supporting indexes, `updated_at` triggers
  where the table has `updated_at`, RLS enablement, authenticated read-only
  grants/policies, service-role grants, and table comments for the six tables;
- the `public.insurance_fee_items` database guard that prevents
  `traffic_accident` schedule items from exposing an automatic `amount_yen`;
- the active schedule non-overlap trigger for a shared
  `profession_type x payer_context_code` date window;
- the schedule revision guard that rejects ordinary updates to locked or
  superseded schedules;
- one item mutation guard that rejects mutations for locked or superseded
  schedules and keeps traffic-accident amount checks on the same schedule read;
- focused migration verification for the Task 1 objects and that
  traffic-accident guard.

Task 1 must also preserve these boundaries:

- Define the master boundary used by insurance management estimates before a
  later calculator or claim workflow depends on it.
- Keep the master/version/effective-date provenance distinguishable from
  `daily_report_items.fee` and from Phase 3 estimate snapshots.
- Keep estimate output on the existing Phase 3 `revenue_estimates` contract and
  disclaimer contract without linking estimates to Task 1 master tables yet.
- Preserve Phase 1 revenue contexts and Phase 3 warning/status semantics,
  including manual traffic-accident fees as `needs_review` estimates.

## Deferred After Task 1

These are explicitly deferred from this PR:

- a resolver or lookup service that selects an applicable schedule or item by
  effective date, revision, visit facts, or revenue context;
- CLI or batch tooling to capture source snapshots, import fee rows, generate
  revision diffs, refresh master data, or seed official tariff content;
- linking `revenue_estimates`, estimate lines, recalculation routes, or
  estimate warnings to the Task 1 system master tables;
- any automatic insurance master pricing flow beyond storing the Task 1 master
  schema and its traffic-accident guard.

## Non-Scope

Phase 3A-1 does not include:

- claim submission, insurer adjudication, payment reconciliation, or any
  claim-final amount SSOT;
- an official traffic-accident automatic tariff, automatic unit-price lookup,
  or review-free traffic-accident estimate path;
- workers-compensation official pricing completion;
- retroactive rewriting of existing `daily_report_items.fee`, existing
  estimate snapshots, manual overrides, or Phase 1 revenue classifications;
- broad replacement of the current Phase 3 fee/manual estimate policy;
- resolver, CLI, ingestion, and revenue-estimate linking work deferred after
  Task 1;
- unrelated admin master-data cleanup, billing feature expansion, or migration
  work outside the fee system master boundary.

## Rollback Risk

Task 1 rollback is destructive. Running
`supabase/rollbacks/20260521000100_insurance_fee_system_master_phase3a_rollback.sql`
drops all six Task 1 tables:

- `public.insurance_fee_revision_diffs`
- `public.insurance_fee_warning_definitions`
- `public.insurance_fee_items`
- `public.insurance_fee_schedules`
- `public.insurance_fee_source_snapshots`
- `public.insurance_fee_sources`

Dropping those tables loses any loaded source metadata, source snapshots,
schedule revisions, fee items, warning definitions, and stored revision diffs.
Because resolver, CLI ingestion, and revenue-estimate linking are deferred,
Task 1 rollback must not rewrite current Phase 3 estimate snapshots, manual
overrides, or traffic-accident `needs_review` status.

Dump or otherwise preserve Task 1 master data before an approved rollback when
the tables contain data that cannot be recreated deterministically. Destructive
local replay such as `supabase db reset --local` still requires explicit
approval under repo rules.

## Verification

Use the npm scripts defined in this repository. Non-destructive Task 1 checks
are:

```powershell
npm run type-check
npm run test -- --runTestsByPath src/__tests__/api/insurance-fee-system-master-phase3a-migration.test.ts src/__tests__/lib/revenue-estimate.test.ts src/__tests__/api/revenue-estimates-recalculate-route.test.ts
npm run build
```

Task 1 migration verification must prove:

- the six system master tables, Task 1 rollback, RLS/grant shape, and required
  master constraints exist;
- `public.insurance_fee_items` rejects a `traffic_accident` schedule item that
  exposes automatic `amount_yen`;
- no Task 1 migration changes claim-final surfaces or links master rows into
  current Phase 3 revenue estimates.

Because Task 1 adds a migration, also verify the implementation with the
applicable repo DoD commands:

```powershell
supabase db push --local --dry-run
npm run supabase:types
npm run test -- --ci --testPathIgnorePatterns=e2e
```

Do not claim migration replay coverage from `supabase db reset --local` unless
that approved destructive local reset was actually run.

## DoD Tie-In

Phase 3A-1 contributes to `docs/stabilization/DoD-v0.1.md` as follows:

- `DOD-04`: migration work must leave schema drift visible through
  `supabase db push --local --dry-run`.
- `DOD-08`: any clinic-scoped master or estimate access must preserve the RLS
  and tenant boundary; no public helper or client-only bypass is introduced.
- `DOD-10`: `npm run build` remains green after master/type integration.
- `DOD-11`: focused Jest coverage and the non-E2E Jest regression suite cover
  the estimate boundary and traffic-accident guard.
- `DOD-12`: Supabase-generated type output is checked when schema work changes
  generated types.

Phase 3A-1 Task 1 is not complete if it weakens the Phase 3 disclaimer, turns
an estimate into a claim-final surface, adds an official master-derived
traffic-accident auto-unit-price path, or pulls deferred resolver/CLI/estimate
linking work into this migration PR.

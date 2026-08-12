# Function Runtime Contract Remediation Spec v0.1

## Goal

Repair the five runtime errors and three `plpgsql_check` warnings identified after the CRM/LINE Growth rollout without changing public RPC signatures, execution modes, or role grants.

## Runtime Contract

- `confirm_daily_report_item_pricing` keeps its atomic pricing workflow and service-role-only `SECURITY DEFINER` boundary. Its upsert targets `revenue_estimates_unique_item` by constraint name so the output parameter `daily_report_item_id` cannot make the conflict target ambiguous.
- `check_reservation_conflict` keeps the existing reservation/block/no-conflict result shape and explicitly returns `varchar` conflict types. `get_available_time_slots` remains a compatible transitive caller.
- `calculate_churn_risk_score` reads the current `patient_visit_summary` SSOT. It mirrors the application rule: no visit is 0; the expected gap is 30 days for a single visit or `max(14, round(treatment_period_days / (visit_count - 1)))`; ratios over 1/2/3/4 map to 35/60/80/95, with a 55 floor for a single visit overdue by more than 14 days.
- `get_invite_by_token` explicitly converts the clinic's `varchar` name to its declared `text` result and remains service-role-only.
- `analyze_staff_efficiency` reads `resources` and completed/arrived `reservations`, filters an inclusive JST period of at least one day, and preserves the existing neutral satisfaction factor of 3 because no satisfaction SSOT exists.
- `predict_revenue` relies on the implicit integer loop variable instead of shadowing it with an unused declaration.
- `convert_shift_requests` keeps its transaction-scoped advisory lock and all conversion behavior. Runtime-neutral `PRAGMA:TABLE` declarations describe its two temporary tables to `plpgsql_check`.

## Security and Compatibility

- Function argument names, defaults, return columns, volatility, owners, and generated Supabase types remain compatible.
- `confirm_daily_report_item_pricing`, `convert_shift_requests`, and `get_invite_by_token` remain inaccessible to `PUBLIC`, `anon`, and `authenticated`, with `service_role` execution only.
- `check_reservation_conflict`, `calculate_churn_risk_score`, `analyze_staff_efficiency`, and `predict_revenue` remain `SECURITY INVOKER` functions with their legacy execution grants. RLS and clinic predicates remain the data boundary.
- Migration and rollback guards compare each function's complete non-owner `EXECUTE` ACL and reject unexpected roles or any `WITH GRANT OPTION` delegation.
- No RLS policy, table grant, API route, UI, dependency, or generated type is changed.

## Verification

- Apply the append-only migration locally, execute pgTAP runtime and privilege tests, and require schema lint to report none of the original five errors or three warnings.
- Rebuild the local database from the full migration history and rerun pgTAP.
- Run related Jest, TypeScript, ESLint, build, route inventory, migration history, generated-type drift, and secret/security checks.
- Push the verified commit only to `codex/line-crm-data-foundation`. Remote Supabase migration application is a separate approval gate.

## Rollback Strategy

The previous function bodies are known to fail at runtime, so the rollback SQL is intentionally validation-only. It refuses to report success unless the repaired definitions, security modes, search paths, and execution grants remain present. A production rollback must use a reviewed forward migration rather than restoring the broken bodies.

## DoD Mapping

- DOD-04 / DOD-08: privileged functions retain fixed search paths, least-privilege execution, RLS, and clinic-scoped queries.
- DOD-09: transitive RPC callers retain their public signatures and result shapes.
- DOD-10: generated type drift, type-check, lint, and build must pass.
- DOD-11: pgTAP and targeted Jest cover the repaired runtime paths and privilege boundaries.

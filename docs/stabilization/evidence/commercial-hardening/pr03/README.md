# Commercial hardening PR-03 evidence

## Scope

PR-03 normalizes every retained `public` schema RLS policy to the explicit
`authenticated` database role, removes 17 redundant service-role policies,
removes the two tautological `clinic_settings` policies, consolidates the
reviewed duplicate/subsumed groups, wraps seven newer `auth.uid()` references
for initplan evaluation, and enables deny-all RLS on the two legacy treatment
tables.

The source specification is
`docs/stabilization/spec-commercial-hardening-migration-v1.0.md` PR-03 and
Sections 8.4-8.6. The detailed decisions are in `policy-matrix.csv`.

## Before state and RED

- PR-00 catalog: 212 policies, including 168 with implicit `{public}` roles.
- PR-02 adds four explicit shared-master policies, making the expected PR-03
  preflight catalog 216 policies.
- `COMM-RLS-003` reproduced 168 implicit/public, service-semantic, or
  tautological policies before the migration.
- `commercial-pr03-migration-contract.test.ts` failed before the migration
  existed.

## Migration and recovery

- Forward migration:
  `supabase/migrations/20260712235120_commercial_rls_role_policy_normalization.sql`
- Security-preserving recovery guard:
  `supabase/rollbacks/20260712235120_commercial_rls_role_policy_normalization_rollback.sql`
- The rollback never recreates a public/service policy or disables RLS. An
  incident must use route disablement plus a reviewed forward-fix.

## Expected catalog after replay

- 191 policies in `public`.
- Every retained policy targets exactly `{authenticated}`.
- No policy name, role, `USING`, or `WITH CHECK` references `service_role`.
- Every policy has a `PR-03:` catalog comment.
- `treatment_menu_records` and `treatments` have RLS enabled and no client
  policy.
- Unassigned and revoked managers cannot read or update another clinic.

## Verification status

Implementation-time results are recorded here after the approved clean local
replay. Production/linked migration application, hosted Advisor recapture,
branch protection, staging, canary, and production smoke remain operator-owned
and must not be inferred from local results.

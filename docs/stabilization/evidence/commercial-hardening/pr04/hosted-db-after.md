# PR-04 linked hosted database after-state

- Date: 2026-07-13 (Asia/Tokyo)
- Target project: `qnanuoqveidwvacvbhqp`
- Approval: explicit user approval obtained before remote `db push`
- Result: PASS

## Apply sequence

1. `supabase migration list --linked`
   - Local and remote matched through `20260712235120`.
   - The only pending migration was
     `20260713004754_commercial_function_execution_hardening.sql`.
2. `supabase db push --linked --dry-run`
   - PASS; the output listed only the PR-04 migration above.
3. `supabase db push --linked --yes`
   - PASS; PR-04 was applied successfully.
4. `supabase migration list --linked`
   - PASS; local and remote matched through `20260713004754`.

The CLI emitted an existing `[inbucket]` configuration deprecation warning.
It did not block migration apply and is outside PR-04's function-execution
scope.

## Independent catalog verification

Read-only remote catalog queries reported:

- `app_private` functions: 12;
- exact non-owner EXECUTE entries: 28;
- PUBLIC EXECUTE entries: 0;
- exact non-owner schema `USAGE` entries: 4, held only by `anon`,
  `authenticated`, `service_role`, and `supabase_auth_admin`.

`supabase db advisors --linked --type security --level info --fail-on none`
reported no PR-04 function-execution finding. Existing unrelated findings
remain for RLS-enabled internal tables without client policies, `btree_gist`
in `public`, and disabled Auth leaked-password protection. PR-04 deliberately
does not weaken the fail-closed internal-table posture or relocate the
extension.

## Hosted Auth boundary

This database apply did not modify Hosted Auth configuration. A later,
authorized Dashboard attempt was rejected by Supabase's Pro-or-above plan gate,
so leaked-password protection remains disabled. The user approved skipping the
paid-plan setting for PR-04. See `hosted-auth-plan-gate.md` and
`docs/operations/COMMERCIAL_PR04_LEAKED_PASSWORD_PROTECTION.md`.

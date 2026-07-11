# PR-00 RED evidence

All entries distinguish an expected contract failure from an infrastructure or syntax failure.

| Contract | Command / mechanism | Observed result | Status |
|---|---|---|---|
| Local DB security contracts | `npm run commercial:red:db` | All 9 files returned their mapped marker: `COMM-RLS-001`, `COMM-GRANT-001`, `COMM-FUNCTION-001`, `COMM-FUNCTION-002`, `COMM-FK-001`, `COMM-FK-002`, `COMM-RLS-002`, `COMM-INVITE-001`, `COMM-AUTH-001` | RED reproduced |
| Stale remote generated types | `node scripts/commercial-hardening/verify-generated-types.mjs --project-id qnanuoqveidwvacvbhqp --write` | `COMM-TYPES-001`; committed `7dbf841c...` != remote `a9966e89...` | RED reproduced |
| Local generated types | `npm run commercial:red:types:local` | Fresh local output equals committed hash | Unexpected-for-global-claim GREEN; confirms drift is remote/local, not a false generator failure |
| Unclassified mutation routes | `npm run commercial:red:routes` | `COMM-ROUTE-001`: 117 handlers remain unclassified | RED reproduced |
| Non-atomic invite simulation | `npm run commercial:red:invite` | Dedicated server-only Jest test emits `RED COMM-INVITE-003: PARTIAL_COMMIT_STATE_MISMATCH` only when failure leaves mutated state; wrapper requires that full marker | RED reproduced |
| Parent clinic rehome | `05_parent_rehome_fixture.sql` through the mapped DB runner | Rehome succeeds and produces a cross-clinic reservation relation (`COMM-FK-002`) | RED reproduced |
| Profile self-escalation + cross-tenant settings | `08_profile_self_escalation.sql` through the mapped DB runner | An authenticated staff user changes own `role`/`clinic_id`, sees both tenant settings, and updates the original tenant (`COMM-AUTH-001`) | RED reproduced |
| Fixture cleanup | read-only fixed-UUID row count after DB RED run across both writing fixtures | auth.users=0, clinic_settings=0, clinics=0, customers=0, profiles=0, reservations=0 | PASS (rollback proven) |

The initial version of the DB runner accepted any non-zero CLI result. Independent review caught this false-positive risk before evidence was accepted. The runner now combines stdout/stderr and requires the exact marker mapped to each SQL file. The composite-FK array type error and multi-statement fixture incompatibility found in that review were also corrected before the results above were recorded.

The initial invite wrapper could also accept an unrelated failure because its short marker appeared in the suite title. Final review caught that risk: the suite title no longer contains the marker, the post-failure state comparison alone emits the full marker, and the wrapper requires that exact string.

Cleanup was verified with one read-only query using the fixtures' fixed `f000...` and `f100...` UUID ranges. It counted matching rows in `auth.users`, `public.clinic_settings`, `public.clinics`, `public.customers`, `public.profiles`, and `public.reservations`; every count was zero.

No contract is GREENed in PR-00; remediation belongs to PR-01 through PR-10 in the specification order.

# PR-04 Hosted Auth plan-gate evidence

- Date: 2026-07-14 (Asia/Tokyo)
- Target project: `qnanuoqveidwvacvbhqp`
- Requested setting: leaked-password protection
- Result: `SKIPPED_PLAN_GATED`

An authorized operator attempted to enable leaked-password protection from the
Supabase Dashboard. Supabase rejected the update because Have I Been Pwned
leaked-password protection is available only on the Pro Plan and above. No
Hosted Auth configuration change was applied.

The user then explicitly directed the task to skip this paid-plan setting and
continue PR-04. No password, access token, Auth configuration response, or user
identifier is retained as evidence.

Official references:

- <https://supabase.com/docs/guides/auth/password-security>
- <https://supabase.com/pricing>

## Residual risk and reopen conditions

The Security Advisor finding `auth_leaked_password_protection` remains an
accepted, visible residual risk while the project stays on a plan that does
not include the feature. It must not be reported as fixed or verified.

Reopen this operational step only after all of the following are true:

1. the project is on Pro or above;
2. a fresh explicit production Auth-change approval is recorded;
3. login, password-reset, invite, and support recovery fixtures are ready;
4. the runbook's before/after and Advisor verification can be completed.

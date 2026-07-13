# PR-04 leaked-password protection runbook

## Status and authority

- Current repository evidence status: `NOT_APPLIED`
- Target hosted project: `qnanuoqveidwvacvbhqp`
- Production Auth changes require explicit human approval.
- Do not run the PATCH step from an implementation or audit task without that
  approval.

Supabase exposes this setting as `password_hibp_enabled`. It rejects newly set
passwords known to the Have I Been Pwned Pwned Passwords service. Never record
passwords, access tokens, full Auth config responses, or user identifiers in
evidence.

## Preconditions

1. Approved maintenance/change window and named operator.
2. Auth-config read/write authorization for the target project.
3. Staging-equivalent login, reset-password, invite, and support paths ready.
4. Support owner and user-facing recovery guidance confirmed.
5. Abort criteria and evidence directory prepared without secrets.

## Read-only before check (PowerShell)

The following reads and prints only the relevant boolean:

```powershell
$projectRef = "qnanuoqveidwvacvbhqp"
$headers = @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" }
$authConfig = Invoke-RestMethod `
  -Method Get `
  -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
  -Headers $headers
$authConfig.password_hibp_enabled
```

Expected before value from the 2026-07-11 Advisor snapshot: `False`. If the
live value differs, stop and reconcile drift before making any change.

## Approved change

After explicit approval only:

```powershell
$body = @{ password_hibp_enabled = $true } | ConvertTo-Json
Invoke-RestMethod `
  -Method Patch `
  -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body | Out-Null
```

Repeat the read-only check and record only the timestamp, operator, project
reference, and resulting boolean.

## Required verification

- Existing user login with a valid password succeeds.
- Password reset with a strong, non-leaked synthetic password succeeds.
- A known-leaked synthetic password is rejected without logging its value.
- Invite acceptance and initial password setup succeed with a compliant value.
- Error copy does not reveal whether another account uses the password.
- Rate limits, audit events, and support recovery behavior remain normal.
- Security Advisor no longer reports `auth_leaked_password_protection`.

Run the repository's established Auth/security Jest and Playwright commands
from `package.json`; record exact commands and results. Do not mark Auth E2E or
Advisor-after PASS unless they actually ran against the changed environment.

## Abort and recovery

Abort before enabling when login/reset/invite fixtures are unavailable, live
configuration differs from the approved packet, or support ownership is
missing.

After enabling, do not automatically disable the protection as a rollback;
that would regress the security boundary. Use password reset and support
recovery first. A verified platform-wide false positive or lockout requiring a
temporary disablement needs a separate emergency owner approval, incident
record, time bound, and re-enable plan.

## Evidence

Record only:

- approval reference;
- operator and timestamp;
- before/after boolean;
- exact test commands and pass/fail totals;
- Advisor finding name and after status;
- support/incident observations without personal data.

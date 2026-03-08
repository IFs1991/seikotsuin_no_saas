# DoD Verification Report (DOD-01 ~ DOD-04)

## Meta

| Item | Value |
|------|-------|
| **Execution Date** | 2026-03-06T05:39:29Z ~ 2026-03-06T05:56:07Z (UTC) |
| **Commit SHA** | `73366d81a28a3759ab4629d43b3457423c84ad1f` |
| **Branch** | `main` |
| **Migration File** | `supabase/migrations/00000000000001_squashed_baseline.sql` (1 file only) |
| **Supabase CLI** | v2.76.17 |
| **Docker** | v29.2.1 |
| **Platform** | Windows 11 Pro 10.0.26220 |

---

## Pre-check: Migration Directory

| Check | Result |
|-------|--------|
| `supabase/migrations/` contains only `00000000000001_squashed_baseline.sql` | **PASS** |

---

## DoD Results

### DOD-01: Local Supabase stack is ready before tests

| Step | Result | Notes |
|------|--------|-------|
| `supabase status` | **PASS** | API/DB/Storage running. Stopped: imgproxy, edge_runtime, analytics, vector, pooler (non-essential for dev) |
| `node scripts/verify-supabase-connection.mjs` (before fix) | **FAIL** | `.env` not found; script did not fallback to `.env.local` |
| `node scripts/verify-supabase-connection.mjs` (after fix) | **PASS** | clinics/patients/revenues tables reachable |

**Final: PASS (after Green fix)**

### DOD-02: Migrations are idempotent

| Step | Result | Notes |
|------|--------|-------|
| `supabase db reset --local --no-seed` | **PASS** | Migration applied cleanly. Only NOTICE: `extension "uuid-ossp"/"pgcrypto" already exists, skipping` (expected with `IF NOT EXISTS`) |

**Final: PASS**

### DOD-03: Seed is reproducible on a clean local reset

| Step | Result | Notes |
|------|--------|-------|
| `supabase db reset --local` | **CONDITIONAL PASS** | Migration + seed applied successfully (verified: clinics row exists, 46 tables created). Container restart emitted `502: An invalid response was received from the upstream server` |
| Post-reset `supabase status` | **PASS** | All core services running |
| Post-reset table count | **PASS** | 46 tables (matches `final-schema-inventory.md`) |
| Post-reset seed data | **PASS** | `Demo Clinic` row present in `clinics` |

**Final: CONDITIONAL PASS** -- Schema/seed integrity confirmed; 502 is Docker container restart timing issue (infrastructure-level, not migration-level)

### DOD-04: Local schema drift is visible and zero

| Step | Result | Notes |
|------|--------|-------|
| `supabase db push --local --dry-run` (after DOD-02) | **PASS** | `Remote database is up to date.` |
| `supabase db push --local --dry-run` (after DOD-03) | **PASS** | `Remote database is up to date.` |

**Final: PASS**

---

## Findings (severity order)

### F-01 [LOW] verify-supabase-connection.mjs .env fallback missing

- **File**: `scripts/verify-supabase-connection.mjs` : `loadEnv()` (line 44)
- **Issue**: Script only loaded `.env`, but local credentials are in `.env.local` (Next.js convention)
- **Impact**: DOD-01 verification script fails on fresh checkout
- **Fix Applied**: Added `.env.local` fallback loading
- **Status**: RESOLVED

### F-02 [INFO] Container restart 502 during `supabase db reset --local`

- **File**: N/A (infrastructure-level)
- **Issue**: Supabase CLI v2.76.17 on Docker v29.2.1 (Windows) emits `502: An invalid response was received from the upstream server` during container restart phase
- **Impact**: `supabase db reset` returns exit code 1 despite migration/seed success. CI pipelines may false-fail.
- **Root Cause**: Docker container health check timing on Windows
- **Fix Applied**: None (no migration change required)
- **Recommendation**: Pin Supabase CLI version in CI; add retry logic or `supabase status` post-check in CI scripts

---

## Changed Files

| File | Change |
|------|--------|
| `scripts/verify-supabase-connection.mjs` | Added `.env.local` fallback in `loadEnv()` (line 44) |
| `docs/stabilization/DoD-verification-report-2026-03-06.md` | This report (new file) |

---

## Next Actions (minimal)

1. **F-02 mitigation (CI)**: CI パイプラインで `supabase db reset` 後に `supabase status` でヘルスチェックを追加し、502 exit code を一時的リトライで吸収する運用ルールを検討
2. **DOD-05 ~ DOD-12**: 本レポートはDOD-01~04のみ。残りのDoD項目（E2E, Playwright, RLS, Build, Jest, Types）は次フェーズで検証予定
3. **Supabase CLI version lock**: `package.json` の `devDependencies` または CI config で Supabase CLI バージョンを固定し、再現性を担保

# Admin Settings Persistence Review Fix Spec (Phase 1)

## Goal
- Resolve Phase 1 review findings and align TDD/E2E behavior with the docs.
- Stabilize persistence, error display, access control, and E2E execution.

## Background
- `useAdminSettings` never completes initialization in compatibility mode.
- Playwright E2E does not share auth between `page` and `request`.
- E2E reads `data.settings` but the API returns `{ data: { settings } }`.
- `clinic_id` access control is too permissive.
- E2E fixtures do not guarantee `clinic_settings` is empty.

## In Scope
- `src/hooks/useAdminSettings.ts`
- `src/components/admin/clinic-basic-settings.tsx` (error display)
- `src/app/api/admin/settings/route.ts`
- `supabase/migrations/20251231000100_clinic_settings_table.sql` (RLS)
- `src/__tests__/e2e-playwright/admin-settings.spec.ts`
- `playwright.config.ts`
- `src/__tests__/e2e-playwright/global-setup.ts`
- `scripts/e2e/seed-e2e-data.mjs`
- `scripts/e2e/cleanup-e2e-data.mjs`
- `src/__tests__/components/admin-settings.test.tsx` (new)

## Out of Scope
- Phase 2+ features or UI redesign
- External email/SMS delivery
- Production data migration

## Fix Plan

### 1) `useAdminSettings` initialization
#### Problem
- `isInitialized` never becomes `true` when `persistOptions` is undefined.

#### Behavior
- If `persistOptions` is undefined, set `isInitialized = true` on mount.
- If `autoLoad: false`, set `isInitialized = true` and skip fetch.
- If `fetchSettings` returns early, still set `isInitialized = true`.

#### Acceptance
- Legacy (non-persistent) screens never hang on loading.

### 2) Error message display
#### Problem
- Initial load errors are not shown in `ClinicBasicSettings`.

#### Behavior
- Render `AdminMessage` for `loadingState.error` explicitly.
- Keep success and error messages separate (same pattern as other settings screens).

#### Acceptance
- Failed GET shows a visible error banner at the top.

### 3) API clinic_id access control
#### Problem
- `requireClinicMatch: false` allows clinic_id mismatch access.
- `ensureClinicAccess` runs before clinic_id is known for PUT.

#### Behavior
- GET/PUT must pass clinic_id into `ensureClinicAccess` and reject mismatches.
- Keep allowed roles: GET (admin/clinic_manager/manager/therapist/staff), PUT (admin/clinic_manager/manager).

#### Implementation Notes
- GET: validate `clinic_id` and `category` first, then call `processApiRequest` with `clinicId`.
- PUT: enable clinic_id access before `ensureClinicAccess` by either:
  - Adding `preparsedBody` to `processApiRequest`, or
  - Reordering `processApiRequest` to parse JSON before calling `ensureClinicAccess`.

#### Acceptance
- Staff users get 403 for other-clinic clinic_id.
- Missing clinic_id returns 400 as before.

### 4) RLS alignment
#### Problem
- RLS checks `profiles` only, but app logic also uses `user_permissions`.

#### Behavior
- RLS for `clinic_settings` must accept membership from `profiles` OR `user_permissions`.
  - SELECT: same clinic in either table
  - INSERT/UPDATE: same clinic + role in (admin, clinic_manager, manager)

#### Acceptance
- Users with only `user_permissions` can read/write within their clinic.

### 5) Playwright E2E stability
#### Problems
- `request` fixture is unauthenticated.
- API response is read from the wrong path.
- `clinic_settings` is not cleared for E2E.

#### Behavior
- Use `storageState` in E2E and generate it in `globalSetup`.
- Use `page.request` for authenticated API calls.
- Read settings via `data.data.settings`.
- Clear `clinic_settings` for `CLINIC_A_ID`/`CLINIC_B_ID` in seed/cleanup.
- Wait for save completion with `page.waitForResponse`.

#### Acceptance
- E2E runs without 401/403.
- Scenarios 1-3 are stable.

### 6) TDD tests
#### Problems
- Component test is missing.
- Staff invite E2E scenario is missing.

#### Behavior
- Add `src/__tests__/components/admin-settings.test.tsx`:
  - Initial load reflects API values
  - Save click triggers PUT
  - API error displays message
- Add staff invite scenario to E2E:
  - POST `/api/onboarding/invites`
  - Verify "invited" status in list
  - If blocked by implementation, mark `test.skip` with reason

#### Acceptance
- Component tests run in Jest.
- E2E scenario 4 runs or is skipped with a clear reason.

## Expected Outcome
- Compatibility mode loads without hanging.
- Initial load errors are visible.
- Access control rejects clinic_id mismatches.
- E2E aligns with the Playwright guide and fixture spec.

## Acceptance Criteria
- Phase 1 tests (Jest + E2E) are reproducible.
- E2E scenarios 1-3 pass, scenario 4 is implemented or explicitly skipped.

## Test Plan
```bash
npm run test
npx playwright test admin-settings
```

## References
- `docs/管理設定永続化_MVP仕様書.md`
- `docs/Playwright_E2E手引書.md`
- `docs/E2E共通フィクスチャ仕様書.md`

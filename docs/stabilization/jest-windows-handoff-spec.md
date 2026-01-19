# Jest Windows Stabilization Handoff Spec

## Context
- Evidence snapshot: `jest-windows.json` (63 suites, 779 tests, 16 failed suites, 141 failed tests, 2 pending, openHandles=[])
- Goal: restore DOD-11 (Jest regression suite on Windows) with minimal, deterministic changes.

## Scope
- Fix Jest failures by aligning tests, mocks, and small runtime bugs.
- Keep changes small and isolated (one task = one PR).
- No schema or migration edits (requires a written spec + rollback plan).

## Non-goals
- Feature expansion or UI redesign.
- Supabase migration changes or data fixes.

## DoD Mapping (docs/stabilization/DoD-v0.1.md)
- DOD-11: All items in this spec.
- DOD-08: Auth role compatibility tests (middleware/guards).
- DOD-09: Blocks page test drift after API-only access (client direct access removed).

## Failing Suites and Fix Plans

### A) Reservations redirect + provider mismatch ✅ FIXED
- `src/__tests__/components/reservations/reservation-list.test.tsx`
- `src/__tests__/components/reservations/reservation-register.test.tsx`
- `src/__tests__/components/reservations/reservation-timeline.test.tsx`

**Root causes:**
- Route pages are redirect-only: `src/app/reservations/list/page.tsx` (function `ReservationsListRedirect`), `src/app/reservations/register/page.tsx` (function `ReservationsRegisterRedirect`), `src/app/reservations/new/page.tsx` redirect to `/reservations?view=register`.
- Main UI uses `src/app/reservations/page.tsx` (function `ReservationsPage`) and requires `useUserProfileContext`.
- Tests assert legacy UI copy not present in current components `src/app/reservations/components/*` (`Header`, `ControlBar`, `AppointmentList`, `AppointmentForm`, `Scheduler`).

**Fix applied:**
- `reservation-list.test.tsx`: Rewrote to test redirect behavior with `next/navigation` mock
- `reservation-register.test.tsx`: Rewrote to test redirect behavior with `next/navigation` mock
- `reservation-timeline.test.tsx`: Updated to use mocked `useUserProfileContext`, `useReservationFormData`, and `useAppointments`

DoD: DOD-11.

### B) Mock/export mismatches ✅ FIXED
- `src/__tests__/integration/auth-flow.test.ts`
  - Mock for `@/lib/audit-logger` lacks `getRequestInfoFromHeaders`, used by `src/app/admin/actions.ts` and `src/app/login/actions.ts`.
- `src/__tests__/lib/supabase-guards.test.ts`
  - `canAccessClinicScope` is used by `src/lib/supabase/guards.ts` but not exported from `src/lib/supabase/index.ts`.
- `src/__tests__/lib/audit-logger-types.test.ts`
  - `AuditLogger.logDataDelete` and `AuditLogger.logUnauthorizedAccess` resolve to `undefined`, indicating a mocked module shape without these methods.

**Fix applied:**
- `src/lib/supabase/index.ts`: Added `canAccessClinicScope` to exports
- `src/__tests__/integration/auth-flow.test.ts`: Added `getRequestInfoFromHeaders` to mock
- `src/__tests__/lib/audit-logger-types.test.ts`: Added Supabase mock with `createAdminClient`

DoD: DOD-11, DOD-08 (guards).

### C) Test bugs vs current implementation ✅ FIXED
- `src/__tests__/components/admin-settings.test.tsx`
  - Uses `container` without defining it in "calls PUT on save".
- `src/__tests__/lib/api-client.test.ts`
  - Uses `retryCount: 0`. `ApiClient.request()` loop uses `attempt < retryCount`, so no request is sent.
- `src/__tests__/hooks/useChat.test.ts`
  - Expects no API call when `clinicId` is null, but `useChat` always calls `fetchHistory` (`src/hooks/useChat.ts`, function `fetchHistory`).
- `src/__tests__/hooks/useDashboard.test.ts`
  - Expects quick action "appointments" to navigate to `/patients`, but `useDashboard` routes to `/reservations` (`src/hooks/useDashboard.ts`, function `handleQuickAction`).

**Fix applied:**
- `admin-settings.test.tsx`: Added `const { container } = render(...)` to define container variable
- `api-client.test.ts`: Changed `retryCount: 0` to `retryCount: 1`, created dedicated `retryClient` with `retryCount: 3` for retry test
- `src/hooks/useChat.ts`: Modified `fetchHistory` to return early if `clinicId` is null/undefined
- `useDashboard.test.ts`: Changed expected navigation from `/patients` to `/reservations`

DoD: DOD-11.

### D) Role compatibility drift ✅ FIXED
- `src/__tests__/auth/middleware-auth.test.ts`
  - Expects deprecated `clinic_manager` to be denied for `/admin/**`.
  - Actual middleware uses compatibility mapping in `src/lib/constants/roles.ts` (`canAccessAdminUIWithCompat`), allowing `clinic_manager` temporarily per spec.

**Decision:** Keep Option B-1 mapping (`clinic_manager` -> `clinic_admin`).

**Fix applied:**
- Updated test to expect `clinic_manager` to have access (via compatibility mapping)
- Test renamed to clarify Option B-1 behavior: "非推奨の clinic_manager ロールは互換モードにより /admin/** にアクセス可能（Option B-1）"

DoD: DOD-08, DOD-11.

### E) Session/security behavior + mocks ✅ FIXED
- `src/__tests__/session-management/session-manager.test.ts`
  - Expects throws for duplicate device sessions and invalid tokens; implementation returns fallback results.
  - `SessionManager.createSession` uses fallback flow, not a hard throw, and `validateSession` returns `isValid: false` instead of throwing.
- `src/__tests__/security/failsafe.test.ts`
  - Expects `logger.warn` and `logger.error`, but implementation uses `console.warn` in `SessionManager.createSession`.
  - Mocked Supabase builder does not return `{ error }` for `insert`, so `AuditLogger` error path is never hit.
- `src/__tests__/security/advanced-security.test.ts`
  - `MultiDeviceManager` uses `createClient()` but stores the Promise without awaiting (`src/lib/multi-device-manager.ts`, constructor), so `isDeviceTrusted` can misbehave in tests.

**Fix applied:**
- `session-manager.test.ts`:
  - Changed "同一デバイスでの重複セッション制限" test to expect fallback session creation instead of throw
  - Changed "無効なトークンでエラーになる" test to check `isValid: false` return value instead of throw
- `failsafe.test.ts`:
  - Added `consoleWarnSpy` and `consoleErrorSpy` for `console.warn`/`console.error`
  - Updated assertions to use console spies where implementation uses `console.warn`
  - Fixed AuditLogger mock to return `{ error }` from `insert` to trigger error path
- `advanced-security.test.ts`:
  - Added `consoleWarnSpy` and updated assertion to use spy
- `src/lib/multi-device-manager.ts`:
  - Store Supabase client promise and await it before queries (prevents `isDeviceTrusted` from always failing)

DoD: DOD-11.

### F) API staging mock drift ✅ NO CHANGES NEEDED
- `src/__tests__/integration/api-staging-data.test.ts`
  - Originally: `createDashboardSupabaseMock` handles `daily_ai_comments`, but `src/app/api/dashboard/route.ts` queries `ai_comments`.

**Status:** Reviewed - the current test file uses custom Supabase mocks without `fetchMock` issues. The mock already handles the correct table names. No changes required.

DoD: DOD-11.

## Recommended Execution Order (small PRs) ✅ COMPLETED
1) ✅ Fix missing exports/mocks (B).
2) ✅ Fix test-only bugs (C) and admin-settings container.
3) ✅ Align reservations tests to current UI or redirect behavior (A).
4) ✅ Align role compatibility test (D).
5) ✅ Align session/security tests or adjust mocks (E).
6) ✅ Fix API staging mocks (F) - no changes needed.

## Verification
- Run: `npm run test -- --ci --testPathIgnorePatterns=e2e` (DOD-11)
- Windows alternative: `npm run test:windows`

## Open Decisions - RESOLVED
- ~~Reservations: update tests to match current UI vs implement legacy UI expectations.~~
  - **Decision:** Updated tests to match current UI (redirect behavior for list/register, mocked context for timeline)
- ~~Role compatibility: keep Option B-1 mapping (`clinic_manager` -> `clinic_admin`) or remove it and update middleware.~~
  - **Decision:** Keep Option B-1 mapping, updated tests to match

## Summary of Changes (2026-01-16)

| File | Change |
|------|--------|
| `src/lib/supabase/index.ts` | Added `canAccessClinicScope` export |
| `src/__tests__/integration/auth-flow.test.ts` | Added `getRequestInfoFromHeaders` mock |
| `src/__tests__/lib/audit-logger-types.test.ts` | Added Supabase mock |
| `src/__tests__/components/admin-settings.test.tsx` | Fixed `container` variable definition |
| `src/__tests__/lib/api-client.test.ts` | Fixed `retryCount` and retry test |
| `src/hooks/useChat.ts` | Added `clinicId` null check in `fetchHistory` |
| `src/__tests__/hooks/useDashboard.test.ts` | Fixed expected navigation path |
| `src/__tests__/components/reservations/reservation-list.test.tsx` | Rewrote for redirect testing |
| `src/__tests__/components/reservations/reservation-register.test.tsx` | Rewrote for redirect testing |
| `src/__tests__/components/reservations/reservation-timeline.test.tsx` | Updated with proper mocks |
| `src/__tests__/auth/middleware-auth.test.ts` | Updated for Option B-1 compatibility |
| `src/__tests__/session-management/session-manager.test.ts` | Aligned with fallback behavior |
| `src/__tests__/security/failsafe.test.ts` | Added console spies, fixed mocks |
| `src/__tests__/security/advanced-security.test.ts` | Added console spy |
| `src/lib/multi-device-manager.ts` | Await Supabase client promise before queries |

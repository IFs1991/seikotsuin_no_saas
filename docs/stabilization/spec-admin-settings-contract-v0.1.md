# Admin Settings Contract and E2E Selector Spec v0.1

## Overview
- Purpose: Align admin settings UI payloads with the persistence API and stabilize E2E selectors.
- DoD: DOD-06 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: **High**
- Risk: **Data save failures in production**
- Status: Implemented (booking calendar + system security + selectors + persistence hook stability + profile fallback + audit log best-effort)

## Evidence (Prior Behavior)

### Critical: UI/API Schema Mismatch (Resolved)

| Field | UI (src/components/admin/booking-calendar-settings.tsx) | API (src/app/api/admin/settings/route.ts BookingCalendarSchema) |
|-------|---------------------------------------------------------|------------------------------------------------------------------|
| Slot duration | slotDuration | slotMinutes |
| Max bookings | maxSimultaneousBookings | maxConcurrent |
| Week start | weekStartsOn | weekStartDay |

Impact: UI payload keys were rejected by the API schema, causing data loss on save.
Resolution: UI keys aligned to API contract and API schema extended for missing booking fields.

### E2E Selector Issues (Resolved)
- src/components/admin/system-settings.tsx: 2FA used a checkbox input (no switch role)
- src/__tests__/e2e-playwright/admin-settings.spec.ts: expected getByRole('switch') for 2FA
- Save button label differed between UI and test expectations
Resolution: data-testid hooks added and E2E updated to use them.

## Booking Calendar Contract (Current)

Decision: Align UI to API schema (API is the source of truth).

| BookingSettings key | Persisted in API | Notes |
|---------------------|------------------|-------|
| slotMinutes | yes | booking calendar slot length |
| maxConcurrent | yes | max concurrent bookings |
| weekStartDay | yes | 0 = Sunday, 1 = Monday |
| maxAdvanceBookingDays | yes | days in advance |
| minAdvanceBookingHours | yes | hours in advance |
| allowCancellation | yes | toggle for cancellation |
| cancellationDeadlineHours | yes | deadline in hours |
| defaultCalendarView | yes | day/week/month |
| allowOnlineBooking | yes | toggle only |
| online.* | no | local-only until API support |
| notifications.* | no | local-only until API support |

## Implementation (Applied)

### 1. UI/API contract alignment (P0, Done)

```typescript
// booking-calendar-settings.tsx - AFTER
interface BookingSettings {
  slotMinutes: number;
  maxConcurrent: number;
  weekStartDay: 0 | 1;
  maxAdvanceBookingDays: number;
  minAdvanceBookingHours: number;
  allowCancellation: boolean;
  cancellationDeadlineHours: number;
  defaultCalendarView: 'day' | 'week' | 'month';
  allowOnlineBooking: boolean;
}
// Online/notification settings are kept in local component state.
```

### 2. API schema + defaults extended (P0, Done)

```typescript
const BookingCalendarSchema = z.object({
  slotMinutes: z.number().min(5).max(180).optional(),
  maxConcurrent: z.number().min(1).max(100).optional(),
  weekStartDay: z.number().min(0).max(6).optional(),
  allowOnlineBooking: z.boolean().optional(),
  maxAdvanceBookingDays: z.number().min(1).max(365).optional(),
  minAdvanceBookingHours: z.number().min(0).max(48).optional(),
  allowCancellation: z.boolean().optional(),
  cancellationDeadlineHours: z.number().min(0).max(168).optional(),
  defaultCalendarView: z.enum(['day', 'week', 'month']).optional(),
});
```

Also update DEFAULT_SETTINGS.booking_calendar to include the same keys.

### 3. Stable selectors for E2E (P1, Done)

Add data-testid attributes to interactive elements:

```tsx
<select data-testid="slot-duration-select" ... />
<Input data-testid="max-concurrent-input" ... />
<select data-testid="week-start-select" ... />
<Button data-testid="save-settings-button" ... />
<Switch data-testid="2fa-toggle" ... />
<Input data-testid="session-timeout-input" ... />
<AdminMessage data-testid="success-message" ... />
<AdminMessage data-testid="error-message" ... />
```

### 4. E2E tests updated to data-testid (P1, Done)

```typescript
await page.getByTestId('slot-duration-select').selectOption('30');
await page.getByTestId('max-concurrent-input').fill('5');
await page.getByTestId('save-settings-button').click();
await expect(page.getByTestId('success-message')).toBeVisible();

const toggle = page.getByTestId('2fa-toggle');
await toggle.click();
await expect(toggle).toHaveAttribute('aria-checked', 'true');
```

### 4.1. E2E waits for settings readiness (P1, Done)

Problem: dynamic imports + settings fetch can leave a brief loading state that
disables the Save button and causes Playwright timeouts (DOD-06).

Resolution: wait for the loading label to disappear and for section headings
to be visible before interacting.

```typescript
await expect(page.getByText('設定を読み込み中...')).toBeHidden();
await expect(
  page.getByRole('heading', { name: '自動通知メール', level: 1 })
).toBeVisible();
```

Reload wait (Windows/Next.js dev):

```typescript
// load が不安定なため DOMContentLoaded まで待機し、UIのロード完了を別途確認
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByText('設定を読み込み中...')).toBeHidden();
```

### 5. useAdminSettings persistOptions stabilization (P1, Done)

Problem: persistOptions object was created inline per render, which retriggered
autoLoad fetches and kept `loadingState.isLoading` true. This blocked saves and
caused E2E timeouts (DOD-06). Fetch state also used the same isLoading flag,
disabling Save during initial loads.

Resolution: key hook behavior off primitive values and reset initialization when
fetching.

```typescript
const clinicId = persistOptions?.clinicId ?? null;
const category = persistOptions?.category ?? null;
const autoLoad = persistOptions?.autoLoad;
const hasPersist = Boolean(clinicId && category);

useEffect(() => {
  if (!hasPersist) {
    setIsInitialized(true);
    return;
  }
  if (autoLoad === false) {
    setIsInitialized(true);
    return;
  }
  fetchSettings();
}, [autoLoad, fetchSettings, hasPersist]);
```

Save button stabilization:

```typescript
// useAdminSettings.ts
// Fetch uses isInitialized for load gating; save-only uses loadingState.isLoading.
setLoadingState(prev => ({ ...prev, error: null, savedMessage: '' }));
```

Fetch timeout guard:

```typescript
const FETCH_TIMEOUT_MS = 8000;
const abortController = new AbortController();
const timeoutId = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);
const response = await fetch(url, { signal: abortController.signal });
```

### 5.1. Admin settings save does not block on audit logging (P1, Done)

Problem: `AuditLogger.logAdminAction` can fail or hang (e.g., missing `audit_logs` table
or service-role availability), preventing the `PUT /api/admin/settings` response and
keeping the UI in "保存中..." state (DOD-06).

Resolution: make audit logging best-effort so saves return immediately.

```typescript
// src/app/api/admin/settings/route.ts
void AuditLogger.logAdminAction(/* ... */);
```

### 6. Shared profile context reuse (P1, Done)

Problem: admin settings components called `useUserProfile` directly, which
re-issued `/api/auth/profile` and kept the settings view in a loading state
in Playwright runs (DOD-06).

Resolution: `useUserProfile` now reuses `UserProfileProvider` context when
available, so settings pages consume the already-loaded profile instead of
fetching again.

```typescript
// useUserProfile.ts
const context = useOptionalUserProfileContext();
if (context) {
  return { profile: context.profile, loading: context.loading, error: context.error };
}
```

### 6.1. Profile fetch timeout + session/cookie fallback (P1, Done)

Problem: `/api/auth/profile` fetch can stall in Playwright, leaving `profileLoading`
true and admin settings stuck at "設定を読み込み中..." (DOD-06).

Resolution: `useUserProfile` seeds profile from the auth cookie on initial render,
falls back to Supabase session metadata when needed, times out the session fetch
to avoid hangs, and aborts the profile fetch after a short timeout to avoid
infinite loading.

```typescript
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const SESSION_FETCH_TIMEOUT_MS = 2000;
const sessionResult = await Promise.race([
  supabase.auth.getSession(),
  new Promise<null>(resolve => setTimeout(resolve, SESSION_FETCH_TIMEOUT_MS)),
]);
if (sessionResult?.data?.session?.user) {
  setProfile(buildProfileFromUser(sessionResult.data.session.user));
}

const res = await fetch('/api/auth/profile', { signal: abortController.signal });
```

## Required data-testid List

| Component | Element | data-testid |
|-----------|---------|-------------|
| BookingCalendarSettings | Slot duration select | slot-duration-select |
| BookingCalendarSettings | Max concurrent input | max-concurrent-input |
| BookingCalendarSettings | Week start select | week-start-select |
| BookingCalendarSettings | Save button | save-settings-button |
| SystemSettings | 2FA toggle | 2fa-toggle |
| SystemSettings | Session timeout input | session-timeout-input |
| SystemSettings | Save button | save-settings-button |
| CommunicationSettings | Save button | save-settings-button |
| AdminSaveButton (e.g., ClinicBasicSettings) | Save button | save-settings-button |
| AdminMessage (all settings pages) | Success message | success-message |
| AdminMessage (all settings pages) | Error message | error-message |

## Non-goals
- Persisting online booking detail fields and notification settings (remain local-only).
- Schema or migration changes (settings stored as JSONB).

## Acceptance Criteria (DoD)
- DOD-06: src/__tests__/e2e-playwright/admin-settings.spec.ts completes without selector or validation failures.
- Booking calendar saves/loads with API-aligned keys without key mismatch errors.
- Interactive elements in scope expose stable data-testid attributes.

## Rollback
- If UI changes regress layout, revert UI changes and stabilize tests via data-testid as a temporary measure.
- Rollback steps:
  1. Revert key renaming in src/components/admin/booking-calendar-settings.tsx
  2. Revert BookingCalendarSchema extensions in src/app/api/admin/settings/route.ts
  3. Update E2E tests to use data-testid only as a temporary shim

## Verification

```bash
# Run admin settings E2E tests
npm run test:e2e:pw -- src/__tests__/e2e-playwright/admin-settings.spec.ts

# Manual verification
# 1. Go to /admin/settings
# 2. Open Booking Calendar settings
# 3. Change slot duration to 45 minutes
# 4. Click Save
# 5. Refresh page
# 6. Verify slot duration is still 45 minutes
```

Expected: save/reload scenarios complete without timeouts or data loss.

## Handoff Note (2026-01-18)

- 次のチームにエラー解消を引き継ぐ。
- 直近のテスト結果: `admin-settings.spec.ts` で UI系が一部失敗。API系の `GET`/`clinic_id` エラーは通過。
- 調査・修正の対象: `admin-settings.spec.ts` の SMTP/セキュリティ/予約枠、`PUT /api/admin/settings` の安定性。

## Files Updated
- src/components/admin/booking-calendar-settings.tsx
- src/components/admin/system-settings.tsx
- src/components/admin/communication-settings.tsx
- src/components/admin/AdminMessage.tsx
- src/components/admin/AdminSaveButton.tsx
- src/app/api/admin/settings/route.ts
- src/__tests__/e2e-playwright/admin-settings.spec.ts
- src/types/admin.ts
- src/hooks/useAdminSettings.ts
- src/hooks/useUserProfile.ts
- src/providers/user-profile-context.tsx
- src/types/user-profile.ts
- src/components/navigation/header.tsx
- src/components/master/master-data-form.tsx
- src/app/admin/(protected)/settings/page.tsx

## Migration Notes

If existing settings data exists with old keys:

```sql
-- One-time migration for existing clinic_settings
UPDATE clinic_settings
SET settings = jsonb_set(settings, '{slotMinutes}', settings->'slotDuration', true)
WHERE category = 'booking_calendar'
  AND settings ? 'slotDuration';

UPDATE clinic_settings
SET settings = jsonb_set(settings, '{maxConcurrent}', settings->'maxSimultaneousBookings', true)
WHERE category = 'booking_calendar'
  AND settings ? 'maxSimultaneousBookings';

UPDATE clinic_settings
SET settings = jsonb_set(settings, '{weekStartDay}', settings->'weekStartsOn', true)
WHERE category = 'booking_calendar'
  AND settings ? 'weekStartsOn';

UPDATE clinic_settings
SET settings = jsonb_set(settings, '{defaultCalendarView}', settings->'defaultView', true)
WHERE category = 'booking_calendar'
  AND settings ? 'defaultView';

UPDATE clinic_settings
SET settings = jsonb_set(settings, '{maxAdvanceBookingDays}', settings->'maxAdvanceBooking', true)
WHERE category = 'booking_calendar'
  AND settings ? 'maxAdvanceBooking';

UPDATE clinic_settings
SET settings = jsonb_set(settings, '{minAdvanceBookingHours}', settings->'minAdvanceBooking', true)
WHERE category = 'booking_calendar'
  AND settings ? 'minAdvanceBooking';

UPDATE clinic_settings
SET settings = jsonb_set(settings, '{cancellationDeadlineHours}', settings->'cancellationDeadline', true)
WHERE category = 'booking_calendar'
  AND settings ? 'cancellationDeadline';
```

Note: allowOnlineBooking previously lived under online.isEnabled in the UI and was never persisted.

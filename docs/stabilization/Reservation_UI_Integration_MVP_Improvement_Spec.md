# Reservation UI Integration MVP Improvement Spec (E2E excluded)

## Purpose
- Stabilize the reservation UI by fixing state consistency, error handling, and duplicate customer creation.
- Provide implementation guidance for non-E2E improvements (UI, logic, unit/integration tests).

## Background / Issues
- Update flows reflect changes before API success, causing UI state drift on failures.
- The unconfirmed reservations modal does not re-sync with parent state and cannot recover on confirm failures.
- Reservation creation always creates a new customer, which can generate duplicates.
- Errors are surfaced via `alert`, which is weak for in-context recovery.

## In Scope
- `src/app/reservations/page.tsx`
- `src/app/reservations/hooks/useAppointments.ts`
- `src/app/reservations/components/AppointmentForm.tsx`
- `src/app/reservations/components/AppointmentDetail.tsx`
- `src/app/reservations/components/UnconfirmedReservationsModal.tsx`
- `src/app/reservations/api.ts`
- `src/__tests__/components/reservations/*` (unit/integration)

## Out of Scope
- E2E tests (Playwright, fixtures, seed, global-setup)
- Legacy prototype removal or relocation
- DB schema/RLS changes

## Detailed Requirements

### 1) Update Flow Consistency (no premature UI update)
**Policy**
- Only update UI state after the API confirms success.
- On failure, keep prior state and show a visible error.

**Requirements**
- `useAppointments.updateAppointment` and `moveAppointment` return a result (`Promise<boolean>` or `Promise<{ ok: boolean; error?: string }>`).
- `ReservationsPage.handleUpdateAppointment` updates `selectedAppointment` only on success; on failure, show an error message in the UI.
- `handleConfirmPending` follows the same rule; on failure the item remains in the modal list.

**Acceptance**
- When API update fails, list/detail states remain unchanged.
- Users see a visible error and can retry.

### 2) Unconfirmed Reservations Modal Sync and Recovery
**Policy**
- The modal must track the latest `pendingAppointments`.
- Confirmation failures must not remove items from the list.

**Requirements**
- Sync the modal list when `appointments` changes (use `useEffect` or remove local list state).
- Remove an item from the modal only after `onConfirm` succeeds.
- Show an in-modal error when confirmation fails.

**Acceptance**
- Modal contents always reflect the latest pending reservations.
- Failed confirmations keep the reservation visible and show an error.

### 3) Prevent Duplicate Customers on Reservation Create
**Policy**
- Reuse an existing customer when a clear match exists.

**Requirements**
- Add a customer lookup helper in `src/app/reservations/api.ts` (e.g., `fetchCustomers` using `GET /api/customers?clinic_id=...&q=...`).
- In `AppointmentForm`, look up an existing customer by phone (exact match) before creating a new one.
- Only call `createCustomer` when there is no match.

**Acceptance**
- If a customer with the same phone exists, `createCustomer` is not called and the reservation uses the existing customer ID.
- If no match exists, a new customer is created as before.

### 4) In-Context Error Messaging for Form and Update
**Policy**
- Avoid `alert` for recoverable errors; use inline messages.

**Requirements**
- Add `errorMessage` state in `AppointmentForm` and render it in the form.
- Surface API error details (including 409 conflict) in the form.
- In `AppointmentDetail`, keep edit mode on failure and show a message in the modal.

**Acceptance**
- Create/update failures show visible in-context messages.
- Form inputs remain intact after failures for retry.

## Test Strategy (non-E2E)
- Unit/integration updates should cover:
  - `AppointmentForm` reuses existing customer and skips `createCustomer`.
  - Create failure renders a form error message.
  - `UnconfirmedReservationsModal` re-syncs when appointments change.
  - Update failure does not overwrite `selectedAppointment`.

## Global Acceptance
- Update/confirm failures do not corrupt UI state.
- Pending reservations remain consistent and recoverable.
- Duplicate customer creation is prevented in common flows.
- Errors are visible and actionable.

## Target Files
- `src/app/reservations/page.tsx`
- `src/app/reservations/hooks/useAppointments.ts`
- `src/app/reservations/components/AppointmentForm.tsx`
- `src/app/reservations/components/AppointmentDetail.tsx`
- `src/app/reservations/components/UnconfirmedReservationsModal.tsx`
- `src/app/reservations/api.ts`
- `src/__tests__/components/reservations/*`

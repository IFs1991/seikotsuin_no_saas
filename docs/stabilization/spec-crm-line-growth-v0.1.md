# CRM Data Foundation & LINE Growth Features v0.1 — Implementation Spec

Source: `docs/Tiramisu_CRM_Data_Foundation_and_Line_Growth_Features_Spec_v0.1.md`

## Scope

This implementation extends the current canonical `customers` model. In this
repository, `customers.id` is the patient identity used by `reservations` and
all existing customer APIs. The legacy `patients` table and the retired
`patient_profiles` name are not reintroduced.

The first delivery provides the data foundation, staff-assisted UI, and LINE flow:

- identity aliases and candidate scoring for staff-assisted reservation entry;
- an explicit candidate decision dialog before manual patient/reservation writes;
- LINE-authenticated staff preference registration from the existing LIFF My Page;
- clinic-scoped staff availability events;
- relationship-filtered LINE outbox notifications;
- notification-to-reservation attribution and a relationship-first reward record.

AI is intentionally not used to auto-confirm identity. Candidate scoring is a
deterministic, reviewable ranking and never mutates the selected patient.
Manual booking requires the receptionist to choose an existing candidate or
explicitly register a new patient whenever candidates exist. Changing the
name, phone, staff, or menu invalidates the previous choice.

## Security and tenant rules

- Every new table has `clinic_id`, RLS enabled, and direct `anon`/
  `authenticated` table privileges revoked. Server APIs use the existing
  service-role scoped contexts after validating clinic ownership or LINE ID
  token audience.
- Composite foreign keys bind customer, staff, event, notification, reward,
  and reservation references to the same clinic.
- LINE preference APIs accept only a verified LINE ID token for the requested
  clinic. The token's `sub` is the only patient lookup key for that flow.
- Manual candidate lookup is authenticated staff access and is clinic-scoped.
- Candidate discovery requires at least one of name, phone, or LINE ID and
  includes exact `patient_identity_aliases.normalized_alias` matches before
  returning the highest-scored ten candidates.
- Staff preference GET/PUT is limited to active, bookable staff with a
  completed/arrived treatment history for the LINE-linked patient.

## Data mapping

| Source specification             | Current implementation                     |
| -------------------------------- | ------------------------------------------ |
| `patient_id`                     | `customers.id`                             |
| `patient_profiles.display_name`  | `customers.name`                           |
| `patient_profiles.phonetic_name` | `customers.name_kana`                      |
| `staff_id`                       | `resources.id` where `type = 'staff'`      |
| LINE delivery                    | existing `line_message_outbox` + processor |

## Fixed notification slot and attribution

Only patients who have a completed/arrived reservation with the staff member,
have a current `customers.line_user_id`, and have an enabled
`patient_staff_preferences` row receive an availability message. A message
contains a booking URL with the availability event ID. The public event lookup
requires a LINE ID token for the same clinic audience and only exposes the
notified staff and start time to the intended patient. The booking UI fixes
those values; an invalid, expired, cancelled, or booked notification does not
silently fall back to ordinary booking. The patient must explicitly select
“通常予約に切り替える”.

An `availability_event_id` reservation requires a valid LINE token. The server
rejects a different staff or start time with 409 even if the client UI is
bypassed.

## Atomic state transitions

All mutation functions are `SECURITY INVOKER`, have a fixed search path, and
are executable only by `service_role`:

- `create_staff_availability_event` validates the staff resource, JST 14-day
  horizon, current LINE identity, preference, and completed/arrived history,
  then creates event, notification, and LINE outbox rows in one transaction.
- `create_staff_availability_reservation` locks the event and intended
  notification with `FOR UPDATE`, revalidates clinic/customer/LINE/staff/time
  and state, then creates the reservation, books both state rows, and issues
  one reward in one transaction. Concurrent claims leave only one reservation
  and one reward.
- `finalize_staff_availability_delivery` verifies the clinic-scoped
  outbox/notification relationship and changes both delivery states in one
  transaction. Update errors and missing relationships are not ignored.

## Rollback

Use `supabase/rollbacks/20260811155532_crm_line_growth_foundation_rollback.sql`.
The rollback drops the three functions before the five feature tables, then
removes the feature-specific outbox composite uniqueness constraint. It
deliberately retains the customer/resource/reservation composite
tenant-integrity constraints that protect existing tables.

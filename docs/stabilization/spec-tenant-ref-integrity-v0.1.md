# Tenant Reference Integrity (Reservations) Spec v0.1

## Overview
- Purpose: enforce same-clinic references for reservation-domain tables.
- DoD: DOD-08 (docs/stabilization/DoD-v0.1.md).
- Priority: High
- Risk: cross-tenant data corruption via mismatched foreign keys.
- Status: DRAFT

## Evidence (current behavior)
- `supabase/migrations/20251104000100_reservation_system_schema.sql`:
  - `public.reservations.customer_id`, `menu_id`, `staff_id` are id-only FKs.
  - `public.blocks.resource_id` and `public.reservation_history.reservation_id` are id-only FKs.
- `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`:
  - Adds `clinic_id` to reservation-related tables but does not enforce same-clinic references.

## Scope
- Tables: reservations, blocks, reservation_history.
- References: customers, menus, resources, reservations.
- Out of scope: composite PK/FK redesign, legacy `appointments`, non-reservation domains.

## Decisions
- Add BEFORE INSERT/UPDATE triggers to validate `NEW.clinic_id` equals referenced row `clinic_id`.
- Allow `menus.clinic_id IS NULL` (global menu) to be referenced.
- Require `reservations.clinic_id`, `blocks.clinic_id`, `reservation_history.clinic_id` to be non-null.
- Update reservation_history logging functions to set `clinic_id`.

## Plan (implementation)
1. Add migration `supabase/migrations/20260127000300_tenant_ref_integrity_triggers.sql`.
2. Create trigger functions:
   - `public.validate_reservations_clinic_refs()`
   - `public.validate_blocks_clinic_refs()`
   - `public.validate_reservation_history_clinic_refs()`
3. Attach triggers to tables (reservations/blocks/reservation_history).
4. Update `log_reservation_created/updated/deleted` to insert `clinic_id`.

## Rollback plan
- SQL: `docs/stabilization/rollbacks/20260127000300_tenant_ref_integrity_triggers_rollback.sql`.
- Steps:
  1. Drop the new validation triggers and functions.
  2. Restore `log_reservation_*` functions to pre-change definitions (no clinic_id insert).
- Rollback risk: cross-clinic references are no longer prevented at the DB layer.

## Acceptance criteria (DoD)
- Inserts/updates with mismatched clinic references are rejected for reservations, blocks, and reservation_history.
- Reservation history rows store `clinic_id` that matches the referenced reservation.
- DOD-08 tenant boundary remains consistent without RLS changes.

## Verification
- Attempt insert with mismatched `customer_id`/`menu_id`/`staff_id` and confirm failure.
- Insert with correct references succeeds.

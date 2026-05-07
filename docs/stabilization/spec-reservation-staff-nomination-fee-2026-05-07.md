# Reservation Staff Nomination Fee

## Purpose

Add patient-requested staff nomination support without changing RLS or tenant
scope behavior.

## Database Changes

- `public.resources.nomination_fee numeric(10,2) not null default 0`
- `public.reservations.is_staff_requested boolean not null default false`
- `public.reservations.staff_nomination_fee numeric(10,2) not null default 0`
- Non-negative check constraints on both fee columns.
- `public.reservation_list_view` exposes `is_staff_requested` and
  `staff_nomination_fee`.

## Application Rules

- Staff nomination fee is configured per `resources` row.
- Reservations store a fee snapshot so later staff setting changes do not
  rewrite historical reservation prices.
- Reservation APIs calculate `price` server-side from menu price, selected
  option price deltas, and the nomination fee snapshot.
- `actual_price` remains untouched by automatic recalculation.

## Rollback

Use `supabase/rollbacks/20260507000400_staff_nomination_fee_rollback.sql` to
restore the previous view definition and remove the added columns/constraints.

# Admin Notifications Realtime Spec v0.1

## Scope

- Enable the admin header notification UI to receive `public.notifications` changes through Supabase Realtime.
- Keep tenant isolation in the application layer through `/api/admin/notifications` and `createScopedAdminContext`.
- This spec supports `DOD-08` tenant boundary consistency and `DOD-10` reproducible build checks in `docs/stabilization/DoD-v0.1.md`.

## Change

- Add `public.notifications` to the `supabase_realtime` publication when the publication exists.
- Do not alter table columns, RLS policies, grants, indexes, or existing notification data.
- The app still uses `/api/admin/notifications` as the source of truth after receiving realtime events.

## Rollback Plan

- Run `supabase/rollbacks/20260422000100_admin_notifications_realtime_rollback.sql`.
- The rollback removes only `public.notifications` from the `supabase_realtime` publication when present.
- Existing notifications, RLS policies, and API behavior remain intact.

## Verification

- Static migration test: `src/__tests__/api/admin-notifications-realtime-migration.test.ts`.
- App verification: `npm run type-check`, targeted Jest tests, `npm run lint`, and `npm run build`.

# Admin AI Chat Cross-Tenant Alignment Spec v0.1

## Purpose

Align `public.chat_sessions.user_id` with the application and RLS assumption that the value is `auth.users.id`.

Current drift:

- `src/app/api/chat/route.ts` writes `user.id` from Supabase Auth into `chat_sessions.user_id`.
- Baseline RLS policies in `supabase/migrations/00000000000001_squashed_baseline.sql` compare `chat_sessions.user_id` to `auth.uid()`.
- The existing FK `chat_sessions_user_id_fkey` still points to `public.user_permissions(id)`.
- `public.user_permissions.staff_id` is the value corresponding to `auth.users.id`.

This change supports admin AI chat and cross-tenant analysis by making the FK match the auth identity used by API and RLS, while preserving `chat_sessions.user_id` as nullable for unresolvable legacy rows.

## Scope

Files:

- Forward migration: `supabase/migrations/20260422000200_admin_ai_chat_alignment.sql`
- Rollback SQL: `supabase/rollbacks/20260422000200_admin_ai_chat_alignment_rollback.sql`
- Spec: `docs/stabilization/spec-admin-ai-cross-tenant-v0.1.md`

Tables and settings:

- `public.chat_sessions.user_id`: FK changes from `public.user_permissions(id)` to `auth.users(id)`, column remains nullable.
- `public.chat_sessions` RLS policies: `chat_sessions_select`, `chat_sessions_insert`, `chat_sessions_update`, `chat_sessions_delete`.
- `public.chat_messages` RLS policies: `chat_messages_select`, `chat_messages_insert`.
- Indexes: add non-duplicative sort-support indexes for session message history and clinic session lists.
- Realtime publication: add `public.chat_messages` to `supabase_realtime` only when the publication exists.

Out of scope:

- No API route changes.
- No generated Supabase type changes.
- No `supabase db push`, `supabase db reset`, or `supabase migration up`.
- No change to historical migration files.

## Forward Migration

`supabase/migrations/20260422000200_admin_ai_chat_alignment.sql` must:

1. Drop the existing `chat_sessions_user_id_fkey`.
2. Convert resolvable legacy values from `user_permissions.id` to `user_permissions.staff_id` only when `staff_id` exists in `auth.users(id)`.
3. Set any remaining non-auth `chat_sessions.user_id` values to `NULL` before adding the new FK, so FK addition cannot fail on unresolvable legacy rows.
4. Re-add `chat_sessions_user_id_fkey` against `auth.users(id)` with `ON DELETE SET NULL`.
5. Keep `chat_sessions.user_id` nullable.
6. Recreate chat RLS policies around these scopes:
   - Session owner: `chat_sessions.user_id = auth.uid()`.
   - Scoped admins: `public.get_current_role() in ('admin', 'clinic_admin')` and `public.can_access_clinic(clinic_id)` for `clinic_id IS NOT NULL`.
   - Global admin sessions: `clinic_id IS NULL` requires `public.jwt_is_admin()`.
7. Add indexes only where they do not duplicate baseline indexes:
   - `idx_chat_messages_session_created_at_desc` on `public.chat_messages(session_id, created_at DESC)`.
   - `idx_chat_sessions_clinic_updated_at_desc` on `public.chat_sessions(clinic_id, updated_at DESC)`.
8. Add `public.chat_messages` to `supabase_realtime` only if the publication exists and the table is not already present.

## RLS Contract

`public.chat_sessions`:

- `SELECT`: owner can read own sessions; `admin` and `clinic_admin` can read sessions in clinics allowed by `public.can_access_clinic(clinic_id)`; `clinic_id IS NULL` is readable only by `public.jwt_is_admin()`.
- `INSERT`: owner can create own sessions in accessible clinic scope; `admin` and `clinic_admin` can create scoped clinic sessions; `clinic_id IS NULL` can be created only by `public.jwt_is_admin()`.
- `UPDATE`: same scope as insert, with the new row also constrained to the same scope.
- `DELETE`: limited to `admin` and `clinic_admin` for accessible clinic sessions; `clinic_id IS NULL` requires `public.jwt_is_admin()`.

`public.chat_messages`:

- `SELECT`: allowed when the parent session is visible under the `chat_sessions` select scope.
- `INSERT`: allowed when the parent session is writable under the `chat_sessions` insert/update scope.

The important boundary is that `clinic_id IS NULL` represents an admin-level chat session and is not accessible to `clinic_admin` unless `public.jwt_is_admin()` is true.

## Rollback Policy

`supabase/rollbacks/20260422000200_admin_ai_chat_alignment_rollback.sql` must:

1. Remove `public.chat_messages` from `supabase_realtime` when present.
2. Drop indexes added by the forward migration.
3. Drop the auth FK.
4. Convert values back from `auth.users.id` to `public.user_permissions.id` where `user_permissions.staff_id = chat_sessions.user_id`.
5. Set any remaining values that cannot be mapped back to `public.user_permissions(id)` to `NULL`.
6. Re-add `chat_sessions_user_id_fkey` against `public.user_permissions(id)` with the baseline `ON DELETE CASCADE` behavior.
7. Recreate baseline chat RLS policy definitions.

Rollback cannot reconstruct unmapped legacy `user_permissions.id` values after forward migration has nulled them; those rows intentionally remain `NULL`.

## Manual Push Procedure

Do not run these commands from this task. Manual operator procedure:

1. Review this spec and both SQL files.
2. On a disposable local database, run `supabase db push --local --dry-run` and confirm only the approved chat FK/RLS/index/realtime changes appear. This maps to DOD-04.
3. Apply the migration in a controlled environment through the team's normal Supabase migration workflow.
4. Verify policy definitions with a targeted query against `pg_policies` for `chat_sessions` and `chat_messages`. This maps to DOD-08.
5. Regenerate types with `npm run supabase:types` after the migration is applied. This maps to DOD-12.
6. Run chat API and relevant E2E checks after application changes are present. This maps to DOD-09, DOD-10, and DOD-11.

## DoD Mapping

- DOD-02: Migration and rollback use idempotent `IF EXISTS` / `IF NOT EXISTS` guards for policies, indexes, FK, and publication membership.
- DOD-04: Schema drift should be limited to `chat_sessions_user_id_fkey`, the two added indexes, chat RLS policy replacement, and `public.chat_messages` realtime membership.
- DOD-08: Chat RLS uses one scope model: `auth.uid()`, `public.get_current_role()`, `public.jwt_is_admin()`, and `public.can_access_clinic(clinic_id)`.
- DOD-09: Tenant boundary is enforced at RLS for `chat_sessions` and inherited by `chat_messages`.
- DOD-12: `src/types/supabase.ts` should be regenerated only after the migration is intentionally applied.

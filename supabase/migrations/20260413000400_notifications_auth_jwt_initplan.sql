-- ================================================================
-- Migration: Notifications auth.jwt() Init Plan Fix
-- ================================================================
-- File:    20260413000400_notifications_auth_jwt_initplan.sql
-- Created: 2026-04-13
-- Purpose:
--   Fix the remaining Auth RLS Initialization Plan warning on
--   public.notifications without changing RLS semantics.
-- Safety:
--   - Keep the same policy name
--   - Keep the same USING truth conditions
--   - Do not change roles, grants, or policy count
-- Related:
--   - docs/stabilization/performance-advisor-meaning-preserving-plan-v0.1.md
-- ================================================================

begin;

alter policy "Users can view their own notifications"
    on public.notifications
    using (
        (((select auth.uid()) = user_id)
         or (
             (clinic_id is not null)
             and ((((select auth.jwt()) ->> 'clinic_id'::text) = (clinic_id)::text))
             and ((((select auth.jwt()) ->> 'user_role'::text) = any (array['clinic_admin'::text, 'admin'::text])))
         ))
    );

commit;

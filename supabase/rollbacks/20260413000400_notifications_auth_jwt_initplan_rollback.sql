-- ================================================================
-- Rollback: Notifications auth.jwt() Init Plan Fix
-- ================================================================
-- Target: 20260413000400_notifications_auth_jwt_initplan.sql
-- ================================================================

begin;

alter policy "Users can view their own notifications"
    on public.notifications
    using (
        ((auth.uid() = user_id)
         or (
             (clinic_id is not null)
             and (((auth.jwt() ->> 'clinic_id'::text) = (clinic_id)::text))
             and (((auth.jwt() ->> 'user_role'::text) = any (array['clinic_admin'::text, 'admin'::text])))
         ))
    );

commit;

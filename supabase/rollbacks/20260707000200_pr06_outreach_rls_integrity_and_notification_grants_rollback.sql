-- Rollback: PR-06 SaaS review DB/RLS remediation.
-- Reverts only changes from
-- supabase/migrations/20260707000200_pr06_outreach_rls_integrity_and_notification_grants.sql.

begin;

revoke all on table public.reservation_notifications from service_role;
grant all on table public.reservation_notifications to anon;
grant all on table public.reservation_notifications to authenticated;

drop policy if exists "patient_outreach_campaigns_update_scoped"
on public.patient_outreach_campaigns;

create policy "patient_outreach_campaigns_update_scoped"
on public.patient_outreach_campaigns
for update
using (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "patient_outreach_recipients_update_scoped"
on public.patient_outreach_recipients;

create policy "patient_outreach_recipients_update_scoped"
on public.patient_outreach_recipients
for update
using (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
);

alter table public.reservations
  drop constraint if exists reservations_campaign_clinic_fkey,
  add constraint reservations_campaign_id_fkey
    foreign key (campaign_id)
    references public.patient_outreach_campaigns(id)
    on delete set null;

alter table public.patient_outreach_recipients
  drop constraint if exists patient_outreach_recipients_booked_reservation_clinic_fkey,
  add constraint patient_outreach_recipients_booked_reservation_id_fkey
    foreign key (booked_reservation_id)
    references public.reservations(id)
    on delete set null;

alter table public.patient_outreach_recipients
  drop constraint if exists patient_outreach_recipients_customer_clinic_fkey,
  add constraint patient_outreach_recipients_customer_id_fkey
    foreign key (customer_id)
    references public.customers(id)
    on delete cascade;

alter table public.reservations
  drop constraint if exists reservations_id_clinic_unique;

alter table public.customers
  drop constraint if exists customers_id_clinic_unique;

commit;

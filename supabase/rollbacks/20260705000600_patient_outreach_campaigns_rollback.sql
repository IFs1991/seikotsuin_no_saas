-- Rollback: dormant patient outreach campaign drafts.

begin;

drop trigger if exists update_patient_outreach_campaigns_updated_at
on public.patient_outreach_campaigns;

alter table public.reservations
  drop constraint if exists reservations_campaign_id_fkey;

drop index if exists public.reservations_campaign_id_idx;
drop index if exists public.patient_outreach_recipients_customer_idx;
drop index if exists public.patient_outreach_recipients_campaign_idx;
drop index if exists public.patient_outreach_campaigns_status_idx;
drop index if exists public.patient_outreach_campaigns_clinic_created_idx;

drop table if exists public.patient_outreach_recipients;
drop table if exists public.patient_outreach_campaigns;

alter table public.reservations
  drop column if exists campaign_id;

commit;

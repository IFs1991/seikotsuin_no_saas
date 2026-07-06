-- Spec: docs/stabilization/spec-liff-booking-workflow-v0.3.md
-- Phase F / PR11: dormant patient outreach campaign drafts.

begin;

create table if not exists public.patient_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'cancelled')),
  message_body text not null
    check (length(btrim(message_body)) > 0 and length(message_body) <= 2000),
  segment_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_outreach_campaigns_id_clinic_unique
    unique (id, clinic_id)
);

comment on table public.patient_outreach_campaigns is
  'Clinic-scoped dormant patient reactivation campaign drafts and delivery state.';
comment on column public.patient_outreach_campaigns.message_body is
  'Manual outreach text. PR11 allows only {{name}} as a replacement token.';
comment on column public.patient_outreach_campaigns.segment_snapshot is
  'Snapshot of dormant segment extraction parameters at draft creation time.';

create table if not exists public.patient_outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  clinic_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  line_user_id text not null check (length(btrim(line_user_id)) > 0),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  booked_reservation_id uuid null references public.reservations(id) on delete set null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint patient_outreach_recipients_campaign_clinic_fkey
    foreign key (campaign_id, clinic_id)
    references public.patient_outreach_campaigns(id, clinic_id)
    on delete cascade,
  constraint patient_outreach_recipients_campaign_customer_unique
    unique (campaign_id, customer_id)
);

comment on table public.patient_outreach_recipients is
  'Clinic-scoped recipient snapshot for dormant patient outreach campaigns.';
comment on column public.patient_outreach_recipients.booked_reservation_id is
  'Reservation attributed to this outreach recipient. Filled by PR12 attribution.';

alter table public.reservations
  add column if not exists campaign_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_campaign_id_fkey'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_campaign_id_fkey
      foreign key (campaign_id)
      references public.patient_outreach_campaigns(id)
      on delete set null;
  end if;
end $$;

create index if not exists patient_outreach_campaigns_clinic_created_idx
  on public.patient_outreach_campaigns (clinic_id, created_at desc);

create index if not exists patient_outreach_campaigns_status_idx
  on public.patient_outreach_campaigns (clinic_id, status, created_at desc);

create index if not exists patient_outreach_recipients_campaign_idx
  on public.patient_outreach_recipients (campaign_id, created_at);

create index if not exists patient_outreach_recipients_customer_idx
  on public.patient_outreach_recipients (clinic_id, customer_id, created_at desc);

create index if not exists reservations_campaign_id_idx
  on public.reservations (campaign_id)
  where campaign_id is not null;

drop trigger if exists update_patient_outreach_campaigns_updated_at
on public.patient_outreach_campaigns;

create trigger update_patient_outreach_campaigns_updated_at
before update on public.patient_outreach_campaigns
for each row execute function public.update_updated_at_column();

alter table public.patient_outreach_campaigns enable row level security;
alter table public.patient_outreach_recipients enable row level security;

drop policy if exists "patient_outreach_campaigns_select_scoped"
on public.patient_outreach_campaigns;
create policy "patient_outreach_campaigns_select_scoped"
on public.patient_outreach_campaigns
for select
using (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "patient_outreach_campaigns_insert_scoped"
on public.patient_outreach_campaigns;
create policy "patient_outreach_campaigns_insert_scoped"
on public.patient_outreach_campaigns
for insert
with check (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
);

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

drop policy if exists "patient_outreach_recipients_select_scoped"
on public.patient_outreach_recipients;
create policy "patient_outreach_recipients_select_scoped"
on public.patient_outreach_recipients
for select
using (
  app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "patient_outreach_recipients_insert_scoped"
on public.patient_outreach_recipients;
create policy "patient_outreach_recipients_insert_scoped"
on public.patient_outreach_recipients
for insert
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

revoke all on table public.patient_outreach_campaigns from anon;
revoke all on table public.patient_outreach_recipients from anon;
grant select, insert, update on public.patient_outreach_campaigns to authenticated;
grant select, insert, update on public.patient_outreach_recipients to authenticated;
revoke delete on table public.patient_outreach_campaigns from authenticated;
revoke delete on table public.patient_outreach_recipients from authenticated;
grant all on table public.patient_outreach_campaigns to service_role;
grant all on table public.patient_outreach_recipients to service_role;

do $$
begin
  if to_regclass('public.patient_outreach_campaigns') is null then
    raise exception 'patient_outreach_campaigns table was not created';
  end if;

  if to_regclass('public.patient_outreach_recipients') is null then
    raise exception 'patient_outreach_recipients table was not created';
  end if;
end $$;

commit;

-- Spec: docs/stabilization/spec-saas-review-findings-remediation-v0.1.md
-- PR-06: F-16 reservation notification grants, F-17 outreach RLS role
-- alignment, and F-18 outreach cross-clinic DB integrity.

begin;

-- F-16: reservation_notifications is service-role internal state.
revoke all on table public.reservation_notifications from anon;
revoke all on table public.reservation_notifications from authenticated;
grant all on table public.reservation_notifications to service_role;

-- F-17: API send route allows only admin / clinic_admin. Keep direct RLS
-- updates no broader than that route for send/delivery/attribution state.
drop policy if exists "patient_outreach_campaigns_update_scoped"
on public.patient_outreach_campaigns;

create policy "patient_outreach_campaigns_update_scoped"
on public.patient_outreach_campaigns
for update
using (
  app_private.get_current_role() in ('admin', 'clinic_admin')
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() in ('admin', 'clinic_admin')
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "patient_outreach_recipients_update_scoped"
on public.patient_outreach_recipients;

create policy "patient_outreach_recipients_update_scoped"
on public.patient_outreach_recipients
for update
using (
  app_private.get_current_role() in ('admin', 'clinic_admin')
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() in ('admin', 'clinic_admin')
  and app_private.can_access_clinic(clinic_id)
);

-- F-18: fail before adding constraints if historical data is already
-- cross-clinic. Do not rewrite or delete data in a stabilisation migration.
do $$
begin
  if exists (
    select 1
    from public.patient_outreach_recipients por
    join public.customers c on c.id = por.customer_id
    where c.clinic_id <> por.clinic_id
  ) then
    raise exception 'Cross-clinic patient_outreach_recipients.customer_id rows exist'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.patient_outreach_recipients por
    join public.reservations r on r.id = por.booked_reservation_id
    where por.booked_reservation_id is not null
      and r.clinic_id <> por.clinic_id
  ) then
    raise exception 'Cross-clinic patient_outreach_recipients.booked_reservation_id rows exist'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.reservations r
    join public.patient_outreach_campaigns poc on poc.id = r.campaign_id
    where r.campaign_id is not null
      and poc.clinic_id <> r.clinic_id
  ) then
    raise exception 'Cross-clinic reservations.campaign_id rows exist'
      using errcode = '23514';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_id_clinic_unique'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_id_clinic_unique
      unique (id, clinic_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_id_clinic_unique'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_id_clinic_unique
      unique (id, clinic_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'patient_outreach_campaigns_id_clinic_unique'
      and conrelid = 'public.patient_outreach_campaigns'::regclass
  ) then
    alter table public.patient_outreach_campaigns
      add constraint patient_outreach_campaigns_id_clinic_unique
      unique (id, clinic_id);
  end if;
end
$$;

alter table public.patient_outreach_recipients
  drop constraint if exists patient_outreach_recipients_customer_id_fkey,
  add constraint patient_outreach_recipients_customer_clinic_fkey
    foreign key (customer_id, clinic_id)
    references public.customers(id, clinic_id)
    on delete cascade;

alter table public.patient_outreach_recipients
  drop constraint if exists patient_outreach_recipients_booked_reservation_id_fkey,
  add constraint patient_outreach_recipients_booked_reservation_clinic_fkey
    foreign key (booked_reservation_id, clinic_id)
    references public.reservations(id, clinic_id)
    on delete set null (booked_reservation_id);

alter table public.reservations
  drop constraint if exists reservations_campaign_id_fkey,
  add constraint reservations_campaign_clinic_fkey
    foreign key (campaign_id, clinic_id)
    references public.patient_outreach_campaigns(id, clinic_id)
    on delete set null (campaign_id);

commit;

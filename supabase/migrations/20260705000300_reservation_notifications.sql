begin;

create table if not exists public.reservation_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  notification_type text not null
    check (
      notification_type in (
        'received',
        'confirmed',
        'cancelled',
        'reminder_day_before',
        'reminder_same_day'
      )
    ),
  channel text not null default 'email'
    check (channel in ('email', 'line', 'none')),
  status text not null default 'claimed'
    check (status in ('claimed', 'enqueued', 'skipped', 'failed')),
  scheduled_for timestamptz null,
  email_outbox_id uuid null references public.email_outbox(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, notification_type)
);

comment on table public.reservation_notifications is
  'Reservation notification idempotency and delivery decision log.';
comment on column public.reservation_notifications.notification_type is
  'received, confirmed, cancelled, reminder_day_before, reminder_same_day';
comment on column public.reservation_notifications.scheduled_for is
  'Scheduled send time for reminders; null for immediate notifications.';

create index if not exists reservation_notifications_clinic_created_idx
  on public.reservation_notifications (clinic_id, created_at desc);

create index if not exists reservation_notifications_scheduled_idx
  on public.reservation_notifications (notification_type, scheduled_for)
  where scheduled_for is not null;

alter table public.reservation_notifications enable row level security;

drop policy if exists "service_role_full_access_reservation_notifications"
  on public.reservation_notifications;

create policy "service_role_full_access_reservation_notifications"
  on public.reservation_notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.update_reservation_notifications_updated_at()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservation_notifications_updated_at_trigger
  on public.reservation_notifications;

create trigger reservation_notifications_updated_at_trigger
  before update on public.reservation_notifications
  for each row
  execute function public.update_reservation_notifications_updated_at();

create or replace function public.get_clinic_settings(
  p_clinic_id uuid,
  p_category text
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_settings jsonb;
  v_default_settings jsonb;
begin
  v_default_settings := case p_category
    when 'clinic_basic' then '{
      "name": "",
      "zipCode": "",
      "address": "",
      "phone": "",
      "fax": "",
      "email": "",
      "website": "",
      "description": "",
      "logoUrl": null
    }'::jsonb
    when 'clinic_hours' then '{
      "hoursByDay": {},
      "holidays": [],
      "specialClosures": []
    }'::jsonb
    when 'booking_calendar' then '{
      "slotMinutes": 30,
      "maxConcurrent": 3,
      "weekStartDay": 1,
      "allowOnlineBooking": false,
      "maxAdvanceBookingDays": 30,
      "minAdvanceBookingHours": 2,
      "allowCancellation": true,
      "cancellationDeadlineHours": 24,
      "defaultCalendarView": "week",
      "reminders": {
        "dayBefore": { "enabled": true, "sendAtHour": 18 },
        "sameDay": { "enabled": false, "hoursBefore": 3 }
      }
    }'::jsonb
    when 'booking_form' then '{
      "fields": {
        "nameKana": { "enabled": true, "required": false },
        "phone": { "enabled": true, "required": true },
        "email": { "enabled": true, "required": false },
        "birthDate": { "enabled": false, "required": false },
        "gender": { "enabled": false, "required": false },
        "notes": { "enabled": true, "required": false }
      },
      "staffSelection": "optional",
      "questions": [],
      "consents": [],
      "completionMessage": ""
    }'::jsonb
    when 'communication' then '{
      "channels": {
        "emailEnabled": false,
        "smsEnabled": false,
        "lineEnabled": false,
        "pushEnabled": false
      },
      "smtpSettings": {
        "host": "",
        "port": 587,
        "username": "",
        "secure": true
      },
      "templates": []
    }'::jsonb
    when 'system_security' then '{
      "passwordPolicy": {
        "minLength": 8,
        "requireUppercase": true,
        "requireNumbers": true,
        "requireSymbols": false
      },
      "twoFactorEnabled": false,
      "sessionTimeout": 30,
      "loginAttempts": 5,
      "lockoutDuration": 15
    }'::jsonb
    when 'system_backup' then '{
      "autoBackup": false,
      "backupFrequency": "daily",
      "backupTime": "03:00",
      "retentionDays": 30,
      "cloudStorage": false,
      "storageProvider": "aws"
    }'::jsonb
    when 'services_pricing' then '{
      "menus": [],
      "categories": [],
      "insuranceOptions": []
    }'::jsonb
    when 'insurance_billing' then '{
      "insuranceTypes": [],
      "receiptSettings": {},
      "billingCycle": "monthly"
    }'::jsonb
    when 'data_management' then '{
      "importMode": "update",
      "exportFormat": "csv",
      "retentionDays": 365
    }'::jsonb
    else '{}'::jsonb
  end;

  select settings into v_settings
  from public.clinic_settings
  where clinic_id = p_clinic_id and category = p_category;

  return coalesce(v_settings, v_default_settings);
end;
$$;

commit;

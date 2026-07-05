begin;

alter table public.clinic_settings
  drop constraint if exists clinic_settings_category_check;

alter table public.clinic_settings
  add constraint clinic_settings_category_check
  check (
    category = any (
      array[
        'clinic_basic'::text,
        'clinic_hours'::text,
        'booking_calendar'::text,
        'booking_form'::text,
        'communication'::text,
        'system_security'::text,
        'system_backup'::text,
        'services_pricing'::text,
        'insurance_billing'::text,
        'data_management'::text
      ]
    )
  );

comment on column public.clinic_settings.category is
  '設定カテゴリ（clinic_basic, clinic_hours, booking_calendar, booking_form, communication, system_security, system_backup, services_pricing, insurance_billing, data_management）';

create or replace function public.upsert_clinic_settings(
  p_clinic_id uuid,
  p_category text,
  p_settings jsonb,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_result_id uuid;
begin
  if p_category not in (
    'clinic_basic',
    'clinic_hours',
    'booking_calendar',
    'booking_form',
    'communication',
    'system_security',
    'system_backup',
    'services_pricing',
    'insurance_billing',
    'data_management'
  ) then
    return jsonb_build_object('success', false, 'error', '不正なカテゴリです');
  end if;

  insert into public.clinic_settings (clinic_id, category, settings, updated_by)
  values (p_clinic_id, p_category, p_settings, p_user_id)
  on conflict (clinic_id, category)
  do update set
    settings = excluded.settings,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_result_id;

  return jsonb_build_object('success', true, 'id', v_result_id);
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

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
      "defaultCalendarView": "week"
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

alter table public.reservations
  add column if not exists intake_responses jsonb null;

comment on column public.reservations.intake_responses is
  'Public booking form response snapshots captured at reservation creation time.';

create or replace view public.reservation_list_view as
select
  r.id,
  r.clinic_id,
  r.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  r.menu_id,
  m.name as menu_name,
  m.duration_minutes,
  m.price as menu_price,
  r.staff_id,
  res.name as staff_name,
  res.type as resource_type,
  r.start_time,
  r.end_time,
  r.status,
  r.channel,
  r.notes,
  r.price,
  r.actual_price,
  r.payment_status,
  r.reservation_group_id,
  r.created_at,
  r.updated_at,
  r.created_by,
  r.selected_options,
  r.intake_responses,
  r.is_staff_requested,
  r.staff_nomination_fee
from public.reservations r
join public.customers c on r.customer_id = c.id
join public.menus m on r.menu_id = m.id
join public.resources res on r.staff_id = res.id
where
  r.is_deleted = false
  and c.is_deleted = false
  and m.is_deleted = false
  and res.is_deleted = false;

alter view public.reservation_list_view
  set (security_invoker = true);

commit;

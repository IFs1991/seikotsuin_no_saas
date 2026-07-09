begin;

drop trigger if exists reservation_notifications_updated_at_trigger
  on public.reservation_notifications;

drop function if exists public.update_reservation_notifications_updated_at();

drop table if exists public.reservation_notifications;

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

commit;

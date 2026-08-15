-- Forward-fix rollback guard for PR2 LINE self-serve setup.
-- The migration is intentionally non-destructive: verified setup state and
-- credential generations must not be rolled back to a weaker contract.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

alter function public.wipe_line_setup_session_secrets()
  security invoker
  set search_path = pg_catalog, public;
alter function public.claim_line_setup_verification(uuid, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  security invoker set search_path = pg_catalog, public;
alter function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) security invoker set search_path = pg_catalog, public;
alter function public.update_line_feature_settings(uuid, boolean, boolean, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) security invoker set search_path = pg_catalog, public;
alter function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) security invoker set search_path = pg_catalog, public;
alter function public.get_line_public_booking_context(uuid)
  security invoker set search_path = pg_catalog, public;

alter function public.wipe_line_setup_session_secrets() owner to postgres;
alter function public.claim_line_setup_verification(uuid, uuid)
  owner to postgres;
alter function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  owner to postgres;
alter function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  owner to postgres;
alter function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) owner to postgres;
alter function public.update_line_feature_settings(uuid, boolean, boolean, uuid)
  owner to postgres;
alter function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) owner to postgres;
alter function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) owner to postgres;
alter function public.get_line_public_booking_context(uuid) owner to postgres;

revoke all on function public.wipe_line_setup_session_secrets()
  from public, anon, authenticated, service_role;
grant execute on function public.wipe_line_setup_session_secrets()
  to service_role;
revoke all on function public.claim_line_setup_verification(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_setup_verification(uuid, uuid)
  to service_role;
revoke all on function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  to service_role;
revoke all on function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) to service_role;
revoke all on function public.update_line_feature_settings(
  uuid, boolean, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_line_feature_settings(
  uuid, boolean, boolean, uuid
) to service_role;
revoke all on function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) to service_role;
revoke all on function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) to service_role;
revoke all on function public.get_line_public_booking_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_line_public_booking_context(uuid)
  to service_role;

do $rollback_guard$
declare
  function_oid oid;
  index_name text;
  actual_execute_roles text[];
  has_execute_grant_option boolean;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinic_line_setup_sessions'
      and column_name = 'encrypted_verification_payload'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinic_line_setup_sessions'
      and column_name = 'verification_request_digest'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinic_line_credentials'
      and column_name = 'provider_identity_verified_at'
  ) then
    raise exception 'Refusing rollback: LINE setup contract columns are missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.clinic_line_setup_sessions'::regclass
      and trigger_data.tgname = 'wipe_line_setup_session_secrets_trigger'
      and not trigger_data.tgisinternal
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_payload_lifecycle'
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_claim_lifecycle'
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_request_digest_format'
  ) then
    raise exception 'Refusing rollback: LINE setup secret lifecycle drifted';
  end if;

  foreach index_name in array array[
    'customers_line_generation_idx',
    'line_message_outbox_customer_clinic_idx',
    'line_message_outbox_generation_idx',
    'patient_identity_aliases_customer_clinic_idx',
    'patient_staff_preferences_customer_clinic_idx',
    'patient_staff_preferences_staff_clinic_idx',
    'reservation_rewards_reservation_clinic_idx',
    'staff_availability_events_created_by_idx',
    'staff_availability_events_staff_clinic_idx',
    'staff_availability_notifications_customer_clinic_idx',
    'staff_availability_notifications_event_clinic_idx',
    'staff_availability_notifications_outbox_clinic_idx',
    'staff_availability_notifications_reservation_clinic_idx',
    'clinic_line_chat_settings_updated_by_idx',
    'clinic_line_setup_sessions_created_by_idx',
    'line_chat_outbox_clinic_idx',
    'line_chat_outbox_conversation_clinic_idx',
    'line_chat_outbox_message_conversation_idx',
    'line_conversations_assignee_clinic_idx',
    'line_conversations_contact_generation_idx',
    'line_job_heartbeats_clinic_idx',
    'line_messages_conversation_contact_generation_idx',
    'line_messages_sent_by_idx',
    'line_messages_webhook_event_contact_idx',
    'line_webhook_events_contact_identity_idx',
    'line_webhook_events_generation_idx'
  ]
  loop
    if to_regclass('public.' || index_name) is null then
      raise exception 'Refusing rollback: LINE/CRM FK index missing:%', index_name;
    end if;
  end loop;

  foreach function_oid in array array[
    'public.wipe_line_setup_session_secrets()'::regprocedure::oid,
    'public.claim_line_setup_verification(uuid,uuid)'::regprocedure::oid,
    'public.bind_line_setup_push_request(uuid,uuid,uuid,text)'::regprocedure::oid,
    'public.release_line_setup_verification_claim(uuid,uuid,uuid)'::regprocedure::oid,
    'public.finalize_line_setup_verification(uuid,uuid,uuid,text,text,boolean)'::regprocedure::oid,
    'public.update_line_feature_settings(uuid,boolean,boolean,uuid)'::regprocedure::oid,
    'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)'::regprocedure::oid,
    'public.update_line_chat_settings(uuid,boolean,text,integer,boolean,uuid)'::regprocedure::oid,
    'public.get_line_public_booking_context(uuid)'::regprocedure::oid
  ]
  loop
    select
      coalesce(
        array_agg(
          distinct actual_grant.role_name collate "C"
          order by actual_grant.role_name collate "C"
        ),
        array[]::text[]
      ),
      coalesce(bool_or(actual_grant.is_grantable), false)
    into actual_execute_roles, has_execute_grant_option
    from (
      select case
        when acl_entry.grantee = 0 then 'PUBLIC'
        else pg_get_userbyid(acl_entry.grantee)::text
      end as role_name,
      acl_entry.is_grantable
      from pg_proc function_data
      cross join lateral aclexplode(
        coalesce(function_data.proacl, acldefault('f', function_data.proowner))
      ) acl_entry
      where function_data.oid = function_oid
        and acl_entry.privilege_type = 'EXECUTE'
        and acl_entry.grantee <> function_data.proowner
    ) actual_grant;

    if actual_execute_roles is distinct from array['service_role']::text[]
      or has_execute_grant_option
      or exists (
        select 1
        from pg_proc function_data
        where function_data.oid = function_oid
          and (
            function_data.prosecdef
            or pg_get_userbyid(function_data.proowner) <> 'postgres'
            or not coalesce(function_data.proconfig, array[]::text[])
              @> array['search_path=pg_catalog, public']::text[]
          )
      )
    then
      raise exception 'Refusing rollback: LINE setup function contract drifted:%', function_oid;
    end if;
  end loop;
end
$rollback_guard$;

commit;

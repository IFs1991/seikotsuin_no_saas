-- Forward-fix rollback guard for PR3 LINE chat runtime.
-- Message history is intentionally preserved. This script restores the
-- service-role-only function boundary and refuses to weaken runtime safety.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

alter table public.line_unsend_tombstones enable row level security;
alter table public.line_unsend_tombstones owner to postgres;
revoke all on table public.line_unsend_tombstones
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.line_unsend_tombstones
  to service_role;

alter function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  security invoker set search_path = pg_catalog, public;
alter function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.claim_line_chat_outbox(uuid, integer)
  security invoker set search_path = pg_catalog, public;
alter function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) security invoker set search_path = pg_catalog, public;
alter function public.purge_expired_line_chat_data(uuid)
  security invoker set search_path = pg_catalog, public;
alter function public.run_line_chat_cleanup_if_due()
  security invoker set search_path = pg_catalog, public;
alter function public.list_line_chat_delivery_clinics(integer)
  security invoker set search_path = pg_catalog, public;

alter function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  owner to postgres;
alter function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  owner to postgres;
alter function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  owner to postgres;
alter function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  owner to postgres;
alter function public.claim_line_chat_outbox(uuid, integer)
  owner to postgres;
alter function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  owner to postgres;
alter function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) owner to postgres;
alter function public.purge_expired_line_chat_data(uuid) owner to postgres;
alter function public.run_line_chat_cleanup_if_due() owner to postgres;
alter function public.list_line_chat_delivery_clinics(integer)
  owner to postgres;

revoke all on function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  to service_role;
revoke all on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  to service_role;
revoke all on function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  to service_role;
revoke all on function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  to service_role;
revoke all on function public.claim_line_chat_outbox(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_chat_outbox(uuid, integer)
  to service_role;
revoke all on function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  to service_role;
revoke all on function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) to service_role;
revoke all on function public.purge_expired_line_chat_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_line_chat_data(uuid)
  to service_role;
revoke all on function public.run_line_chat_cleanup_if_due()
  from public, anon, authenticated, service_role;
grant execute on function public.run_line_chat_cleanup_if_due()
  to service_role;
revoke all on function public.list_line_chat_delivery_clinics(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_line_chat_delivery_clinics(integer)
  to service_role;

do $rollback_guard$
declare
  function_oid oid;
  actual_execute_roles text[];
  actual_table_privileges text[];
  has_execute_grant_option boolean;
  has_table_grant_option boolean;
  tombstone_table_oid oid := to_regclass('public.line_unsend_tombstones');
begin
  if pg_get_functiondef(
    'public.process_line_webhook_delivery(uuid,uuid,jsonb)'::regprocedure
  ) not ilike '%on conflict (clinic_id, webhook_event_id) do nothing%'
    or pg_get_functiondef(
      'public.process_line_webhook_delivery(uuid,uuid,jsonb)'::regprocedure
    ) not ilike '%text_content = null%'
    or pg_get_functiondef(
      'public.process_line_webhook_delivery(uuid,uuid,jsonb)'::regprocedure
    ) not ilike '%unsend_message_id = v_unsend_message_id%'
    or pg_get_functiondef(
      'public.process_line_webhook_delivery(uuid,uuid,jsonb)'::regprocedure
    ) not ilike '%line_unsend_tombstones%'
    or pg_get_functiondef(
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure
    ) not ilike '%manager_clinic_assignments%'
    or pg_get_functiondef(
      'public.list_authorized_line_chat_messages(uuid,uuid,uuid)'::regprocedure
    ) not ilike '%manager_clinic_assignments%'
    or pg_get_functiondef(
      'public.assign_line_chat_conversation(uuid,uuid,uuid,uuid)'::regprocedure
    ) not ilike '%manager_clinic_assignments%'
    or pg_get_functiondef(
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure
    ) not ilike '%hashtext(''manager_clinic_assignments'')%'
    or pg_get_functiondef(
      'public.list_authorized_line_chat_messages(uuid,uuid,uuid)'::regprocedure
    ) not ilike '%hashtext(''manager_clinic_assignments'')%'
    or pg_get_functiondef(
      'public.assign_line_chat_conversation(uuid,uuid,uuid,uuid)'::regprocedure
    ) not ilike '%hashtext(''manager_clinic_assignments'')%'
    or pg_get_functiondef(
      'public.renew_line_chat_outbox_claim(uuid,uuid,uuid)'::regprocedure
    ) not ilike '%feature_flags.line_chat_enabled%'
    or pg_get_functiondef(
      'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure
    ) not ilike '%last_outbound_at = statement_timestamp()%'
    or pg_get_functiondef(
      'public.run_line_chat_cleanup_if_due()'::regprocedure
    ) not ilike '%purge_expired_line_chat_data(null)%'
    or pg_get_functiondef(
      'public.purge_expired_line_chat_data(uuid)'::regprocedure
    ) not ilike '%outbox.status in (''pending'', ''processing'')%'
    or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.line_webhook_events'::regclass
        and conname = 'line_webhook_events_unsend_message_id_not_blank'
    )
    or tombstone_table_oid is null
    or to_regclass('public.line_unsend_tombstones_pkey') is null
    or not exists (
      select 1
      from pg_class table_data
      where table_data.oid = tombstone_table_oid
        and table_data.relrowsecurity
        and pg_get_userbyid(table_data.relowner) = 'postgres'
    )
  then
    raise exception 'Refusing rollback: LINE chat runtime contract drifted';
  end if;

  select
    coalesce(
      array_agg(
        distinct (
          case
            when acl_entry.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl_entry.grantee)::text
          end || ':' || acl_entry.privilege_type
        ) collate "C"
        order by (
          case
            when acl_entry.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl_entry.grantee)::text
          end || ':' || acl_entry.privilege_type
        ) collate "C"
      ),
      array[]::text[]
    ),
    coalesce(bool_or(acl_entry.is_grantable), false)
  into actual_table_privileges, has_table_grant_option
  from pg_class table_data
  cross join lateral aclexplode(
    coalesce(table_data.relacl, acldefault('r', table_data.relowner))
  ) acl_entry
  where table_data.oid = tombstone_table_oid
    and acl_entry.grantee <> table_data.relowner;

  if actual_table_privileges is distinct from array[
      'service_role:DELETE',
      'service_role:INSERT',
      'service_role:SELECT',
      'service_role:UPDATE'
    ]::text[]
    or has_table_grant_option
  then
    raise exception 'Refusing rollback: LINE unsend tombstone table boundary drifted';
  end if;

  foreach function_oid in array array[
    'public.process_line_webhook_delivery(uuid,uuid,jsonb)'::regprocedure::oid,
    'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure::oid,
    'public.list_authorized_line_chat_messages(uuid,uuid,uuid)'::regprocedure::oid,
    'public.assign_line_chat_conversation(uuid,uuid,uuid,uuid)'::regprocedure::oid,
    'public.claim_line_chat_outbox(uuid,integer)'::regprocedure::oid,
    'public.renew_line_chat_outbox_claim(uuid,uuid,uuid)'::regprocedure::oid,
    'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure::oid,
    'public.purge_expired_line_chat_data(uuid)'::regprocedure::oid,
    'public.run_line_chat_cleanup_if_due()'::regprocedure::oid,
    'public.list_line_chat_delivery_clinics(integer)'::regprocedure::oid
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
      raise exception 'Refusing rollback: LINE chat function boundary drifted:%', function_oid;
    end if;
  end loop;
end
$rollback_guard$;

commit;

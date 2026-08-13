-- Forward-fix rollback guard for LINE integration security foundation v0.4.
--
-- This migration introduces tenant-scoped identity and potentially durable
-- chat/audit rows. A destructive down migration could reintroduce cross-tenant
-- identity collisions or delete patient communications. The supported rollback
-- therefore preserves data and reasserts the last known safe security contract.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, auth, extensions;

do $rollback$
declare
  table_name text;
begin
  if exists (
    select 1
    from public.customers customer
    where customer.line_user_id is not null
    group by customer.clinic_id, customer.line_user_id
    having count(*) > 1
  ) then
    raise exception 'Refusing rollback: duplicate clinic-scoped LINE identities exist';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'customers_clinic_line_user_id_unique'
      and indexdef ilike '%unique%clinic_id%line_user_id%where (line_user_id is not null)%'
  ) then
    raise exception 'Refusing rollback: tenant-scoped LINE identity index drift';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'customers_line_user_id_key'
      and conrelid = 'public.customers'::regclass
  ) then
    raise exception 'Refusing rollback: unsafe global LINE identity constraint returned';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.customers'::regclass
      and trigger_data.tgname = 'guard_customer_line_identity_trigger'
      and (trigger_data.tgtype & 4) = 4
      and (trigger_data.tgtype & 16) = 16
      and not trigger_data.tgisinternal
  ) then
    raise exception 'Refusing rollback: patient LINE identity insert/update protection drift';
  end if;

  if not exists (
    select 1
    from information_schema.columns column_data
    where column_data.table_schema = 'public'
      and column_data.table_name = 'line_message_outbox'
      and column_data.column_name = 'credential_generation_id'
  ) or not exists (
    select 1
    from information_schema.columns column_data
    where column_data.table_schema = 'public'
      and column_data.table_name = 'line_message_outbox'
      and column_data.column_name = 'claim_token'
  ) then
    raise exception 'Refusing rollback: notification outbox generation/claim contract drift';
  end if;

  if not exists (
    select 1
    from information_schema.columns column_data
    where column_data.table_schema = 'public'
      and column_data.table_name = 'line_message_outbox'
      and column_data.column_name = 'customer_id'
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.line_message_outbox'::regclass
      and constraint_data.conname = 'line_message_outbox_customer_clinic_fkey'
  ) then
    raise exception 'Refusing rollback: notification outbox patient identity contract drift';
  end if;

  if exists (
    select 1
    from public.line_message_outbox outbox
    where outbox.status = 'pending'
      and (
        outbox.customer_id is null
        or outbox.credential_generation_id is null
      )
  ) then
    raise exception 'Refusing rollback: an unverified legacy notification remains sendable';
  end if;

  foreach table_name in array array[
    'clinic_line_setup_sessions',
    'clinic_line_credential_generations',
    'clinic_line_chat_settings',
    'line_contacts',
    'line_conversations',
    'line_webhook_events',
    'line_messages',
    'line_chat_outbox',
    'line_job_heartbeats'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Refusing rollback: required relation is missing: %', table_name;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format('revoke all on table public.%I from service_role', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end
$rollback$;

revoke all on function public.expire_line_setup_sessions(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.expire_line_setup_sessions(uuid)
  to service_role;

revoke all on function public.initialize_line_credential_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_line_credential_generation()
  to service_role;

revoke all on function public.initialize_customer_line_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_customer_line_generation()
  to service_role;

revoke all on function public.protect_customer_line_identity()
  from public, anon, authenticated, service_role;
grant execute on function public.protect_customer_line_identity()
  to service_role;

revoke all on function public.initialize_line_message_outbox_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_line_message_outbox_generation()
  to service_role;

revoke all on function public.sync_failed_line_notification_tracking()
  from public, anon, authenticated, service_role;
grant execute on function public.sync_failed_line_notification_tracking()
  to service_role;

revoke all on function public.quarantine_unverified_line_notification_history()
  from public, anon, authenticated, service_role;
grant execute on function public.quarantine_unverified_line_notification_history()
  to service_role;

revoke all on function public.claim_line_notification_outbox(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_notification_outbox(uuid, uuid, integer)
  to service_role;

revoke all on function public.finalize_line_notification_outbox(
  uuid, uuid, uuid, text, timestamptz, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_notification_outbox(
  uuid, uuid, uuid, text, timestamptz, text, timestamptz
) to service_role;

revoke all on function public.renew_line_notification_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_line_notification_claim(uuid, uuid, uuid)
  to service_role;

revoke all on function public.validate_line_current_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_line_current_generation()
  to service_role;

revoke all on function public.rotate_line_credential_generation(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rotate_line_credential_generation(uuid, uuid, uuid, jsonb, uuid)
  to service_role;

revoke all on function public.validate_line_credential_rotation()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_line_credential_rotation()
  to service_role;

revoke all on function public.purge_expired_line_chat_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_line_chat_data(uuid)
  to service_role;

revoke all on function public.validate_line_chat_outbox_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_line_chat_outbox_contract()
  to service_role;

revoke all on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  to service_role;

revoke all on function public.claim_line_chat_outbox(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_chat_outbox(uuid, integer)
  to service_role;

revoke all on function public.finalize_line_chat_outbox(uuid, uuid, uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_chat_outbox(uuid, uuid, uuid, boolean, text, text)
  to service_role;

revoke all on function public.close_line_setup_session(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_line_setup_session(uuid, uuid, text)
  to service_role;

revoke all on function public.enqueue_outreach_campaign(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_outreach_campaign(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.relink_line_contact_generation(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.relink_line_contact_generation(uuid, uuid, text, uuid)
  to service_role;

do $postflight$
declare
  table_name text;
  function_oid oid;
  actual_execute_roles text[];
  has_execute_grant_option boolean;
begin
  foreach table_name in array array[
    'clinic_line_setup_sessions',
    'clinic_line_credential_generations',
    'clinic_line_chat_settings',
    'line_contacts',
    'line_conversations',
    'line_webhook_events',
    'line_messages',
    'line_chat_outbox',
    'line_job_heartbeats'
  ]
  loop
    if has_table_privilege('anon', format('public.%I', table_name), 'select')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'select')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'insert')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'update')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'delete')
    then
      raise exception 'Refusing rollback: client relation grant drift: %', table_name;
    end if;

    if pg_get_userbyid(
      (
        select relation.relowner
        from pg_class relation
        where relation.oid = format('public.%I', table_name)::regclass
      )
    ) <> 'postgres' then
      raise exception 'Refusing rollback: table owner drift: %', table_name;
    end if;

    if not (
      has_table_privilege('service_role', format('public.%I', table_name), 'select')
      and has_table_privilege('service_role', format('public.%I', table_name), 'insert')
      and has_table_privilege('service_role', format('public.%I', table_name), 'update')
      and has_table_privilege('service_role', format('public.%I', table_name), 'delete')
      and has_table_privilege('service_role', format('public.%I', table_name), 'truncate')
      and has_table_privilege('service_role', format('public.%I', table_name), 'references')
      and has_table_privilege('service_role', format('public.%I', table_name), 'trigger')
    ) or exists (
      select 1
      from pg_class relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) acl_entry
      where relation.oid = format('public.%I', table_name)::regclass
        and acl_entry.grantee <> relation.relowner
        and (
          pg_get_userbyid(acl_entry.grantee) <> 'service_role'
          or acl_entry.is_grantable
        )
    ) then
      raise exception 'Refusing rollback: exact table ACL drift: %', table_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.expire_line_setup_sessions(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.expire_line_setup_sessions(uuid)', 'execute')
    or has_function_privilege('anon', 'public.purge_expired_line_chat_data(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.purge_expired_line_chat_data(uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_line_chat_outbox_contract()', 'execute')
    or has_function_privilege('authenticated', 'public.validate_line_chat_outbox_contract()', 'execute')
    or has_function_privilege('anon', 'public.enqueue_line_chat_message(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.enqueue_line_chat_message(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('anon', 'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_line_credential_rotation()', 'execute')
    or has_function_privilege('authenticated', 'public.validate_line_credential_rotation()', 'execute')
    or has_function_privilege('anon', 'public.initialize_line_credential_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.initialize_line_credential_generation()', 'execute')
    or has_function_privilege('anon', 'public.initialize_customer_line_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.initialize_customer_line_generation()', 'execute')
    or has_function_privilege('anon', 'public.protect_customer_line_identity()', 'execute')
    or has_function_privilege('authenticated', 'public.protect_customer_line_identity()', 'execute')
    or has_function_privilege('anon', 'public.initialize_line_message_outbox_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.initialize_line_message_outbox_generation()', 'execute')
    or has_function_privilege('anon', 'public.sync_failed_line_notification_tracking()', 'execute')
    or has_function_privilege('authenticated', 'public.sync_failed_line_notification_tracking()', 'execute')
    or has_function_privilege('anon', 'public.quarantine_unverified_line_notification_history()', 'execute')
    or has_function_privilege('authenticated', 'public.quarantine_unverified_line_notification_history()', 'execute')
    or has_function_privilege('anon', 'public.claim_line_notification_outbox(uuid,uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_line_notification_outbox(uuid,uuid,integer)', 'execute')
    or has_function_privilege('anon', 'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)', 'execute')
    or has_function_privilege('authenticated', 'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)', 'execute')
    or has_function_privilege('anon', 'public.renew_line_notification_claim(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.renew_line_notification_claim(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_line_current_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.validate_line_current_generation()', 'execute')
    or has_function_privilege('anon', 'public.claim_line_chat_outbox(uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_line_chat_outbox(uuid,integer)', 'execute')
    or has_function_privilege('anon', 'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)', 'execute')
    or has_function_privilege('anon', 'public.close_line_setup_session(uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.close_line_setup_session(uuid,uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.relink_line_contact_generation(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.relink_line_contact_generation(uuid,uuid,text,uuid)', 'execute')
  then
    raise exception 'Refusing rollback: client function EXECUTE grant drift';
  end if;

  foreach function_oid in array array[
    'public.expire_line_setup_sessions(uuid)'::regprocedure::oid,
    'public.purge_expired_line_chat_data(uuid)'::regprocedure::oid,
    'public.validate_line_chat_outbox_contract()'::regprocedure::oid,
    'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure::oid,
    'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)'::regprocedure::oid,
    'public.validate_line_credential_rotation()'::regprocedure::oid,
    'public.initialize_line_credential_generation()'::regprocedure::oid,
    'public.initialize_customer_line_generation()'::regprocedure::oid,
    'public.protect_customer_line_identity()'::regprocedure::oid,
    'public.initialize_line_message_outbox_generation()'::regprocedure::oid,
    'public.sync_failed_line_notification_tracking()'::regprocedure::oid,
    'public.quarantine_unverified_line_notification_history()'::regprocedure::oid,
    'public.claim_line_notification_outbox(uuid,uuid,integer)'::regprocedure::oid,
    'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)'::regprocedure::oid,
    'public.renew_line_notification_claim(uuid,uuid,uuid)'::regprocedure::oid,
    'public.validate_line_current_generation()'::regprocedure::oid,
    'public.claim_line_chat_outbox(uuid,integer)'::regprocedure::oid,
    'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure::oid,
    'public.close_line_setup_session(uuid,uuid,text)'::regprocedure::oid,
    'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)'::regprocedure::oid,
    'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure::oid
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
    then
      raise exception 'Refusing rollback: exact function ACL drift: %', function_oid;
    end if;

    if exists (
      select 1
      from pg_proc function_data
      where function_data.oid = function_oid
        and (
          function_data.prosecdef is distinct from (
            function_data.oid = 'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure::oid
          )
          or pg_get_userbyid(function_data.proowner) <> 'postgres'
          or not exists (
            select 1
            from unnest(coalesce(function_data.proconfig, array[]::text[])) setting
            where setting = 'search_path=pg_catalog, public'
          )
        )
    ) then
      raise exception 'Refusing rollback: function contract drift: %', function_oid;
    end if;
  end loop;
end
$postflight$;

commit;

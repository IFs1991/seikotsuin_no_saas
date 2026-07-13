begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table _pr03_service_policies (
  table_name text not null,
  policy_name text not null,
  primary key (table_name, policy_name)
) on commit drop;

insert into _pr03_service_policies (table_name, policy_name)
values
  ('appointments', 'appointments_insert_service_role'),
  ('audit_logs', 'audit_logs_insert_service_role'),
  ('beta_usage_metrics', 'System can insert metrics'),
  ('billing_audit_logs', 'service_role full access billing audit logs'),
  ('billing_overrides', 'service_role full access billing overrides'),
  ('csp_violations', 'csp_violations_insert_any'),
  ('email_logs', 'service_role_full_access_logs'),
  ('email_outbox', 'service_role_full_access_outbox'),
  ('notifications', 'notifications_insert_service_role'),
  ('patients', 'patients_insert_legacy_block'),
  ('reservation_history', 'reservation_history_insert_service_role'),
  (
    'reservation_notifications',
    'service_role_full_access_reservation_notifications'
  ),
  ('security_alerts', 'security_alerts_insert_any'),
  ('security_events', 'security_events_insert_service_role'),
  ('staff', 'staff_insert_legacy_block'),
  ('stripe_webhook_events', 'service_role full access stripe webhook events'),
  ('subscriptions', 'service_role full access subscriptions');

do $preflight$
declare
  missing_service_policies text;
  policy_role_drift text;
begin
  if to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
  then
    raise exception 'PR-03 preflight failed: required Supabase roles are missing';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
  ) <> 216 or (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and roles = array['public']::name[]
  ) <> 168 or (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and roles = array['authenticated']::name[]
  ) <> 48 then
    raise exception
      'PR-03 preflight failed: expected the reviewed post-PR-02 216-policy catalog (168 public, 48 authenticated)';
  end if;

  select string_agg(
    format('%I.%I roles=%s', tablename, policyname, roles::text),
    ', ' order by tablename, policyname
  )
  into policy_role_drift
  from pg_policies
  where schemaname = 'public'
    and roles not in (
      array['public']::name[],
      array['authenticated']::name[]
    );

  if policy_role_drift is not null then
    raise exception
      'PR-03 preflight failed: unreviewed policy role target(s): %',
      policy_role_drift;
  end if;

  select string_agg(
    format('%I.%I', expected.table_name, expected.policy_name),
    ', ' order by expected.table_name, expected.policy_name
  )
  into missing_service_policies
  from _pr03_service_policies expected
  left join pg_policies actual
    on actual.schemaname = 'public'
   and actual.tablename = expected.table_name
   and actual.policyname = expected.policy_name
  where actual.policyname is null;

  if missing_service_policies is not null then
    raise exception
      'PR-03 preflight failed: reviewed service-role policy set is incomplete: %',
      missing_service_policies;
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        roles && array['service_role']::name[]
        or policyname ~* 'service[_ ]role'
        or coalesce(qual, '') ~* 'service_role'
        or coalesce(with_check, '') ~* 'service_role'
      )
  ) <> 17 then
    raise exception
      'PR-03 preflight failed: service-role semantic policy set drifted';
  end if;

  if (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, 'SELECT')
  ) <> 0 then
    raise exception
      'PR-03 preflight failed: PR-02 anon relation boundary is absent';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (tablename, policyname) in (
        values
          ('clinic_settings', 'clinic_settings_select_policy'),
          ('clinic_settings', 'clinic_settings_upsert_policy')
      )
      and (
        coalesce(qual, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
        or coalesce(qual, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
        or coalesce(with_check, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
        or coalesce(with_check, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
      )
  ) <> 2 then
    raise exception
      'PR-03 preflight failed: clinic_settings tautology evidence drifted';
  end if;
end
$preflight$;

-- PR-02 removed every client ACL from the two legacy relations. RLS is now
-- enabled as deny-all defense in depth; service_role continues to bypass RLS.
alter table public.treatment_menu_records enable row level security;
alter table public.treatments enable row level security;

-- service_role is a BYPASSRLS role. These policies never provide the server
-- boundary and only expand policy evaluation to client roles.
drop policy "appointments_insert_service_role" on public.appointments;
drop policy "audit_logs_insert_service_role" on public.audit_logs;
drop policy "System can insert metrics" on public.beta_usage_metrics;
drop policy "service_role full access billing audit logs"
on public.billing_audit_logs;
drop policy "service_role full access billing overrides"
on public.billing_overrides;
drop policy "csp_violations_insert_any" on public.csp_violations;
drop policy "service_role_full_access_logs" on public.email_logs;
drop policy "service_role_full_access_outbox" on public.email_outbox;
drop policy "notifications_insert_service_role" on public.notifications;
drop policy "patients_insert_legacy_block" on public.patients;
drop policy "reservation_history_insert_service_role"
on public.reservation_history;
drop policy "service_role_full_access_reservation_notifications"
on public.reservation_notifications;
drop policy "security_alerts_insert_any" on public.security_alerts;
drop policy "security_events_insert_service_role" on public.security_events;
drop policy "staff_insert_legacy_block" on public.staff;
drop policy "service_role full access stripe webhook events"
on public.stripe_webhook_events;
drop policy "service_role full access subscriptions" on public.subscriptions;

-- Remove predicates that are exact duplicates, tautological, or strict
-- subsets of the retained reviewed policy. Intentional admin/self OR policy
-- pairs on other tables remain separate and documented.
drop policy "clinic_settings_select_policy" on public.clinic_settings;
drop policy "clinic_settings_upsert_policy" on public.clinic_settings;
drop policy "clinics_admin_select" on public.clinics;
drop policy "improvement_backlog_admin_all" on public.improvement_backlog;
drop policy "improvement_backlog_authenticated_select"
on public.improvement_backlog;
drop policy "Admins can manage backlog" on public.improvement_backlog;
drop policy "Admins can view MFA usage stats" on public.mfa_usage_stats;
drop policy "staff_preferences_update_policy" on public.staff_preferences;
drop policy "staff_preferences_upsert_policy" on public.staff_preferences;
drop policy "Admins can view clinic MFA settings"
on public.user_mfa_settings;
drop policy "Users can view own MFA settings" on public.user_mfa_settings;

-- The former ALL policy overlapped the authenticated read policy. Split its
-- write behavior into command-specific policies without widening access.
create policy improvement_backlog_admin_insert
on public.improvement_backlog
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.role::text = 'admin'
  )
);

create policy improvement_backlog_admin_update
on public.improvement_backlog
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.role::text = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.role::text = 'admin'
  )
);

create policy improvement_backlog_admin_delete
on public.improvement_backlog
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.role::text = 'admin'
  )
);

-- Every retained client policy now explicitly excludes anon. PR-02 already
-- made public flows server mediated and removed anon relation privileges.
do $normalize_roles$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = array['public']::name[]
    order by tablename, policyname
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$normalize_roles$;

-- Preserve clinic_settings behavior while making re-homing checks explicit.
alter policy clinic_settings_update
on public.clinic_settings
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager']
  )
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager']
  )
  and app_private.can_access_clinic(clinic_id)
);

-- Supabase recommends wrapping stable auth helpers in SELECT so PostgreSQL
-- produces an initialization plan instead of evaluating the helper per row.
alter policy manager_clinic_assignments_select_admin_or_self_active
on public.manager_clinic_assignments
to authenticated
using (
  app_private.get_current_role() = 'admin'
  or (
    manager_user_id = (select auth.uid())
    and revoked_at is null
  )
);

alter policy calendar_feed_tokens_select_scoped
on public.calendar_feed_tokens
to authenticated
using (
  app_private.get_current_role() = 'admin'
  or created_by = (select auth.uid())
  or (
    feed_type = 'clinic'
    and clinic_id is not null
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    feed_type = 'staff'
    and staff_profile_id is not null
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = calendar_feed_tokens.staff_profile_id
        and sp.user_id = (select auth.uid())
    )
  )
  or (
    feed_type = 'staff'
    and staff_profile_id is not null
    and exists (
      select 1
      from public.staff_clinic_memberships scm
      where scm.staff_profile_id = calendar_feed_tokens.staff_profile_id
        and app_private.can_access_clinic(scm.clinic_id)
    )
  )
);

alter policy staff_profiles_select_scoped
on public.staff_profiles
to authenticated
using (
  app_private.get_current_role() = 'admin'
  or user_id = (select auth.uid())
  or exists (
    select 1
    from public.staff_clinic_memberships scm
    where scm.staff_profile_id = staff_profiles.id
      and app_private.can_access_clinic(scm.clinic_id)
  )
);

alter policy staff_clinic_memberships_select_scoped
on public.staff_clinic_memberships
to authenticated
using (
  app_private.get_current_role() = 'admin'
  or app_private.can_access_clinic(clinic_id)
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = staff_clinic_memberships.staff_profile_id
      and sp.user_id = (select auth.uid())
  )
);

alter policy shift_requests_select_scoped
on public.shift_requests
to authenticated
using (
  (
    app_private.get_current_role() = any (
      array['admin', 'manager', 'clinic_admin']
    )
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = (select auth.uid())
  )
);

alter policy shift_requests_insert_scoped
on public.shift_requests
to authenticated
with check (
  (
    app_private.get_current_role() = any (
      array['admin', 'manager', 'clinic_admin']
    )
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = (select auth.uid())
    and submitted_by = (select auth.uid())
    and submitted_for_role = app_private.get_current_role()
  )
);

alter policy shift_requests_update_scoped
on public.shift_requests
to authenticated
using (
  (
    app_private.get_current_role() = any (
      array['admin', 'manager', 'clinic_admin']
    )
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = (select auth.uid())
  )
)
with check (
  (
    app_private.get_current_role() = any (array['admin', 'manager'])
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = 'clinic_admin'
    and app_private.can_access_clinic(clinic_id)
    and status <> 'converted'
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = (select auth.uid())
    and status in ('draft', 'submitted', 'rejected', 'withdrawn')
    and converted_shift_id is null
  )
);

-- Policy comments are part of the catalog contract and explain why there is
-- no public/service_role target even when the application has a public flow.
do $comment_policies$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    execute format(
      'comment on policy %I on %I.%I is %L',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename,
      format(
        'PR-03: authenticated-only %s policy; authorization remains defined by the reviewed USING/WITH CHECK predicate. Server service_role flows use BYPASSRLS.',
        policy_record.cmd
      )
    );
  end loop;
end
$comment_policies$;

do $postflight$
declare
  unsafe_policies text;
begin
  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
  ) <> 191 then
    raise exception
      'PR-03 postflight failed: expected exactly 191 reviewed public policies';
  end if;

  select string_agg(
    format('%I.%I roles=%s', tablename, policyname, roles::text),
    ', ' order by tablename, policyname
  )
  into unsafe_policies
  from pg_policies
  where schemaname = 'public'
    and roles <> array['authenticated']::name[];

  if unsafe_policies is not null then
    raise exception
      'PR-03 postflight failed: non-authenticated policy target(s): %',
      unsafe_policies;
  end if;

  select string_agg(
    format('%I.%I', tablename, policyname),
    ', ' order by tablename, policyname
  )
  into unsafe_policies
  from pg_policies
  where schemaname = 'public'
    and (
      policyname ~* 'service[_ ]role'
      or coalesce(qual, '') ~* 'service_role'
      or coalesce(with_check, '') ~* 'service_role'
      or coalesce(qual, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
      or coalesce(qual, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
      or coalesce(with_check, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
      or coalesce(with_check, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
    );

  if unsafe_policies is not null then
    raise exception
      'PR-03 postflight failed: service or tautological policy remains: %',
      unsafe_policies;
  end if;

  if exists (
    select 1
    from pg_policy policy_catalog
    join pg_class table_catalog on table_catalog.oid = policy_catalog.polrelid
    join pg_namespace namespace_catalog
      on namespace_catalog.oid = table_catalog.relnamespace
    where namespace_catalog.nspname = 'public'
      and coalesce(
        obj_description(policy_catalog.oid, 'pg_policy'),
        ''
      ) not like 'PR-03:%'
  ) then
    raise exception
      'PR-03 postflight failed: an undocumented public policy remains';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'graphql_public')
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ) then
    raise exception
      'PR-03 postflight failed: an exposed table remains without RLS';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('treatment_menu_records', 'treatments')
  ) then
    raise exception
      'PR-03 postflight failed: legacy deny-all tables gained a client policy';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (tablename, policyname) in (
        values
          (
            'manager_clinic_assignments',
            'manager_clinic_assignments_select_admin_or_self_active'
          ),
          ('calendar_feed_tokens', 'calendar_feed_tokens_select_scoped'),
          ('staff_profiles', 'staff_profiles_select_scoped'),
          (
            'staff_clinic_memberships',
            'staff_clinic_memberships_select_scoped'
          ),
          ('shift_requests', 'shift_requests_select_scoped'),
          ('shift_requests', 'shift_requests_insert_scoped'),
          ('shift_requests', 'shift_requests_update_scoped')
      )
      and concat_ws(' ', qual, with_check) ~* 'SELECT auth\.uid\(\)'
  ) <> 7 then
    raise exception
      'PR-03 postflight failed: reviewed auth.uid initplan targets drifted';
  end if;
end
$postflight$;

commit;

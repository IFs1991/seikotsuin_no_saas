begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(40);

select is(
  (
    select count(*)
    from pg_default_acl d
    join pg_roles owner_role on owner_role.oid = d.defaclrole
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where owner_role.rolname = 'postgres'
      and (n.nspname = 'public' or d.defaclnamespace = 0)
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and d.defaclobjtype in ('r', 'S', 'f')
  ),
  0::bigint,
  'postgres public defaults do not expose future tables, sequences, or functions to client roles'
);

select is(
  (
    select count(*)
    from pg_roles owner_role
    left join pg_default_acl d
      on d.defaclrole = owner_role.oid
     and d.defaclnamespace = 0
     and d.defaclobjtype = 'f'
    cross join lateral aclexplode(
      coalesce(d.defaclacl, acldefault('f', owner_role.oid))
    ) acl
    where owner_role.rolname = 'postgres'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'postgres global function defaults do not grant EXECUTE to PUBLIC'
);

select is(
  (
    select count(*)
    from (
      select c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles owner_role on owner_role.oid = c.relowner
      where n.nspname = 'public'
        and owner_role.rolname = 'supabase_admin'
        and not exists (
          select 1
          from pg_depend d
          where d.classid = 'pg_class'::regclass
            and d.objid = c.oid
            and d.refclassid = 'pg_extension'::regclass
            and d.deptype = 'e'
        )

      union all

      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles owner_role on owner_role.oid = p.proowner
      where n.nspname = 'public'
        and owner_role.rolname = 'supabase_admin'
        and not exists (
          select 1
          from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.refclassid = 'pg_extension'::regclass
            and d.deptype = 'e'
        )
    ) platform_owned_application_objects
  ),
  0::bigint,
  'supabase_admin owns no non-extension public application objects'
);

select is(
  (
    select count(*)
    from pg_auth_members memberships
    join pg_roles member_role on member_role.oid = memberships.member
    where member_role.rolname in ('anon', 'authenticated')
  ),
  0::bigint,
  'client roles do not inherit privileges through role membership'
);

set local role postgres;

create table public.commercial_privilege_table_probe (
  id uuid primary key
);

create sequence public.commercial_privilege_sequence_probe;

create function public.commercial_privilege_function_probe()
returns integer
language sql
as $function$
  select 1
$function$;

reset role;

select is(
  (
    select count(*)
    from (
      select c.relowner as owner_oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'commercial_privilege_table_probe',
          'commercial_privilege_sequence_probe'
        )

      union all

      select p.proowner
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'commercial_privilege_function_probe'
    ) probe_owners
    join pg_roles owner_role on owner_role.oid = probe_owners.owner_oid
    where owner_role.rolname = 'postgres'
  ),
  3::bigint,
  'future-object probes are owned by postgres'
);

select ok(
  not has_table_privilege('anon', 'public.commercial_privilege_table_probe', 'SELECT')
  and not has_table_privilege('anon', 'public.commercial_privilege_table_probe', 'INSERT')
  and not has_table_privilege('anon', 'public.commercial_privilege_table_probe', 'UPDATE')
  and not has_table_privilege('anon', 'public.commercial_privilege_table_probe', 'DELETE'),
  'a new postgres-owned table is not exposed to anon'
);

select ok(
  not has_table_privilege('authenticated', 'public.commercial_privilege_table_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.commercial_privilege_table_probe', 'INSERT')
  and not has_table_privilege('authenticated', 'public.commercial_privilege_table_probe', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.commercial_privilege_table_probe', 'DELETE'),
  'a new postgres-owned table is not exposed to authenticated'
);

select ok(
  not has_sequence_privilege('anon', 'public.commercial_privilege_sequence_probe', 'USAGE')
  and not has_sequence_privilege('anon', 'public.commercial_privilege_sequence_probe', 'SELECT')
  and not has_sequence_privilege('anon', 'public.commercial_privilege_sequence_probe', 'UPDATE'),
  'a new postgres-owned sequence is not exposed to anon'
);

select ok(
  not has_sequence_privilege('authenticated', 'public.commercial_privilege_sequence_probe', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.commercial_privilege_sequence_probe', 'SELECT')
  and not has_sequence_privilege('authenticated', 'public.commercial_privilege_sequence_probe', 'UPDATE'),
  'a new postgres-owned sequence is not exposed to authenticated'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.commercial_privilege_function_probe()',
    'EXECUTE'
  ),
  'a new postgres-owned function is not executable by anon or inherited PUBLIC access'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.commercial_privilege_function_probe()',
    'EXECUTE'
  ),
  'a new postgres-owned function is not executable by authenticated or inherited PUBLIC access'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(
      array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
    ) privilege(privilege_type)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege(
        client.role_name,
        c.oid,
        privilege.privilege_type
      )
  ),
  0::bigint,
  'client roles have no TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN relation privileges'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) privilege(privilege_type)
    where n.nspname = 'public'
      and c.relkind = 'S'
      and has_sequence_privilege(
        client.role_name,
        c.oid,
        privilege.privilege_type
      )
  ),
  0::bigint,
  'existing public sequences have no PUBLIC or client ACLs'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(
      array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]
    ) privilege(privilege_type)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, privilege.privilege_type)
  ),
  0::bigint,
  'anon has no effective public relation privileges'
);

select is(
  (
    select count(*) from (
      select c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
        and (
          acl.grantee = 0
          or (
            grantee.rolname in ('anon', 'authenticated')
            and acl.is_grantable
          )
        )

      union all

      select a.attrelid
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(a.attacl) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = 'public'
        and (
          acl.grantee = 0
          or (
            grantee.rolname in ('anon', 'authenticated')
            and acl.is_grantable
          )
        )
    ) unsafe_acl
  ),
  0::bigint,
  'PUBLIC ACLs and client grant options are absent from public relations'
);

select is(
  (
    select count(*)
    from unnest(array[
        'billing_audit_logs',
        'billing_overrides',
        'clinic_line_credentials',
        'email_logs',
        'email_outbox',
        'encryption_keys',
        'internal_job_runs',
        'line_message_outbox',
        'reservation_notifications',
        'stripe_webhook_events'
      ]) internal(table_name)
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(
      array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]
    ) privilege(privilege_type)
    where has_table_privilege(
      client.role_name,
      format('public.%I', internal.table_name),
      privilege.privilege_type
    )
  ),
  0::bigint,
  'internal service tables have no client relation privileges'
);

select is(
  (
    select count(*)
    from unnest(array[
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      ]) legacy(table_name)
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(
      array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]
    ) privilege(privilege_type)
    where has_table_privilege(
      client.role_name,
      format('public.%I', legacy.table_name),
      privilege.privilege_type
    )
  ),
  0::bigint,
  'legacy quarantine tables have no client relation privileges'
);

select is(
  (
    select count(*)
    from unnest(array[
        'master_categories',
        'master_patient_types',
        'master_payment_methods',
        'menu_categories'
      ]) shared(table_name)
    where has_table_privilege(
      'authenticated',
      format('public.%I', shared.table_name),
      'SELECT'
    )
  ),
  4::bigint,
  'authenticated has SELECT on every shared master table'
);

select is(
  (
    with expected(
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    ) as (
      values
        (
          'master_categories',
          'master_categories_authenticated_read',
          'PERMISSIVE',
          '{authenticated}',
          'SELECT',
          'true',
          null::text
        ),
        (
          'master_patient_types',
          'master_patient_types_authenticated_read',
          'PERMISSIVE',
          '{authenticated}',
          'SELECT',
          'true',
          null::text
        ),
        (
          'master_payment_methods',
          'master_payment_methods_authenticated_read',
          'PERMISSIVE',
          '{authenticated}',
          'SELECT',
          'true',
          null::text
        ),
        (
          'menu_categories',
          'menu_categories_authenticated_read',
          'PERMISSIVE',
          '{authenticated}',
          'SELECT',
          'true',
          null::text
        )
    ),
    actual as (
      select
        tablename,
        policyname,
        permissive,
        roles::text,
        cmd,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'master_categories',
          'master_patient_types',
          'master_payment_methods',
          'menu_categories'
        )
    ),
    differences as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select count(*) from differences
  ),
  0::bigint,
  'shared master policy definitions match the reviewed table-policy pairs exactly'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'master_categories',
        'master_patient_types',
        'master_payment_methods',
        'menu_categories'
      )
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  ),
  4::bigint,
  'row-level security is enabled on every shared master table'
);

select is(
  (
    select count(*)
    from unnest(array[
        'master_categories',
        'master_patient_types',
        'master_payment_methods',
        'menu_categories'
      ]) shared(table_name)
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(
      array[
        'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]
    ) privilege(privilege_type)
    where has_table_privilege(
      client.role_name,
      format('public.%I', shared.table_name),
      privilege.privilege_type
    )
  ),
  0::bigint,
  'shared master tables are read-only for authenticated and closed to anon'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated can read profiles subject to RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated has no table-wide profile write privilege'
);

select is(
  (
    with expected(column_name) as (
      select unnest(array[
        'avatar_url',
        'full_name',
        'language_preference',
        'last_login_at',
        'phone_number',
        'timezone',
        'updated_at'
      ])
    ),
    actual as (
      select a.attname as column_name
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(a.attacl) acl
      join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = 'public'
        and c.relname = 'profiles'
        and grantee.rolname = 'authenticated'
        and acl.privilege_type = 'UPDATE'
    ),
    differences as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select count(*) from differences
  ),
  0::bigint,
  'authenticated profile UPDATE column ACLs match the seven-column allowlist exactly'
);

select is(
  (
    select count(*)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and not (
        c.relname = 'profiles'
        and grantee.rolname = 'authenticated'
        and acl.privilege_type = 'UPDATE'
        and a.attname in (
          'avatar_url',
          'full_name',
          'language_preference',
          'last_login_at',
          'phone_number',
          'timezone',
          'updated_at'
        )
      )
  ),
  0::bigint,
  'no PUBLIC or client column ACL exists outside the profile allowlist'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'clinic_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'is_active', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE'),
  'authenticated cannot update profile authority columns'
);

select is(
  (
    with expected(table_name, privilege_type) as (
      select unnest(array[
        'ai_comments', 'audit_logs', 'beta_feedback', 'beta_usage_metrics',
        'blocks', 'chat_messages', 'chat_sessions', 'clinic_feature_flags',
        'clinic_settings', 'clinics', 'csp_violations',
        'customer_insurance_coverages', 'customers',
        'daily_report_items', 'daily_reports', 'improvement_backlog',
        'master_categories',
        'master_patient_types', 'master_payment_methods', 'menu_billing_profiles',
        'menu_categories', 'menus', 'mfa_setup_sessions', 'notifications',
        'onboarding_states', 'patients', 'profiles', 'registered_devices',
        'reservations', 'resources', 'revenue_contexts',
        'revenue_estimate_lines', 'revenue_estimate_warnings',
        'revenue_estimates', 'security_events', 'session_policies',
        'shift_request_periods', 'shift_requests', 'staff', 'staff_invites',
        'staff_performance', 'staff_preferences', 'staff_profiles',
        'staff_shifts', 'user_mfa_settings', 'user_permissions', 'user_sessions',
        'daily_report_revenue_breakdown_summary',
        'daily_report_revenue_context_summary',
        'daily_report_revenue_estimate_summary', 'daily_revenue_summary',
        'patient_visit_summary', 'reservation_list_view',
        'staff_performance_summary'
      ]),
      'SELECT'

      union all

      select unnest(array[
        'ai_comments', 'beta_feedback', 'blocks', 'chat_messages',
        'chat_sessions', 'clinic_settings', 'daily_reports',
        'improvement_backlog', 'menus', 'mfa_setup_sessions',
        'onboarding_states', 'registered_devices', 'reservations', 'resources',
        'security_events', 'shift_request_periods', 'shift_requests', 'staff',
        'staff_invites', 'staff_preferences', 'staff_shifts',
        'user_mfa_settings', 'user_sessions'
      ]),
      'INSERT'

      union all

      select unnest(array[
        'ai_comments', 'beta_feedback', 'clinic_settings', 'csp_violations',
        'daily_reports', 'improvement_backlog', 'menus', 'onboarding_states',
        'registered_devices', 'reservations', 'resources', 'security_events',
        'shift_request_periods', 'shift_requests', 'staff_shifts',
        'user_mfa_settings', 'user_sessions'
      ]),
      'UPDATE'

      union all

      select unnest(array[
        'blocks', 'daily_reports', 'improvement_backlog', 'mfa_setup_sessions'
      ]),
      'DELETE'
    ),
    actual as (
      select c.relname as table_name, privilege.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(
        array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE',
          'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
        ]
      ) privilege(privilege_type)
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and has_table_privilege(
          'authenticated',
          c.oid,
          privilege.privilege_type
        )
    ),
    differences as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select count(*) from differences
  ),
  0::bigint,
  'authenticated public relation privileges match the reviewed PR-02 matrix exactly'
);

select is(
  (
    select count(*)
    from unnest(array[
      'billing_audit_logs',
      'billing_overrides',
      'clinic_line_credentials',
      'email_logs',
      'email_outbox',
      'encryption_keys',
      'internal_job_runs',
      'line_message_outbox',
      'reservation_notifications',
      'stripe_webhook_events'
    ]) as internal(table_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege(privilege_type)
    where has_table_privilege(
      'service_role',
      format('public.%I', internal.table_name),
      privilege.privilege_type
    )
  ),
  40::bigint,
  'service_role retains the four application DML privileges on internal tables'
);

select is(
  (
    select count(*)
    from unnest(array[
        'daily_report_revenue_breakdown_summary',
        'daily_report_revenue_context_summary',
        'daily_report_revenue_estimate_summary',
        'daily_revenue_summary',
        'patient_visit_summary',
        'reservation_list_view',
        'staff_performance_summary'
      ]) runtime_view(table_name)
    where has_table_privilege(
      'authenticated',
      format('public.%I', runtime_view.table_name),
      'SELECT'
    )
  ),
  7::bigint,
  'authenticated keeps SELECT on all runtime public views'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'daily_report_revenue_breakdown_summary',
        'daily_report_revenue_context_summary',
        'daily_report_revenue_estimate_summary',
        'daily_revenue_summary',
        'patient_visit_summary',
        'reservation_list_view',
        'staff_performance_summary'
      )
      and c.relkind = 'v'
      and coalesce(c.reloptions, array[]::text[])
        @> array['security_invoker=true']
  ),
  7::bigint,
  'every authenticated runtime view executes with invoker security'
);

select is(
  (
    select count(*)
    from pg_proc p
    where p.oid = 'public.get_hourly_visit_pattern(uuid)'::regprocedure
      and not p.prosecdef
      and coalesce(p.proconfig, array[]::text[])
        @> array['search_path=public, auth, extensions']
  ),
  1::bigint,
  'legacy heatmap keeps SECURITY INVOKER and the fixed search_path'
);

insert into public.master_categories (id, name, description)
values (
  '00000000-0000-0000-0000-000000000202',
  '__commercial_pr02_shared_master_probe__',
  'rolled back by commercial_privileges_test.sql'
);

insert into public.clinics (id, name)
values
  (
    'f2020000-0000-4000-8000-000000000001',
    '__commercial_pr02_clinic_a__'
  ),
  (
    'f2020000-0000-4000-8000-000000000002',
    '__commercial_pr02_clinic_b__'
  );

insert into public.visits (id, clinic_id, visit_date)
values
  (
    'f2020000-0000-4000-8000-000000000101',
    'f2020000-0000-4000-8000-000000000001',
    current_timestamp - interval '1 hour'
  ),
  (
    'f2020000-0000-4000-8000-000000000102',
    'f2020000-0000-4000-8000-000000000002',
    current_timestamp - interval '1 hour'
  );

insert into public.revenues (
  id,
  visit_id,
  clinic_id,
  revenue_date,
  amount
)
values
  (
    'f2020000-0000-4000-8000-000000000201',
    'f2020000-0000-4000-8000-000000000101',
    'f2020000-0000-4000-8000-000000000001',
    current_date,
    100.00
  ),
  (
    'f2020000-0000-4000-8000-000000000202',
    'f2020000-0000-4000-8000-000000000102',
    'f2020000-0000-4000-8000-000000000002',
    current_date,
    200.00
  ),
  (
    'f2020000-0000-4000-8000-000000000203',
    'f2020000-0000-4000-8000-000000000101',
    'f2020000-0000-4000-8000-000000000002',
    current_date,
    900.00
  );

set local role anon;

select throws_ok(
  'select * from public.email_outbox limit 0',
  '42501',
  null::text,
  'anon direct access to an internal table is permission denied'
);

reset role;
set local role authenticated;

select results_eq(
  $query$
    select id::text
    from public.master_categories
    where id = '00000000-0000-0000-0000-000000000202'
  $query$,
  $expected$
    values ('00000000-0000-0000-0000-000000000202'::text)
  $expected$,
  'authenticated can see a concrete shared-master row through RLS'
);

select throws_ok(
  'delete from public.master_categories where false',
  '42501',
  null::text,
  'authenticated cannot directly write a shared master table'
);

select throws_ok(
  'update public.profiles set role = role where false',
  '42501',
  null::text,
  'authenticated cannot directly update a profile authority column'
);

select throws_ok(
  'select * from public.revenues limit 0',
  '42501',
  null::text,
  'authenticated cannot directly read a quarantined legacy table'
);

select throws_ok(
  $query$
    select *
    from public.get_hourly_visit_pattern(
      'f2020000-0000-4000-8000-000000000001'
    )
  $query$,
  '42501',
  null::text,
  'authenticated cannot indirectly read quarantined legacy tables through the heatmap RPC'
);

reset role;
set local role service_role;

select lives_ok(
  'select * from public.email_outbox limit 0',
  'service_role direct internal-table flow remains available'
);

select results_eq(
  $query$
    select count(*)
    from public.revenues
    where clinic_id = 'f2020000-0000-4000-8000-000000000001'
  $query$,
  $expected$
    values (1::bigint)
  $expected$,
  'service_role keeps the clinic-scoped legacy revenue read used by the API'
);

select results_eq(
  $query$
    select
      coalesce(sum(visit_count), 0)::bigint,
      coalesce(sum(avg_revenue), 0)::numeric
    from public.get_hourly_visit_pattern(
      'f2020000-0000-4000-8000-000000000001'
    )
  $query$,
  $expected$
    values (1::bigint, 100.00::numeric)
  $expected$,
  'service_role heatmap excludes a mismatched cross-clinic revenue fixture'
);

reset role;

select * from finish();

rollback;

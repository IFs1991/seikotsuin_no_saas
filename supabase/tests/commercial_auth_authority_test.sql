begin;

set local search_path = pg_catalog, extensions, public;
set local role postgres;

select plan(65);

-- PR-00 deliberately keeps these operational tables off the direct Data API.
-- Grant only inside this rolled-back test transaction so the PR-09 policy
-- predicates themselves are still exercised as authenticated without
-- widening the production relation ACL contract.
grant select, insert, update, delete
on table public.critical_incidents
to authenticated;

grant select
on table public.mfa_usage_stats
to authenticated;

-- PR-00 keeps memberships off the direct Data API. Grant SELECT only inside
-- this rolled-back transaction so the tightened PR-09 RLS predicate can be
-- exercised as authenticated without changing the production ACL.
grant select
on table public.staff_clinic_memberships
to authenticated;

insert into public.clinics (id, name, parent_id)
values
  (
    'f3090000-0000-4000-8000-000000000000',
    '__commercial_pr09_root_a__',
    null
  ),
  (
    'f3090000-0000-4000-8000-000000000001',
    '__commercial_pr09_clinic_a1__',
    'f3090000-0000-4000-8000-000000000000'
  ),
  (
    'f3090000-0000-4000-8000-000000000002',
    '__commercial_pr09_clinic_a2__',
    'f3090000-0000-4000-8000-000000000000'
  ),
  (
    'f3090000-0000-4000-8000-0000000000ff',
    '__commercial_pr09_root_b__',
    null
  );

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
)
select
  fixture.id,
  fixture.email,
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  'authenticated'
from (
  values
    (
      'f3090000-0000-4000-8000-000000000010'::uuid,
      'commercial-pr09-staff@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000020'::uuid,
      'commercial-pr09-clinic-admin@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000030'::uuid,
      'commercial-pr09-missing-permission@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000040'::uuid,
      'commercial-pr09-inactive@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000050'::uuid,
      'commercial-pr09-manager@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000060'::uuid,
      'commercial-pr09-admin-missing-profile@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000070'::uuid,
      'commercial-pr09-active-admin@example.invalid'
    )
) as fixture(id, email);

insert into public.profiles (
  user_id,
  clinic_id,
  email,
  full_name,
  role,
  is_active
)
values
  (
    'f3090000-0000-4000-8000-000000000010',
    'f3090000-0000-4000-8000-000000000001',
    'commercial-pr09-staff@example.invalid',
    'Commercial PR09 Staff',
    'staff',
    true
  ),
  (
    'f3090000-0000-4000-8000-000000000020',
    'f3090000-0000-4000-8000-000000000000',
    'commercial-pr09-clinic-admin@example.invalid',
    'Commercial PR09 Clinic Admin',
    'clinic_admin',
    true
  ),
  (
    'f3090000-0000-4000-8000-000000000030',
    'f3090000-0000-4000-8000-000000000001',
    'commercial-pr09-missing-permission@example.invalid',
    'Commercial PR09 Missing Permission',
    'admin',
    true
  ),
  (
    'f3090000-0000-4000-8000-000000000040',
    'f3090000-0000-4000-8000-000000000001',
    'commercial-pr09-inactive@example.invalid',
    'Commercial PR09 Inactive',
    'admin',
    false
  ),
  (
    'f3090000-0000-4000-8000-000000000050',
    'f3090000-0000-4000-8000-000000000001',
    'commercial-pr09-manager@example.invalid',
    'Commercial PR09 Manager',
    'manager',
    true
  ),
  (
    'f3090000-0000-4000-8000-000000000070',
    'f3090000-0000-4000-8000-000000000000',
    'commercial-pr09-active-admin@example.invalid',
    'Commercial PR09 Active Admin',
    'admin',
    true
  );

insert into public.staff (id, clinic_id, name, role, email, password_hash)
select
  fixture.id,
  fixture.clinic_id,
  fixture.name,
  fixture.role,
  fixture.email,
  'not-used'
from (
  values
    (
      'f3090000-0000-4000-8000-000000000010'::uuid,
      'f3090000-0000-4000-8000-000000000001'::uuid,
      'Commercial PR09 Staff',
      'staff',
      'commercial-pr09-staff@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000020'::uuid,
      'f3090000-0000-4000-8000-000000000000'::uuid,
      'Commercial PR09 Clinic Admin',
      'clinic_admin',
      'commercial-pr09-clinic-admin@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000030'::uuid,
      'f3090000-0000-4000-8000-000000000001'::uuid,
      'Commercial PR09 Missing Permission',
      'staff',
      'commercial-pr09-missing-permission@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000040'::uuid,
      'f3090000-0000-4000-8000-000000000001'::uuid,
      'Commercial PR09 Inactive',
      'staff',
      'commercial-pr09-inactive@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000050'::uuid,
      'f3090000-0000-4000-8000-000000000001'::uuid,
      'Commercial PR09 Manager',
      'manager',
      'commercial-pr09-manager@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000060'::uuid,
      'f3090000-0000-4000-8000-000000000001'::uuid,
      'Commercial PR09 Admin Missing Profile',
      'admin',
      'commercial-pr09-admin-missing-profile@example.invalid'
    ),
    (
      'f3090000-0000-4000-8000-000000000070'::uuid,
      'f3090000-0000-4000-8000-000000000000'::uuid,
      'Commercial PR09 Active Admin',
      'admin',
      'commercial-pr09-active-admin@example.invalid'
    )
) as fixture(id, clinic_id, name, role, email);

insert into public.user_permissions (
  staff_id,
  username,
  hashed_password,
  role,
  clinic_id
)
values
  (
    'f3090000-0000-4000-8000-000000000010',
    'commercial-pr09-staff',
    'not-used',
    'staff',
    'f3090000-0000-4000-8000-000000000001'
  ),
  (
    'f3090000-0000-4000-8000-000000000020',
    'commercial-pr09-clinic-admin',
    'not-used',
    'clinic_admin',
    'f3090000-0000-4000-8000-000000000000'
  ),
  (
    'f3090000-0000-4000-8000-000000000040',
    'commercial-pr09-inactive',
    'not-used',
    'staff',
    'f3090000-0000-4000-8000-000000000001'
  ),
  (
    'f3090000-0000-4000-8000-000000000050',
    'commercial-pr09-manager',
    'not-used',
    'manager',
    'f3090000-0000-4000-8000-000000000001'
  ),
  (
    'f3090000-0000-4000-8000-000000000060',
    'commercial-pr09-admin-missing-profile',
    'not-used',
    'admin',
    'f3090000-0000-4000-8000-000000000001'
  ),
  (
    'f3090000-0000-4000-8000-000000000070',
    'commercial-pr09-active-admin',
    'not-used',
    'admin',
    'f3090000-0000-4000-8000-000000000000'
  );

insert into public.manager_clinic_assignments (
  manager_user_id,
  clinic_id,
  assigned_by
)
values (
  'f3090000-0000-4000-8000-000000000050',
  'f3090000-0000-4000-8000-000000000001',
  'f3090000-0000-4000-8000-000000000050'
);

update public.manager_clinic_assignments
set revoked_at = now(), revoke_reason = 'commercial-pr09-test'
where manager_user_id = 'f3090000-0000-4000-8000-000000000050'
  and clinic_id = 'f3090000-0000-4000-8000-000000000001';

-- Deterministic rows used to exercise every PR-09 policy predicate against
-- tenant A, a sibling clinic, and tenant B.
insert into public.beta_feedback (
  id,
  clinic_id,
  user_id,
  user_name,
  category,
  severity,
  title,
  description
)
values
  (
    'f3091000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000010',
    'Commercial PR09 Staff',
    'bug_report',
    'medium',
    '__commercial_pr09_feedback_a1__',
    'tenant A1 feedback'
  ),
  (
    'f3091000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000020',
    'Commercial PR09 Clinic Admin',
    'usability',
    'low',
    '__commercial_pr09_feedback_a2__',
    'tenant A2 feedback'
  ),
  (
    'f3091000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-000000000060',
    'Commercial PR09 Other Tenant',
    'performance',
    'high',
    '__commercial_pr09_feedback_b__',
    'tenant B feedback'
  );

insert into public.beta_usage_metrics (
  id,
  clinic_id,
  period_start,
  period_end,
  login_count
)
values
  (
    'f3092000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000001',
    '2099-01-01T00:00:00Z',
    '2099-01-02T00:00:00Z',
    11
  ),
  (
    'f3092000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000002',
    '2099-01-01T00:00:00Z',
    '2099-01-02T00:00:00Z',
    12
  ),
  (
    'f3092000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-0000000000ff',
    '2099-01-01T00:00:00Z',
    '2099-01-02T00:00:00Z',
    99
  );

insert into public.critical_incidents (
  id,
  title,
  description,
  severity,
  category,
  affected_clinics,
  impact_description
)
values
  (
    'f3093000-0000-4000-8000-000000000001',
    '__commercial_pr09_incident_a1__',
    'tenant A1 only',
    'p2',
    'service_outage',
    array['f3090000-0000-4000-8000-000000000001']::uuid[],
    'tenant A1 impact'
  ),
  (
    'f3093000-0000-4000-8000-000000000002',
    '__commercial_pr09_incident_mixed__',
    'shared incident affecting A1 and B',
    'p1',
    'security',
    array[
      'f3090000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-0000000000ff'
    ]::uuid[],
    'shared impact visible to each affected clinic'
  ),
  (
    'f3093000-0000-4000-8000-0000000000ff',
    '__commercial_pr09_incident_b__',
    'tenant B only',
    'p2',
    'performance',
    array['f3090000-0000-4000-8000-0000000000ff']::uuid[],
    'tenant B impact'
  );

insert into public.improvement_backlog (
  id,
  title,
  description,
  category,
  priority,
  estimated_effort,
  business_value,
  affected_clinics,
  created_by
)
values
  (
    'f3094000-0000-4000-8000-000000000001',
    '__commercial_pr09_backlog_a1__',
    'tenant A1 backlog',
    'enhancement',
    'medium',
    's',
    5,
    array['f3090000-0000-4000-8000-000000000001']::uuid[],
    'f3090000-0000-4000-8000-000000000070'
  ),
  (
    'f3094000-0000-4000-8000-000000000002',
    '__commercial_pr09_backlog_mixed__',
    'mixed tenant backlog',
    'bug_fix',
    'high',
    'm',
    8,
    array[
      'f3090000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-0000000000ff'
    ]::uuid[],
    'f3090000-0000-4000-8000-000000000070'
  );

insert into public.notifications (
  id,
  user_id,
  clinic_id,
  title,
  message
)
values
  (
    'f3095000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000010',
    'f3090000-0000-4000-8000-000000000001',
    '__commercial_pr09_notification_owner__',
    'owner notification'
  ),
  (
    'f3095000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000020',
    'f3090000-0000-4000-8000-000000000001',
    '__commercial_pr09_notification_a1_other__',
    'another user in A1'
  ),
  (
    'f3095000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-000000000060',
    'f3090000-0000-4000-8000-0000000000ff',
    '__commercial_pr09_notification_b__',
    'another tenant'
  );

insert into public.mfa_usage_stats (
  id,
  clinic_id,
  period_start,
  period_end,
  total_users
)
values
  (
    'f3096000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000001',
    '2099-02-01T00:00:00Z',
    '2099-02-02T00:00:00Z',
    11
  ),
  (
    'f3096000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000002',
    '2099-02-01T00:00:00Z',
    '2099-02-02T00:00:00Z',
    12
  ),
  (
    'f3096000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-0000000000ff',
    '2099-02-01T00:00:00Z',
    '2099-02-02T00:00:00Z',
    99
  );

insert into public.user_mfa_settings (
  id,
  user_id,
  clinic_id,
  secret_key
)
values
  (
    'f3097000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000010',
    'f3090000-0000-4000-8000-000000000001',
    '__commercial_pr09_secret_owner__'
  ),
  (
    'f3097000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000020',
    'f3090000-0000-4000-8000-000000000002',
    '__commercial_pr09_secret_a2__'
  ),
  (
    'f3097000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-000000000060',
    'f3090000-0000-4000-8000-0000000000ff',
    '__commercial_pr09_secret_b__'
  ),
  (
    'f3097000-0000-4000-8000-000000000040',
    'f3090000-0000-4000-8000-000000000040',
    'f3090000-0000-4000-8000-000000000001',
    '__commercial_pr09_secret_inactive_owner__'
  );

insert into public.staff_profiles (id, user_id, display_name, is_active)
values
  (
    'f3098000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000010',
    '__commercial_pr09_staff_profile_a1__',
    true
  ),
  (
    'f3098000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000020',
    '__commercial_pr09_staff_profile_a2__',
    true
  ),
  (
    'f3098000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-000000000060',
    '__commercial_pr09_staff_profile_b__',
    true
  ),
  (
    'f3098000-0000-4000-8000-000000000070',
    'f3090000-0000-4000-8000-000000000070',
    '__commercial_pr09_staff_profile_admin__',
    true
  ),
  (
    'f3098000-0000-4000-8000-000000000040',
    'f3090000-0000-4000-8000-000000000040',
    '__commercial_pr09_staff_profile_inactive__',
    true
  );

insert into public.staff_clinic_memberships (
  id,
  staff_profile_id,
  clinic_id,
  membership_type
)
values
  (
    'f3098100-0000-4000-8000-000000000001',
    'f3098000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000001',
    'home'
  ),
  (
    'f3098100-0000-4000-8000-000000000002',
    'f3098000-0000-4000-8000-000000000002',
    'f3090000-0000-4000-8000-000000000002',
    'home'
  ),
  (
    'f3098100-0000-4000-8000-0000000000ff',
    'f3098000-0000-4000-8000-0000000000ff',
    'f3090000-0000-4000-8000-0000000000ff',
    'home'
  ),
  (
    'f3098100-0000-4000-8000-000000000070',
    'f3098000-0000-4000-8000-000000000070',
    'f3090000-0000-4000-8000-000000000000',
    'home'
  ),
  (
    'f3098100-0000-4000-8000-000000000040',
    'f3098000-0000-4000-8000-000000000040',
    'f3090000-0000-4000-8000-000000000001',
    'home'
  );

insert into public.clinic_feature_flags (clinic_id)
values
  ('f3090000-0000-4000-8000-000000000001'),
  ('f3090000-0000-4000-8000-000000000002'),
  ('f3090000-0000-4000-8000-0000000000ff');

do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'admin',
        'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001',
          'f3090000-0000-4000-8000-0000000000ff'
        )
      )
    )::text,
    true
  );
end
$claims$;

set local role authenticated;

select is(
  app_private.get_current_role(),
  'staff'::text,
  'stale JWT admin role cannot override the DB permission role'
);

select is(
  app_private.get_current_clinic_id(),
  'f3090000-0000-4000-8000-000000000001'::uuid,
  'stale JWT clinic cannot override the DB permission clinic'
);

select is(
  app_private.jwt_is_admin(),
  false,
  'legacy jwt_is_admin name delegates to DB authority'
);

select is(
  app_private.jwt_clinic_id(),
  'f3090000-0000-4000-8000-000000000001'::uuid,
  'legacy jwt_clinic_id name delegates to DB authority'
);

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  true,
  'staff can access the DB-authorized primary clinic'
);

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-0000000000ff'::uuid
  ),
  false,
  'stale JWT scope cannot expand staff access to another tenant'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('provider', 'email')
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  true,
  'an absent JWT clinic scope preserves DB-authorized scope'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'clinic_scope_ids', jsonb_build_array()
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'an explicitly empty JWT clinic scope fails closed'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000020',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'staff',
        'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000002'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000002'::uuid
  ),
  true,
  'a valid JWT subset can narrow clinic-admin DB hierarchy scope'
);

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000000'::uuid
  ),
  false,
  'a valid JWT subset excludes other DB-authorized clinics'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'clinic_scope_ids', 'malformed'
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'a malformed present JWT scope claim fails closed'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'clinic_scope_ids', jsonb_build_array(null)
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'a JWT clinic scope containing null fails closed as boolean false'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000030',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'admin',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.get_current_role(),
  ''::text,
  'permission missing cannot be restored from a stale JWT role'
);

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'permission missing denies clinic access despite stale JWT scope'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000040',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'admin',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.get_current_role(),
  ''::text,
  'inactive profile denies DB permission authority'
);

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'inactive profile denies clinic access with a valid stale JWT'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000060',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'admin',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.get_current_role(),
  ''::text,
  'admin permission without a profile has no DB role authority'
);

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'admin permission without a profile cannot use stale JWT clinic scope'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000050',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'manager',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  app_private.can_access_clinic(
    'f3090000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'revoked manager assignment denies access despite stale JWT scope'
);

reset role;
set local role postgres;

select ok(
  not (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000030',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000030',
          'role', 'authenticated',
          'user_role', 'admin',
          'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
          'clinic_scope_ids', jsonb_build_array(
            'f3090000-0000-4000-8000-0000000000ff'
          ),
          'app_metadata', jsonb_build_object(
            'user_role', 'admin',
            'role', 'admin',
            'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
            'clinic_scope_ids', jsonb_build_array(
              'f3090000-0000-4000-8000-0000000000ff'
            )
          )
        )
      )
    ) -> 'claims' ?| array['user_role', 'clinic_id', 'clinic_scope_ids']
  )
  and not (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000030',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000030',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object(
            'user_role', 'admin',
            'role', 'admin',
            'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
            'clinic_scope_ids', jsonb_build_array(
              'f3090000-0000-4000-8000-0000000000ff'
            )
          )
        )
      )
    ) #> '{claims,app_metadata}'
      ?| array['user_role', 'role', 'clinic_id', 'clinic_scope_ids']
  ),
  'hook clears stale top-level and app_metadata authority for missing permission'
);

select ok(
  not (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000040',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000040',
          'role', 'authenticated',
          'user_role', 'admin',
          'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
          'clinic_scope_ids', jsonb_build_array(
            'f3090000-0000-4000-8000-0000000000ff'
          ),
          'app_metadata', jsonb_build_object(
            'user_role', 'admin',
            'role', 'admin',
            'clinic_id', 'f3090000-0000-4000-8000-0000000000ff',
            'clinic_scope_ids', jsonb_build_array(
              'f3090000-0000-4000-8000-0000000000ff'
            )
          )
        )
      )
    ) -> 'claims' ?| array['user_role', 'clinic_id', 'clinic_scope_ids']
  ),
  'hook clears stale authority for an inactive profile'
);

select ok(
  not (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000050',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000050',
          'role', 'authenticated',
          'user_role', 'manager',
          'clinic_id', 'f3090000-0000-4000-8000-000000000001',
          'clinic_scope_ids', jsonb_build_array(
            'f3090000-0000-4000-8000-000000000001'
          ),
          'app_metadata', jsonb_build_object(
            'user_role', 'manager',
            'clinic_id', 'f3090000-0000-4000-8000-000000000001',
            'clinic_scope_ids', jsonb_build_array(
              'f3090000-0000-4000-8000-000000000001'
            )
          )
        )
      )
    ) -> 'claims' ?| array['user_role', 'clinic_id', 'clinic_scope_ids']
  )
  and not (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000050',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000050',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object(
            'user_role', 'manager',
            'clinic_id', 'f3090000-0000-4000-8000-000000000001',
            'clinic_scope_ids', jsonb_build_array(
              'f3090000-0000-4000-8000-000000000001'
            )
          )
        )
      )
    ) #> '{claims,app_metadata}'
      ?| array['user_role', 'role', 'clinic_id', 'clinic_scope_ids']
  ),
  'hook clears all stale authority when a manager has no active assignment'
);

select ok(
  (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000010',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('provider', 'email')
        )
      )
    ) #>> '{claims,user_role}'
  ) = 'staff'
  and (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000010',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('provider', 'email')
        )
      )
    ) #>> '{claims,clinic_id}'
  ) = 'f3090000-0000-4000-8000-000000000001'
  and (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000010',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('provider', 'email')
        )
      )
    ) #> '{claims,clinic_scope_ids}'
  ) = jsonb_build_array('f3090000-0000-4000-8000-000000000001'),
  'hook refreshes top-level authority from active DB rows'
);

select ok(
  (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000010',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('provider', 'email')
        )
      )
    ) #>> '{claims,app_metadata,user_role}'
  ) = 'staff'
  and (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000010',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('provider', 'email')
        )
      )
    ) #>> '{claims,app_metadata,clinic_id}'
  ) = 'f3090000-0000-4000-8000-000000000001'
  and (
    app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000010',
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('provider', 'email')
        )
      )
    ) #> '{claims,app_metadata,clinic_scope_ids}'
  ) = jsonb_build_array('f3090000-0000-4000-8000-000000000001'),
  'hook refreshes app_metadata authority from active DB rows'
);

select throws_ok(
  $query$
    select app_private.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'f3090000-0000-4000-8000-000000000010',
        'claims', jsonb_build_object(
          'sub', 'f3090000-0000-4000-8000-000000000020',
          'role', 'authenticated'
        )
      )
    )
  $query$,
  '22023',
  'custom access token hook subject mismatch',
  'hook rejects an event user_id that differs from claims.sub'
);

select is(
  (
    select count(*)
    from pg_policies policy_data
    cross join lateral (
      select lower(
        concat_ws(' ', policy_data.qual, policy_data.with_check)
      ) as policy_text
    ) normalized
    where policy_data.schemaname = 'public'
      and (
        position('auth.jwt()' in normalized.policy_text) > 0
        or position('request.jwt.claims' in normalized.policy_text) > 0
        or position('profiles.role' in normalized.policy_text) > 0
        or position('profiles.clinic_id' in normalized.policy_text) > 0
        or normalized.policy_text ~ '\m(p|profiles)\.(role|clinic_id)\M'
      )
  ),
  0::bigint,
  'no public policy retains direct JWT or profile role/clinic authority'
);

select is(
  (
    with expected(
      table_name,
      policy_name,
      policy_command,
      policy_permissive,
      policy_roles
    ) as (
      values
        (
          'notifications',
          'Users can view their own notifications',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'beta_feedback',
          'Admins can update feedback',
          'UPDATE',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'beta_feedback',
          'Admins can view all feedback',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'beta_feedback',
          'Users can insert their clinic feedback',
          'INSERT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'beta_feedback',
          'Users can view their clinic feedback',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'beta_usage_metrics',
          'Admins can view all metrics',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'beta_usage_metrics',
          'Users can view their clinic metrics',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'critical_incidents',
          'Admins can manage incidents',
          'ALL',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'critical_incidents',
          'Affected clinics can view their incidents',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'improvement_backlog',
          'improvement_backlog_admin_delete',
          'DELETE',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'improvement_backlog',
          'improvement_backlog_admin_insert',
          'INSERT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'improvement_backlog',
          'improvement_backlog_admin_update',
          'UPDATE',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'mfa_usage_stats',
          'mfa_usage_stats_select_policy',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'user_mfa_settings',
          'user_mfa_settings_select_policy',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'staff_profiles',
          'staff_profiles_select_scoped',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'staff_clinic_memberships',
          'staff_clinic_memberships_select_scoped',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'clinic_feature_flags',
          'clinic_feature_flags_select_scoped',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        )
    ), actual as (
      select
        policy_data.tablename,
        policy_data.policyname,
        policy_data.cmd,
        policy_data.permissive,
        policy_data.roles
      from pg_policies policy_data
      where policy_data.schemaname = 'public'
        and exists (
          select 1
          from expected
          where expected.table_name = policy_data.tablename
            and expected.policy_name = policy_data.policyname
        )
    ), missing as (
      select * from expected
      except
      select * from actual
    ), unexpected as (
      select * from actual
      except
      select * from expected
    )
    select
      (select count(*) from missing)
      + (select count(*) from unexpected)
  ),
  0::bigint,
  'all 17 reviewed policies retain exact role, command, and permissive identity'
);

select is(
  (
    with expected (table_name, policy_name) as (
      values
        ('staff_profiles', 'staff_profiles_select_scoped'),
        (
          'staff_clinic_memberships',
          'staff_clinic_memberships_select_scoped'
        ),
        ('clinic_feature_flags', 'clinic_feature_flags_select_scoped')
    ), actual as (
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'staff_profiles',
          'staff_clinic_memberships',
          'clinic_feature_flags'
        )
    ), missing as (
      select * from expected
      except
      select * from actual
    ), unexpected as (
      select * from actual
      except
      select * from expected
    )
    select
      (select count(*) from missing)
      + (select count(*) from unexpected)
  ),
  0::bigint,
  'staff and feature tables have the exact reviewed policy set with no permissive extras'
);

select is(
  (
    select count(*)
    from information_schema.columns column_data
    cross join (
      values ('INSERT'), ('UPDATE')
    ) privilege(privilege_name)
    where column_data.table_schema = 'public'
      and column_data.table_name in (
        'staff_profiles',
        'staff_clinic_memberships',
        'clinic_feature_flags'
      )
      and has_column_privilege(
        'authenticated',
        format('%I.%I', column_data.table_schema, column_data.table_name),
        column_data.column_name,
        privilege.privilege_name
      )
  ),
  0::bigint,
  'staff and feature tables expose no authenticated column-level writes'
);

-- Active staff: owner predicates and clinic-scoped user predicates.
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'staff',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  (
    select count(*)
    from public.notifications
    where id = any(
      array[
        'f3095000-0000-4000-8000-000000000001',
        'f3095000-0000-4000-8000-000000000002',
        'f3095000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'notification owner policy exposes only the active subject own row'
);

select is(
  (
    select count(*)
    from public.beta_feedback
    where id = any(
      array[
        'f3091000-0000-4000-8000-000000000001',
        'f3091000-0000-4000-8000-000000000002',
        'f3091000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'feedback user-select policy exposes only the DB and JWT scoped clinic'
);

select lives_ok(
  $query$
    insert into public.beta_feedback (
      id,
      clinic_id,
      user_id,
      user_name,
      category,
      severity,
      title,
      description
    )
    values (
      'f3091000-0000-4000-8000-000000000010',
      'f3090000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000010',
      'Commercial PR09 Staff',
      'other',
      'low',
      '__commercial_pr09_feedback_staff_insert__',
      'staff scoped insert'
    )
  $query$,
  'feedback insert policy permits an active user inside canonical scope'
);

select throws_ok(
  $query$
    insert into public.beta_feedback (
      id,
      clinic_id,
      user_id,
      user_name,
      category,
      severity,
      title,
      description
    )
    values (
      'f3091000-0000-4000-8000-000000000011',
      'f3090000-0000-4000-8000-0000000000ff',
      'f3090000-0000-4000-8000-000000000010',
      'Commercial PR09 Staff',
      'other',
      'low',
      '__commercial_pr09_feedback_staff_cross_tenant__',
      'must be rejected'
    )
  $query$,
  '42501',
  null::text,
  'feedback insert policy rejects another tenant'
);

select is(
  (
    select count(*)
    from public.beta_usage_metrics
    where id = any(
      array[
        'f3092000-0000-4000-8000-000000000001',
        'f3092000-0000-4000-8000-000000000002',
        'f3092000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'metrics user-select policy exposes only the DB and JWT scoped clinic'
);

select is(
  (
    select count(*)
    from public.critical_incidents
    where id = any(
      array[
        'f3093000-0000-4000-8000-000000000001',
        'f3093000-0000-4000-8000-000000000002',
        'f3093000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  2::bigint,
  'affected-clinic incident policy exposes A1-only and shared incidents but not B-only'
);

select is(
  (
    select count(*)
    from public.user_mfa_settings
    where id = any(
      array[
        'f3097000-0000-4000-8000-000000000001',
        'f3097000-0000-4000-8000-000000000002',
        'f3097000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'MFA settings owner policy exposes only the active subject own row'
);

select is(
  (
    select count(*)
    from public.staff_profiles
    where id = any(
      array[
        'f3098000-0000-4000-8000-000000000001',
        'f3098000-0000-4000-8000-000000000002',
        'f3098000-0000-4000-8000-0000000000ff',
        'f3098000-0000-4000-8000-000000000070'
      ]::uuid[]
    )
  ),
  1::bigint,
  'staff profile policy exposes only the active subject linked row'
);

reset role;

-- Active root-A admin with a JWT subset narrowed to clinic A1.
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000070',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'admin',
        'clinic_id', 'f3090000-0000-4000-8000-000000000000',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  (
    select count(*)
    from public.notifications
    where id = any(
      array[
        'f3095000-0000-4000-8000-000000000001',
        'f3095000-0000-4000-8000-000000000002',
        'f3095000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  2::bigint,
  'admin notification branch is narrowed to the JWT clinic subset'
);

select is(
  (
    select count(*)
    from public.beta_feedback
    where id = any(
      array[
        'f3091000-0000-4000-8000-000000000001',
        'f3091000-0000-4000-8000-000000000002',
        'f3091000-0000-4000-8000-0000000000ff',
        'f3091000-0000-4000-8000-000000000010'
      ]::uuid[]
    )
  ),
  2::bigint,
  'admin feedback select policy permits A1 and rejects sibling A2 and tenant B'
);

with updated as (
  update public.beta_feedback
  set status = 'acknowledged'
  where id = 'f3091000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from updated),
  1::bigint,
  'admin feedback update policy permits a row inside the JWT subset'
);

with updated as (
  update public.beta_feedback
  set status = 'acknowledged'
  where id = 'f3091000-0000-4000-8000-000000000002'
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'admin feedback update policy rejects a sibling clinic outside the JWT subset'
);

select is(
  (
    select count(*)
    from public.beta_usage_metrics
    where id = any(
      array[
        'f3092000-0000-4000-8000-000000000001',
        'f3092000-0000-4000-8000-000000000002',
        'f3092000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'admin metrics policy permits A1 and rejects sibling A2 and tenant B'
);

select is(
  (
    select count(*)
    from public.critical_incidents
    where id = any(
      array[
        'f3093000-0000-4000-8000-000000000001',
        'f3093000-0000-4000-8000-000000000002',
        'f3093000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  2::bigint,
  'admin can read A1-only and shared affected incidents but not B-only incidents'
);

with updated as (
  update public.critical_incidents
  set status = 'investigating'
  where id = 'f3093000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from updated),
  1::bigint,
  'incident admin-manage policy permits an A1-only update'
);

with updated as (
  update public.critical_incidents
  set status = 'investigating'
  where id = 'f3093000-0000-4000-8000-000000000002'
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'incident admin-manage policy rejects an update spanning outside the JWT subset'
);

select lives_ok(
  $query$
    insert into public.critical_incidents (
      id,
      title,
      description,
      severity,
      category,
      affected_clinics,
      impact_description
    )
    values (
      'f3093000-0000-4000-8000-000000000010',
      '__commercial_pr09_incident_admin_insert__',
      'A1-only admin insert',
      'p3',
      'other',
      array['f3090000-0000-4000-8000-000000000001']::uuid[],
      'A1 impact'
    )
  $query$,
  'incident admin-manage policy permits an A1-only insert'
);

select throws_ok(
  $query$
    insert into public.critical_incidents (
      id,
      title,
      description,
      severity,
      category,
      affected_clinics,
      impact_description
    )
    values (
      'f3093000-0000-4000-8000-000000000011',
      '__commercial_pr09_incident_admin_cross_tenant__',
      'must be rejected',
      'p3',
      'other',
      array[
        'f3090000-0000-4000-8000-000000000001',
        'f3090000-0000-4000-8000-0000000000ff'
      ]::uuid[],
      'mixed impact'
    )
  $query$,
  '42501',
  null::text,
  'incident admin-manage policy rejects a cross-tenant insert'
);

select lives_ok(
  $query$
    insert into public.improvement_backlog (
      id,
      title,
      description,
      category,
      priority,
      estimated_effort,
      business_value,
      affected_clinics,
      created_by
    )
    values (
      'f3094000-0000-4000-8000-000000000010',
      '__commercial_pr09_backlog_admin_insert__',
      'A1-only admin insert',
      'feature',
      'low',
      'xs',
      4,
      array['f3090000-0000-4000-8000-000000000001']::uuid[],
      'f3090000-0000-4000-8000-000000000070'
    )
  $query$,
  'backlog admin-insert policy permits an A1-only row'
);

select throws_ok(
  $query$
    insert into public.improvement_backlog (
      id,
      title,
      description,
      category,
      priority,
      estimated_effort,
      business_value,
      affected_clinics,
      created_by
    )
    values (
      'f3094000-0000-4000-8000-000000000011',
      '__commercial_pr09_backlog_admin_cross_tenant__',
      'must be rejected',
      'feature',
      'low',
      'xs',
      4,
      array[
        'f3090000-0000-4000-8000-000000000001',
        'f3090000-0000-4000-8000-0000000000ff'
      ]::uuid[],
      'f3090000-0000-4000-8000-000000000070'
    )
  $query$,
  '42501',
  null::text,
  'backlog admin-insert policy rejects a cross-tenant row'
);

with updated as (
  update public.improvement_backlog
  set status = 'planned'
  where id = 'f3094000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from updated),
  1::bigint,
  'backlog admin-update policy permits an A1-only row'
);

with updated as (
  update public.improvement_backlog
  set status = 'planned'
  where id = 'f3094000-0000-4000-8000-000000000002'
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'backlog admin-update policy rejects a cross-tenant row'
);

with deleted as (
  delete from public.improvement_backlog
  where id = 'f3094000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from deleted),
  1::bigint,
  'backlog admin-delete policy permits an A1-only row'
);

select is(
  (
    select count(*)
    from public.mfa_usage_stats
    where id = any(
      array[
        'f3096000-0000-4000-8000-000000000001',
        'f3096000-0000-4000-8000-000000000002',
        'f3096000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'MFA usage admin policy permits A1 and rejects sibling A2 and tenant B'
);

select is(
  (
    select count(*)
    from public.user_mfa_settings
    where id = any(
      array[
        'f3097000-0000-4000-8000-000000000001',
        'f3097000-0000-4000-8000-000000000002',
        'f3097000-0000-4000-8000-0000000000ff',
        'f3097000-0000-4000-8000-000000000040'
      ]::uuid[]
    )
  ),
  2::bigint,
  'MFA settings admin policy exposes all A1 rows and no sibling or tenant-B row'
);

select is(
  (
    select count(*)
    from public.staff_profiles
    where id = any(
      array[
        'f3098000-0000-4000-8000-000000000001',
        'f3098000-0000-4000-8000-000000000002',
        'f3098000-0000-4000-8000-0000000000ff',
        'f3098000-0000-4000-8000-000000000070'
      ]::uuid[]
    )
  ),
  1::bigint,
  'admin staff-profile reads remain self-only instead of role-global'
);

select is(
  (
    select count(*)
    from public.staff_clinic_memberships
    where id = any(
      array[
        'f3098100-0000-4000-8000-000000000001',
        'f3098100-0000-4000-8000-000000000002',
        'f3098100-0000-4000-8000-0000000000ff',
        'f3098100-0000-4000-8000-000000000070',
        'f3098100-0000-4000-8000-000000000040'
      ]::uuid[]
    )
  ),
  2::bigint,
  'admin membership reads are limited to the JWT A1 subset'
);

select is(
  (
    select count(*)
    from public.clinic_feature_flags
    where clinic_id = any(
      array[
        'f3090000-0000-4000-8000-000000000001',
        'f3090000-0000-4000-8000-000000000002',
        'f3090000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  1::bigint,
  'admin feature-flag reads reject sibling and tenant-B clinics'
);

reset role;

-- Present-but-empty and malformed JWT scopes must deny even an active admin.
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000070',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'clinic_scope_ids', jsonb_build_array()
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  (
    select count(*)
    from public.beta_feedback
    where id = any(
      array[
        'f3091000-0000-4000-8000-000000000001',
        'f3091000-0000-4000-8000-000000000002',
        'f3091000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  0::bigint,
  'empty JWT scope denies all reviewed feedback rows'
);

select is(
  (
    select count(*)
    from public.staff_clinic_memberships
    where id = any(
      array[
        'f3098100-0000-4000-8000-000000000001',
        'f3098100-0000-4000-8000-000000000002',
        'f3098100-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  0::bigint,
  'empty JWT scope denies all reviewed staff memberships'
);

select is(
  (
    select count(*)
    from public.clinic_feature_flags
    where clinic_id = any(
      array[
        'f3090000-0000-4000-8000-000000000001',
        'f3090000-0000-4000-8000-000000000002',
        'f3090000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  0::bigint,
  'empty JWT scope denies all reviewed feature flags'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000070',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'clinic_scope_ids', 'malformed'
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  (
    select count(*)
    from public.beta_feedback
    where id = any(
      array[
        'f3091000-0000-4000-8000-000000000001',
        'f3091000-0000-4000-8000-000000000002',
        'f3091000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  0::bigint,
  'malformed JWT scope denies all reviewed feedback rows'
);

select is(
  (
    select count(*)
    from public.clinic_feature_flags
    where clinic_id = any(
      array[
        'f3090000-0000-4000-8000-000000000001',
        'f3090000-0000-4000-8000-000000000002',
        'f3090000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  0::bigint,
  'malformed JWT scope denies all reviewed feature flags'
);

reset role;
do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3090000-0000-4000-8000-000000000040',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'admin',
        'clinic_scope_ids', jsonb_build_array(
          'f3090000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;
set local role authenticated;

select is(
  (
    select count(*)
    from public.beta_feedback
    where id = any(
      array[
        'f3091000-0000-4000-8000-000000000001',
        'f3091000-0000-4000-8000-000000000002',
        'f3091000-0000-4000-8000-0000000000ff'
      ]::uuid[]
    )
  ),
  0::bigint,
  'inactive profile denies reviewed feedback despite stale admin claims'
);

select is(
  (
    select count(*)
    from public.user_mfa_settings
    where id = 'f3097000-0000-4000-8000-000000000040'
  ),
  0::bigint,
  'inactive MFA owner cannot bypass the DB-authoritative role requirement'
);

select is(
  (
    select count(*)
    from public.staff_profiles
    where id = 'f3098000-0000-4000-8000-000000000040'
  ),
  0::bigint,
  'inactive staff-profile owner cannot bypass the DB-authoritative role requirement'
);

reset role;

select * from finish();

rollback;

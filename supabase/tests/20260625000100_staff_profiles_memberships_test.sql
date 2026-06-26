begin;

select plan(12);

select has_table(
  'public',
  'staff_profiles',
  'staff_profiles table exists'
);

select has_table(
  'public',
  'staff_clinic_memberships',
  'staff_clinic_memberships table exists'
);

select has_column(
  'public',
  'staff_shifts',
  'staff_profile_id',
  'staff_shifts.staff_profile_id exists'
);

select has_column(
  'public',
  'staff_shifts',
  'home_clinic_id',
  'staff_shifts.home_clinic_id exists'
);

select has_column(
  'public',
  'staff_shifts',
  'assignment_type',
  'staff_shifts.assignment_type exists'
);

select has_column(
  'public',
  'staff_shifts',
  'time_preset',
  'staff_shifts.time_preset exists'
);

select has_column(
  'public',
  'staff_shifts',
  'source_shift_request_id',
  'staff_shifts.source_shift_request_id exists'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_clinic_memberships'
      and column_name = 'staff_profile_id'
      and is_nullable = 'NO'
  ),
  'membership staff_profile_id is required'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'staff_clinic_memberships_type_check'
      and conrelid = 'public.staff_clinic_memberships'::regclass
      and pg_get_constraintdef(oid) like '%blocked%'
  ),
  'membership_type check includes blocked'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'staff_shifts_assignment_type_check'
      and conrelid = 'public.staff_shifts'::regclass
      and pg_get_constraintdef(oid) like '%help%'
  ),
  'staff_shifts assignment_type check includes help'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_clinic_memberships'
      and policyname = 'staff_clinic_memberships_select_scoped'
      and qual like '%app_private.can_access_clinic%'
  ),
  'memberships select policy uses app_private clinic scope'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'staff_clinic_memberships'
      and indexname = 'staff_clinic_memberships_resource_unique'
  ),
  'resource_id unique index exists for backfill idempotency'
);

select * from finish();

rollback;

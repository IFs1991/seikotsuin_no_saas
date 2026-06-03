-- ================================================================
-- pgTAP Test: Manager shift request workflow v0.2
-- ================================================================

begin;

select plan(21);

select has_table('public', 'shift_request_periods', 'shift_request_periods table exists');
select has_table('public', 'shift_requests', 'shift_requests table exists');
select has_table('public', 'shift_request_audit_logs', 'shift_request_audit_logs table exists');

select col_has_check(
  'public',
  'shift_request_periods',
  'status',
  'shift_request_periods.status has enum-like check'
);

select col_has_check(
  'public',
  'shift_requests',
  'request_type',
  'shift_requests.request_type has enum-like check'
);

select col_has_check(
  'public',
  'shift_requests',
  'status',
  'shift_requests.status has enum-like check'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shift_requests'::regclass
      and conname = 'shift_requests_time_check'
  ),
  'shift_requests rejects end_time <= start_time'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shift_requests'::regclass
      and conname = 'shift_requests_converted_state_check'
      and pg_get_constraintdef(oid) like '%available%'
      and pg_get_constraintdef(oid) like '%preferred%'
  ),
  'converted state is limited to available/preferred with converted_shift_id'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.shift_requests'::regclass
      and tgname = 'validate_shift_requests_clinic_refs_trigger'
      and not tgisinternal
  ),
  'shift_requests clinic/resource consistency trigger exists'
);

select ok(
  exists (
    select 1
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace table_ns on table_ns.oid = cls.relnamespace
    join pg_depend dep on dep.classid = 'pg_policy'::regclass
      and dep.objid = pol.oid
    join pg_proc proc on proc.oid = dep.refobjid
    join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
    where table_ns.nspname = 'public'
      and cls.relname = 'shift_requests'
      and pol.polname = 'shift_requests_select_scoped'
      and proc.proname = 'can_access_clinic'
      and proc_ns.nspname = 'app_private'
  ),
  'shift_requests select policy uses app_private clinic scope'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_requests'
      and policyname = 'shift_requests_insert_scoped'
      and with_check like '%staff_id = auth.uid%'
  ),
  'shift_requests insert policy self-scope requires staff_id = auth.uid()'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'convert_shift_requests'
  ),
  'convert_shift_requests RPC exists'
);

select ok(
  exists (
    select 1
    from information_schema.role_routine_grants
    where specific_schema = 'public'
      and routine_name = 'convert_shift_requests'
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  ),
  'convert_shift_requests is executable by service_role'
);

select ok(
  not exists (
    select 1
    from information_schema.role_routine_grants
    where specific_schema = 'public'
      and routine_name = 'convert_shift_requests'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'convert_shift_requests is not directly executable by authenticated'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_preferences'
      and policyname = 'staff_preferences_insert'
  ),
  'legacy permissive staff_preferences_insert policy is removed'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_request_audit_logs'
      and policyname = 'shift_request_audit_logs_select_scoped'
  ),
  'audit logs have scoped select policy'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'shift_requests'
      and indexname = 'shift_requests_convertible_idx'
      and indexdef like '%status = ''approved''%'
      and indexdef like '%available%'
      and indexdef like '%preferred%'
  ),
  'shift_requests has a partial index for convertible requests'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'shift_requests'
      and indexname = 'shift_requests_approved_constraints_idx'
      and indexdef like '%unavailable%'
      and indexdef like '%day_off%'
  ),
  'shift_requests has a partial index for approved constraints'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'staff_shifts'
      and indexname = 'staff_shifts_conversion_overlap_idx'
      and indexdef like '%status <> ''cancelled''%'
  ),
  'staff_shifts has a partial overlap index for conversion'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'convert_shift_requests'
      and pg_get_functiondef(p.oid) like '%p_actor_role <> any%'
  ),
  'convert_shift_requests does not use the always-true <> any role check'
);

select ok(
  exists (
    select 1
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace table_ns on table_ns.oid = cls.relnamespace
    join pg_depend dep on dep.classid = 'pg_policy'::regclass
      and dep.objid = pol.oid
    join pg_proc proc on proc.oid = dep.refobjid
    join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
    where table_ns.nspname = 'public'
      and cls.relname = 'shift_request_periods'
      and pol.polname = 'shift_request_periods_select_scoped'
      and proc.proname = 'get_current_role'
      and proc_ns.nspname = 'app_private'
  ),
  'shift_request_periods policies use app_private role helper'
);

select * from finish();
rollback;

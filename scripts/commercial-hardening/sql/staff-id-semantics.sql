with source_values as (
  select
    'public.user_permissions'::regclass as source_table,
    'user_permissions.staff_id'::text as column_name,
    staff_id as identifier
  from public.user_permissions

  union all

  select 'public.staff_preferences'::regclass, 'staff_preferences.staff_id', staff_id
  from public.staff_preferences

  union all

  select 'public.staff_shifts'::regclass, 'staff_shifts.staff_id', staff_id
  from public.staff_shifts

  union all

  select 'public.shift_requests'::regclass, 'shift_requests.staff_id', staff_id
  from public.shift_requests

  union all

  select 'public.profiles'::regclass, 'profiles.user_id', user_id
  from public.profiles
),
expected_sources(source_table, column_name, source_column) as (
  values
    ('public.user_permissions'::regclass, 'user_permissions.staff_id'::text, 'staff_id'::text),
    ('public.staff_preferences'::regclass, 'staff_preferences.staff_id'::text, 'staff_id'::text),
    ('public.staff_shifts'::regclass, 'staff_shifts.staff_id'::text, 'staff_id'::text),
    ('public.shift_requests'::regclass, 'shift_requests.staff_id'::text, 'staff_id'::text),
    ('public.profiles'::regclass, 'profiles.user_id'::text, 'user_id'::text)
),
fk_targets as (
  select
    fk_constraint.conrelid as source_table,
    child_attribute.attname::text as child_column,
    format(
      '%I.%I.%I',
      parent_namespace.nspname,
      parent_relation.relname,
      parent_attribute.attname
    ) as target
  from pg_constraint fk_constraint
  cross join lateral unnest(fk_constraint.conkey, fk_constraint.confkey)
    as key_pair(child_attnum, parent_attnum)
  join pg_attribute child_attribute
    on child_attribute.attrelid = fk_constraint.conrelid
   and child_attribute.attnum = key_pair.child_attnum
  join pg_class parent_relation on parent_relation.oid = fk_constraint.confrelid
  join pg_namespace parent_namespace on parent_namespace.oid = parent_relation.relnamespace
  join pg_attribute parent_attribute
    on parent_attribute.attrelid = fk_constraint.confrelid
   and parent_attribute.attnum = key_pair.parent_attnum
  where fk_constraint.contype = 'f'
    and child_attribute.attname in ('staff_id', 'user_id')
)
select
  expected.column_name,
  coalesce(string_agg(distinct fk.target, ', ' order by fk.target), 'NONE') as current_fk_target,
  count(source.identifier)::bigint as rows_checked,
  count(*) filter (where auth_user.id is not null)::bigint as matches_auth_users,
  count(*) filter (where profile.user_id is not null)::bigint as matches_profiles_user_id,
  count(*) filter (where staff.id is not null)::bigint as matches_staff_id,
  count(*) filter (where resource.id is not null)::bigint as matches_resources_id,
  count(*) filter (where staff_profile.id is not null)::bigint as matches_staff_profiles_id
from expected_sources expected
left join source_values source
  on source.source_table = expected.source_table
 and source.column_name = expected.column_name
left join fk_targets fk
  on fk.source_table = expected.source_table
 and fk.child_column = expected.source_column
left join auth.users auth_user on auth_user.id = source.identifier
left join public.profiles profile on profile.user_id = source.identifier
left join public.staff staff on staff.id = source.identifier
left join public.resources resource on resource.id = source.identifier
left join public.staff_profiles staff_profile on staff_profile.id = source.identifier
group by expected.column_name
order by expected.column_name;

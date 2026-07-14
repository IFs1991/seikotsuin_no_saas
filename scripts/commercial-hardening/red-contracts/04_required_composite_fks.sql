do $commercial_red$
declare
  missing_relations text;
begin
  with required(
    child_table,
    child_columns,
    parent_table,
    parent_columns,
    expected_delete_action
  ) as (
    values
      ('public.reservations'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'r'),
      ('public.reservations'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'r'),
      ('public.reservations'::regclass, array['staff_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'r'),
      ('public.blocks'::regclass, array['resource_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.care_episodes'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.customer_insurance_coverages'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.menu_billing_profiles'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.daily_report_items'::regclass, array['daily_report_id', 'clinic_id'], 'public.daily_reports'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.daily_report_items'::regclass, array['reservation_id', 'clinic_id'], 'public.reservations'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_items'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_items'::regclass, array['care_episode_id', 'clinic_id'], 'public.care_episodes'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_items'::regclass, array['customer_insurance_coverage_id', 'clinic_id'], 'public.customer_insurance_coverages'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_items'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_items'::regclass, array['menu_billing_profile_id', 'clinic_id'], 'public.menu_billing_profiles'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_items'::regclass, array['staff_resource_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'n'),
      ('public.daily_report_item_tags'::regclass, array['daily_report_item_id', 'clinic_id'], 'public.daily_report_items'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.reservation_history'::regclass, array['reservation_id', 'clinic_id'], 'public.reservations'::regclass, array['id', 'clinic_id'], 'c'),
      ('public.reservation_notifications'::regclass, array['reservation_id', 'clinic_id'], 'public.reservations'::regclass, array['id', 'clinic_id'], 'c')
  ),
  actual as (
    select
      con.conrelid as child_table,
      con.confrelid as parent_table,
      child_columns.columns as child_columns,
      parent_columns.columns as parent_columns,
      con.convalidated as validated,
      con.confdeltype as delete_action
    from pg_constraint con
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = keys.attnum
    ) child_columns on true
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.confkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.confrelid
       and att.attnum = keys.attnum
    ) parent_columns on true
    where con.contype = 'f'
  )
  select string_agg(
    format(
      '%s(%s)->%s(%s) expected_delete=%s',
      required.child_table,
      array_to_string(required.child_columns, ','),
      required.parent_table,
      array_to_string(required.parent_columns, ','),
      coalesce(required.expected_delete_action::text, 'UNKNOWN')
    ),
    '; ' order by required.child_table::text, array_to_string(required.child_columns, ',')
  )
  into missing_relations
  from required
  where not exists (
    select 1
    from actual
    where actual.child_table = required.child_table
      and actual.parent_table = required.parent_table
      and actual.child_columns = required.child_columns
      and actual.parent_columns = required.parent_columns
      and actual.validated
      and actual.delete_action::text = required.expected_delete_action
  );

  if missing_relations is not null then
    raise exception 'RED COMM-FK-001: missing tenant composite FKs: %', missing_relations;
  end if;
end
$commercial_red$;

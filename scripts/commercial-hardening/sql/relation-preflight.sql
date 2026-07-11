select * from (
  select 'reservations.customer_id->customers.id' as relation,
    count(*)::bigint as rows_checked,
    count(*) filter (where p.id is null)::bigint as orphan_count,
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )::bigint as mismatch_count
  from public.reservations c
  left join public.customers p on p.id = c.customer_id

  union all
  select 'reservations.menu_id->menus.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.reservations c
  left join public.menus p on p.id = c.menu_id

  union all
  select 'reservations.staff_id->resources.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.reservations c
  left join public.resources p on p.id = c.staff_id

  union all
  select 'blocks.resource_id->resources.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.blocks c
  left join public.resources p on p.id = c.resource_id

  union all
  select 'care_episodes.customer_id->customers.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.care_episodes c
  left join public.customers p on p.id = c.customer_id

  union all
  select 'customer_insurance_coverages.customer_id->customers.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.customer_insurance_coverages c
  left join public.customers p on p.id = c.customer_id

  union all
  select 'menu_billing_profiles.menu_id->menus.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.menu_billing_profiles c
  left join public.menus p on p.id = c.menu_id

  union all
  select 'daily_report_items.daily_report_id->daily_reports.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.daily_reports p on p.id = c.daily_report_id

  union all
  select 'daily_report_items.reservation_id->reservations.id',
    count(*) filter (where c.reservation_id is not null),
    count(*) filter (where c.reservation_id is not null and p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.reservations p on p.id = c.reservation_id

  union all
  select 'daily_report_items.customer_id->customers.id',
    count(*) filter (where c.customer_id is not null),
    count(*) filter (where c.customer_id is not null and p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.customers p on p.id = c.customer_id

  union all
  select 'daily_report_items.care_episode_id->care_episodes.id',
    count(*) filter (where c.care_episode_id is not null),
    count(*) filter (where c.care_episode_id is not null and p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.care_episodes p on p.id = c.care_episode_id

  union all
  select 'daily_report_items.customer_insurance_coverage_id->customer_insurance_coverages.id',
    count(*) filter (where c.customer_insurance_coverage_id is not null),
    count(*) filter (
      where c.customer_insurance_coverage_id is not null
        and p.id is null
    ),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.customer_insurance_coverages p
    on p.id = c.customer_insurance_coverage_id

  union all
  select 'daily_report_items.menu_id->menus.id',
    count(*) filter (where c.menu_id is not null),
    count(*) filter (where c.menu_id is not null and p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.menus p on p.id = c.menu_id

  union all
  select 'daily_report_items.menu_billing_profile_id->menu_billing_profiles.id',
    count(*) filter (where c.menu_billing_profile_id is not null),
    count(*) filter (
      where c.menu_billing_profile_id is not null
        and p.id is null
    ),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.menu_billing_profiles p
    on p.id = c.menu_billing_profile_id

  union all
  select 'daily_report_items.staff_resource_id->resources.id',
    count(*) filter (where c.staff_resource_id is not null),
    count(*) filter (where c.staff_resource_id is not null and p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_items c
  left join public.resources p on p.id = c.staff_resource_id

  union all
  select 'daily_report_item_tags.daily_report_item_id->daily_report_items.id',
    count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.daily_report_item_tags c
  left join public.daily_report_items p on p.id = c.daily_report_item_id

  union all
  select 'reservation_history.reservation_id->reservations.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.reservation_history c
  left join public.reservations p on p.id = c.reservation_id

  union all
  select 'reservation_notifications.reservation_id->reservations.id', count(*),
    count(*) filter (where p.id is null),
    count(*) filter (
      where p.id is not null
        and c.clinic_id is distinct from p.clinic_id
    )
  from public.reservation_notifications c
  left join public.reservations p on p.id = c.reservation_id
) relations
order by relation;

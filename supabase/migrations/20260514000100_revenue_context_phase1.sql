-- Revenue context Phase 1.
-- Rollback: supabase/rollbacks/20260514000100_revenue_context_phase1_rollback.sql
-- POST /api/revenue is deprecated. Use /api/daily-reports/items instead.

create table if not exists public.revenue_contexts (
  code text primary key,
  name text not null,
  rollup_category text not null,
  description text,
  is_insurance_related boolean not null default false,
  is_analysis_target boolean not null default true,
  is_selectable boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_contexts_rollup_category_check
    check (
      rollup_category in (
        'insurance',
        'private',
        'traffic_accident',
        'workers_comp',
        'product',
        'ticket',
        'other'
      )
    )
);

insert into public.revenue_contexts (
  code,
  name,
  rollup_category,
  description,
  is_insurance_related,
  is_analysis_target,
  is_selectable,
  sort_order
)
values
  (
    'insurance',
    '保険',
    'insurance',
    '健康保険等の保険施術。既存billing_type=insuranceに対応。',
    true,
    true,
    true,
    10
  ),
  (
    'private',
    '自費',
    'private',
    '自費施術。既存billing_type=privateに対応。',
    false,
    true,
    true,
    20
  ),
  (
    'traffic_accident',
    '交通事故',
    'traffic_accident',
    '交通事故・自賠責関連。請求確定ではなく分析分類。',
    false,
    true,
    true,
    30
  ),
  (
    'workers_comp',
    '労災',
    'workers_comp',
    '労災関連。請求確定ではなく分析分類。',
    false,
    true,
    true,
    40
  ),
  (
    'product',
    '物販',
    'product',
    '物販・サプリ・備品等の販売。',
    false,
    true,
    true,
    50
  ),
  (
    'ticket',
    '回数券',
    'ticket',
    '回数券・プリペイド・チケット関連。',
    false,
    true,
    true,
    60
  ),
  (
    'mixed',
    '混合',
    'other',
    '保険・自費等が混在する将来拡張用。Phase 1では選択不可・分析対象外。',
    true,
    false,
    false,
    70
  ),
  (
    'other',
    'その他',
    'other',
    'その他分類。',
    false,
    true,
    true,
    999
  )
on conflict (code) do update set
  name = excluded.name,
  rollup_category = excluded.rollup_category,
  description = excluded.description,
  is_insurance_related = excluded.is_insurance_related,
  is_analysis_target = excluded.is_analysis_target,
  is_selectable = excluded.is_selectable,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.revenue_contexts enable row level security;

drop policy if exists "revenue_contexts_select_for_authenticated"
on public.revenue_contexts;

create policy "revenue_contexts_select_for_authenticated"
on public.revenue_contexts
for select
to authenticated
using (true);

revoke all on table public.revenue_contexts from anon;
grant select on table public.revenue_contexts to authenticated;
grant all on table public.revenue_contexts to service_role;

alter table public.daily_report_items
  add column if not exists revenue_context_code text,
  add column if not exists revenue_context_source text not null default 'derived',
  add column if not exists amount_source text not null default 'manual',
  add column if not exists estimate_status text not null default 'not_calculated';

update public.daily_report_items
set
  revenue_context_code =
    case
      when billing_type = 'insurance' then 'insurance'
      else 'private'
    end,
  revenue_context_source =
    case
      when source = 'reservation' then 'derived'
      else 'manual'
    end,
  amount_source =
    case
      when source = 'reservation' then 'reservation'
      else 'manual'
    end,
  estimate_status = 'not_calculated'
where revenue_context_code is null;

alter table public.daily_report_items
  alter column revenue_context_code set default 'private',
  alter column revenue_context_code set not null;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_revenue_context_code_fkey,
  add constraint daily_report_items_revenue_context_code_fkey
    foreign key (revenue_context_code)
    references public.revenue_contexts(code);

alter table public.daily_report_items
  drop constraint if exists daily_report_items_revenue_context_source_check,
  add constraint daily_report_items_revenue_context_source_check
    check (
      revenue_context_source in (
        'derived',
        'manual',
        'override',
        'system'
      )
    );

alter table public.daily_report_items
  drop constraint if exists daily_report_items_amount_source_check,
  add constraint daily_report_items_amount_source_check
    check (
      amount_source in (
        'menu_price',
        'manual',
        'estimate',
        'override',
        'reservation'
      )
    );

alter table public.daily_report_items
  drop constraint if exists daily_report_items_estimate_status_check,
  add constraint daily_report_items_estimate_status_check
    check (
      estimate_status in (
        'not_calculated',
        'calculated',
        'needs_review',
        'blocked',
        'overridden'
      )
    );

create index if not exists idx_daily_report_items_revenue_context
  on public.daily_report_items (clinic_id, report_date, revenue_context_code);

create index if not exists idx_daily_report_items_staff_context_date
  on public.daily_report_items (
    clinic_id,
    staff_resource_id,
    revenue_context_code,
    report_date
  );

create index if not exists idx_daily_report_items_estimate_status
  on public.daily_report_items (clinic_id, report_date, estimate_status);

create or replace function public.sync_arrived_reservation_daily_report_item()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_report_id uuid;
  v_report_date date;
  v_customer_name text;
  v_menu_name text;
  v_menu_price numeric(10,2);
  v_is_insurance boolean;
  v_option_delta numeric(10,2) := 0;
  v_fee numeric(10,2);
  v_duration_minutes integer;
begin
  if tg_op = 'UPDATE'
    and old.status = 'arrived'
    and (new.status <> 'arrived' or coalesce(new.is_deleted, false) = true)
  then
    delete from public.daily_report_items
    where reservation_id = old.id
      and source = 'reservation';
    return new;
  end if;

  if new.status <> 'arrived' or coalesce(new.is_deleted, false) = true then
    return new;
  end if;

  v_report_date := date(new.start_time at time zone 'Asia/Tokyo');

  insert into public.daily_reports (
    clinic_id,
    report_date,
    total_patients,
    new_patients,
    total_revenue,
    insurance_revenue,
    private_revenue,
    report_text
  )
  values (
    new.clinic_id,
    v_report_date,
    0,
    0,
    0,
    0,
    0,
    '自動作成: 来院済み予約'
  )
  on conflict (clinic_id, report_date)
  do update set updated_at = now()
  returning id into v_report_id;

  select c.name, m.name, m.price, coalesce(m.is_insurance_applicable, false)
  into v_customer_name, v_menu_name, v_menu_price, v_is_insurance
  from public.customers c
  join public.menus m on m.id = new.menu_id
  where c.id = new.customer_id;

  if not found then
    raise exception 'daily_report_items arrived reservation references not found' using errcode = '23503';
  end if;

  select coalesce(
    sum(
      case
        when option_item.value->>'priceDelta' ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (option_item.value->>'priceDelta')::numeric
        else 0
      end
    ),
    0
  )::numeric(10,2)
  into v_option_delta
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(new.selected_options, '[]'::jsonb)) = 'array'
        then coalesce(new.selected_options, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as option_item(value);

  v_fee := coalesce(new.actual_price, new.price, v_menu_price + v_option_delta, 0)::numeric(10,2);
  v_duration_minutes := greatest(
    0,
    round(extract(epoch from (new.end_time - new.start_time)) / 60)::integer
  );

  insert into public.daily_report_items (
    clinic_id,
    daily_report_id,
    report_date,
    reservation_id,
    customer_id,
    menu_id,
    staff_resource_id,
    patient_name,
    treatment_name,
    duration_minutes,
    fee,
    billing_type,
    revenue_context_code,
    revenue_context_source,
    amount_source,
    estimate_status,
    source,
    notes,
    created_by,
    updated_by
  )
  values (
    new.clinic_id,
    v_report_id,
    v_report_date,
    new.id,
    new.customer_id,
    new.menu_id,
    new.staff_id,
    v_customer_name,
    v_menu_name,
    v_duration_minutes,
    v_fee,
    case when v_is_insurance then 'insurance' else 'private' end,
    case when v_is_insurance then 'insurance' else 'private' end,
    'derived',
    'reservation',
    'not_calculated',
    'reservation',
    new.notes,
    new.created_by,
    new.created_by
  )
  on conflict (clinic_id, reservation_id) where reservation_id is not null
  do update set
    daily_report_id = excluded.daily_report_id,
    report_date = excluded.report_date,
    customer_id = excluded.customer_id,
    menu_id = excluded.menu_id,
    staff_resource_id = excluded.staff_resource_id,
    patient_name = excluded.patient_name,
    treatment_name = excluded.treatment_name,
    duration_minutes = excluded.duration_minutes,
    fee =
      case
        when public.daily_report_items.amount_source = 'override'
          then public.daily_report_items.fee
        else excluded.fee
      end,
    billing_type =
      case
        when public.daily_report_items.revenue_context_source in ('manual', 'override') then
          case
            when public.daily_report_items.revenue_context_code = 'insurance' then 'insurance'
            else 'private'
          end
        else excluded.billing_type
      end,
    revenue_context_code =
      case
        when public.daily_report_items.revenue_context_source in ('manual', 'override')
          then public.daily_report_items.revenue_context_code
        else excluded.revenue_context_code
      end,
    revenue_context_source =
      case
        when public.daily_report_items.revenue_context_source in ('manual', 'override')
          then public.daily_report_items.revenue_context_source
        else excluded.revenue_context_source
      end,
    amount_source = excluded.amount_source,
    estimate_status =
      case
        when public.daily_report_items.estimate_status in ('overridden', 'blocked')
          then public.daily_report_items.estimate_status
        else excluded.estimate_status
      end,
    notes = excluded.notes,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return new;
end;
$$;

revoke execute on function public.sync_arrived_reservation_daily_report_item()
from public, anon, authenticated;

grant execute on function public.sync_arrived_reservation_daily_report_item()
to service_role;

alter function public.sync_arrived_reservation_daily_report_item()
set search_path = public, auth, extensions;

create table if not exists public.daily_report_item_tag_definitions (
  code text primary key,
  name text not null,
  category text not null,
  severity text not null default 'info',
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_report_item_tag_category_check
    check (
      category in (
        'payer',
        'clinical',
        'operation',
        'billing_review',
        'analysis',
        'system',
        'other'
      )
    ),
  constraint daily_report_item_tag_severity_check
    check (
      severity in (
        'info',
        'warning',
        'needs_review',
        'excluded',
        'blocked'
      )
    )
);

insert into public.daily_report_item_tag_definitions (
  code,
  name,
  category,
  severity,
  description,
  sort_order
)
values
  (
    'TRAFFIC_ACCIDENT_REVIEW',
    '交通事故 要確認',
    'billing_review',
    'needs_review',
    '交通事故・自賠責関連として確認が必要な明細。',
    10
  ),
  (
    'WORKERS_COMP_REVIEW',
    '労災 要確認',
    'billing_review',
    'needs_review',
    '労災関連として確認が必要な明細。',
    20
  ),
  (
    'ESTIMATE_EXCLUDED',
    '見込み計算対象外',
    'analysis',
    'excluded',
    '療養費・売上見込み計算から除外する明細。',
    30
  ),
  (
    'MANUAL_CLASSIFICATION',
    '手動分類',
    'operation',
    'info',
    'スタッフが売上文脈を手動変更した明細。',
    40
  )
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  severity = excluded.severity,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.daily_report_item_tag_definitions enable row level security;

drop policy if exists "daily_report_item_tag_definitions_select_for_authenticated"
on public.daily_report_item_tag_definitions;

create policy "daily_report_item_tag_definitions_select_for_authenticated"
on public.daily_report_item_tag_definitions
for select
to authenticated
using (true);

revoke all on table public.daily_report_item_tag_definitions from anon;
grant select on table public.daily_report_item_tag_definitions to authenticated;
grant all on table public.daily_report_item_tag_definitions to service_role;

create table if not exists public.daily_report_item_tags (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  daily_report_item_id uuid not null,
  tag_code text not null,
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_report_item_tags_pkey primary key (id),
  constraint daily_report_item_tags_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint daily_report_item_tags_item_id_fkey
    foreign key (daily_report_item_id) references public.daily_report_items(id) on delete cascade,
  constraint daily_report_item_tags_tag_code_fkey
    foreign key (tag_code) references public.daily_report_item_tag_definitions(code),
  constraint daily_report_item_tags_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint daily_report_item_tags_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint daily_report_item_tags_unique
    unique (daily_report_item_id, tag_code)
);

create index if not exists idx_daily_report_item_tags_clinic_item
  on public.daily_report_item_tags (clinic_id, daily_report_item_id);

create index if not exists idx_daily_report_item_tags_clinic_tag
  on public.daily_report_item_tags (clinic_id, tag_code);

create or replace function public.validate_daily_report_item_tags_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_item_clinic_id uuid;
begin
  select clinic_id
  into v_item_clinic_id
  from public.daily_report_items
  where id = new.daily_report_item_id;

  if not found then
    raise exception 'daily_report_items.id not found' using errcode = '23503';
  end if;

  if v_item_clinic_id <> new.clinic_id then
    raise exception 'daily_report_item_tags.daily_report_item_id clinic mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_report_item_tags_ref_check
on public.daily_report_item_tags;

create trigger daily_report_item_tags_ref_check
before insert or update on public.daily_report_item_tags
for each row execute function public.validate_daily_report_item_tags_refs();

drop trigger if exists update_daily_report_item_tags_updated_at
on public.daily_report_item_tags;

create trigger update_daily_report_item_tags_updated_at
before update on public.daily_report_item_tags
for each row execute function public.update_updated_at_column();

revoke execute on function public.validate_daily_report_item_tags_refs()
from public, anon, authenticated;

grant execute on function public.validate_daily_report_item_tags_refs()
to service_role;

alter table public.daily_report_item_tags enable row level security;

drop policy if exists "daily_report_item_tags_select_for_staff"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_select_for_staff"
on public.daily_report_item_tags
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "daily_report_item_tags_insert_for_staff"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_insert_for_staff"
on public.daily_report_item_tags
for insert
to authenticated
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "daily_report_item_tags_update_for_staff"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_update_for_staff"
on public.daily_report_item_tags
for update
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "daily_report_item_tags_delete_for_managers"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_delete_for_managers"
on public.daily_report_item_tags
for delete
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager']
  )
  and app_private.can_access_clinic(clinic_id)
);

grant select, insert, update, delete on table public.daily_report_item_tags to authenticated;
grant all on table public.daily_report_item_tags to service_role;

create or replace view public.daily_report_revenue_context_summary
with (security_invoker = true)
as
select
  dri.clinic_id,
  dri.report_date,
  dri.revenue_context_code,
  rc.name as revenue_context_name,
  rc.rollup_category,
  count(*)::integer as item_count,
  coalesce(sum(dri.fee), 0)::numeric(10,2) as total_revenue,
  count(*) filter (where dri.estimate_status = 'needs_review')::integer as needs_review_count,
  count(*) filter (where dri.estimate_status = 'blocked')::integer as blocked_count
from public.daily_report_items dri
join public.revenue_contexts rc
  on rc.code = dri.revenue_context_code
where rc.is_analysis_target = true
group by
  dri.clinic_id,
  dri.report_date,
  dri.revenue_context_code,
  rc.name,
  rc.rollup_category;

grant select on public.daily_report_revenue_context_summary to authenticated;
grant select on public.daily_report_revenue_context_summary to service_role;

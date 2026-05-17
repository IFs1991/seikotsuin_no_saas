-- Revenue estimates Phase 3.
-- Rollback: supabase/rollbacks/20260514000300_revenue_estimates_phase3_rollback.sql

create table if not exists public.revenue_estimates (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  daily_report_item_id uuid not null,
  revenue_context_code text not null,
  estimate_status text not null default 'not_calculated',
  estimated_total numeric(10,2) not null default 0,
  disclaimer text not null default '経営分析用の概算です。請求確定額ではありません。',
  calculated_at timestamptz,
  calculation_version text not null default 'v1',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_estimates_pkey primary key (id),
  constraint revenue_estimates_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimates_item_id_fkey
    foreign key (daily_report_item_id) references public.daily_report_items(id) on delete cascade,
  constraint revenue_estimates_context_fkey
    foreign key (revenue_context_code) references public.revenue_contexts(code),
  constraint revenue_estimates_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint revenue_estimates_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint revenue_estimates_status_check
    check (
      estimate_status in (
        'not_calculated',
        'calculated',
        'needs_review',
        'blocked',
        'overridden'
      )
    ),
  constraint revenue_estimates_unique_item
    unique (daily_report_item_id)
);

create index if not exists idx_revenue_estimates_clinic_status
  on public.revenue_estimates (clinic_id, estimate_status);

create index if not exists idx_revenue_estimates_clinic_context
  on public.revenue_estimates (clinic_id, revenue_context_code);

drop trigger if exists update_revenue_estimates_updated_at
on public.revenue_estimates;

create trigger update_revenue_estimates_updated_at
before update on public.revenue_estimates
for each row execute function public.update_updated_at_column();

create table if not exists public.revenue_estimate_lines (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  revenue_estimate_id uuid not null,
  line_type text not null,
  label text not null,
  quantity numeric(10,2) not null default 1,
  unit_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint revenue_estimate_lines_pkey primary key (id),
  constraint revenue_estimate_lines_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimate_lines_estimate_id_fkey
    foreign key (revenue_estimate_id) references public.revenue_estimates(id) on delete cascade
);

create index if not exists idx_revenue_estimate_lines_estimate
  on public.revenue_estimate_lines (clinic_id, revenue_estimate_id, sort_order);

create table if not exists public.revenue_estimate_warnings (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  revenue_estimate_id uuid not null,
  warning_code text not null,
  severity text not null default 'warning',
  message text not null,
  created_at timestamptz not null default now(),
  constraint revenue_estimate_warnings_pkey primary key (id),
  constraint revenue_estimate_warnings_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimate_warnings_estimate_id_fkey
    foreign key (revenue_estimate_id) references public.revenue_estimates(id) on delete cascade,
  constraint revenue_estimate_warnings_severity_check
    check (severity in ('info', 'warning', 'needs_review', 'blocked'))
);

create index if not exists idx_revenue_estimate_warnings_estimate
  on public.revenue_estimate_warnings (clinic_id, revenue_estimate_id);

create index if not exists idx_revenue_estimate_warnings_estimate_id
  on public.revenue_estimate_warnings (revenue_estimate_id);

create table if not exists public.revenue_estimate_overrides (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  revenue_estimate_id uuid not null,
  previous_amount numeric(10,2),
  override_amount numeric(10,2) not null,
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint revenue_estimate_overrides_pkey primary key (id),
  constraint revenue_estimate_overrides_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimate_overrides_estimate_id_fkey
    foreign key (revenue_estimate_id) references public.revenue_estimates(id) on delete cascade,
  constraint revenue_estimate_overrides_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null
);

create index if not exists idx_revenue_estimate_overrides_estimate
  on public.revenue_estimate_overrides (clinic_id, revenue_estimate_id, created_at);

create or replace function public.validate_revenue_estimates_refs()
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
    raise exception 'revenue_estimates.daily_report_item_id clinic mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists revenue_estimates_ref_check
on public.revenue_estimates;

create trigger revenue_estimates_ref_check
before insert or update on public.revenue_estimates
for each row execute function public.validate_revenue_estimates_refs();

create or replace function public.validate_revenue_estimate_child_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_estimate_clinic_id uuid;
begin
  select clinic_id
  into v_estimate_clinic_id
  from public.revenue_estimates
  where id = new.revenue_estimate_id;

  if not found then
    raise exception 'revenue_estimates.id not found' using errcode = '23503';
  end if;

  if v_estimate_clinic_id <> new.clinic_id then
    raise exception 'revenue_estimate child clinic mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists revenue_estimate_lines_ref_check
on public.revenue_estimate_lines;

create trigger revenue_estimate_lines_ref_check
before insert or update on public.revenue_estimate_lines
for each row execute function public.validate_revenue_estimate_child_refs();

drop trigger if exists revenue_estimate_warnings_ref_check
on public.revenue_estimate_warnings;

create trigger revenue_estimate_warnings_ref_check
before insert or update on public.revenue_estimate_warnings
for each row execute function public.validate_revenue_estimate_child_refs();

drop trigger if exists revenue_estimate_overrides_ref_check
on public.revenue_estimate_overrides;

create trigger revenue_estimate_overrides_ref_check
before insert or update on public.revenue_estimate_overrides
for each row execute function public.validate_revenue_estimate_child_refs();

revoke execute on function public.validate_revenue_estimates_refs()
from public, anon, authenticated;

revoke execute on function public.validate_revenue_estimate_child_refs()
from public, anon, authenticated;

grant execute on function public.validate_revenue_estimates_refs()
to service_role;

grant execute on function public.validate_revenue_estimate_child_refs()
to service_role;

alter table public.revenue_estimates enable row level security;
alter table public.revenue_estimate_lines enable row level security;
alter table public.revenue_estimate_warnings enable row level security;
alter table public.revenue_estimate_overrides enable row level security;

drop policy if exists "revenue_estimates_select_for_staff"
on public.revenue_estimates;

create policy "revenue_estimates_select_for_staff"
on public.revenue_estimates
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "revenue_estimates_write_for_staff"
on public.revenue_estimates;

create policy "revenue_estimates_write_for_staff"
on public.revenue_estimates
for all
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

drop policy if exists "revenue_estimate_lines_select_for_staff"
on public.revenue_estimate_lines;

create policy "revenue_estimate_lines_select_for_staff"
on public.revenue_estimate_lines
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "revenue_estimate_lines_write_for_staff"
on public.revenue_estimate_lines;

create policy "revenue_estimate_lines_write_for_staff"
on public.revenue_estimate_lines
for all
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

drop policy if exists "revenue_estimate_warnings_select_for_staff"
on public.revenue_estimate_warnings;

create policy "revenue_estimate_warnings_select_for_staff"
on public.revenue_estimate_warnings
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "revenue_estimate_warnings_write_for_staff"
on public.revenue_estimate_warnings;

create policy "revenue_estimate_warnings_write_for_staff"
on public.revenue_estimate_warnings
for all
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

drop policy if exists "revenue_estimate_overrides_select_for_staff"
on public.revenue_estimate_overrides;

create policy "revenue_estimate_overrides_select_for_staff"
on public.revenue_estimate_overrides
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "revenue_estimate_overrides_insert_for_staff"
on public.revenue_estimate_overrides;

create policy "revenue_estimate_overrides_insert_for_staff"
on public.revenue_estimate_overrides
for insert
to authenticated
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

revoke all on table public.revenue_estimates from anon;
revoke all on table public.revenue_estimate_lines from anon;
revoke all on table public.revenue_estimate_warnings from anon;
revoke all on table public.revenue_estimate_overrides from anon;

grant select, insert, update, delete on table public.revenue_estimates to authenticated;
grant select, insert, update, delete on table public.revenue_estimate_lines to authenticated;
grant select, insert, update, delete on table public.revenue_estimate_warnings to authenticated;
grant select, insert on table public.revenue_estimate_overrides to authenticated;

grant all on table public.revenue_estimates to service_role;
grant all on table public.revenue_estimate_lines to service_role;
grant all on table public.revenue_estimate_warnings to service_role;
grant all on table public.revenue_estimate_overrides to service_role;

create or replace view public.daily_report_revenue_estimate_summary
with (security_invoker = true)
as
with estimate_summary as (
  select
    dri.clinic_id,
    dri.report_date,
    count(re.id)::integer as estimate_count,
    coalesce(sum(re.estimated_total), 0)::numeric(10,2) as estimated_total,
    count(re.id) filter (where re.estimate_status = 'calculated')::integer as calculated_count,
    count(re.id) filter (where re.estimate_status = 'needs_review')::integer as needs_review_count,
    count(re.id) filter (where re.estimate_status = 'blocked')::integer as blocked_count,
    count(re.id) filter (where re.estimate_status = 'overridden')::integer as overridden_count
  from public.daily_report_items dri
  left join public.revenue_estimates re
    on re.daily_report_item_id = dri.id
  group by
    dri.clinic_id,
    dri.report_date
),
warning_summary as (
  select
    dri.clinic_id,
    dri.report_date,
    count(rew.id)::integer as warning_count
  from public.daily_report_items dri
  join public.revenue_estimates re
    on re.daily_report_item_id = dri.id
  join public.revenue_estimate_warnings rew
    on rew.revenue_estimate_id = re.id
  group by
    dri.clinic_id,
    dri.report_date
)
select
  es.clinic_id,
  es.report_date,
  es.estimate_count,
  es.estimated_total,
  es.calculated_count,
  es.needs_review_count,
  es.blocked_count,
  es.overridden_count,
  coalesce(ws.warning_count, 0)::integer as warning_count,
  '経営分析用の概算です。請求確定額ではありません。'::text as disclaimer
from estimate_summary es
left join warning_summary ws
  on ws.clinic_id = es.clinic_id
  and ws.report_date = es.report_date;

grant select on public.daily_report_revenue_estimate_summary to authenticated;
grant select on public.daily_report_revenue_estimate_summary to service_role;

comment on table public.revenue_estimates is 'Management-analysis revenue estimates. Not claim-final amounts.';
comment on table public.revenue_estimate_lines is 'Line-level breakdown for revenue estimates.';
comment on table public.revenue_estimate_warnings is 'Warnings that explain estimate uncertainty or review needs.';
comment on table public.revenue_estimate_overrides is 'Manual override audit trail for revenue estimates.';

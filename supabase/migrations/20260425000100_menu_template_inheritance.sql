-- Menu template inheritance for parent/child tenant menu setup.
-- @spec docs/stabilization/spec-menu-template-inheritance-v0.1.md
-- @rollback supabase/rollbacks/20260425000100_menu_template_inheritance_rollback.sql

create table if not exists public.menu_templates (
  id uuid default extensions.uuid_generate_v4() not null,
  owner_clinic_id uuid not null references public.clinics(id) on delete cascade,
  name character varying(255) not null,
  description text,
  category character varying(100),
  price numeric(10,2) not null,
  duration_minutes integer not null,
  is_insurance_applicable boolean default false,
  options jsonb default '[]'::jsonb,
  is_active boolean default true,
  display_order integer default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_deleted boolean default false,
  constraint menu_templates_pkey primary key (id),
  constraint menu_templates_duration_minutes_check check (duration_minutes > 0),
  constraint menu_templates_price_check check (price >= 0)
);

comment on table public.menu_templates is
  'Parent/standalone clinic-owned treatment menu templates copied into clinic-owned public.menus rows.';
comment on column public.menu_templates.owner_clinic_id is
  'Clinic that owns the common template set. Child clinics import from their parent clinic.';

create index if not exists idx_menu_templates_owner_clinic
  on public.menu_templates (owner_clinic_id)
  where is_deleted = false;

create index if not exists idx_menu_templates_active_order
  on public.menu_templates (owner_clinic_id, is_active, display_order, name)
  where is_deleted = false;

create or replace trigger update_menu_templates_updated_at
  before update on public.menu_templates
  for each row execute function public.update_updated_at_column();

alter table public.menu_templates enable row level security;

drop policy if exists "menu_templates_select_for_managers" on public.menu_templates;
drop policy if exists "menu_templates_insert_for_managers" on public.menu_templates;
drop policy if exists "menu_templates_update_for_managers" on public.menu_templates;
drop policy if exists "menu_templates_delete_for_managers" on public.menu_templates;

create policy "menu_templates_select_for_managers"
on public.menu_templates
for select
using (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])
  and public.can_access_clinic(owner_clinic_id)
);

create policy "menu_templates_insert_for_managers"
on public.menu_templates
for insert
with check (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])
  and public.can_access_clinic(owner_clinic_id)
);

create policy "menu_templates_update_for_managers"
on public.menu_templates
for update
using (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])
  and public.can_access_clinic(owner_clinic_id)
)
with check (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])
  and public.can_access_clinic(owner_clinic_id)
);

create policy "menu_templates_delete_for_managers"
on public.menu_templates
for delete
using (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])
  and public.can_access_clinic(owner_clinic_id)
);

grant all on table public.menu_templates to anon;
grant all on table public.menu_templates to authenticated;
grant all on table public.menu_templates to service_role;

-- Rollback menu template inheritance.
-- @spec docs/stabilization/spec-menu-template-inheritance-v0.1.md
-- @migration supabase/migrations/20260425000100_menu_template_inheritance.sql

drop policy if exists "menu_templates_delete_for_managers" on public.menu_templates;
drop policy if exists "menu_templates_update_for_managers" on public.menu_templates;
drop policy if exists "menu_templates_insert_for_managers" on public.menu_templates;
drop policy if exists "menu_templates_select_for_managers" on public.menu_templates;

drop trigger if exists update_menu_templates_updated_at on public.menu_templates;

drop index if exists public.idx_menu_templates_active_order;
drop index if exists public.idx_menu_templates_owner_clinic;

drop table if exists public.menu_templates;

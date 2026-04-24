# Menu Template Inheritance v0.1

## Goal

Enable a parent tenant to manage shared treatment menu templates, while each child tenant copies those templates into its own `public.menus` rows and customizes them independently.

## Scope

- Parent/child relationship uses existing `public.clinics.parent_id`.
- Reservation screens continue to read only `public.menus` through `/api/menus`.
- Shared templates are stored separately in `public.menu_templates`.
- Child clinic customization is performed on copied `public.menus` records, not on the parent template.

## Non-Goals

- No automatic propagation from parent templates to already-copied child menus.
- No destructive overwrite of child menus.
- No migration of existing `public.menus` rows into templates.
- No changes to reservation write paths.

## Data Model

Add `public.menu_templates`:

- `id uuid primary key`
- `owner_clinic_id uuid not null references public.clinics(id) on delete cascade`
- `name text/varchar not null`
- `description text`
- `category varchar(100)`
- `price numeric(10,2) not null`
- `duration_minutes integer not null check > 0`
- `is_insurance_applicable boolean default false`
- `options jsonb default []`
- `is_active boolean default true`
- `display_order integer default 0`
- `created_by uuid references auth.users(id)`
- `created_at`, `updated_at`
- `is_deleted boolean default false`

RLS:

- Select: `admin`, `clinic_admin`, `manager` with `public.can_access_clinic(owner_clinic_id)`.
- Insert/update/delete: same role set and same clinic scope.
- The API layer enforces that a child clinic imports only from its parent clinic, or from itself when the selected clinic is a parent/standalone clinic.

## API Contract

`GET /api/menu-templates?clinic_id={selectedClinicId}`

- Auth: `admin`, `clinic_admin`, `manager`.
- Resolves template owner:
  - if selected clinic has `parent_id`, owner is `parent_id`
  - otherwise owner is selected clinic id
- Returns `{ templates, ownerClinicId, ownerClinicName, targetClinicId, isOwnerClinic }`.

`POST /api/menu-templates`

- Auth: `admin`, `clinic_admin`, `manager`.
- Body includes `owner_clinic_id` and template fields.
- Creates a parent template.

`PATCH /api/menu-templates`

- Auth: `admin`, `clinic_admin`, `manager`.
- Body includes `owner_clinic_id`, `id`, and changed fields.

`DELETE /api/menu-templates?owner_clinic_id=...&id=...`

- Soft-deletes a template by setting `is_deleted = true`.

`POST /api/menu-templates/import`

- Auth: `admin`, `clinic_admin`, `manager`.
- Body includes `clinic_id` and `template_id`.
- Resolves the target clinic's template owner using `clinics.parent_id`.
- Reads an active, non-deleted template from the owner.
- Inserts a new `public.menus` row for the target clinic.
- Returns the created menu row.

## UI Contract

`/admin/settings` → `サービス・料金` → `施術メニュー`

- The registered menu list is backed by `/api/menus`.
- The common template list is backed by `/api/menu-templates`.
- If the selected clinic is the owner clinic, the user can add/edit/delete templates.
- If the selected clinic is a child clinic, the user can import parent templates.
- After import, the child menu appears in the clinic's own registered menu list and can be customized independently.

## DoD Tie-In

- DOD-08: RLS policies use `clinic_id`/`owner_clinic_id` and `public.can_access_clinic(...)`.
- DOD-09: Client paths do not access tenant tables directly; UI uses server APIs.
- DOD-10: `npm run build` succeeds.
- DOD-11: focused Jest tests pass.

## Rollback Plan

Use `supabase/rollbacks/20260425000100_menu_template_inheritance_rollback.sql`.

Rollback removes:

- `public.menu_templates`
- `update_menu_templates_updated_at` trigger
- indexes on `public.menu_templates`
- RLS policies on `public.menu_templates`

Rollback does not delete child `public.menus` rows already imported from templates, because those are ordinary clinic-owned menu rows after import.

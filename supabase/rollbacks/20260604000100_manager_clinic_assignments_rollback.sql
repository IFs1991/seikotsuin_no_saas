-- ================================================================
-- Rollback: Manager clinic assignments v0.2 PR-01
-- Restores app_private.can_access_clinic(uuid) to the pre-PR-01 shape.
-- ================================================================

begin;

set search_path = public, auth, extensions;

drop table if exists public.manager_clinic_assignments cascade;
drop function if exists app_private.assert_manager_clinic_assignment_valid();
drop function if exists public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid);

create or replace function app_private.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  scope_ids_json jsonb;
  scope_ids uuid[];
  primary_clinic_id uuid;
begin
  if target_clinic_id is null then
    return false;
  end if;

  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    scope_ids_json := coalesce(
      claims -> 'app_metadata' -> 'clinic_scope_ids',
      claims -> 'clinic_scope_ids'
    );

    if scope_ids_json is not null
       and jsonb_typeof(scope_ids_json) = 'array'
       and jsonb_array_length(scope_ids_json) > 0
    then
      select array_agg(elem::text::uuid)
      into scope_ids
      from jsonb_array_elements_text(scope_ids_json) as elem;

      return target_clinic_id = any(scope_ids);
    end if;
  exception when others then
    null;
  end;

  primary_clinic_id := app_private.get_current_clinic_id();

  if primary_clinic_id is null then
    return false;
  end if;

  return target_clinic_id = primary_clinic_id;
end;
$$;

grant execute on function app_private.can_access_clinic(uuid) to anon, authenticated;

commit;

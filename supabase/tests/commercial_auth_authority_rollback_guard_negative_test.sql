-- Manual negative fixture for the PR-09 validation-only rollback guard.
--
-- Normal `supabase test db` execution takes the pgTAP branch below. To prove
-- the real rollback guard rejects semantic drift, concatenate this file and
-- the PR-09 rollback SQL into one local psql input with exactly one psql
-- variable defined:
--
--   pr09_run_rollback_guard_negative_policy
--     -> policy identity/role/command/expression drift
--   pr09_run_rollback_guard_negative_function
--     -> authority function definition/owner/config drift
--   pr09_run_rollback_guard_negative_extra_policy
--     -> unexpected permissive policy-set drift
--   pr09_run_rollback_guard_negative_column_acl
--     -> authenticated column-level write privilege drift
--
-- Both the unsafe replacement and the guard run inside a transaction. The
-- expected exception aborts that transaction, so disconnecting rolls the
-- synthetic drift back and leaves the local schema unchanged.

\if :{?pr09_run_rollback_guard_negative_policy}

begin;

-- Deliberately unsafe: the helper names remain present but the predicate is a
-- tautology for every active role. A substring-only guard would miss this.
alter policy "Admins can update feedback"
on public.beta_feedback
to authenticated
using (
  (select app_private.get_current_role()) <> ''
  and (
    app_private.can_access_clinic(beta_feedback.clinic_id)
    or not app_private.can_access_clinic(beta_feedback.clinic_id)
  )
)
with check (
  (select app_private.get_current_role()) <> ''
  and (
    app_private.can_access_clinic(beta_feedback.clinic_id)
    or not app_private.can_access_clinic(beta_feedback.clinic_id)
  )
);

\elif :{?pr09_run_rollback_guard_negative_extra_policy}

begin;

-- Deliberately unsafe: permissive policies are OR-composed, so an extra policy
-- can bypass an otherwise exact expected predicate without changing its hash.
create policy pr09_unsafe_feature_flags_select_all
on public.clinic_feature_flags
for select
to authenticated
using (true);

\elif :{?pr09_run_rollback_guard_negative_column_acl}

begin;

-- Deliberately unsafe: table-level ACL checks do not report a column-only
-- UPDATE grant, but it still widens the authenticated write surface.
grant update (display_name)
on public.staff_profiles
to authenticated;

\elif :{?pr09_run_rollback_guard_negative_function}

begin;

create or replace function app_private.can_access_clinic(
  target_clinic_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $unsafe_jwt_first_fixture$
declare
  v_database_allows boolean := false;
begin
  -- Deliberately unsafe: JWT admin authority is trusted before any DB check.
  if coalesce(auth.jwt() ->> 'user_role', '') = 'admin' then
    return true;
  end if;

  select exists (
    select 1
    from public.user_permissions up
    join public.profiles p
      on p.user_id = up.staff_id
     and p.is_active is true
    where up.staff_id = auth.uid()
      and up.clinic_id = target_clinic_id
  )
  into v_database_allows;

  if v_database_allows is distinct from true then
    return false;
  end if;

  return true;
end
$unsafe_jwt_first_fixture$;

\else

begin;

set local search_path = pg_catalog, extensions, public;

select plan(1);

select pass(
  'rollback-guard negative fixture is opt-in and leaves the normal pgTAP suite unchanged'
);

select * from finish();

rollback;

\endif

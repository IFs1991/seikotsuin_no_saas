-- ================================================================
-- Migration: Multiple Permissive Exact Duplicate Cleanup
-- ================================================================
-- File:    20260413000500_multiple_permissive_exact_duplicate_cleanup.sql
-- Created: 2026-04-13
-- Purpose:
--   Remove only the exact-duplicate permissive RLS policies that are
--   safe to drop without changing access semantics.
-- Safety:
--   - Validate each keep/drop pair against pg_policies before dropping
--   - Abort if cmd/permissive/roles/USING/WITH CHECK differ
--   - Do not touch high-risk multi-policy tables beyond the 6 targets
-- Related:
--   - docs/stabilization/spec-performance-advisor-multiple-permissive-exact-duplicates-v0.1.md
--   - docs/stabilization/rollback-performance-advisor-multiple-permissive-exact-duplicates-v0.1.md
--   - docs/stabilization/DoD-v0.1.md (DOD-04 / DOD-08)
-- ================================================================

begin;

create temporary table _exact_duplicate_policy_pairs (
    tablename text not null,
    keep_policy text not null,
    drop_policy text not null,
    primary key (tablename, keep_policy, drop_policy)
) on commit drop;

insert into _exact_duplicate_policy_pairs (tablename, keep_policy, drop_policy)
values
    ('staff_shifts', 'staff_shifts_delete', 'staff_shifts_delete_policy'),
    ('staff_shifts', 'staff_shifts_insert', 'staff_shifts_insert_policy'),
    ('staff_shifts', 'staff_shifts_select', 'staff_shifts_select_policy'),
    ('staff_shifts', 'staff_shifts_update', 'staff_shifts_update_policy'),
    ('staff_preferences', 'staff_preferences_delete', 'staff_preferences_delete_policy'),
    ('staff_preferences', 'staff_preferences_select', 'staff_preferences_select_policy');

do $$
declare
    rec record;
    keep_count integer;
    drop_count integer;
    diff_count integer;
begin
    for rec in
        select tablename, keep_policy, drop_policy
        from _exact_duplicate_policy_pairs
        order by tablename, keep_policy
    loop
        select count(*)
          into keep_count
          from pg_policies
         where schemaname = 'public'
           and tablename = rec.tablename
           and policyname = rec.keep_policy;

        select count(*)
          into drop_count
          from pg_policies
         where schemaname = 'public'
           and tablename = rec.tablename
           and policyname = rec.drop_policy;

        if keep_count <> 1 or drop_count <> 1 then
            raise exception
                'Expected one keep/drop policy for %. (% / %), found keep=% drop=%',
                rec.tablename,
                rec.keep_policy,
                rec.drop_policy,
                keep_count,
                drop_count;
        end if;

        with keep_policy as (
            select
                cmd,
                permissive,
                array_to_string(roles, ',') as roles,
                coalesce(qual, '') as qual,
                coalesce(with_check, '') as with_check
            from pg_policies
            where schemaname = 'public'
              and tablename = rec.tablename
              and policyname = rec.keep_policy
        ),
        drop_policy as (
            select
                cmd,
                permissive,
                array_to_string(roles, ',') as roles,
                coalesce(qual, '') as qual,
                coalesce(with_check, '') as with_check
            from pg_policies
            where schemaname = 'public'
              and tablename = rec.tablename
              and policyname = rec.drop_policy
        ),
        diffs as (
            (
                select * from keep_policy
                except
                select * from drop_policy
            )
            union all
            (
                select * from drop_policy
                except
                select * from keep_policy
            )
        )
        select count(*)
          into diff_count
          from diffs;

        if diff_count <> 0 then
            raise exception
                'Policy pair %. (% / %) is not an exact duplicate',
                rec.tablename,
                rec.keep_policy,
                rec.drop_policy;
        end if;
    end loop;
end
$$;

drop policy if exists "staff_shifts_delete_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_insert_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_select_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_update_policy" on public.staff_shifts;

drop policy if exists "staff_preferences_delete_policy" on public.staff_preferences;
drop policy if exists "staff_preferences_select_policy" on public.staff_preferences;

commit;

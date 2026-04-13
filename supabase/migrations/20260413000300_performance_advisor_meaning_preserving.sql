-- ================================================================
-- Migration: Performance Advisor Meaning-Preserving Fixes
-- ================================================================
-- File:    20260413000300_performance_advisor_meaning_preserving.sql
-- Created: 2026-04-13
-- Purpose:
--   1. Drop duplicate indexes flagged by Supabase Performance Advisor
--   2. Wrap auth.uid()/auth.role() in RLS policies with SELECT init plans
-- Non-goals:
--   - Do not merge multiple permissive policies automatically
--   - Do not widen or narrow RLS access boundaries
--   - Do not change USING/WITH CHECK semantics
-- Related:
--   - docs/stabilization/performance-advisor-meaning-preserving-plan-v0.1.md
--   - docs/stabilization/DoD-v0.1.md (DOD-04 / DOD-08)
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Drop byte-for-byte duplicate indexes
-- ----------------------------------------------------------------
drop index if exists public.idx_reservations_status_clinic;
drop index if exists public.idx_resources_clinic;

-- ----------------------------------------------------------------
-- 2. Turn auth.uid()/auth.role() calls into init plans
-- ----------------------------------------------------------------
do $$
declare
    rec record;
    new_qual text;
    new_with_check text;
    changed_count integer := 0;
begin
    for rec in
        select
            schemaname,
            tablename,
            policyname,
            qual,
            with_check
        from pg_policies
        where schemaname = 'public'
          and (
              coalesce(qual, '') like '%auth.uid()%'
              or coalesce(with_check, '') like '%auth.uid()%'
              or coalesce(qual, '') like '%auth.role()%'
              or coalesce(with_check, '') like '%auth.role()%'
          )
        order by tablename, policyname
    loop
        new_qual := rec.qual;
        new_with_check := rec.with_check;

        if new_qual is not null then
            new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
            new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
        end if;

        if new_with_check is not null then
            new_with_check := replace(new_with_check, 'auth.uid()', '(select auth.uid())');
            new_with_check := replace(new_with_check, 'auth.role()', '(select auth.role())');
        end if;

        if coalesce(new_qual, '') = coalesce(rec.qual, '')
           and coalesce(new_with_check, '') = coalesce(rec.with_check, '') then
            raise exception
                'Expected auth wrapper change for %.%, but expression stayed the same',
                rec.tablename,
                rec.policyname;
        end if;

        if rec.qual is not null and rec.with_check is not null then
            execute format(
                'alter policy %I on %I.%I using (%s) with check (%s)',
                rec.policyname,
                rec.schemaname,
                rec.tablename,
                new_qual,
                new_with_check
            );
        elsif rec.qual is not null then
            execute format(
                'alter policy %I on %I.%I using (%s)',
                rec.policyname,
                rec.schemaname,
                rec.tablename,
                new_qual
            );
        elsif rec.with_check is not null then
            execute format(
                'alter policy %I on %I.%I with check (%s)',
                rec.policyname,
                rec.schemaname,
                rec.tablename,
                new_with_check
            );
        else
            raise exception
                'Policy %.% had neither USING nor WITH CHECK',
                rec.tablename,
                rec.policyname;
        end if;

        changed_count := changed_count + 1;
    end loop;

    raise notice 'Performance Advisor init-plan wrapper updated % policies', changed_count;
end
$$;

commit;

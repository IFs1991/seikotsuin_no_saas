-- ================================================================
-- Rollback: Performance Advisor Meaning-Preserving Fixes
-- ================================================================
-- Target: 20260413000300_performance_advisor_meaning_preserving.sql
-- Purpose:
--   - Recreate the dropped duplicate indexes
--   - Restore direct auth.uid()/auth.role() calls in public RLS policies
-- Note:
--   This rollback is intended for immediate rollback of this migration.
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Recreate duplicate indexes
-- ----------------------------------------------------------------
create index if not exists idx_reservations_status_clinic
    on public.reservations using btree (clinic_id, status)
    where (is_deleted = false);

create index if not exists idx_resources_clinic
    on public.resources using btree (clinic_id);

-- ----------------------------------------------------------------
-- 2. Restore direct auth.uid()/auth.role() calls
-- ----------------------------------------------------------------
do $$
declare
    rec record;
    old_qual text;
    old_with_check text;
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
              coalesce(qual, '') like '%(select auth.uid())%'
              or coalesce(with_check, '') like '%(select auth.uid())%'
              or coalesce(qual, '') like '%(select auth.role())%'
              or coalesce(with_check, '') like '%(select auth.role())%'
          )
        order by tablename, policyname
    loop
        old_qual := rec.qual;
        old_with_check := rec.with_check;

        if old_qual is not null then
            old_qual := replace(old_qual, '(select auth.uid())', 'auth.uid()');
            old_qual := replace(old_qual, '(select auth.role())', 'auth.role()');
        end if;

        if old_with_check is not null then
            old_with_check := replace(old_with_check, '(select auth.uid())', 'auth.uid()');
            old_with_check := replace(old_with_check, '(select auth.role())', 'auth.role()');
        end if;

        if rec.qual is not null and rec.with_check is not null then
            execute format(
                'alter policy %I on %I.%I using (%s) with check (%s)',
                rec.policyname,
                rec.schemaname,
                rec.tablename,
                old_qual,
                old_with_check
            );
        elsif rec.qual is not null then
            execute format(
                'alter policy %I on %I.%I using (%s)',
                rec.policyname,
                rec.schemaname,
                rec.tablename,
                old_qual
            );
        elsif rec.with_check is not null then
            execute format(
                'alter policy %I on %I.%I with check (%s)',
                rec.policyname,
                rec.schemaname,
                rec.tablename,
                old_with_check
            );
        else
            raise exception
                'Policy %.% had neither USING nor WITH CHECK',
                rec.tablename,
                rec.policyname;
        end if;

        changed_count := changed_count + 1;
    end loop;

    raise notice 'Performance Advisor init-plan wrapper rollback updated % policies', changed_count;
end
$$;

commit;

-- Rollback admin notifications realtime publication
-- @spec docs/stabilization/spec-admin-notifications-realtime-v0.1.md
-- @migration supabase/migrations/20260422000100_admin_notifications_realtime.sql

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end $$;

-- Admin notifications realtime publication
-- @spec docs/stabilization/spec-admin-notifications-realtime-v0.1.md
-- @rollback supabase/rollbacks/20260422000100_admin_notifications_realtime_rollback.sql

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

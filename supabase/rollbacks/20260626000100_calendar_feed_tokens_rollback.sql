-- Rollback for 20260626000100_calendar_feed_tokens.sql
-- Warning: dropping calendar_feed_tokens revokes all issued ICS subscription URLs.

drop policy if exists "calendar_feed_tokens_write_admin_only"
on public.calendar_feed_tokens;

drop policy if exists "calendar_feed_tokens_select_scoped"
on public.calendar_feed_tokens;

drop table if exists public.calendar_feed_tokens;

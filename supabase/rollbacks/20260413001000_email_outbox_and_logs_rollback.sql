-- Rollback: email_outbox + email_logs
begin;

drop trigger if exists email_outbox_updated_at_trigger on public.email_outbox;
drop function if exists public.update_email_outbox_updated_at();
drop table if exists public.email_logs;
drop table if exists public.email_outbox;

commit;

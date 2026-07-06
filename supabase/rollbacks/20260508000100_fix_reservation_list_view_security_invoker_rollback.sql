-- Reverts supabase/migrations/20260508000100_fix_reservation_list_view_security_invoker.sql.

begin;

alter view public.reservation_list_view
  reset (security_invoker);

commit;

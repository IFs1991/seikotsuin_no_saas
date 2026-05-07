-- ================================================================
-- Migration: Fix reservation_list_view security_invoker
-- ================================================================
-- Purpose:
--   Ensure public.reservation_list_view runs with caller privileges.
--   This prevents Supabase Advisor security_definer_view lint from recurring.
-- ================================================================

begin;

alter view public.reservation_list_view
  set (security_invoker = true);

commit;
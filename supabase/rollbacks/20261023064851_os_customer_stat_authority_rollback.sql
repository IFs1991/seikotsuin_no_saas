-- Spec: docs/stabilization/spec-os-customer-stat-authority-v0.1.md (§9)
-- 旧 update_customer_stats（completed への遷移でだけ加算）を再導入すると、
-- 取消・再完了・訂正・削除で顧客統計cacheを再び壊すため、自動rollbackを禁止する。
-- 問題時は reservations_customer_visit_stats_* trigger を維持した
-- reviewed forward-fix（新しいmigration）だけを行う（spec §9.4）。
begin;
do $$ begin
  raise exception 'OS-F1 rollback blocked: keep reservations_customer_visit_stats_* and app_private.refresh_customer_visit_stats; use a reviewed forward fix';
end $$;
rollback;

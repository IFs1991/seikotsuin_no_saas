-- Spec: docs/stabilization/spec-post-core100-notification-durability-v0.1.md
-- 履歴や配送所有権を失う自動rollbackを禁止する。outboxを保全したforward fixのみ行う。
begin;
do $$ begin
  raise exception 'PR-D rollback blocked: preserve outbox rows and monotone claim revisions; use a reviewed forward fix';
end $$;
rollback;

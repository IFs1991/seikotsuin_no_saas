-- Spec: docs/stabilization/spec-os-daily-report-aggregate-authority-v0.1.md (§9)
-- 明細集計の正本を外し、古いブラウザ合計を再び受け付ける自動rollbackを禁止する。
-- 問題時はguard triggerを維持したreviewed forward-fix（新しいmigration）だけを行う。
begin;
do $$ begin
  raise exception 'OS-F2 rollback blocked: keep daily_reports_aggregate_authority and aggregate_source; use a reviewed forward fix';
end $$;
rollback;

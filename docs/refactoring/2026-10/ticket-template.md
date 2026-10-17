# OS-RF 実装Issue/PRテンプレート

> Phase IssueはEpic（進捗集約）。下記は**実作業1件＝PR1件**に適用する。旧監査のIDと現在のSHAを併記し、二重起票を防止。

## Issue
- Program: [#134](https://github.com/IFs1991/seikotsuin_no_saas/issues/134)
- Phase / Tracker:
- Current main commit SHA:
- Kind: DOCS_ONLY / REFACTOR_NO_BEHAVIOR_CHANGE / FIX / PERFORMANCE / FEATURE
- Risk: Low / Medium / High / NOT_ASSESSED
- Status: BACKLOG / VERIFY_FIRST / READY / IN_PROGRESS / REVIEW / BLOCKED / DONE
- Impacted surface: UI / API / DB / Security / Ops / Billing / external / none
- Problem statement: 現在の不具合や変更コストを、利用者観点と証拠で表現
- Evidence: コードpath、行、再現コマンド、実験記録/環境、関連監査F-ID、既存PR/Issue
- Proposed small change:
- Scope / Non-goals:
- Dependencies / blocked by:
- Before metrics / behavior:
- After targets (**仮説**; 実測と区別):
- Positive / negative / regression tests:
- Rollback / forward-fix:
- Residual risk / reviewer:
- Expected acceptance evidence (commit / environment / date):
- Works priority check: 作業してもWorksの顧客案件を延期しないこと

## PR
1. Scope / Non-goals
2. Risk classification / security and tenant boundary
3. Before and after: API/DB calls、p50/p95、既存挙動（実施時のみ）
4. Tests: RED→GREEN（該当領域）、commands/results、current commit SHA
5. Migration/rollback（なしならN/Aと明記）
6. Unverified/blocked/skip/flaky evidence
7. Reviewer sign-off per [Change DoD](../../quality/change-dod-v1.0.md)

## チケットの停止条件
- 未使用・無駄の証拠がない → `VERIFY_FIRST`
- データ漏洩/課金/患者/tenantの境界を変える → High-riskの独立Issue + 承認
- 今回の改善値よりWorksの営業機会費用が高い → `DEFERRED`
- テストや運用経路の不備で旧挙動が不明 → 実装前のcontract testを別PR

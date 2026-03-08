# Plan PR-05: Verification Bundle v0.1

## 1. 目的

「リファクタ計画」の最終工程を、実態に合わせて `Refactor + Verification` の束として定義し、期待成果物を明確にする。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 5 に対応する。

## 2. 現状

- `docs/stabilization/DoD-verification-report-2026-03-06.md` で DOD-01〜04 は確認済み
- `docs/stabilization/mvp-release-readiness-2026-03-06.md` の通り、DOD-05〜12 は未完了
- したがって最終 PR は純粋なリファクタではなく、E2E / build / type-check / runbook 固定化の比重が大きい

## 3. 対象

- `src/__tests__/e2e-playwright/auth-context.spec.ts`
- `src/__tests__/e2e-playwright/cross-clinic-isolation.spec.ts`
- `src/__tests__/e2e-playwright/admin-tenants.spec.ts`
- `src/__tests__/e2e-playwright/public-menus-api.spec.ts`
- `src/__tests__/e2e-playwright/reservations.spec.ts`
- `docs/stabilization/DoD-v0.1.md`
- `docs/stabilization/DoD-verification-report-*.md`
- `docs/test-runbook.md`

## 4. 方針

- PR-05 は検証タスクとして扱う
- コード修正が必要でも、目的は新機能追加ではなく再現性固定化とする
- 実行順、前提条件、失敗時の切り分け手順を文書化する

## 5. 固定するフロー

1. Supabase local 起動確認
2. fixture validate / seed / cleanup の再現性確認
3. Playwright 起動条件の固定
4. 多店舗権限境界の検証
5. 公開予約フローの検証
6. 管理設定 MVP 対象カテゴリの保存確認
7. `build` / `type-check` / Jest の再実行

## 6. 実行手順

1. `docs/stabilization/DoD-v0.1.md` の DOD-05〜12 を再度、対象フロー単位で分解する。
2. `docs/test-runbook.md` に最小手順を書く。
   - 必要 env
   - Supabase 起動順
   - seed 手順
   - Playwright 実行コマンド
3. Playwright ケースを MVP 導線に限定して安定化する。
4. build / type-check / Jest を最終ゲートとして再配置する。
5. 検証結果を DoD report として残す。

## 7. 受け入れ条件

- PR-05 の説明が「何をリファクタしたか」ではなく「何を再現可能にしたか」で書ける
- 対象フローに必要な DoD が埋まる
- E2E と runbook の前提条件が一致する
- ローカル再現手順が 1 回で追える

## 8. DoD

- `docs/stabilization/DoD-v0.1.md` `DOD-05`
- `docs/stabilization/DoD-v0.1.md` `DOD-06`
- `docs/stabilization/DoD-v0.1.md` `DOD-07`
- `docs/stabilization/DoD-v0.1.md` `DOD-08`
- `docs/stabilization/DoD-v0.1.md` `DOD-09`
- `docs/stabilization/DoD-v0.1.md` `DOD-10`
- `docs/stabilization/DoD-v0.1.md` `DOD-11`

## 9. リスク

- PR-05 を「最後にまとめて確認するだけ」と扱うと、検証環境の前提が固定されない
- テスト修正と runbook 更新が分離すると、再現手順が腐る
- DOD-08 / DOD-09 は PR-02 の仕様確定に依存する

## 10. 完了証跡

- Playwright 実行結果
- `npm run build`
- `npm run type-check`
- Jest 実行結果
- `docs/test-runbook.md`
- DoD verification report

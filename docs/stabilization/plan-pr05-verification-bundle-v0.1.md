# Plan PR-05: Verification Bundle v0.1

Status: Preconditions refreshed on 2026-03-13
Status: Verification progress updated on 2026-03-15

## Progress Snapshot (2026-03-15)

- 完了:
  - `npm run e2e:validate-fixtures`
  - `npm run e2e:seed`
  - `npm run e2e:cleanup`
  - `npm run e2e:seed` (cleanup 後の再 seed)
  - `npm run supabase:types`
  - `npm run type-check`
  - `npm run build`
  - PR-05 対象 focused Jest (`9 suites / 94 tests`)
  - `docs/test-runbook.md` 更新
  - `docs/stabilization/DoD-verification-report-2026-03-15.md` 作成
- 完了扱いできる DoD:
  - `DOD-05`
  - `DOD-08`
  - `DOD-09`
  - `DOD-10`
  - `DOD-12`
- 部分完了:
  - `DOD-11` は focused suite まで確認済み。repo 全量 Jest は PR-05 では未取得
- 未完了:
  - `DOD-06`
  - `DOD-07`
- 残ブロッカー:
  - Windows 上で Playwright が `browserType.launch: spawn EPERM` で失敗する
  - 現在の Supabase CLI (`v2.75.0`) では `supabase db query --local` が未対応のため、DOD-08 は `psql` で代替確認した

## Current Closeout View

- 本計画は「前提整備済み項目を束ねて repo-wide に再検証する」という主目的に対して、ほぼ完了である
- 残件は Playwright の Windows 環境ブロッカー解消と、その後の E2E 実行証跡取得に限られる
- したがって PR-05 は「検証バンドル本体は完了、E2E 実行環境の最終閉塞のみ未解消」という状態である

## 1. 目的

「リファクタ計画」の最終工程を、実態に合わせて `Refactor + Verification` の束として定義し、期待成果物を明確にする。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 5 に対応する。

## 2. 現状

- `docs/stabilization/DoD-verification-report-2026-03-06.md` で DOD-01〜04 は確認済み
- `docs/stabilization/mvp-release-readiness-2026-03-06.md` は 2026-03-06 時点のスナップショットであり、その後の完了分を未反映のまま含む
- PR-01 完了により、`npm run supabase:types` と `npm run type-check` の再検証は完了している
- PR-02 完了により、HQ / clinic 権限境界の API / middleware 前提は更新済みである
- PR-03 Phase A 完了により、管理設定 `communication` 契約と SMTP password 非保存の前提は更新済みである
- PR-04 完了により、MVP 導線と管理設定ナビの期待値は更新済みである
- したがって PR-05 の開始前提は「DOD-05〜12 が一様に未着手」ではなく、「個別に前提整備が進んだため repo-wide の再検証と証跡束ねが必要」である
- したがって最終 PR は純粋なリファクタではなく、E2E / build / type-check / runbook 固定化の比重が大きい

## 3. 対象

- `src/__tests__/e2e-playwright/auth-context.spec.ts`
- `src/__tests__/e2e-playwright/cross-clinic-isolation.spec.ts`
- `src/__tests__/e2e-playwright/auth-login-flow.spec.ts`
- `src/__tests__/e2e-playwright/onboarding-rls.spec.ts`
- `src/__tests__/e2e-playwright/admin-tenants.spec.ts`
- `src/__tests__/e2e-playwright/admin-settings.spec.ts`
- `src/__tests__/e2e-playwright/public-menus-api.spec.ts`
- `src/__tests__/e2e-playwright/reservations.spec.ts`
- `playwright.config.ts`
- `package.json`
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
4. 認証 / ログイン / オンボーディング導線の検証
5. 多店舗権限境界の検証
6. 公開メニュー / 公開予約フローの検証
7. 管理設定 MVP 対象カテゴリの保存確認
8. `build` / `type-check` / Jest / `supabase:types` の再実行

## 6. 実行手順

1. `docs/stabilization/DoD-v0.1.md` の DOD-05〜12 を、完了済み前提と未検証項目に分けて対象フロー単位で再整理する。
2. `docs/test-runbook.md` に最小手順を書く。
   - 必要 env
   - Supabase 起動順
   - seed 手順
   - Playwright 実行コマンド
3. `playwright.config.ts` / `NEXT_PUBLIC_APP_URL` / `PLAYWRIGHT_BASE_URL` の前提を runbook と一致させる。
4. Playwright ケースを MVP 導線に限定し、PR-02〜04 で確定した期待値へ揃える。
5. build / type-check / Jest / `supabase:types` を最終ゲートとして再配置する。
6. 検証結果を DoD report として残す。

## 7. 受け入れ条件

- PR-05 の説明が「何をリファクタしたか」ではなく「何を再現可能にしたか」で書ける
- 対象フローに必要な DoD が埋まる
- PR-01〜04 で更新された前提条件と runbook / E2E の期待値が矛盾しない
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
- `mvp-release-readiness-2026-03-06.md` の古い「未完了」記述をそのまま前提にすると、完了済み PR-01〜04 の成果を取りこぼす
- DOD-08 / DOD-09 は PR-02 完了後の権限マトリクスを前提に再検証しないと、旧期待値で誤判定する
- DOD-06 / DOD-07 は PR-04 後のナビ期待値と `admin-settings.spec.ts` の現契約を前提にしないと、非MVP導線由来の失敗が混ざる

## 10. 完了証跡

- Playwright 実行結果
- `npm run build`
- `npm run type-check`
- `npm run supabase:types`
- Jest 実行結果
- `docs/test-runbook.md`
- DoD verification report

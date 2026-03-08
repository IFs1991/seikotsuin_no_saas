# CI/CD Stabilization Implementation Plan v0.1

## Overview

- Parent spec: `docs/stabilization/spec-ci-cd-stabilization-v0.1.md`
- Objective: CI/CD の安定化を小さな PR で段階実装し、DoD 準拠の運用へ移行する。
- Rule: 1 task = 1 PR
- Status: Draft

## Execution Policy

- 機能追加は行わず、開発基盤の安定化に限定する。
- migration 変更は扱わない（必要時は別 spec を起票）。
- 各タスクは「対象ファイル」「設定名」「検証コマンド」を PR 説明に明記する。

## Work Breakdown (1 Task = 1 PR)

### CI-01: Build Gate 追加

- Purpose: DOD-10 を CI 上で強制する。
- Scope:
  - `.github/workflows/ci.yml`
- Changes:
  - `npm run build` 専用 job（例: `build`）を追加。
  - `actions/upload-artifact` で build ログを保持。
- Validation:
  - `npm run build`
- DoD link:
  - DOD-10
- Acceptance:
  - PR/`main` push の両方で build job が実行される。
  - build 失敗時に merge できない状態になる。

### CI-02: Playwright を CI 正式ゲート化

- Purpose: DOD-06 の実行担保。
- Scope:
  - `.github/workflows/ci.yml`
  - `playwright.config.ts`（必要最小限）
  - `package.json`（必要最小限）
- Changes:
  - 現行 `test-e2e`（Jest E2E）とは別に `test-e2e-playwright` job を追加。
  - `npm run test:e2e:pw -- --project=chromium` を実行。
  - CI 用 `PLAYWRIGHT_BASE_URL` を固定値で明示。
- Validation:
  - `npm run test:e2e:pw -- --project=chromium`
- DoD link:
  - DOD-06
- Acceptance:
  - Playwright job 成功時のみ E2E gate が green になる。
  - baseURL と webServer の不整合時に明確な失敗ログが出る。

### CI-03: Supabase/E2E Preflight Gate 追加

- Purpose: DOD-01/DOD-05 の前提崩れを早期検知。
- Scope:
  - `.github/workflows/ci.yml`
  - `scripts/e2e/*.mjs`（必要時）
- Changes:
  - Playwright 実行前に `npm run e2e:validate-fixtures` を必須化。
  - 必要に応じて seed/cleanup の検証レーンを nightly へ分離。
- Validation:
  - `npm run e2e:validate-fixtures`
  - `npm run e2e:seed`
  - `npm run e2e:cleanup`
- DoD link:
  - DOD-01, DOD-05
- Acceptance:
  - preflight 失敗時は Playwright 実行前に fail-fast する。
  - fixture 不整合時の失敗理由が Summary に表示される。

### CI-04: Required Checks と Branch Protection 整備

- Purpose: CI green 以外の merge を防止する。
- Scope:
  - GitHub repository settings（コード外設定）
  - `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`
- Changes:
  - `main` に required status checks を設定。
  - レビュー必須・up-to-date 必須を設定。
  - 設定内容を runbook/チェックリストへ反映。
- Validation:
  - 保護ブランチで failing check 時に merge 不可を確認。
- DoD link:
  - DOD-10（品質ゲートの実効性）
- Acceptance:
  - 必須チェック未通過 PR は merge 不可。
  - 設定一覧がドキュメントに残る。

### CD-01: Staging 自動デプロイ運用の固定化

- Purpose: CD の手順依存を排除し、preview 検証を標準化する。
- Scope:
  - Vercel project settings（コード外設定）
  - `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`
- Changes:
  - PR 単位で staging/preview 反映される運用を固定。
  - 確認項目（health/auth/tenant boundary）を必須化。
- Validation:
  - PR ごとに preview URL が生成されることを確認。
- DoD link:
  - DOD-06, DOD-08, DOD-09（運用上の継続確認）
- Acceptance:
  - preview なしでレビュー進行しない運用になる。
  - 確認結果を evidence に記録できる。

### CD-02: Production リリースゲートと Rollback 確立

- Purpose: 本番反映の誤投入と復旧遅延を防ぐ。
- Scope:
  - GitHub environment protection（コード外設定）
  - Vercel production deploy settings（コード外設定）
  - `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`
- Changes:
  - production は承認者を必須化。
  - rollback 手順を「誰が」「何分以内に」「どこへ戻すか」で定義。
- Validation:
  - 本番前に承認ステップが発生することを確認。
  - rollback drill を 1 回実施して記録。
- DoD link:
  - DOD-10（build/test green 前提運用）
- Acceptance:
  - 承認なしで production 反映できない。
  - rollback drill の証跡が残る。

### DOC-01: CI/CD 証跡テンプレートの追加

- Purpose: 「実施済み」の判断を記録ベースに統一する。
- Scope:
  - `docs/operations/` 配下（新規 evidence テンプレート）
- Changes:
  - 日付付き evidence テンプレート（実行コマンド、結果、commit SHA、担当者）を追加。
- Validation:
  - テンプレートに 1 回分の実データを記入して保存。
- DoD link:
  - DOD-01, DOD-05, DOD-06, DOD-10, DOD-11（証跡管理）
- Acceptance:
  - CI/CD 変更 PR ごとに evidence が 1 つ以上添付される。

## Recommended Order

1. CI-01
2. CI-02
3. CI-03
4. CI-04
5. CD-01
6. CD-02
7. DOC-01

## Verification Suite (Per Milestone)

```bash
npm run lint
npm run type-check
npm run build
npm run test -- --ci --testPathIgnorePatterns=e2e
npm test -- --ci --testPathPattern="security|session-management"
npm run e2e:validate-fixtures
npm run test:e2e:pw -- --project=chromium
```

## Approval Required Commands (Operational)

- `supabase db reset --local`
- `supabase db push --local`
- `supabase migration up`

## Evidence Format (PR Template Snippet)

- Task ID:
- Changed files:
- Updated settings/functions:
- Commands run:
- Result summary:
- DoD items covered:
- Rollback method:

## Exit Criteria

- `main` への PR で CI 必須ゲートがすべて green。
- Playwright gate が継続的に実行される。
- staging/production の反映ルートと承認ルールが文書化され、運用実績が 1 回以上ある。
- rollback drill の証跡が存在する。


# CI/CD Stabilization Spec v0.1

## Overview

- Purpose: CI/CD を「再現性のある品質ゲート」として再設計し、`main` へのマージと本番反映を安定化する。
- DoD: DOD-01, DOD-05, DOD-06, DOD-10, DOD-11（`docs/stabilization/DoD-v0.1.md`）。
- Priority: High
- Status: Draft
- One task = one PR
- Migration policy: 本仕様では migration 変更を扱わない（別 spec + rollback plan 必須）。

## Scope

### In scope

- GitHub Actions CI の必須ゲート定義（lint/type-check/build/test/security/e2e）。
- Playwright を CI の正式ゲートに昇格するための要件定義。
- CD の承認・反映・ロールバック手順の標準化（Vercel 前提）。
- 証跡（evidence）フォーマットと運用ドキュメントの整備。

### Out of scope

- アプリ機能追加、UI/UX 変更。
- Supabase migration 変更。
- 監視基盤の新規導入（Datadog 等）。
- 本仕様単体でのリポジトリ設定変更（GitHub Branch protection, Vercel project settings は実施時タスクで対応）。

## Current State Evidence

- CI workflow は存在する。  
  - Path: `.github/workflows/ci.yml`  
  - Settings/Jobs: `on.push`, `on.pull_request`, `quality`, `test-unit-integration`, `test-security`, `test-e2e`
- `quality` は lint/type-check/secrets scan を実行。  
  - Path: `.github/workflows/ci.yml`  
  - Commands: `npm run lint`, `npm run type-check`, `npm run scan:secrets`
- build ゲートが未定義。  
  - Path: `.github/workflows/ci.yml`  
  - Missing setting: `npm run build` を実行する job がない（DOD-10 非整合）
- E2E job は Playwright ではなく Jest E2E を実行。  
  - Path: `.github/workflows/ci.yml`  
  - Setting: `test-e2e` job command = `npm run test:e2e -- --ci`
- スクリプト上は Playwright が利用可能。  
  - Path: `package.json`  
  - Scripts: `test:e2e:pw`, `test:e2e:pw:install`, `e2e:validate-fixtures`, `e2e:seed`, `e2e:cleanup`
- Playwright の baseURL/webServer の設計は既に存在。  
  - Path: `playwright.config.ts`  
  - Settings: `use.baseURL`, `webServer.command`, `webServer.url`, `webServer.reuseExistingServer`, `webServer.timeout`
- CD は運用チェックリスト中心で、workflow による deploy 定義は未確認。  
  - Path: `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`  
  - Sections: `3. Staging Deploy (Vercel)`, `5. Production Deploy (Vercel)`
- Vercel 設定ファイルは build/install/header などの実行設定のみ。  
  - Path: `vercel.json`  
  - Settings: `buildCommand`, `installCommand`, `framework`, `functions`, `headers`

## Target State

### CI (Required Gates)

- Gate 1: Quality
  - `npm run lint`
  - `npm run type-check`
  - `npm run scan:secrets`
- Gate 2: Build
  - `npm run build`
- Gate 3: Unit/Integration
  - `npm run test -- --ci --testPathIgnorePatterns=e2e`
- Gate 4: Security
  - `npm test -- --ci --testPathPattern="security|session-management"`
- Gate 5: E2E (Playwright smoke)
  - `npm run e2e:validate-fixtures`
  - `npm run test:e2e:pw -- --project=chromium`（CI 向け最小シナリオ）

### CD (Release Gates)

- Staging: PR 更新ごとに Preview を自動更新し、疎通確認を必須化。
- Production: `main` 反映時に自動デプロイ、ただし以下が満たされること。
  - Required CI checks がすべて green
  - 必要レビュー数を満たす
  - 手動承認（Environment protection）を通過
- Rollback: 直前の安定デプロイへ即時復旧できる Runbook を明文化。

## Requirements

### CI-REQ

- CI-REQ-01: `pull_request`（target=`main`）と `push`（branch=`main`）で同一品質ゲートを実行する。
- CI-REQ-02: Node version は固定（現行 `20`）し、`npm ci` を使用する。
- CI-REQ-03: DOD-10 を満たすため `npm run build` を必須 job とする。
- CI-REQ-04: DOD-06 を満たすため Playwright を CI 正式ゲートに含める。
- CI-REQ-05: DOD-01/DOD-05 の preflight 失敗時は fail-fast で終了する。
- CI-REQ-06: すべての job は Summary/Artifact を残し、再現性確認が可能であること。

### CD-REQ

- CD-REQ-01: Staging/Production の反映経路を単一化（Vercel を source of truth に統一）。
- CD-REQ-02: Production 反映は CI 緑化と承認ゲート通過を前提とする。
- CD-REQ-03: デプロイ失敗時は Runbook に基づく rollback を 15 分以内で開始できること。
- CD-REQ-04: デプロイ証跡（日時、commit SHA、実行者、確認結果）を記録する。

### Governance-REQ

- GOV-REQ-01: 1 task = 1 PR を維持する。
- GOV-REQ-02: Supabase 破壊的/状態変更コマンドは事前承認ルールに従う。
- GOV-REQ-03: 設定変更は必ず対象 path + setting/function 名で記録する。

## DoD Mapping

- DOD-01: CI の E2E 前段で Supabase readiness を確認。
- DOD-05: fixture validate/seed/cleanup の idempotency 検証を定期ジョブまたは release gate で実施。
- DOD-06: Playwright baseURL/webServer 整合を CI で継続検証。
- DOD-10: `npm run build` を必須化。
- DOD-11: Jest Windows 互換は別枠検証を維持し、回帰を監視。

## Non-Functional Requirements

- Deterministic: 同一 commit で同一結果を再現できる。
- Observability: 各 job の失敗要因を Summary と Artifact で追跡可能。
- Security: 秘密情報の直接参照を禁止し、既存 lint ルールを順守。
- Lead time: CI 全体の目安は 20 分以内（並列実行前提）。

## Risks and Mitigations

- Risk: Playwright が環境依存で不安定。  
  - Mitigation: CI 用 smoke シナリオを明示し、長時間シナリオは nightly 分離。
- Risk: Supabase 依存で CI が flaky。  
  - Mitigation: preflight 失敗を即時可視化し、失敗分類を Summary に出力。
- Risk: CD が手動手順依存で属人化。  
  - Mitigation: Environment protection + チェックリスト + 証跡テンプレートを固定化。

## Rollback Policy

- CI 変更: workflow 変更 PR を revert して直前安定版へ戻す。
- CD 変更: Vercel の直前安定デプロイへ promote/restore を実施。
- ドキュメント変更: 当該 spec を revert（実行系影響なし）。

## Verification Commands (Spec Baseline)

```bash
npm run lint
npm run type-check
npm run build
npm run test -- --ci --testPathIgnorePatterns=e2e
npm test -- --ci --testPathPattern="security|session-management"
npm run e2e:validate-fixtures
npm run test:e2e:pw -- --project=chromium
```

## Approval Required Commands (Operational Reminder)

- `supabase db reset --local`
- `supabase db push --local`
- `supabase migration up`

## File References

- `.github/workflows/ci.yml`
- `package.json`
- `playwright.config.ts`
- `vercel.json`
- `docs/stabilization/DoD-v0.1.md`
- `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`


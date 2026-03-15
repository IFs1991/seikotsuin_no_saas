# CI/CD Minimum MVP Plan 2026-03-15

## Purpose

- PR-05 完了直後の repo 状態を前提に、MVP として運用可能な最小 CI/CD を定義する。
- 対象は `src` / `supabase` / `.github/workflows` / deploy runbook の整合確認であり、機能追加や migration 変更は行わない。
- DoD 対応範囲は `docs/stabilization/DoD-v0.1.md` の `DOD-01`, `DOD-05`, `DOD-10`, `DOD-11`, `DOD-12` を主対象とし、`DOD-06`, `DOD-07` は既知ブロッカーとして分離する。

## Why A New Minimum Plan

- 既存の [plan-ci-cd-stabilization-v0.1.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/plan-ci-cd-stabilization-v0.1.md) は最終到達像としては妥当だが、現時点では Playwright 正式ゲート化まで含んでおり広すぎる。
- PR-05 の再検証結果では、`build`, `type-check`, `supabase:types`, fixture preflight, focused Jest は再現済みである一方、Playwright は Windows で `spawn EPERM` により未完了である。
- したがって、MVP 向けには「現在通る検証を required に載せる」「Playwright は optional / follow-up に落とす」という切り方が必要。

## Current State Snapshot

### CI Before Implementation (2026-03-15 時点の起点)

- Path: [.github/workflows/ci.yml](/C:/Users/seekf/Desktop/seikotsuin_management_saas/.github/workflows/ci.yml)
- Jobs (実装前):
  - `quality`
  - `test-unit-integration`
  - `test-security`
  - `test-e2e`

### Gaps That Were Addressed

- `quality` job に `npm run build` がない。
  - Missing setting: `DOD-10` 用 build gate → **CI-MVP-01 で解消**
- `test-e2e` job が Playwright ではなく Jest E2E を実行している。
  - Current command: `npm run test:e2e -- --ci` → **`fixture-preflight` に置換**
- repo-wide Jest 全量は重く、PR-05 では focused suite に絞っている。
  - Evidence: `focused PR-05 suite | PARTIAL PASS | 9 suites / 94 tests pass` → **`focused-regression` として固定**
- Playwright は repo 設定以前に Windows 環境で `spawn EPERM` により失敗する。
  - Setting/function names: `use.baseURL`, `webServer.command`, `globalSetup` → **required gate から除外、コメント明記**
- Supabase fixture 系スクリプトは CI へ載せられる状態。
  - Function names: `validateE2EFixtures`, `seedE2EData`, `cleanupE2EData` → **`E2E_SKIP_DB_CHECK=1` で静的チェックのみ CI に載せた**
- `supabase:types` は生成後整形まで含めて build 再現性が確保されている。
  - Evidence path: [docs/stabilization/DoD-verification-report-2026-03-15.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/DoD-verification-report-2026-03-15.md) → **header validation のみ実装（live 再生成は follow-up）**

### CI After Implementation (現在の状態)

- Path: [.github/workflows/ci.yml](/C:/Users/seekf/Desktop/seikotsuin_management_saas/.github/workflows/ci.yml)
- Required jobs (全て `needs: [quality]` でシリアル実行):
  - `quality` → lint / type-check / scan:secrets
  - `build` → `npm run build`（`NEXT_PUBLIC_*` はプレースホルダーまたは repository secrets）
  - `supabase-contract` → `src/types/supabase.ts` ヘッダー検証
  - `fixture-preflight` → `E2E_SKIP_DB_CHECK=1` で静的 UUID/email チェック
  - `focused-regression` → `npm run test:pr05:focused`（9 suites）
- Informational jobs:
  - `test-security` → `continue-on-error: true`（必須 merge gate 外）
- Deferred:
  - Playwright → `spawn EPERM` blocked（DOD-06/DOD-07）

## Source Inspection Notes

### `src`

- Focused regression candidates are already clear.
  - Paths:
    - [src/__tests__/api/admin-settings.test.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/api/admin-settings.test.ts)
    - [src/__tests__/api/admin-tenants-access.test.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/api/admin-tenants-access.test.ts)
    - [src/__tests__/api/multi-store-kpi.test.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/api/multi-store-kpi.test.ts)
    - [src/__tests__/auth/middleware-auth.test.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/auth/middleware-auth.test.ts)
    - [src/__tests__/components/admin-settings.test.tsx](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/components/admin-settings.test.tsx)
    - [src/__tests__/components/admin-settings-navigation.test.tsx](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/components/admin-settings-navigation.test.tsx)
    - [src/__tests__/components/navigation/admin-navigation.test.tsx](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/components/navigation/admin-navigation.test.tsx)
    - [src/__tests__/lib/api-helpers-auth.test.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/lib/api-helpers-auth.test.ts)
    - [src/__tests__/lib/reservation-service.test.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/lib/reservation-service.test.ts)
- `npm test` は `scripts/run-jest.mjs` 経由で Windows では `--runInBand` を自動注入する。
  - Path: [scripts/run-jest.mjs](/C:/Users/seekf/Desktop/seikotsuin_management_saas/scripts/run-jest.mjs)
  - Function name: `injectRunInBand`
- したがって CI の Linux runner とローカル Windows で実行特性が一致しない。MVP CI では full Jest を required にするより focused regression を先に固定する方が安全。

### `supabase`

- Local stack の公開面は `supabase/config.toml` に定義されており、`api.schemas`, `db.seed.sql_paths`, `auth.hook.custom_access_token` が tenant/RLS 検証の前提になる。
  - Path: [supabase/config.toml](/C:/Users/seekf/Desktop/seikotsuin_management_saas/supabase/config.toml)
  - Setting names: `api.schemas`, `db.seed.sql_paths`, `auth.hook.custom_access_token.uri`
- Baseline migration 1 本構成と seed 前提の運用は PR-05 と整合している。
  - Path: [supabase/migrations/00000000000001_squashed_baseline.sql](/C:/Users/seekf/Desktop/seikotsuin_management_saas/supabase/migrations/00000000000001_squashed_baseline.sql)
  - Path: [supabase/seed.sql](/C:/Users/seekf/Desktop/seikotsuin_management_saas/supabase/seed.sql)
- `supabase db query --local` は手元 CLI では未対応だったため、CI minimum plan では DB drift gate を含めない。必要なら follow-up で CLI version 標準化を先に行う。

## Minimum Target State

### Required CI Checks For MVP

1. `quality`
   - `npm run lint`
   - `npm run type-check`
   - `npm run scan:secrets`

2. `build`
   - `npm run build`

3. `supabase-contract`
   - ~~`npm run supabase:types`~~ → Supabase local stack なしの CI では不可。follow-up タスクへ。
   - generated header validation（`src/types/supabase.ts` 先頭行が `export type Json =` であることを確認）
   - optional: `git diff --exit-code -- src/types/supabase.ts` to detect unstaged drift in CI job only（未実装）

4. `fixture-preflight`
   - `npm run e2e:validate-fixtures`（`E2E_SKIP_DB_CHECK=1` で静的チェックのみ）

5. `focused-regression`
   - PR-05 対象 9 suites のみ（`npm run test:pr05:focused`）

### Non-Required / Deferred Checks

- Playwright smoke
  - Deferred reason: `DOD-06`, `DOD-07` blocked by Windows `spawn EPERM`
- repo-wide Jest full run
  - Deferred reason: runtime cost is high and PR-05 already adopted focused verification
- seed / cleanup destructive cycle in PR-required lane
  - Deferred reason: local approval policy and CI environment bootstrap cost
  - Can move to scheduled/nightly after Supabase runner strategy is fixed
- `supabase:types` live regeneration in CI
  - Deferred reason: Supabase local stack の CI runner 戦略が未確定
- branch protection / environment protection
  - Required operationally, but should be documented after CI job names are finalized

## Work Breakdown — 実装状況

### CI-MVP-01: Align CI jobs with passing local evidence — **DONE**

- Scope:
  - [.github/workflows/ci.yml](/C:/Users/seekf/Desktop/seikotsuin_management_saas/.github/workflows/ci.yml)
- 実装内容:
  - `build` job 追加（`npm run build`、`NEXT_PUBLIC_*` プレースホルダー対応）
  - `test-e2e` を `fixture-preflight` に置換（`E2E_SKIP_DB_CHECK=1`）
  - `quality` 維持
  - `test-unit-integration` を `focused-regression` に置換
  - `test-security` を `continue-on-error: true` で残存（informational）
  - 全 downstream jobs に `needs: [quality]` 追加（レビュー指摘対応）
- DoD link:
  - `DOD-05`, `DOD-10`, `DOD-11`, `DOD-12`

### CI-MVP-02: Make focused Jest deterministic in CI — **DONE**

- Scope:
  - [package.json](/C:/Users/seekf/Desktop/seikotsuin_management_saas/package.json)
- 実装内容:
  - `test:pr05:focused` スクリプト追加（line 23）
  - `node scripts/run-jest.mjs --ci --runTestsByPath` + 9 ファイルの明示的列挙
  - `run-jest.mjs` 経由のためローカル Windows では `--runInBand` 自動注入
- DoD link:
  - `DOD-11`

### CI-MVP-03: Add Supabase type generation gate — **DONE (partial)**

- Scope:
  - [.github/workflows/ci.yml](/C:/Users/seekf/Desktop/seikotsuin_management_saas/.github/workflows/ci.yml)
- 実装内容:
  - `supabase-contract` job で `src/types/supabase.ts` の先頭行を node インラインスクリプトで検証
  - `npm run supabase:types` の live 実行は **未実装**（Supabase local stack が CI で起動できないため）
  - `git diff --exit-code` drift check も **未実装**（plan で optional 扱い）
- DoD link:
  - `DOD-12`, indirectly `DOD-10`

### CD-MVP-01: Document one deploy path only — **DONE**

- Scope:
  - [docs/operations/deployment-checklist-supabase-vercel-v0.1.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/operations/deployment-checklist-supabase-vercel-v0.1.md)
- 実装内容:
  - Section 1 を Required / Optional に分割
  - 必須 CI job 名（`quality` · `build` · `supabase-contract` · `fixture-preflight` · `focused-regression`）を明記
  - Playwright を `BLOCKED: spawn EPERM on Windows (DOD-06/DOD-07)` として注記

## Implemented Command Set

```bash
# quality
npm run lint
npm run type-check
npm run scan:secrets

# build（NEXT_PUBLIC_* は secrets || placeholder）
npm run build

# supabase-contract（header のみ。live 再生成は follow-up）
node -e "const fs=require('fs');const c=fs.readFileSync('src/types/supabase.ts','utf8');const l=c.split('\n')[0].trim();if(l!=='export type Json ='){console.error(l);process.exit(1)}"

# fixture-preflight（static check のみ）
E2E_SKIP_DB_CHECK=1 npm run e2e:validate-fixtures

# focused-regression
npm run test:pr05:focused
```

## Explicitly Deferred Commands

```bash
npm run test:e2e:pw -- --project=chromium
npm run test -- --ci --testPathIgnorePatterns=e2e
npm run e2e:seed
npm run e2e:cleanup
npm run supabase:types   # CI での live 実行は Supabase runner 戦略確定後
```

Deferred means "not a required MVP merge gate now", not "unused forever".

## Acceptance Criteria — 達成状況

| 基準 | 状態 |
|------|------|
| `.github/workflows/ci.yml` に `build` gate がある | **DONE** |
| CI required checks が「今通る検証」に一致している | **DONE** |
| Playwright が required check から外れているか、少なくとも blocked / optional と明記されている | **DONE** |
| `supabase:types` 実行後に build を壊す経路が CI で検出できる | **PARTIAL** — header validation のみ。live 再生成は follow-up |
| deploy checklist が CI job 名と一致している | **DONE** |

## Risks

- `e2e:validate-fixtures` は service-role 環境変数に依存する
  - Mitigation: `E2E_SKIP_DB_CHECK=1` で静的チェックのみにしてリスク回避済み。DB 接続チェック有効化は secrets 戦略確定後。
- focused regression に絞ることで repo-wide の未検知回帰は残る
  - Mitigation: full Jest は nightly または follow-up PR に回す
- Playwright を外すことで UI browser regression の検知は弱くなる
  - Mitigation: PR-05 evidence と known issue を残し、後続タスクで復帰させる
- `supabase:types` live 再生成が CI で動かないため型 drift を検知できない
  - Mitigation: header check が corruption を検知。drift 検知は `supabase:types` CI 化の follow-up タスクで対処。

## Out Of Scope

- migration の追加・修正
- GitHub branch protection の実設定作業
- Vercel environment protection の実設定作業
- Playwright `spawn EPERM` の根治
- repo-wide test suite の全件安定化
- `supabase:types` live 再生成の CI 化（Supabase runner 戦略確定後に別タスクで実施）

## Self Review

### Review Result

- PASS: このプランは repo の現在値と矛盾していない
- PASS: DoD 参照が `DOD-01`, `DOD-05`, `DOD-10`, `DOD-11`, `DOD-12` に明示的に結びついている
- PASS: `src` / `supabase` / workflow / deploy docs の現物に基づいている
- PASS: 既知ブロッカーである Playwright を required gate に入れていない

### Review Findings (プラン策定時)

- Finding 1:
  - Current [docs/stabilization/spec-ci-cd-stabilization-v0.1.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/spec-ci-cd-stabilization-v0.1.md) は Playwright 正式ゲート化を前提にしているため、MVP minimum plan とは粒度が違う
  - Handling: 本 md は spec の置換ではなく、2026-03-15 時点の運用縮約版として扱う
- Finding 2:
  - `fixture-preflight` を CI に載せるには secrets 注入方法を別途決める必要がある
  - Handling: `E2E_SKIP_DB_CHECK=1` で静的チェックのみに限定し secrets 依存を回避した
- Finding 3:
  - `focused-regression` は PR-05 向けに妥当だが、将来 PR 範囲が広がると coverage 不足になる
  - Handling: job 名・script 名に `pr05` の限定性を残し、後で一般化する

### Implementation Review Findings (実装レビュー時)

- Finding R-1 (HIGH → 修正済み):
  - `focused-regression` job に `--coverage` なしで `upload-artifact path: coverage/` が存在し、毎回 "no files found" 警告が出るだけの dead code だった
  - Fix: upload-artifact ステップを削除
- Finding R-2 (MEDIUM → 修正済み):
  - `build` / `supabase-contract` / `fixture-preflight` / `focused-regression` に `needs: [quality]` がなく、全ジョブが並列起動していた。`quality` 失敗時でも無駄に CI 分を消費する。
  - Fix: 4 ジョブ全てに `needs: [quality]` を追加

### Implementation Deviations

- `supabase-contract` は `npm run supabase:types` を実行しない（Supabase local stack 不要の header check のみ）
  - 理由: CI runner に Supabase CLI + local stack の起動戦略が未確定
  - 影響: 型 drift の検知は制限付き。格上げは follow-up タスク。
- `git diff --exit-code -- src/types/supabase.ts` は未実装
  - 理由: plan で optional と明記されていたため

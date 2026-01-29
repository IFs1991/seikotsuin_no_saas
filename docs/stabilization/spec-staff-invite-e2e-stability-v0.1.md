# スタッフ招待E2E安定化 仕様書 v0.1

## Overview
- Purpose: TD-001（E2Eで招待送信がハング）を解消し、Playwrightのスタッフ招待テストを安定化する。
- DoD: DOD-06（主）、DOD-01/05/08/09（副）- docs/stabilization/DoD-v0.1.md
- One task = one PR
- Priority: High
- Status: ✅ Completed (2026-01-21)
- Risk: 誤ったE2E環境設定で本番相当の挙動が隠れる可能性

## Related Specs / Docs
- `docs/technical-debt.md` (TD-001)
- `docs/stabilization/spec-admin-settings-contract-v0.1.md` (data-testid契約/管理設定E2E基準)
- `docs/stabilization/admin-settings-contract-e2e-followup-v0.1.md` (待機条件/タイムアウト方針)
- `docs/stabilization/admin-settings-staff-invite-todo.md` (スタッフ招待の実装経緯)
- `docs/stabilization/spec-e2e-preflight-fixtures-v0.1.md` (Supabase readiness)
- `docs/stabilization/spec-playwright-baseurl-windows-v0.1.md` (baseURL/port整合)
- `docs/stabilization/spec-auth-role-alignment-v0.1.md` (ロール正規化)
- `docs/stabilization/spec-rls-tenant-boundary-dod08-v0.1.md` (RLS境界)

## Evidence (Current Behavior)
- `src/app/api/admin/staff/invites/route.ts` (`POST`)
  - `createAdminClient().auth.admin.inviteUserByEmail` 呼び出しにタイムアウトがなく、E2Eでレスポンスが返らずハングする可能性。
- `src/lib/api-helpers.ts` (`processApiRequest`)
  - `ensureClinicAccess` がSupabase疎通不良時に待ち続ける可能性（タイムアウトなし）。
- `src/components/admin/staff-management-settings.tsx` (`handleInviteStaff`)
  - `fetch('/api/admin/staff/invites')` を await し続けるため、APIハング時に `isLoading` が解除されない。
- `src/__tests__/e2e-playwright/admin-settings.spec.ts` (`test.describe('Staff invites')`)
  - 成功/エラー表示を待つが、APIが返らずタイムアウト。
- `supabase/config.toml` (`auth.site_url`, `inbucket.enabled`)
  - ローカル環境は inbucket 前提だが、E2E環境の `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SUPABASE_URL` が一致しないと招待送信が不安定になる。

## Scope
### In-scope
- `/api/admin/staff/invites` の応答安定化（ハング回避、E2E限定の決定的挙動）
- E2E実行時の環境・前提条件の明確化（ドキュメント/設定）

### Out-of-scope
- マイグレーション変更（`supabase/migrations/*`）
- `src/app/api/onboarding/invites/route.ts` の契約変更
- UIの新機能追加（招待フロー拡張）

## Plan (1 task = 1 PR)

### Task SI-01: E2E環境の前提を明文化
- **Scope**: `docs/test-runbook.md`, `.env.test.example`
- **Change**:
  - E2E用の必須/推奨環境変数を明記する（例: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLAYWRIGHT_BASE_URL`）。
  - 招待E2E安定化用フラグを追記する（例: `E2E_INVITE_MODE=skip`）。
  - `supabase/config.toml` の `auth.site_url` と E2E環境変数の整合条件を追記する。
- **DoD**: DOD-01, DOD-06
- **Acceptance**:
  - E2E実行時にローカルSupabase + inbucket前提が明確である。
  - `.env.test.example` に必要変数が記載されている。
- **Rollback**: ドキュメントの追記を戻すのみ（挙動変更なし）。

### Task SI-02: 招待APIのタイムアウトガード
- **Scope**: `src/app/api/admin/staff/invites/route.ts` (`POST`)
- **Change**:
  - `inviteUserByEmail` を `Promise.race` でラップし、一定時間（例: 10-15s）で 504 を返す。
  - `logError` に `endpoint: '/api/admin/staff/invites'` と `params: { email, role, clinicId }` を残す。
- **DoD**: DOD-06
- **Acceptance**:
  - 招待APIがハングせず、失敗時はエラー応答が返る。
  - E2Eで `送信中...` が解除される。
- **Rollback**: タイムアウトラッパーを除去する。

### Task SI-03: E2E専用の招待スキップ（決定的成功）
- **Scope**: `src/app/api/admin/staff/invites/route.ts` (`POST`), `.env.test.example`, `docs/test-runbook.md`
- **Change**:
  - `process.env.E2E_INVITE_MODE === 'skip'` かつ `process.env.NODE_ENV !== 'production'` の場合は
    `inviteUserByEmail` をスキップし、`staff_invites` への INSERT を優先して成功応答を返す。
  - APIレスポンスの形は `spec-admin-settings-contract-v0.1.md` と一致させ、追加フィールドは入れない。
- **DoD**: DOD-06, DOD-09
- **Acceptance**:
  - `admin-settings.spec.ts` の「スタッフを招待して一覧に表示される」が安定して通る。
  - `staff_invites` のINSERTが成功し、UI一覧に「招待中」が表示される。
- **Rollback**: E2Eフラグ分岐を削除し、常に `inviteUserByEmail` を実行する。

### Task SI-04: 安定性検証（再現性）
- **Scope**: `src/__tests__/e2e-playwright/admin-settings.spec.ts`（変更なし）
- **Change**: なし（検証のみ）
- **DoD**: DOD-06
- **Acceptance**:
  - `npm run test:e2e:pw -- --grep "Staff invites"` が3回連続でパスする。
- **Rollback**: なし。

## Verification
```bash
# Staff invites だけを検証
npm run test:e2e:pw -- --grep "Staff invites"
```

Expected:
- 「招待メールを送信しました」が表示される
- 一覧に対象メールが追加される
- 3回連続で成功（DOD-06）

## Rollback Summary
- SI-02: `inviteUserByEmail` のタイムアウトラッパー削除
- SI-03: `E2E_INVITE_MODE` 分岐削除
- SI-01: ドキュメント追記の取り消し


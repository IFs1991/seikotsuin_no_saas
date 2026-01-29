# スタッフ招待機能 (管理設定) 未実装タスク

**作成日**: 2025-01-21  
**状態**: 🚧 未実装（UIのみ完成）  
**親仕様**: `docs/stabilization/spec-admin-settings-contract-v0.1.md`  
**関連**: `docs/stabilization/admin-settings-contract-e2e-followup-v0.1.md`  
**DoD紐づけ**: DOD-06 / DOD-08 / DOD-09 (`docs/stabilization/DoD-v0.1.md`)

## 目的

管理設定画面（`/admin/settings`）のスタッフ招待UIを、既存のオンボーディング招待実装と整合させつつ、
Supabase/RLS/Playwrightの安定化基準（DoD）に沿ってAPIへ接続する。

## 参照（仕様/実装）

### 仕様書
- `docs/stabilization/spec-admin-settings-contract-v0.1.md`（管理設定のUI/API契約）
- `docs/管理設定永続化_MVP仕様書.md`（「既存のadmin/usersとonboarding/invitesのAPI契約は変更しない」）
- `docs/stabilization/spec-auth-role-alignment-v0.1.md`（ロール定義の統一）
- `docs/stabilization/spec-rls-tenant-boundary-dod08-v0.1.md`（RLSのDOD-08）

### 既存実装（関連ファイル）
- UI: `src/components/admin/staff-management-settings.tsx`（関数: `handleInviteStaff`, `handleSave`）
- Onboarding招待API: `src/app/api/onboarding/invites/route.ts`（関数: `POST`）
- Onboarding招待UI: `src/components/onboarding/InvitesStep.tsx`
- 招待スキーマ: `src/app/api/onboarding/schema.ts`（定数: `ROLE_VALUES`, `staffInviteSchema`）
- ロール型: `src/types/onboarding.ts`（型: `StaffRole`, 定数: `ROLE_LABELS`）
- E2E: `src/__tests__/e2e-playwright/admin-settings.spec.ts`（`test.describe('Staff invites')`）
- DB: `supabase/migrations/20251225000100_onboarding_tables.sql`（テーブル: `staff_invites`）
- DB: `supabase/migrations/20260110000300_fix_rls_clinic_manager_roles.sql`
  （制約: `staff_invites_role_check`, ポリシー: `staff_invites_clinic_admin_select`）

## 現状（観測点）

- `src/components/admin/staff-management-settings.tsx` の `handleInviteStaff` が
  ローカルステートに追加するだけでAPI呼び出しなし。
- 同ファイルの `handleSave` は `setTimeout` で疑似保存のみ。
- 同ファイルのロール定義が `receptionist` を含み、`StaffRole` と不一致。
  (`src/types/onboarding.ts` の `StaffRole` / `ROLE_LABELS` は `staff` を使用)
- `src/app/api/onboarding/invites/route.ts` は `onboarding_states` から
  `clinic_id` を取得するため、管理設定画面からそのまま再利用できない。
- `staff_invites` は `clinic_id + email` のユニーク制約があり
  (`supabase/migrations/20251225000100_onboarding_tables.sql`),
  役割は `staff_invites_role_check` の範囲に制限される
  (`supabase/migrations/20260110000300_fix_rls_clinic_manager_roles.sql`)。
- E2Eは `src/__tests__/e2e-playwright/admin-settings.spec.ts` の
  `test.skip('Invite UI is not wired to API yet')` が残ったまま。

## ギャップ / 影響

- UIロールの不一致でAPIバリデーション・DB制約に弾かれる可能性。
- 招待/一覧が永続化されず、E2Eで再現性が担保できない（DOD-06）。
- クライアント直アクセス回避（DOD-09）やRLS境界（DOD-08）を
  満たすためのAPI経路が不足。

## 方針（Stabilization）

- **オンボーディングAPIの契約は変更しない**
  （`docs/管理設定永続化_MVP仕様書.md` の方針に従う）。
- **既存テーブル `staff_invites` を使用し、新規マイグレーションは行わない。**
- **サーバー側で clinic_id を解決し、クライアント入力に依存しない。**

## 実装タスク

### 1) 仕様決定（先に合意が必要）
- **招待可能ロール**: `StaffRole` を基準にするか
  （`src/types/onboarding.ts` の `StaffRole` / `ROLE_LABELS`）。
- **招待一覧の表示ソース**: `staff_invites` と `user_permissions` の
  統合要否（`staff_invites` は `accepted_at` / `expires_at` が状態判断の材料）。

### 2) Backend（API）
- **新規API**（推奨）: `POST /api/admin/staff/invites`
  - `processApiRequest` など既存のガードを使用し
    `CLINIC_ADMIN_ROLES` を許可（`src/lib/constants/roles.ts`）。
  - `staffInviteSchema` を再利用しロール値を統一
    (`src/app/api/onboarding/schema.ts` の `staffInviteSchema`)。
  - `createAdminClient().auth.admin.inviteUserByEmail` で招待送信
    (`src/app/api/onboarding/invites/route.ts` の `POST` を参考)。
  - `staff_invites` に `clinic_id`, `email`, `role`, `created_by` を保存。
    ユニーク制約違反は 409 で返す（`staff_invites_role_check` と整合）。
  - 監査ログ: `AuditLogger.logAdminAction` で記録。
- **招待一覧API**（必要なら）
  - `GET /api/admin/staff/invites` で `staff_invites` を参照し
    `pending/expired/accepted` を `accepted_at` / `expires_at` から算出。

### 3) Frontend（UI）
- `src/components/admin/staff-management-settings.tsx`
  - ロール一覧を `StaffRole` に合わせて再定義
    （`receptionist` → `staff` など）。
  - `handleInviteStaff` を新規APIに接続し、
    成功時は API レスポンスで一覧を更新。
  - 招待一覧は API 取得結果で描画（モックデータ削除）。
  - E2E安定化のため、主要ボタン/入力に `data-testid` を付与
    （`spec-admin-settings-contract-v0.1.md` の方式に合わせる）。

### 4) E2E（DOD-06）
- `src/__tests__/e2e-playwright/admin-settings.spec.ts`
  - `test.skip` を外し、`data-testid` を用いた安定セレクタへ置換。
  - `設定を読み込み中...` が消えるまで待つ既存パターンに合わせる。

## 変更対象ファイル（スコープ固定）

- `src/components/admin/staff-management-settings.tsx`
- `src/app/api/admin/staff/invites/route.ts`（新規作成）
- `src/__tests__/e2e-playwright/admin-settings.spec.ts`

## 範囲外 / Non-goals

- 既存のオンボーディングAPI契約の変更
  (`src/app/api/onboarding/invites/route.ts`, `src/app/api/onboarding/schema.ts`)
- マイグレーション変更・新規マイグレーションの追加
  (`supabase/migrations/*`)
- 他の管理設定画面・他画面のUI変更

## 完了条件 (Definition of Done)

- [ ] `POST /api/admin/staff/invites` が動作し、`staff_invites` に保存される
  （`staff_invites_role_check` と一致）。
- [ ] 管理設定UIが API 経由で招待を送信し、一覧が永続化される。
- [ ] `admin-settings.spec.ts` のスタッフ招待テストが安定して通る（DOD-06）。
- [ ] 役割定義が `StaffRole` / `ROLE_VALUES` と一致し、RLS/制約に抵触しない
  （DOD-08）。
- [ ] クライアントが直接Supabaseテーブルへアクセスしない（DOD-09）。

## 参考リンク

- Supabase Auth Invite: https://supabase.com/docs/reference/javascript/auth-admin-inviteuser
- ロール仕様: `docs/stabilization/spec-auth-role-alignment-v0.1.md`

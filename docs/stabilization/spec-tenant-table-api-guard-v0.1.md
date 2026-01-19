# Tenant Table API Guard Spec v0.1

## Overview
- Purpose: Remove direct client Supabase access and enforce server-side guards for tenant tables.
- DoD: DOD-09 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: **Critical**
- Risk: **Tenant isolation violation - direct DB access bypasses server-side authorization**

## Evidence (Current Behavior)

### Guarded API routes (server-side)
- `src/lib/api-helpers.ts`: `processApiRequest()` calls `ensureClinicAccess()` for role + clinic scope enforcement.
- `src/app/api/blocks/route.ts`: `GET/POST/DELETE` use `processApiRequest()` and enforce `clinic_id` via `permissions.clinic_id` + `isHQRole()`.
- `src/app/api/reservations/route.ts`: `GET/POST/PATCH/DELETE` use `processApiRequest({ clinicId, requireClinicMatch: true })`; GET uses `reservation_list_view`.
- `src/app/api/menus/route.ts`: `GET/POST/PATCH/DELETE` use `processApiRequest({ clinicId, requireClinicMatch: true })`.
- `src/app/api/resources/route.ts`: `GET/POST/PATCH/DELETE` use `processApiRequest({ clinicId, requireClinicMatch: true })`.
- `src/app/api/customers/route.ts`: `GET/POST/PATCH` use `processApiRequest({ clinicId, requireClinicMatch: true })`.

### Direct Supabase access outside API routes (remaining)
- `src/lib/services/reservation-service.ts`: `ReservationService` is `server-only`, requires `clinicId` in the constructor, and applies `.eq('clinic_id', ...)` to tenant queries. Direct access remains but is clinic-scoped; current usage is test-only (`src/__tests__/lib/reservation-service.test.ts`).
- `src/lib/services/block-service.ts`: `BlockService` is `server-only`, requires `clinicId` in the constructor, and applies `.eq('clinic_id', ...)` to tenant queries. Direct access remains but is clinic-scoped.

### Public customer endpoints (service role)
- `src/app/api/public/menus/route.ts`: `createAdminClient()` + explicit `clinic_id` validation.
- `src/app/api/public/reservations/route.ts`: `createAdminClient()` + explicit `clinic_id` validation.

### Admin management endpoints (service role)
- `src/app/api/admin/tenants/route.ts`: `createAdminClient()` で `clinics` を取得/作成（`processApiRequest` の `allowedRoles: ['admin']` で認可）。
- `src/app/api/admin/users/route.ts`: `createAdminClient()` で `user_permissions`/`profiles` を参照/更新（`processApiRequest` の `allowedRoles: ['admin']` で認可）。

### Security Risk Analysis
1. **Server-only services remain direct access**: `ReservationService` and `BlockService` are `server-only` and clinic-scoped, but must not be imported into client paths.
2. **Guard entry point consistency**: direct Supabase access bypasses `processApiRequest()`; acceptable only when `clinic_id` is enforced in queries.
3. **Service-role public APIs rely on explicit clinic_id validation**: must keep strict validation to avoid cross-tenant access (`src/app/api/public/*`).

## Tenant Tables Requiring API Guards

| Table | Current Access | Status | Notes |
|-------|----------------|--------|-------|
| blocks | `/api/blocks` (processApiRequest) + `BlockService` server-only | 完了 | API guardあり。BlockServiceは `server-only` + `clinic_id` スコープ固定。 |
| reservations | `/api/reservations` (processApiRequest) + `ReservationService` server-only | 完了 | ReservationServiceは `server-only` + `clinic_id` スコープ固定（現状テスト専用）。 |
| customers | `/api/customers` (processApiRequest) | 完了 | `requireClinicMatch: true` でガード済み。 |
| menus | `/api/menus` (processApiRequest) + `/api/public/menus` (service role) | 完了 | publicはRLS外、`clinic_id`検証あり。 |
| resources | `/api/resources` (processApiRequest) + `/api/public/reservations`参照 | 完了 | publicはRLS外、`clinic_id`検証あり。 |

## Implementation Status
- [x] `processApiRequest()` → `ensureClinicAccess()` のガード導線を確立 (`src/lib/api-helpers.ts`, `src/lib/supabase/guards.ts`)。
- [x] `/api/blocks` を `processApiRequest()` + `clinic_id` 強制で保護 (`src/app/api/blocks/route.ts` の `GET/POST/DELETE`)。
- [x] `/api/reservations` を `processApiRequest({ clinicId, requireClinicMatch: true })` で保護 (`src/app/api/reservations/route.ts`)。
- [x] `/api/menus` `/api/resources` `/api/customers` を `processApiRequest({ clinicId, requireClinicMatch: true })` で保護。
- [x] `ReservationService` を `server-only` + `clinic_id` スコープ固定へ移行 (`src/lib/services/reservation-service.ts: ReservationService`)。
- [x] `BlockService` を `server-only` + `clinic_id` スコープ固定へ移行 (`src/lib/services/block-service.ts: BlockService`)。
- [x] DOD-08: 管理系APIは service role で `clinics` / `user_permissions` を操作（`src/app/api/admin/tenants/route.ts`, `src/app/api/admin/users/route.ts`）。

## Migration Strategy

### Phase 1: API routes (完了)
1. `/api/blocks` 実装
2. `/api/reservations` 既存ガードを維持
3. `/api/menus` `/api/resources` `/api/customers` 既存ガードを維持

### Phase 2: Client update (完了)
1. `ReservationService`/`BlockService` を `server-only` + `clinic_id` スコープ固定へ移行
2. UIから利用する場合は `/api/*` を経由する方針を維持
3. サービス層から `createClient()` を排除

### Phase 3: Remove direct access (完了: server-only 例外)
1. non-APIコードの直接アクセスは `server-only` + `clinic_id` スコープ固定のみ許容
2. テストは `server-only` のクライアント注入で運用
3. `rg` で残存アクセスを監査し、例外は明記

## Non-goals
- UI feature changes.
- RLS policy updates (handled in spec-rls-tenant-boundary-v0.1.md).

## Acceptance Criteria (DoD)
- [x] DOD-09: 非APIコードの直接アクセスは `server-only` + `clinic_id` スコープ固定のみ許容。
- [x] 全テナントテーブルAPIが `processApiRequest()` または `ensureClinicAccess()` を必ず通過。
- [x] `clinic_id` は必須・権限チェック済み（`requireClinicMatch: true` または `/api/blocks` の明示チェック）。
- [x] 公開APIは `clinic_id` 事前検証を維持（service role前提）。
- [x] UPDATE/DELETE は `clinic_id` で明示的にスコープされている（RLS依存のみは不可）。

## Follow-ups (実装追記)
- [x] DOD-09: 更新/削除クエリに `clinic_id` フィルタを追加。（2026-01-14 実装完了）
  - [x] `src/app/api/reservations/route.ts`: `PATCH` の `.update()` と `DELETE` の `.delete()` に `.eq('clinic_id', clinicId)` を追加。
  - [x] `src/app/api/menus/route.ts`: `PATCH` の `.update()` と `DELETE` の `.update({ is_deleted: true })` に `.eq('clinic_id', clinic_id)` を追加。
  - [x] `src/app/api/resources/route.ts`: `PATCH` の `.update()` と `DELETE` の `.update({ is_deleted: true })` に `.eq('clinic_id', clinic_id)` を追加。
  - [x] `src/app/api/customers/route.ts`: `PATCH` の `.update()` に `.eq('clinic_id', clinic_id)` を追加。
- [x] APIエラーのステータス保持とDELETEの存在チェックを追加。（2026-01-16 実装完了）
  - [x] `src/lib/error-handler.ts`: `getStatusCodeFromErrorCode()` と `isApiError()` を追加。
  - [x] `src/app/api/reservations/route.ts`: `PATCH/DELETE` の `ApiError` をステータス反映 + `DELETE` の0件時に404返却。
  - [x] `src/app/api/menus/route.ts`: `PATCH/DELETE` の `ApiError` をステータス反映 + `DELETE` の0件時に404返却。
  - [x] `src/app/api/resources/route.ts`: `PATCH/DELETE` の `ApiError` をステータス反映 + `DELETE` の0件時に404返却。
  - [x] `src/app/api/customers/route.ts`: `PATCH` の `ApiError` をステータス反映。

## Follow-ups (追加修正2)
- [x] DOD-08: `clinics` / `user_permissions` のRLSポリシーを `can_access_clinic()` に統一する新規マイグレーションを追加。（2026-01-16 実装完了）
  - 対策: 既存の `get_current_user_clinic_id()` 依存をやめ、`public.can_access_clinic(...)` を `USING` / `WITH CHECK` に適用。
  - 指針: `src/api/database/rls-policies.sql` の `admin_clinics_all` / `clinic_manager_clinics_own` / `staff_clinics_own_read`、および `admin_user_permissions_all` / `clinic_manager_user_permissions_own_clinic` / `user_permissions_own` を `can_access_clinic()` 基準に更新し、変更は `supabase/migrations` に集約する。
  - 実装: `supabase/migrations/20260116000100_rls_clinics_user_permissions_can_access_clinic.sql`
- [x] DOD-08: 子テナント作成の経路を明確化（選択肢B: オンボーディング限定を明記）。（2026-01-16 実装完了）
  - 決定: **選択肢B採用** - 親子テナント（parent_id付き）作成はオンボーディング経路のみ。
  - 対策: `src/app/api/admin/tenants/route.ts` は既存フラットテナント管理用とし、`parent_id` 非対応を明記。
  - 経路整理:
    - `POST /api/onboarding/clinic`: 親子テナント作成対応（`create_clinic_with_admin` RPC + `parent_id`サポート）
    - `POST /api/admin/tenants`: フラットテナント管理用（`parent_id`非対応、既存運用向け）
  - 指針: 新規クリニック（子テナント）作成は `/api/onboarding/clinic` を使用すること。
- [x] DOD-08: E2Eで `clinic_scope_ids` 未設定時は失敗扱いにする。（2026-01-16 実装完了）
  - 対策: フォールバックの `console.warn` ではなく `expect` で明示的に失敗させる。
  - 指針: `src/__tests__/e2e-playwright/cross-clinic-isolation.spec.ts` の `clinic_scope_ids` 未設定分岐を失敗条件に変更し、親スコープ前提のE2Eを保証する。

## Rollback
- UI/予約フローに影響が出た場合は、直前のAPIルート変更を戻す。
- `ReservationService` を戻す場合は `clinic_id` フィルタを必須化し、リスクをドキュメント化。
- 直アクセス復活時は、RLSと`ensureClinicAccess()`の整合性を再確認する。

## Verification

```bash
# 非API + 非テストの直接アクセス検出
rg -n "createClient\\(|from\\('(reservations|blocks|customers|menus|resources)'\\)" src --glob '!**/api/**' --glob '!**/__tests__/**'

# 期待: server-only な BlockService/ReservationService がヒット（clinic_id スコープ固定を確認）。
```

## Files to Modify
- src/lib/services/reservation-service.ts (ReservationService: direct client access)
- src/lib/services/block-service.ts (BlockService: server-only direct access)
- src/__tests__/lib/reservation-service.test.ts (ReservationService refactorに合わせて修正)

## Security Checklist

| Check | Status |
|-------|--------|
| All tenant table access goes through API routes | 完了（server-only + clinic_id スコープ固定を例外として許容） |
| All API routes use ensureClinicAccess() | 完了（processApiRequest経由） |
| clinic_id is required in all requests | 完了（API + server-only で必須） |
| clinic_id is validated against user's permissions | 完了（ensureClinicAccess + canAccessClinicScope） |
| Double-check clinic ownership in UPDATE/DELETE | 完了（clinic_id フィルタ追加） |
| Audit logging for sensitive operations | 進行中（ensureClinicAccessで失敗時ログ） |
| No createClient() in non-API code | 完了（サービス層から排除） |

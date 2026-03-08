# Plan PR-02: HQ / Tenant Access Alignment v0.1

## 1. 目的

HQ ユーザーと clinic ユーザーの閲覧・更新権限を明文化し、`middleware.ts` と API guard の判定を 1 系統で説明できる状態にする。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 3 に対応する。

## 2. 現状

- `src/lib/supabase/server.ts` `getUserPermissions`, `canAccessClinicScope` は実装済み
- `src/lib/supabase/guards.ts` `ensureClinicAccess` は parent-scope モデルに寄せている
- ただし `middleware.ts` は `user_permissions` 優先 + `profiles` fallback の二系統
- `src/app/api/admin/tenants/route.ts` と `src/app/api/admin/tenants/[clinic_id]/route.ts` は `allowedRoles: ['admin']` + `requireClinicMatch: false`
- `/multi-store` と `/api/admin/tenants` の対象ロールがコードから一意に読み取れない

## 3. 対象

- `middleware.ts`
- `src/lib/supabase/guards.ts` `ensureClinicAccess`
- `src/lib/api-helpers.ts` `processApiRequest`, `verifyAdminAuth`
- `src/lib/supabase/server.ts` `getUserPermissions`, `canAccessClinicScope`
- `src/app/admin/(protected)/layout.tsx`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/multi-store/page.tsx`

## 4. 先に固定する仕様

以下を先に確定する。未確定のまま実装を始めない。

1. HQ は全店舗閲覧か、`clinic_scope_ids` 内のみか
2. HQ は更新可能か、閲覧のみか
3. `/multi-store` は HQ 専用か、clinic_admin にも見せるか
4. `/api/admin/tenants` は一覧のみ HQ で、更新は別権限にするか
5. `/api/chat` の cross-clinic 利用を許可するか

## 5. 実装方針

- source of truth は `user_permissions` を主とする
- `profiles` は `is_active` 等の補助属性に限定する
- route ごとの例外を増やさず、`ensureClinicAccess` に寄せる
- `requireClinicMatch: false` を使う API は明示的な許可理由を残す
- service role を使う API は、返却データを scope 内集約値に限定する

## 6. 実行手順

1. 対象 API / 画面を「cross-clinic 許可」と「single-clinic 限定」に分類する。
2. `middleware.ts` の認可責務を最小化する。
   - 認証
   - is_active 確認
   - Admin UI / Clinic UI の大分類
3. `ensureClinicAccess` に、閲覧可否と更新可否の判定ルールを集約する。
4. `processApiRequest` 経由で cross-clinic API の入口を統一する。
5. `/multi-store`, `/api/admin/tenants`, `/api/chat` の仕様を文書化する。
6. 既存テストを権限マトリクスに合わせて更新する。

## 7. 権限マトリクス案

### HQ系

- `admin`
  - `/multi-store`: 可
  - `/api/admin/tenants` GET: 可
  - `/api/admin/tenants/[clinic_id]` PATCH: 要仕様確定
  - 他院データ閲覧: `clinic_scope_ids` ベース

### clinic系

- `clinic_admin`
- `manager`
- `therapist`
- `staff`

各ロールの cross-clinic 可否は、別紙 spec に固定する。

## 8. 受け入れ条件

- HQ と clinic の可否条件が `ensureClinicAccess` を中心に説明できる
- `middleware.ts` と `layout.tsx` が独自ロジックを持ちすぎない
- `requireClinicMatch: false` の API 一覧と理由が残る
- `/multi-store` と `/api/admin/tenants` の対象者が文書化される
- cross-clinic E2E テストの期待値が仕様と一致する

## 9. DoD

- `docs/stabilization/DoD-v0.1.md` `DOD-08`
- `docs/stabilization/DoD-v0.1.md` `DOD-09`

## 10. リスク

- 仕様未確定のまま着手すると、`middleware.ts` と API の両方を再修正することになる
- `profiles` fallback を完全撤去できない場合、source-of-truth の説明が曖昧に残る
- `createAdminClient()` 利用 API は、scope 漏れがあると一気に高リスク化する

## 11. 完了証跡

- 権限マトリクス文書
- `middleware.ts`
- `src/lib/supabase/guards.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
- cross-clinic 関連テスト結果

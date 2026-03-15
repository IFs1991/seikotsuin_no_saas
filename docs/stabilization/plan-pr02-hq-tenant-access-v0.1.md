# Plan PR-02: HQ / Tenant Access Alignment v0.2

Status: Complete (2026-03-10)

## 1. 目的

HQ ユーザーと clinic ユーザーの閲覧・更新権限を、`user_permissions` + `clinic_scope_ids` を前提に揃え、`middleware.ts` / `layout.tsx` / API guard / tenant 管理 API を 1 系統で説明できる状態にする。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 3 に対応する。

## 2. 2026-03-09 着手時点の現状

- `src/lib/supabase/server.ts` `getUserPermissions`, `canAccessClinicScope` は実装済み
  - `clinic_scope_ids` があればそれを優先し、無ければ `clinic_id` にフォールバックする
- `src/lib/supabase/guards.ts` `ensureClinicAccess` は admin 全件バイパスを持たず、parent-scope チェックに寄っている
- `src/lib/api-helpers.ts` `processApiRequest`, `verifyAdminAuth` は `ensureClinicAccess` を経由している
- `src/app/admin/(protected)/layout.tsx` は `getUserPermissions` を優先し、`profiles` 依存は `is_active` のみ
- ただし `middleware.ts` は `user_permissions` 優先 + `profiles` fallback の二系統をまだ持つ
- `middleware.ts` の保護対象に `/multi-store` が入っておらず、UI ルート認可と API 認可が分離している
- `src/app/api/admin/tenants/route.ts`
  - `GET` / `POST`: `allowedRoles: ['admin']` + `requireClinicMatch: false`
  - `createAdminClient()` を使うため RLS をバイパスする
  - 現状は `clinic_scope_ids` による明示スコープ制限が入っていない
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
  - `PATCH`: `allowedRoles: ['admin']` + `requireClinicMatch: false`
  - 現状は user client で更新しており、tenant 管理 API の read/write モデルが GET/POST と一致していない
- `src/app/api/chat/route.ts`
  - `GET`: `clinic_id` 必須、`requireClinicMatch: true`
  - `POST`: `clinic_id` があれば `requireClinicMatch: true`
  - 現状は cross-clinic chat を許可していない
- `src/app/multi-store/page.tsx`
  - 画面自体にはロール判定がない
  - 実データ取得は `/api/admin/tenants?include_kpi=true` に依存するため、実質 API 側の認可頼み

## 3. 確定する仕様

未確定項目のうち、既存 spec / role 定数 / RLS 方針から確定できる範囲を先に固定する。

1. HQ の横断閲覧範囲は「全店舗」ではなく `clinic_scope_ids` 内のみ
   - フォールバック時のみ `clinic_id` 単体で扱う
   - 参照: `src/lib/supabase/server.ts` `canAccessClinicScope`
   - 参照: `docs/stabilization/spec-rls-tenant-boundary-v0.1.md`
2. HQ (`admin`) は tenant 管理 API の閲覧/作成/更新を持てるが、scope 外 clinic には作用させない
   - `/api/admin/tenants` は既存フラット tenant 管理用のまま
   - parent-child tenant 作成は引き続き `/api/onboarding/clinic` 側で扱う
3. `/multi-store` は HQ 専用 (`admin`) とする
   - `clinic_admin` は `/admin/**` に入れても、cross-clinic KPI 画面には入れない
4. `/api/admin/tenants` と `/api/admin/tenants/[clinic_id]` は admin 専用のまま維持する
   - ただし service role 利用時は、返却対象と更新対象を `clinic_scope_ids` / `clinic_id` で必ず絞る
5. `/api/chat` は single-clinic 前提とし、cross-clinic 利用を許可しない
   - `clinic_id` つき chat は `ensureClinicAccess` で clinic scope 一致が必須
   - `clinic_id = null` の admin session は本 PR では非対応のまま据え置く

## 4. 対象

- `middleware.ts`
- `src/lib/supabase/guards.ts` `ensureClinicAccess`
- `src/lib/api-helpers.ts` `processApiRequest`, `verifyAdminAuth`
- `src/lib/supabase/server.ts` `getUserPermissions`, `canAccessClinicScope`
- `src/app/admin/(protected)/layout.tsx`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/multi-store/page.tsx`
- `src/__tests__/auth/middleware-auth.test.ts`
- `src/__tests__/api/multi-store-kpi.test.ts`
- 必要なら tenant/HQ 関連の追加テスト

## 5. 実装方針

- source of truth は `user_permissions.role`, `user_permissions.clinic_id`, JWT の `clinic_scope_ids`
- `profiles` 依存は `is_active` のみ
- UI ルート判定は薄く保ち、権限の意味付けは role 定数 + `canAccessClinicScope` に寄せる
- `requireClinicMatch: false` を使う API は、RLS をバイパスするなら必ず明示スコープ制限を追加する
- tenant 管理 API は read/write ともに同じ scope ルールで説明できるようにする
- `/multi-store` は「API が 403 を返すから大丈夫」ではなく、ルート段階でも閉じる

## 6. TDD 実行順

1. まず失敗テストを追加する
   - `/multi-store` が未認証/非HQを通してしまうこと
   - `/api/admin/tenants` が scope 外 clinic を返してしまうこと
   - `/api/admin/tenants/[clinic_id]` が scope ルールを明示していないこと
2. `middleware.ts` を修正し、`/multi-store` を保護対象かつ HQ 専用にする
3. tenant 管理 API に scope 制約を追加する
   - `GET`: `permissions.clinic_scope_ids` または `permissions.clinic_id` で対象 clinic を制限
   - `PATCH`: target `clinic_id` が scope 内であることを確認してから更新
4. `processApiRequest` / `ensureClinicAccess` の責務境界を再確認する
   - single-clinic API は `clinicId + requireClinicMatch`
   - cross-clinic API は `requireClinicMatch: false` でも scope リストで fail-closed
5. 対象テストを実行して期待値を固定する

## 7. 権限マトリクス

### HQ

- `admin`
  - `/admin/**`: 可
  - `/multi-store`: 可
  - `/api/admin/tenants` GET/POST: 可、ただし scope 内のみ
  - `/api/admin/tenants/[clinic_id]` PATCH: 可、ただし scope 内のみ
  - `/api/chat` cross-clinic: 不可

### Clinic

- `clinic_admin`
  - `/admin/**`: 可
  - `/multi-store`: 不可
  - `/api/admin/tenants*`: 不可
- `manager`
  - `/admin/**`: 不可
  - `/multi-store`: 不可
  - `/api/admin/tenants*`: 不可
- `therapist`
  - `/admin/**`: 不可
  - `/multi-store`: 不可
  - `/api/admin/tenants*`: 不可
- `staff`
  - `/admin/**`: 不可
  - `/multi-store`: 不可
  - `/api/admin/tenants*`: 不可

## 8. 受け入れ条件

- HQ と clinic の可否条件が `role constants` + `canAccessClinicScope` を中心に説明できる
- `middleware.ts` と `layout.tsx` が route ごとの独自認可を増やさない
- `/multi-store` はルート段階で HQ 専用になる
- `requireClinicMatch: false` の tenant 管理 API でも scope 漏れがない
- `/api/admin/tenants` と `/api/admin/tenants/[clinic_id]` の対象 clinic が仕様どおりに絞られる
- cross-clinic 関連テストの期待値が仕様と一致する

## 9. DoD

- `docs/stabilization/DoD-v0.1.md` `DOD-08`
- `docs/stabilization/DoD-v0.1.md` `DOD-09`

## 10. リスク

- `middleware.ts` は Edge 側で `getUserPermissions` の既存 server helper をそのまま使えないため、責務の寄せ方を誤ると二重実装になる
- `createAdminClient()` を使う API は、scope 漏れがあると即 cross-tenant 漏洩になる
- `clinic_scope_ids` 未設定時のフォールバックを広げると、DOD-08 の説明が再び曖昧になる

## 11. 完了証跡

- 更新済み権限マトリクス文書
- `middleware.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
- 必要に応じて `src/lib/supabase/guards.ts` / `src/lib/api-helpers.ts`
- 関連ユニットテスト結果

2026-03-10 実績:

- `middleware.ts`
  - `/multi-store` を保護対象に追加
  - `/multi-store` を HQ (`admin`) 専用に制限
- `src/app/api/admin/tenants/route.ts`
  - `allowedRoles` を `HQ_ROLES` に統一
  - `clinic_scope_ids` / `clinic_id` ベースの scope 制約を追加
  - scope 欠落時は 403 fail-closed に変更
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
  - `allowedRoles` を `HQ_ROLES` に統一
  - `canAccessClinicScope()` による target clinic の scope 検証を追加
  - 更新処理を `createAdminClient()` 側に統一
- `src/lib/api-helpers.ts`
  - `verifyAdminAuth()` の期待値をテストで固定
- テスト結果
  - `src/__tests__/auth/middleware-auth.test.ts`: pass
  - `src/__tests__/api/admin-tenants-access.test.ts`: pass
  - `src/__tests__/api/multi-store-kpi.test.ts`: pass
  - `src/__tests__/api/chat-api.test.ts`: pass
  - `src/__tests__/lib/api-helpers-auth.test.ts`: pass
  - 合計: 5 suites / 47 tests passed

## 12. 完了判定

PR-02 は完了とする。

完了理由:

- HQ と clinic の可否条件を `role constants` + `canAccessClinicScope()` を中心に説明できる状態に揃えた
- `/multi-store` を HQ 専用ルートとして middleware で閉じた
- `requireClinicMatch: false` の tenant 管理 API に scope 制約を追加し、cross-tenant 漏れを fail-closed にした
- `/api/chat` は single-clinic 方針のまま既存仕様と整合していることを確認した
- 関連ユニットテストを更新し、権限マトリクスと期待値を固定した

PR-02 完了後に別管理で残す項目:

- `middleware.ts` の `profiles` fallback を将来どこまで縮小するかの整理
- `/admin/**` 全域で `HQ_ROLES` と `ADMIN_UI_ROLES` の使い分けをさらに統一する追加リファクタ

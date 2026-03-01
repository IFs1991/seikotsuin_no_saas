# RLS 修正仕様書: メニュー公開ポリシー & スタッフ希望 INSERT 制御（改訂）

**作成日**: 2026-02-28  
**バージョン**: v0.2  
**前版**: `spec-rls-menus-staff-preferences-hardening-v0.1.md`  
**対象マイグレーション**: `20260218000200`（menus）, `20260218000400`（staff_preferences）  
**優先度**: Medium

---

## 1. v0.1 からの修正点

- Issue 2 の方針矛盾を解消  
  - `therapist/staff` は「API経由で許可」ではなく「POSTを403で拒否」に統一。
- Issue 1 の前提を現実装に合わせて更新  
  - `/api/public/menus` は既に実装済み（新規実装タスクから除外）。
- 再発防止観点を追加  
  - `menus_select_public` は過去に削除済みだったが、`20260218000200` で再導入されたため「回帰修正」として扱う。
- DoD 連携を明記  
  - `docs/stabilization/DoD-v0.1.md` の `DOD-08`, `DOD-09`, `DOD-11` と紐づけ。

---

## 2. 現状確認（コード・DB）

### Issue 1: `menus_select_public` がテナント境界なし

- 現在の有効ポリシー再導入箇所  
  - `supabase/migrations/20260218000200_rls_reservation_tables_tenant_boundary.sql`
  - `CREATE POLICY "menus_select_public"`（`is_active = true AND is_deleted = false` のみ）
- 既存の公開API  
  - `src/app/api/public/menus/route.ts` は `createAdminClient()`（service_role）で実装済み。
  - 同APIは `clinic_id` を必須バリデーションし、クエリでも `eq('clinic_id', clinic_id)` を適用。

### Issue 2: `staff_preferences_insert_policy` が therapist/staff を許可

- 現在のINSERTポリシー  
  - `supabase/migrations/20260218000400_rls_shift_tables_role_alignment.sql`
  - `staff_preferences_insert_policy` に `('admin', 'clinic_admin', 'manager', 'therapist', 'staff')` が含まれる。
- API POST 実装  
  - `src/app/api/staff/preferences/route.ts` の POST は `ensureClinicAccess(... requireClinicMatch: true)` のみで、ロール制限がない。

### 補足（構造制約）

- `staff_preferences.staff_id` は `resources.id` 参照であり、`auth.users.id` ではない。  
  - 定義: `supabase/migrations/20251231000101_staff_shifts_preferences.sql`
- `resources` には `user_id` カラムがないため、RLSだけで `auth.uid() = staff_id` を直接検証できない。

---

## 3. 決定事項（v0.2）

## 3.1 Issue 1: `menus_select_public` を廃止（回帰修正）

- `menus_select_public` を削除する。
- 認証ユーザー向けに `menus_select_for_staff` を作成し、`can_access_clinic(clinic_id)` でテナント境界を強制する。
- 公開導線は既存の `/api/public/menus`（service_role）を継続利用する。
- 「新規で公開メニューAPIを作る」は本仕様から削除（既に存在するため）。
- 可視性ルールを固定する（回帰防止）:
  - `admin/clinic_admin/manager`: 既存 `menus_select_for_managers` で全状態参照可（現行維持）
  - `therapist/staff`: `is_active = true AND is_deleted = false` のみ参照可

### SQL（Issue 1）

```sql
BEGIN;

DROP POLICY IF EXISTS "menus_select_public" ON public.menus;
DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;

CREATE POLICY "menus_select_for_staff"
ON public.menus FOR SELECT
TO authenticated
USING (
  public.get_current_role() IN ('therapist', 'staff')
  AND public.can_access_clinic(clinic_id)
  AND is_active = true
  AND is_deleted = false
);

COMMENT ON POLICY "menus_select_for_staff" ON public.menus IS
'therapist/staff は自テナントの公開中メニューのみ参照可。manager 以上は既存 menus_select_for_managers を使用。公開導線は /api/public/menus (service_role)。';

COMMIT;
```

## 3.2 Issue 2: `staff_preferences` INSERT を manager 以上に限定

- RLS INSERT 許可を `('admin', 'clinic_admin', 'manager')` のみに縮小。
- API `POST /api/staff/preferences` は `therapist/staff` を 403 で明示拒否。
- 本フェーズでは self-service 登録は実装しない（`resources.user_id` 導入まで延期）。

### SQL（Issue 2）

```sql
BEGIN;

DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;

CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
TO authenticated
WITH CHECK (
  public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
  AND public.can_access_clinic(clinic_id)
);

COMMENT ON POLICY "staff_preferences_insert_policy" ON public.staff_preferences IS
'希望シフトの直接INSERTは admin/clinic_admin/manager のみ許可。therapist/staff は本フェーズでは403。';

COMMIT;
```

### API変更（Issue 2）

対象: `src/app/api/staff/preferences/route.ts`（POST）

- `ensureClinicAccess` で `permissions.role` を取得。
- `normalizeRole` 適用後、`admin/clinic_admin/manager` 以外は 403 を返却。
- 403メッセージは UI ガイダンス可能な文面にする。

例:

```ts
if (!['admin', 'clinic_admin', 'manager'].includes(normalizedRole)) {
  return createErrorResponse(
    '希望登録は管理者経由で依頼してください',
    403
  );
}
```

---

## 4. テスト方針（TDD）

## 4.1 APIテスト（`/api/staff/preferences`）

- `therapist` POST -> `403`
- `staff` POST -> `403`
- `manager` POST -> `201`
- `clinic_admin` POST -> `201`

## 4.2 RLSテスト（直接DB）

- `therapist` JWT で `staff_preferences` INSERT -> DENY
- `manager` JWT で `staff_preferences` INSERT -> ALLOW
- `anon` で `menus` 直接 SELECT -> **HTTP 200 かつ 0件**（期待値固定）
- `staff` JWT で `menus` 自テナント SELECT -> ALLOW
- `staff` JWT で `menus` 他テナント SELECT -> **0件**（期待値固定）
- `staff` JWT で `menus` 自テナント `is_active=false` 行 SELECT -> **0件**（期待値固定）
- `manager` JWT で `menus` 自テナント `is_active=false` 行 SELECT -> **取得可能**（既存動作維持）

## 4.3 公開API回帰テスト

- 匿名で `GET /api/public/menus?clinic_id=<valid_uuid>` -> `200` + 対象クリニックのみ返却
- `clinic_id` 形式不正 -> `400`（期待値固定）
- 存在しない `clinic_id`（UUID形式は正しい） -> `404`（期待値固定）
- 非アクティブ clinic -> `403`（期待値固定）

---

## 5. 受け入れ条件（DoD 紐づけ）

### DOD-08（RLS source-of-truth）

- `menus` と `staff_preferences` の relevant policy が `can_access_clinic(...)` を含む。
- `menus_select_public` が存在しない。

### DOD-09（client path guard）

- `src` 内に `anon` での `menus` 直接参照がない。
- 公開導線は `/api/public/menus`、認証導線は `/api/menus` を使用。
- 公開導線テストは Supabase 直接参照ではなく、HTTP で `/api/public/menus` を実呼び出しする。

### DOD-11（Jest回帰）

- APIテスト追加後、`npm run test -- --ci --testPathIgnorePatterns=e2e` が成功。

---

## 6. ロールバック

## 6.1 Issue 1

```sql
BEGIN;

CREATE POLICY "menus_select_public"
ON public.menus FOR SELECT
USING (is_active = true AND is_deleted = false);

DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;

COMMIT;
```

## 6.2 Issue 2

```sql
BEGIN;

DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;

CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
WITH CHECK (
  public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
  AND public.can_access_clinic(clinic_id)
);

COMMIT;
```

APIロールバック: `src/app/api/staff/preferences/route.ts` の POST に追加した 403 ロール制限を削除。

---

## 7. 変更対象ファイル

- `supabase/migrations/2026XXXX_rls_menus_public_remove_add_staff_select.sql`
- `supabase/migrations/2026XXXX_rls_staff_preferences_insert_guard.sql`
- `src/app/api/staff/preferences/route.ts`
- `src/__tests__/api/staff-preferences.test.ts`（新規想定）
- `src/__tests__/e2e-playwright/public-menus-api.spec.ts`（新規、HTTP実呼び出し）
- `src/__tests__/e2e-playwright/cross-clinic-isolation.spec.ts`（既存の「public api - menus」ケースを上記新規specへ整理）

---

## 8. 非対象（このPRではやらない）

- `resources.user_id` 追加と self-service 希望登録
- 予約UIの新規機能追加
- 既存マイグレーションの書き換え（新規マイグレーションで対応）

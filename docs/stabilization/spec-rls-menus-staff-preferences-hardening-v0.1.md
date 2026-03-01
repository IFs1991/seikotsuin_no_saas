# RLS 修正仕様書: メニュー公開ポリシー & スタッフ希望テナント分離

**作成日**: 2026-02-27
**バージョン**: v0.1
**対象マイグレーション**: `20260218000200`（Phase 2）、`20260218000400`（Phase 4）
**優先度**: Medium（即時被害リスクは低いが設計意図と乖離）

---

## 背景・問題の所在

セキュリティレビューにより、以下の2点がRLSの設計意図と実装が乖離していると判明した。

| # | テーブル | ポリシー | 問題カテゴリ |
|---|---|---|---|
| 1 | `menus` | `menus_select_public` | テナント境界なし（全クリニックのメニューが匿名参照可能） |
| 2 | `staff_preferences` | `staff_preferences_insert_policy` | 同一クリニック内のスタッフが他スタッフ名義で希望を登録できる |

---

## Issue 1: `menus_select_public` のテナント境界欠如

### 現状

```sql
CREATE POLICY "menus_select_public"
ON public.menus FOR SELECT
USING (
    is_active = true AND is_deleted = false
    -- clinic_id 条件なし！
);
```

### 問題

匿名ユーザー（Supabase の `anon` キー使用）が直接APIを叩いた場合、全クリニックの有効メニューが取得できる。

```js
// anon キーで直接アクセス → 全クリニックのメニューが返る
const { data } = await supabase.from('menus').select('*')
```

現在はアプリ側の `clinic_id` フィルタで絞っているが、これは「防衛線がアプリのみ」という状態であり、RLSの本来の目的（アプリが壊れても守る）に反する。

### `can_access_clinic()` を単純追加できない理由

`can_access_clinic()` はJWTクレームを参照するため、匿名ユーザー（JWTなし）の場合は `FALSE` を返す。そのまま追加すると**予約ページ（未ログイン顧客がメニューを閲覧するユースケース）が壊れる**。

```sql
-- NG: 匿名ユーザーが予約ページでメニューを見れなくなる
USING (
    is_active = true AND is_deleted = false
    AND public.can_access_clinic(clinic_id)  -- 匿名は FALSE → 予約ページが壊れる
);
```

### 修正方針

**方針A（推奨）: Server API Gatewayパターンへの移行**

予約系・顧客系と同様に、匿名ユーザーのメニュー参照も `service_role` 経由のServer APIに集約する。

1. `menus_select_public` ポリシーを削除（または `authenticated` 限定に変更）
2. 予約ページ向けの公開メニュー取得APIエンドポイントを `service_role` 経由で実装
3. 直接DBアクセスをブロック

```sql
-- After: 認証済みユーザーはテナント内メニューのみ参照
-- menus_select_public は廃止
-- menus_select_for_managers（既存）はそのまま保持

-- 新規: スタッフ全員が自テナントのメニューを参照可能
-- ※ is_active フィルタは含めない（managers ポリシーに合わせてアプリ側で制御）
CREATE POLICY "menus_select_for_staff"
ON public.menus FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);
```

**方針B（暫定）: 既存の予約ページAPIを確認・使用**

既存の予約ページが `menus_select_public` を使っているかを確認し、Server API経由に切り替わっている場合はポリシーを削除するだけで済む。

### 移行前に確認すべきこと

- [ ] 予約ページ（`/booking` 等）が `supabase.from('menus')` を直接呼んでいるか確認
- [ ] 直接呼んでいる場合は、Server API（`service_role` 使用）に移行してからポリシーを変更する
- [ ] `anon` キーで `menus` テーブルに直接アクセスしているクライアントコードがないか確認

### マイグレーションSQL（方針A確定後）

```sql
-- ================================================================
-- menus_select_public 廃止 & staff向けポリシー追加
-- ================================================================
BEGIN;

-- 公開ポリシー廃止（Server API Gatewayに移行後に実行）
DROP POLICY IF EXISTS "menus_select_public" ON public.menus;

-- スタッフ全員: 自テナントの有効メニュー参照（is_active/is_deleted フィルタは含めない）
-- ※ menus_select_for_managers と同様に全状態のメニューを参照可能にする。
--   is_active フィルタはアプリ側クエリで行う（管理画面での非公開メニュー確認に対応）
CREATE POLICY "menus_select_for_staff"
ON public.menus FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

COMMIT;
```

---

## Issue 2: `staff_preferences` INSERT の名義制約なし

### 現状

```sql
CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
    -- auth.uid() = staff_id の検証なし！
);
```

### 問題

同一クリニックの `therapist` または `staff` ロールのユーザーが、他スタッフの `staff_id` を指定して希望シフトを登録できる。

```js
// スタッフBとしてログイン中
await supabase.from('staff_preferences').insert({
  clinic_id: '自分のclinic_id',  // ← 自分のクリニック → RLS通過
  staff_id: 'スタッフAのresource_id',  // ← 他人のID → 現状は通過してしまう
  preference_text: '土日休み希望',
  ...
})
```

### `auth.uid() = staff_id` が使えない構造的理由

`staff_preferences.staff_id` は `resources.id`（治療台・スタッフ等のリソースID）への外部キーであり、`auth.users.id` ではない。

```
auth.users.id  ←→  user_permissions.staff_id  （同一の UUID = auth user ID）
resources.id   ←→  staff_preferences.staff_id （別の UUID = resource ID）
```

`resources` テーブルには `user_id` カラムが存在しないため、RLSレベルで `auth.uid()` と `staff_id` を直接紐付けることができない（既存マイグレーションのコメントでも認識済み）。

### 修正方針

**方針A（推奨）: INSERT権限をマネージャー以上に制限**

`therapist` / `staff` ロールにはRLS INSERT権限を与えず、自分の希望登録もServer API経由で行う。APIレイヤーでオーナーシップ検証を行う。

```sql
-- After: INSERT は manager 以上のみ（therapist/staff は Server API 経由）
CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);
```

合わせて、`/api/staff/preferences` の POSTハンドラでオーナーシップ検証を追加する（後述）。

**方針B（将来対応）: resourcesテーブルへ user_id カラム追加**

`resources` テーブルにスタッフの `auth.users.id` を格納する `user_id` カラムを追加し、RLSで `auth.uid() = (SELECT user_id FROM resources WHERE id = staff_id)` のサブクエリ検証を行う。スキーマ変更を伴うため次フェーズ対応とする。

### APIレイヤーでの補完（方針Aと同時実施）

`/api/staff/preferences` の POST ハンドラに `staff_id` オーナーシップ検証を追加する。

#### 現状の問題箇所（`src/app/api/staff/preferences/route.ts`）

```typescript
// 現状: clinic_id の一致しか見ていない
const { supabase } = await ensureClinicAccess(
  request, PATH, dto.clinic_id,
  { requireClinicMatch: true }
);

// staff_id が自分のものかどうかチェックなし
const { data, error } = await supabase
  .from('staff_preferences')
  .insert(dto)
  .select()
  .single();
```

#### 修正後のイメージ

```typescript
// manager以上は任意のstaff_idを指定可能
// therapist/staff は自分のstaff_idのみ許可
const { supabase, permissions } = await ensureClinicAccess(
  request, PATH, dto.clinic_id,
  { requireClinicMatch: true }
);

const isManager = ['admin', 'clinic_admin', 'manager'].includes(permissions.role);

if (!isManager) {
  // staff/therapistは自分のリソースIDに紐づくstaff_idのみ許可
  // NOTE: resources.user_id がないため、現時点では user_permissions 経由で
  //       認証ユーザーに紐付くresource_idを取得する必要がある
  // 暫定: therapist/staffはmanager経由での登録を必須とし、直接POSTを403で弾く
  return createErrorResponse(
    'スタッフ自身の希望登録は管理者経由で行ってください', 403
  );
}
```

> **注意**: 将来的に `resources.user_id` カラムを追加することで、staff本人がself-serviceで登録できるようになる。その際は本処理を改修する。

### マイグレーションSQL（方針A）

```sql
-- ================================================================
-- staff_preferences INSERT 権限をマネージャー以上に制限
-- ================================================================
BEGIN;

DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;

CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

COMMENT ON POLICY "staff_preferences_insert_policy" ON public.staff_preferences IS
'希望シフト登録はマネージャー以上のみ直接RLSで許可。
therapist/staffは /api/staff/preferences エンドポイント経由（Server API Gatewayパターン）。
将来: resources.user_id 追加後に staff 本人によるself-service登録を実装予定。';

COMMIT;
```

---

## 実装方針: TDDで進める

本修正は **t-wada流TDD（Red → Green → Refactor）** で実施する。セキュリティ修正は「壊れていることを先にテストで証明し、修正後に通過することを確認する」というサイクルが特に有効。

### TDDサイクルの適用

```
🔴 Red:   現在の脆弱な挙動を示す失敗テストを書く
🟢 Green: マイグレーション or コードを修正してテストを通す
🔵 Refactor: テストが通った状態で整理
```

**不安なところから始める原則**: 今回はRLS（DBレベル）とAPIレイヤーの2段階があるため、それぞれ独立してテストを書く。

### Issue 2 のTDDテストリスト（先行実施）

```markdown
## staff_preferences INSERT TODOリスト

### APIレイヤー（/api/staff/preferences POST）
- [ ] 🔴 therapistロールが他スタッフのstaff_idで POST → 現状は201になる（バグ確認）
- [ ] 🟢 therapistロールで POST → 403 になる（修正後）
- [ ] 🟢 staffロールで POST → 403 になる（修正後）
- [ ] 🟢 managerロールで POST → 201 になる（既存動作を壊さない）
- [ ] 🟢 clinic_adminロールで POST → 201 になる（既存動作を壊さない）

### RLSレイヤー（直接DB操作）
- [ ] 🔴 therapistロールのJWTで直接INSERT → 現状は成功する（バグ確認）
- [ ] 🟢 therapistロールのJWTで直接INSERT → RLS DENY（マイグレーション後）
- [ ] 🟢 managerロールのJWTで直接INSERT → 成功（既存動作を壊さない）
- [ ] 🟢 他クリニックのmanagerが INSERT → RLS DENY（テナント境界）
```

### Issue 1 のTDDテストリスト（Issue 2 完了後）

```markdown
## menus テナント境界 TODOリスト

### RLSレイヤー
- [ ] 🔴 anonキーで menus SELECT → 現状は全クリニック分が返る（バグ確認）
- [ ] 🟢 anonキーで menus SELECT → 0件（または403）になる（マイグレーション後）
- [ ] 🟢 staffロールで自テナントのメニュー SELECT → 正常取得できる
- [ ] 🟢 staffロールで他テナントのメニュー SELECT → 0件

### アプリケーション（予約ページ）
- [ ] 🟢 予約ページが引き続きメニュー一覧を表示できる（Server API経由）
```

### テスト実装例（Issue 2・APIレイヤー）

> **注意**: 以下はテスト意図を示す疑似コード。`POST()` ヘルパーは既存テスト基盤（`src/__tests__/api/` のパターン）に合わせて実装すること。`CLINIC_A_ID` / `OTHER_STAFF_RESOURCE_ID` はテスト用フィクスチャから取得する。

```typescript
// src/__tests__/api/staff-preferences.test.ts

describe('POST /api/staff/preferences', () => {
  // 🔴 Red: まずこのテストを書いて「失敗」を確認する
  it('therapistロールは他スタッフの名義で希望を登録できない', async () => {
    const res = await POST('/api/staff/preferences', {
      body: {
        clinic_id: CLINIC_A_ID,
        staff_id: OTHER_STAFF_RESOURCE_ID, // 他スタッフのID
        preference_text: '土日休み希望',
      },
      role: 'therapist',
    })
    expect(res.status).toBe(403) // 現状は201になる → Red
  })

  // 🟢 Green: 修正後に通過することを確認
  it('managerロールは任意のstaff_idで希望を登録できる', async () => {
    const res = await POST('/api/staff/preferences', {
      body: {
        clinic_id: CLINIC_A_ID,
        staff_id: OTHER_STAFF_RESOURCE_ID,
        preference_text: '月曜優先希望',
      },
      role: 'manager',
    })
    expect(res.status).toBe(201)
  })
})
```

---

## 実装順序

```
Step 1: Issue 2 先行対応（依存なし・影響範囲小）
  ├── 🔴 Red: therapist/staffが直接INSERTできる失敗テストを書く
  ├── 🟢 Green: マイグレーション適用（staff_preferences INSERT制限）
  ├── 🟢 Green: APIレイヤー修正（/api/staff/preferences POST に roleチェック）
  └── ✅ テスト全通過を確認してコミット

Step 2: Issue 1 調査（先にコードを確認してからテストを書く）
  ├── 予約ページの menus 参照方法を確認（直接DB or Server API）
  ├── anon キーで menus を直接参照しているクライアントコードの有無を確認
  ├── 調査結果をもとにテスト前提を確定
  └── 🔴 Red: anonキーで全クリニックメニューが取得できる失敗テストを書く
      （直接アクセスが残っている場合のみ先行して記述可）

Step 3: Issue 1 対応
  ├── 必要に応じてServer API エンドポイント実装
  ├── クライアントコードをServer API経由に切り替え
  ├── 🟢 Green: マイグレーション適用（menus_select_public廃止）
  └── ✅ テスト全通過 + 予約ページ動作確認してコミット
```

---

## 受け入れ条件（DoD）

### Issue 1

- [ ] `anon` キーで `menus` テーブルを直接クエリしても0件返却（または403）
- [ ] 予約ページが引き続き正常に動作する
- [ ] 認証済みスタッフが自テナントのメニューを正常に参照できる
- [ ] 他テナントのメニューが参照できない

### Issue 2

- [ ] `therapist`/`staff` ロールのユーザーが `staff_preferences` に直接INSERTできない（RLS DENY）
- [ ] `manager`/`clinic_admin`/`admin` ロールは従来通りINSERT可能
- [ ] `POST /api/staff/preferences` に `therapist`/`staff` からリクエストすると403を返す
- [ ] 既存の希望シフトデータが取得・更新できる（SELECTおよびUPDATEポリシーは変更なし）
- [ ] **UX確認**: `therapist`/`staff` が使う希望提出UIが存在する場合、403エラーメッセージが適切に表示される（UI側のエラーハンドリング対応を確認）
  - 現時点でスタッフ向け希望提出UIが存在する場合は「管理者に連絡して登録を依頼する」旨のガイダンス表示が必要

---

## ロールバック手順

### Issue 1 ロールバック

```sql
-- menus_select_public を元に戻す
CREATE POLICY "menus_select_public"
ON public.menus FOR SELECT
USING (is_active = true AND is_deleted = false);

DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;
```

### Issue 2 ロールバック

**RLS（DB）のロールバック:**

```sql
DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;

CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);
```

**APIコードのロールバック:**

`src/app/api/staff/preferences/route.ts` のPOSTハンドラに追加したロールチェック（403返却処理）を削除し、`ensureClinicAccess` の戻り値を元の `{ supabase }` のみの分割代入に戻す。

---

## 関連ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/2026XXXX_rls_menus_tenant_boundary.sql` | menus_select_public廃止・staff向けポリシー追加 |
| `supabase/migrations/2026XXXX_rls_staff_preferences_insert_guard.sql` | INSERT権限をmanager以上に制限 |
| `src/app/api/staff/preferences/route.ts` | POST: therapist/staffロールからのリクエストを403で弾く |

---

*このドキュメントはセキュリティレビュー（2026-02-27）の結果に基づき作成。*

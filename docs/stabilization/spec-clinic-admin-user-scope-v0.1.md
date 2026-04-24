# Clinic Admin User Scope v0.1

## 背景

`/admin/users` は本部 `admin` 向けのアカウント・権限管理画面として実装されている。一方、店舗管理者 `clinic_admin` もスタッフ追加やスタッフ権限の一部管理を行う必要がある。

既存 DB では `user_permissions` の RLS が `admin` / `clinic_admin` と `can_access_clinic(clinic_id)` を前提にしており、親テナント・子テナントのアクセス範囲は JWT の `clinic_scope_ids` とサーバー側 `resolveScopedClinicIds()` で表現される。

## 目的

- `clinic_admin` が `/admin/users` 相当の共通機能を利用できる。
- `clinic_admin` には所属スコープ外の子テナント・スタッフ・権限を表示しない。
- `clinic_admin` が付与・変更できるロールを `manager` / `therapist` / `staff` に制限する。
- 本部 `admin` の既存操作範囲は維持する。

## 非目的

- DB スキーマ変更は行わない。
- 新しい招待フローや Auth ユーザー作成フローは追加しない。
- `staff_invites` の仕様は変更しない。

## 仕様

### API

- `GET /api/admin/users`
  - `admin`: 従来通り全体取得。
  - `clinic_admin`: `resolveScopedClinicIds(permissions)` の範囲に `user_permissions.clinic_id` を限定する。
  - `clinic_id` クエリが指定された場合、`clinic_admin` はスコープ内の ID のみ許可する。

- `GET /api/admin/users/candidates`
  - `admin`: 従来通り全体検索。
  - `clinic_admin`: `staff.clinic_id` をスコープ内に限定する。
  - profile 検索で拾った user_id も、最終的に staff の clinic scope で絞る。

- `POST /api/admin/users`
  - `admin`: 従来通り。
  - `clinic_admin`: 対象 `clinic_id` がスコープ内であること。
  - `clinic_admin`: `role` は `manager` / `therapist` / `staff` のみ許可する。
  - `clinic_admin`: 対象ユーザーが同じ clinic の `staff` レコードを持つこと。
  - `clinic_admin`: 既存権限が `admin` / `clinic_admin` の場合は変更不可。

- `PATCH /api/admin/users/:permission_id`
  - `admin`: 従来通り。
  - `clinic_admin`: 既存権限の `clinic_id` がスコープ内であること。
  - `clinic_admin`: 既存権限と更新後ロールは `manager` / `therapist` / `staff` のみ許可する。
  - `clinic_admin`: revoke も同じ制限を適用する。

### UI

- `admin`: 既存の `/api/admin/tenants` ベースの院選択を維持する。
- `clinic_admin`: AppShell の `SelectedClinicProvider` が持つ accessible clinics を院選択肢に使う。
- `clinic_admin`: ロール選択肢は `manager` / `therapist` / `staff` のみにする。
- `clinic_admin`: 管理できないロールの既存行は編集・剥奪ボタンを表示しない。

## DoD との対応

- DOD-08: `clinic_admin` のテナント境界を `resolveScopedClinicIds()` と `canAccessClinicScope()` に寄せる。
- DOD-09: client から tenant table を直接広く読まず、サーバー API の clinic guard を経由する。
- DOD-10: `npm run type-check` と `npm run build` が通ること。
- DOD-11: 対象 Jest テストが通ること。

## Rollback

DB 変更はない。問題があれば以下のアプリケーション変更を revert する。

- `src/app/api/admin/users/**`
- `src/lib/admin/users.ts`
- `src/hooks/useAdminUsers.ts`
- `src/app/(app)/admin/(protected)/users/page.tsx`
- 関連テスト

# E2E共通フィクスチャ仕様書

## 目的
- E2Eテストで共通に使うシードデータ/アカウント/前提条件を統一する。
- 仕様書間の「前提データ」を単一の参照に集約し、テストの衝突を防ぐ。

## 適用範囲
- `/src/__tests__/e2e/*`
- 管理画面/予約/患者/分析/セキュリティ監視/チャットのE2E

## テスト基盤
- E2Eは Playwright を標準とする。
- 既存のJest E2Eは段階的に置き換える（新規はPlaywrightのみ）。

## 環境前提
- Supabaseローカル、またはE2E専用プロジェクトを使用する。
- E2Eは必ず専用の `clinic_id` / `user_id` を使う（本番/共有データを汚さない）。

## 固定IDルール
- 固定IDは下記の値を使用する（テストコードに直接書く場合はこの値のみ）。
- IDはUUID固定とし、衝突回避のために `e2e-` プレフィックスを付けない。

### クリニック
- `CLINIC_A_ID`: `00000000-0000-0000-0000-0000000000a1`
- `CLINIC_B_ID`: `00000000-0000-0000-0000-0000000000b1`

### ユーザー
- `USER_ADMIN_ID`: `00000000-0000-0000-0000-00000000a001`
- `USER_MANAGER_ID`: `00000000-0000-0000-0000-00000000a002`
- `USER_STAFF_ID`: `00000000-0000-0000-0000-00000000a003`
- `USER_CLINIC_B_ID`: `00000000-0000-0000-0000-00000000b001`
- `USER_NO_CLINIC_ID`: `00000000-0000-0000-0000-00000000ffff`

### 認証情報
- `ADMIN_EMAIL`: `e2e-admin@clinic.local`
- `ADMIN_PASSWORD`: `Admin#12345`
- `MANAGER_EMAIL`: `e2e-manager@clinic.local`
- `MANAGER_PASSWORD`: `Manager#12345`
- `STAFF_EMAIL`: `e2e-staff@clinic.local`
- `STAFF_PASSWORD`: `Staff#12345`
- `NO_CLINIC_EMAIL`: `e2e-no-clinic@clinic.local`
- `NO_CLINIC_PASSWORD`: `NoClinic#12345`
- `CLINIC_B_EMAIL`: `e2e-clinic-b@clinic.local`
- `CLINIC_B_PASSWORD`: `Staff#12345`

## シードデータ（最小セット）
### クリニック
- `clinics`
  - Clinic A（`CLINIC_A_ID`）: E2Eメイン
  - Clinic B（`CLINIC_B_ID`）: 分離検証用

### プロフィール/権限
- `profiles`
  - `USER_ADMIN_ID` -> `CLINIC_A_ID`, role=admin
  - `USER_MANAGER_ID` -> `CLINIC_A_ID`, role=clinic_manager
  - `USER_STAFF_ID` -> `CLINIC_A_ID`, role=staff
  - `USER_CLINIC_B_ID` -> `CLINIC_B_ID`, role=staff
  - `USER_NO_CLINIC_ID` -> clinic_id=null, role=staff
- `user_permissions`
  - `USER_ADMIN_ID` は clinic_id=null / role=admin
  - `USER_MANAGER_ID` は clinic_id=CLINIC_A_ID / role=clinic_manager
  - `USER_STAFF_ID` は clinic_id=CLINIC_A_ID / role=staff
  - `USER_CLINIC_B_ID` は clinic_id=CLINIC_B_ID / role=staff

### 予約/患者
- `customers`
  - 5名以上（氏名/電話/メール）
- `menus`
  - 2件（保険/自費）
- `resources`
  - staff 2名, room 1つ
- `reservations`
  - 今日/明日/来週の予約を最低5件

### 分析
- `daily_revenue_summary`
  - 直近7日分
- `visits`
  - 本日分の来院
- `ai_comments`
  - 本日分1件
- `get_hourly_visit_pattern`
  - 予約データから集計可能であること

### セキュリティ
- `security_events`
  - severity=high 1件
  - severity=medium 1件
- `audit_logs`
  - `failed_login` / `unauthorized_access` を各1件
- `user_sessions`
  - アクティブセッション1件（`USER_ADMIN_ID`）

## E2E用ユーティリティ
- テスト開始時に `npm run e2e:seed` を実行する。
- テスト終了時に `npm run e2e:cleanup` を実行する。
- 事前チェックは `npm run e2e:validate-fixtures` を実行する。

## クリーニングルール
- すべて `clinic_id IN (CLINIC_A_ID, CLINIC_B_ID)` の範囲で削除する。
- 共有テーブル（`auth.users`）は削除しない。

## データ整合性チェック
- 予約作成時は `resources` / `menus` / `customers` が存在すること。
- `user_permissions` と `profiles` は整合すること。

## 妥当性チェック
### リポジトリ内チェック
- 固定UUID/メールが他のシードや実装に重複していないことを確認する。
- 例: `rg -n "00000000-0000-0000-0000-00000000" docs src sql`

### データベースチェック
- 既存データとの衝突が無いことを確認する（E2E実行前に必須）。
- 例:
  - `select id from clinics where id in (CLINIC_A_ID, CLINIC_B_ID);`
  - `select user_id from profiles where user_id in (USER_ADMIN_ID, USER_MANAGER_ID, USER_STAFF_ID, USER_CLINIC_B_ID, USER_NO_CLINIC_ID);`
  - `select staff_id from user_permissions where staff_id in (USER_ADMIN_ID, USER_MANAGER_ID, USER_STAFF_ID, USER_CLINIC_B_ID);`

## 参照先
- 各仕様書の「E2Eテスト仕様」はこの文書を前提にする。

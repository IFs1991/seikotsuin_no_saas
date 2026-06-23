# RLS デプロイメント 実行手順書

## 🔐 Supabase Row Level Security 実装（現行運用版）

**作成日**: 2025年8月23日  
**最終更新**: 2026年1月27日  
**対象**: 整骨院管理SaaS  
**実行環境**: Supabase Database  
**ソース・オブ・トゥルース**: `supabase/migrations/*.sql`（RLS/スキーマ）

---

## 📌 重要な前提（最新構成）

- **RLS/スキーマの正**は `supabase/migrations/*.sql`。  
  `src/api/database/schema.sql` / `src/api/database/rls-policies.sql` は**レガシー参照用**。
- **JWT クレーム前提**: `clinic_id` / `user_role` / `clinic_scope_ids`（親子スコープ）  
  `public.custom_access_token_hook()` により付与。
- **RLS 共通関数（public schema）**:
  - `public.get_current_role()`
  - `public.get_current_clinic_id()`
  - `public.jwt_clinic_id()`
  - `public.jwt_is_admin()`
  - `public.can_access_clinic(uuid)`
  - `public.custom_access_token_hook(jsonb)`
  - `public.user_role()`（レガシー互換）
- **DoD 連動**: DOD-01 / 02 / 03 / 04 / 08（`docs/stabilization/DoD-v0.1.md`）

---

## 📋 事前準備チェックリスト

### 1. Supabase プロジェクト確認

- [ ] Supabase プロジェクト作成済み
- [ ] DB 接続情報確認済み
- [ ] SQL Editor / CLI の権限確認済み

### 2. 環境変数更新

`.env.local` に Supabase 情報を設定:

```bash
# Supabase設定（実際の値に更新）
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key

# DB直接接続（検証用）
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

### 3. バックアップ実行（本番）

```sql
-- 重要: 本番データがある場合は必ずバックアップを取得
pg_dump "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" > backup_before_rls.sql
```

---

## 🧭 現行スキーマ / RLS 概要（2026-01-27 時点）

### 主要テナント系テーブル（RLS 有効）

- **基盤**: `clinics`, `user_permissions`, `profiles`
- **予約系**: `reservations`, `blocks`, `customers`, `menus`, `resources`, `reservation_history`
- **レガシー業務**: `staff`, `patients`, `visits`, `revenues`, `staff_performance`, `daily_reports`, `ai_comments`, `appointments`
- **運用/管理**: `clinic_settings`, `staff_shifts`, `staff_preferences`, `chat_sessions`, `chat_messages`
- **監査/セキュリティ**: `audit_logs`, `encryption_keys`, `security_events`, `notifications`, `staff_invites`

### 重要な挙動

- **親子スコープ**: `clinics.parent_id` + JWT の `clinic_scope_ids` で親子スコープを制御。
- **customer 自己アクセス**: 予約/顧客は**Server API 経由のみ**（RLS から自己アクセスを削除）。
- **appointments**: **読み取り専用**（SSOTは `reservations`）。
- **audit_logs / encryption_keys**: **厳格制御**（更新/削除なし、service role での挿入のみ）。

---

## 🚀 RLS 適用手順（推奨フロー）

### Step 1: ローカル確認（DoD-01/02/03/04）

```bash
supabase start
supabase status
node scripts/verify-supabase-connection.mjs

# マイグレーションの再現性確認
supabase db reset --local --no-seed
supabase db reset --local

# スキーマ差分の確認
supabase db push --local --dry-run
```

### Step 2: Auth Hook 設定確認

`supabase/config.toml` の設定が有効であることを確認:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

> Hosted Supabase の場合は Dashboard → Auth → Hooks で同設定を有効化。

### Step 3: 本番適用（マイグレーション）

- **推奨**: `supabase db push` で `supabase/migrations` を反映  
- **禁止**: `src/api/database/rls-policies.sql` を SQL Editor で手動実行

---

## ✅ 検証クエリ（DoD-08 対応）

### 1. RLS 有効化確認

```sql
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'clinics','user_permissions','profiles',
    'reservations','blocks','customers','menus','resources','reservation_history',
    'staff','patients','visits','revenues','staff_performance','daily_reports','ai_comments','appointments',
    'clinic_settings','staff_shifts','staff_preferences',
    'chat_sessions','chat_messages',
    'audit_logs','encryption_keys','security_events','notifications','staff_invites'
  )
ORDER BY tablename;
```

### 2. 主要ポリシーのスコープ確認（can_access_clinic）

```sql
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'reservations','blocks','customers','menus','resources','reservation_history','ai_comments',
    'clinic_settings','staff_shifts','staff_preferences',
    'clinics','user_permissions',
    'staff','patients','visits','revenues','staff_performance','daily_reports',
    'appointments','staff_invites'
  )
ORDER BY tablename, policyname;
```

### 3. RLS ヘルパー関数の存在確認

```sql
SELECT routine_schema, routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_current_role',
    'get_current_clinic_id',
    'jwt_clinic_id',
    'jwt_is_admin',
    'can_access_clinic',
    'custom_access_token_hook',
    'user_role'
  )
ORDER BY routine_name;
```

### 4. JWT クレーム確認（ログイン後）

```sql
SELECT
  current_setting('request.jwt.claims', true)::jsonb->>'clinic_id' AS clinic_id,
  current_setting('request.jwt.claims', true)::jsonb->>'user_role' AS user_role,
  current_setting('request.jwt.claims', true)::jsonb->'clinic_scope_ids' AS clinic_scope_ids;
```

### 5. appointments が読み取り専用であることを確認

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'appointments'
ORDER BY policyname;
```

---

## 🧪 動作テスト（最小）

```sql
SELECT
  public.get_current_role() AS current_role,
  public.get_current_clinic_id() AS current_clinic_id,
  public.jwt_is_admin() AS is_admin;
```

---

## 🔧 トラブルシューティング

### エラー1: 関数が見つからない

```
ERROR: function public.get_current_role() does not exist
```

**解決策**: `supabase/migrations/20251224001000_auth_helper_functions.sql` が適用されているか確認。

### エラー2: can_access_clinic の判定が常に false

**原因候補**:
- `custom_access_token_hook` が無効
- JWT に `clinic_scope_ids` / `clinic_id` が未付与

**解決策**: `supabase/config.toml` の `[auth.hook.custom_access_token]` 設定を確認し、再ログインで JWT を再発行。

### エラー3: appointments への INSERT が失敗

**説明**: `appointments` は read-only 仕様。  
**対応**: `public.reservations` + `/api/reservations` を使用。

### エラー4: menus の public 参照が不可

**説明**: `menus_select_public` は削除済み。  
**対応**: Server API 経由でメニューを提供。

---

## 📊 実装完了チェック（DoD 紐づけ）

- [ ] DOD-01: ローカル Supabase 起動確認  
- [ ] DOD-02: マイグレーションが冪等  
- [ ] DOD-03: Seed 再現性  
- [ ] DOD-04: スキーマ差分なし  
- [ ] DOD-08: RLS テナント境界が一貫（`can_access_clinic`）

---

## 🎯 次ステップ（運用）

1. **Server API 経由の権限制御を維持**
2. **JWT claims の整合性監視（clinic_scope_ids）**
3. **RLS 変更は必ず `supabase/migrations` へ**

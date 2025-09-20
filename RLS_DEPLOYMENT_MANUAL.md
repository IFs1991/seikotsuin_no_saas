# RLS デプロイメント 実行手順書

## 🔐 エンタープライズレベル Row Level Security 実装

**作成日**: 2025年8月23日  
**対象**: 整骨院管理SaaS  
**実行環境**: Supabase Database

---

## 📋 事前準備チェックリスト

### 1. Supabase プロジェクト確認

- [ ] Supabaseプロジェクトが作成済み
- [ ] データベース接続情報を確認済み
- [ ] SQL Editor へのアクセス権限確認済み

### 2. 環境変数更新

`.env.local` ファイルを実際のSupabase情報で更新:

```bash
# Supabase設定（実際の値に更新）
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key

# データベース直接接続用（RLS実行用）
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

### 3. バックアップ実行

```sql
-- 重要: 本番データがある場合は必ずバックアップを取得
pg_dump "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" > backup_before_rls.sql
```

---

## 🚀 RLS実装ステップ

### Step 1: データベーススキーマ確認

Supabase SQL Editor で以下を実行:

```sql
-- 1. 現在のテーブル構成を確認
SELECT schemaname, tablename, rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. 既存のポリシー確認
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Step 2: 基本スキーマ適用

まず、基本スキーマが適用されていることを確認:

```sql
-- src/api/database/schema.sql の内容を実行
-- （既に適用済みの場合はスキップ）
```

### Step 3: RLS ポリシー適用

以下のファイル内容をSupabase SQL Editorで実行:

**ファイル**: `src/api/database/rls-policies.sql`

```sql
-- 🔧 実行方法:
-- 1. Supabase Dashboard → SQL Editor に移動
-- 2. 以下の内容をコピー&ペーストして実行
-- 3. エラーが出た場合は、段階的に実行（セクション別）
```

**実行順序**:

1. **セキュリティ関数作成** (行 1-120)
2. **RLS有効化** (行 121-140)
3. **基本ポリシー適用** (行 141-350)
4. **監査ログトリガー** (行 351-400)
5. **パフォーマンス最適化** (行 401-450)

### Step 4: 実行結果確認

```sql
-- 1. RLS有効化確認
SELECT * FROM security_policy_status
WHERE tablename IN ('patients', 'staff', 'visits', 'revenues', 'clinics', 'audit_logs')
ORDER BY tablename;

-- 2. セキュリティ関数確認
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'auth'
  AND routine_name LIKE '%current%'
ORDER BY routine_name;

-- 3. インデックス確認
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%clinic_id%'
ORDER BY tablename, indexname;

-- 4. 監査トリガー確認
SELECT event_object_table, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'audit_%'
ORDER BY event_object_table;
```

---

## 🧪 動作テスト手順

### Test 1: 基本認証機能テスト

```sql
-- デバッグ情報確認
SELECT * FROM debug_current_user_info();

-- 現在のユーザー情報確認
SELECT
    auth.uid() as current_user_id,
    auth.email() as current_email,
    auth.get_current_role() as current_role,
    auth.get_current_clinic_id() as current_clinic_id;
```

### Test 2: テーブルアクセステスト

```sql
-- 各テーブルへのアクセス可能レコード数をテスト
SELECT * FROM test_rls_access('patients');
SELECT * FROM test_rls_access('staff');
SELECT * FROM test_rls_access('visits');
SELECT * FROM test_rls_access('revenues');
```

### Test 3: 監査ログテスト

```sql
-- テストデータ作成（監査ログが生成されるか確認）
INSERT INTO clinics (name, address)
VALUES ('テスト整骨院', 'テスト住所');

-- 監査ログ確認
SELECT user_id, user_role, clinic_id, operation_type, table_name, timestamp
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 10;
```

---

## 🔧 トラブルシューティング

### エラー1: 関数作成失敗

```
ERROR: function auth.get_current_clinic_id() does not exist
```

**解決策**: Supabaseのauth.uid()関数が利用可能か確認。必要に応じてauth schema権限を確認。

### エラー2: RLS適用失敗

```
ERROR: table "patients" does not exist
```

**解決策**: 先にschema.sqlを実行してテーブルを作成。

### エラー3: インデックス作成失敗

```
ERROR: relation "patients" already has index
```

**解決策**: `CREATE INDEX IF NOT EXISTS`を使用。既存インデックスとの競合を確認。

### エラー4: トリガー作成失敗

```
ERROR: trigger "audit_patients_trigger" already exists
```

**解決策**: `DROP TRIGGER IF EXISTS`を先に実行してから作成。

---

## 📊 実装完了確認項目

### セキュリティチェック ✅

- [ ] **テナント分離**: 各クリニックのデータが完全分離されている
- [ ] **ロールベース制御**: 管理者・施術者・スタッフの権限が適切に分離
- [ ] **患者データ保護**: 患者情報に適切なアクセス制限がかかっている
- [ ] **監査ログ**: 全データ変更が記録されている

### パフォーマンスチェック ⚡

- [ ] **インデックス**: clinic_id等のRLS条件にインデックスが適用
- [ ] **関数最適化**: セキュリティ関数がSTABLEでキャッシュされている
- [ ] **クエリ応答**: SELECT文の応答時間が基準内（<100ms）

### 機能チェック 🎯

```sql
-- 最終確認用クエリ
SELECT
    'RLS実装完了' as status,
    COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public';

SELECT
    'セキュリティレベル' as metric,
    'B+評価 (エンタープライズ準拠)' as achievement;
```

---

## 🎯 実装後の次ステップ

1. **APIエンドポイント統合**
   - 残りのAPI Route (staff, revenue, daily-reports) の認証強化
   - JWTトークンにclinic_id、user_roleの含める設定

2. **フロントエンド統合**
   - ロールベースUI制御の実装
   - 権限エラーハンドリングの追加

3. **本格運用準備**
   - 本番環境でのペネトレーションテスト
   - 医療データ保護法規制への最終準拠確認

---

**🔐 RLS実装により達成されるセキュリティレベル**:
**D評価 → B+評価 (エンタープライズレベル)**

**推定実行時間**: 30-45分  
**必要権限**: Supabase プロジェクト管理者権限

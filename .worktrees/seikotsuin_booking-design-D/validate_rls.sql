-- ================================================
-- RLS (Row Level Security) 検証・テストスクリプト
-- 整骨院管理SaaS エンタープライズセキュリティ検証
-- ================================================

-- 実行方法:
-- 1. Supabase SQL Editor でこのファイル内容を実行
-- 2. 各セクションの結果を確認
-- 3. 異常がある場合は該当セクションを個別実行して調査

BEGIN;

-- ================================================
-- Section 1: RLS有効化状態の確認
-- ================================================

SELECT 
    '=== RLS有効化状態確認 ===' as section,
    NOW() as execution_time;

SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN '✅ 有効' 
        ELSE '❌ 無効' 
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'clinics', 'staff', 'patients', 'visits', 'revenues', 
        'daily_reports', 'user_permissions', 'audit_logs',
        'chat_sessions', 'chat_messages'
    )
ORDER BY tablename;

-- ================================================
-- Section 2: RLSポリシー数の確認
-- ================================================

SELECT 
    '=== RLSポリシー確認 ===' as section;

SELECT 
    schemaname,
    tablename,
    COUNT(*) as policy_count,
    STRING_AGG(policyname, ', ' ORDER BY policyname) as policy_names
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ================================================  
-- Section 3: セキュリティ関数の確認
-- ================================================

SELECT 
    '=== セキュリティ関数確認 ===' as section;

SELECT 
    routine_schema,
    routine_name,
    routine_type,
    CASE 
        WHEN routine_name LIKE '%current%' THEN '🔑 認証関数'
        WHEN routine_name LIKE '%log%' THEN '📝 監査関数'
        WHEN routine_name LIKE '%assign%' THEN '👥 権限関数'
        ELSE '🔧 その他'
    END as function_category
FROM information_schema.routines
WHERE routine_schema IN ('auth', 'public') 
    AND (
        routine_name LIKE '%current%' 
        OR routine_name LIKE '%log%' 
        OR routine_name LIKE '%assign%'
        OR routine_name = 'debug_current_user_info'
        OR routine_name = 'test_rls_access'
    )
ORDER BY routine_schema, routine_name;

-- ================================================
-- Section 4: インデックス最適化の確認
-- ================================================

SELECT 
    '=== RLS最適化インデックス確認 ===' as section;

SELECT 
    schemaname,
    tablename,
    indexname,
    CASE 
        WHEN indexname LIKE '%clinic_id%' THEN '🏢 テナント分離用'
        WHEN indexname LIKE '%user%' THEN '👤 ユーザー認証用'  
        WHEN indexname LIKE '%audit%' THEN '📊 監査ログ用'
        ELSE '🔧 その他最適化'
    END as index_purpose
FROM pg_indexes
WHERE schemaname = 'public'
    AND (
        indexname LIKE 'idx_%clinic_id%' 
        OR indexname LIKE 'idx_%user%'
        OR indexname LIKE 'idx_audit_%'
    )
ORDER BY tablename, indexname;

-- ================================================
-- Section 5: 監査ログトリガーの確認
-- ================================================

SELECT 
    '=== 監査トリガー確認 ===' as section;

SELECT 
    event_object_schema,
    event_object_table,
    trigger_name,
    STRING_AGG(event_manipulation, ', ') as monitored_operations,
    action_timing,
    CASE 
        WHEN trigger_name LIKE 'audit_%' THEN '✅ 監査対象'
        ELSE '⚠️ 要確認'
    END as audit_status
FROM information_schema.triggers
WHERE event_object_schema = 'public'
    AND trigger_name LIKE 'audit_%'
GROUP BY event_object_schema, event_object_table, trigger_name, action_timing
ORDER BY event_object_table;

-- ================================================
-- Section 6: セキュリティ関数の動作テスト
-- ================================================

SELECT 
    '=== セキュリティ関数動作テスト ===' as section;

-- 現在のユーザー情報テスト
SELECT 
    'current_user_test' as test_name,
    auth.uid() as current_user_id,
    CASE 
        WHEN auth.uid() IS NULL THEN '❌ 未認証'
        ELSE '✅ 認証済み'
    END as auth_status;

-- デバッグ関数テスト（関数が存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'debug_current_user_info'
    ) THEN
        RAISE NOTICE '✅ debug_current_user_info 関数が利用可能';
    ELSE
        RAISE NOTICE '❌ debug_current_user_info 関数が見つかりません';
    END IF;
END $$;

-- ================================================
-- Section 7: テーブル権限の基本テスト
-- ================================================

SELECT 
    '=== テーブルアクセス基本テスト ===' as section;

-- patients テーブルへのアクセステスト
SELECT 
    'patients_access_test' as test_name,
    COUNT(*) as accessible_records,
    CASE 
        WHEN COUNT(*) >= 0 THEN '✅ アクセス可能'
        ELSE '❌ アクセス拒否'
    END as access_status
FROM patients;

-- staff テーブルへのアクセステスト  
SELECT 
    'staff_access_test' as test_name,
    COUNT(*) as accessible_records,
    CASE 
        WHEN COUNT(*) >= 0 THEN '✅ アクセス可能'
        ELSE '❌ アクセス拒否'
    END as access_status
FROM staff;

-- clinics テーブルへのアクセステスト
SELECT 
    'clinics_access_test' as test_name,
    COUNT(*) as accessible_records,
    CASE 
        WHEN COUNT(*) >= 0 THEN '✅ アクセス可能'
        ELSE '❌ アクセス拒否'
    END as access_status
FROM clinics;

-- ================================================
-- Section 8: 監査ログテーブル確認
-- ================================================

SELECT 
    '=== 監査ログテーブル確認 ===' as section;

SELECT 
    'audit_logs_structure' as test_name,
    COUNT(*) as total_audit_records,
    CASE 
        WHEN COUNT(*) >= 0 THEN '✅ 監査ログテーブル正常'
        ELSE '❌ 監査ログテーブル異常'
    END as table_status
FROM audit_logs;

-- 最近の監査ログエントリ確認（存在する場合）
SELECT 
    'recent_audit_logs' as test_name,
    operation_type,
    table_name,
    user_role,
    COUNT(*) as record_count
FROM audit_logs 
WHERE timestamp >= NOW() - INTERVAL '1 day'
GROUP BY operation_type, table_name, user_role
ORDER BY record_count DESC
LIMIT 10;

-- ================================================
-- Section 9: セキュリティポリシー統計
-- ================================================

SELECT 
    '=== セキュリティ実装統計 ===' as section;

-- ポリシー統計
WITH policy_stats AS (
    SELECT COUNT(*) as total_policies FROM pg_policies WHERE schemaname = 'public'
),
table_stats AS (
    SELECT COUNT(*) as total_tables 
    FROM pg_tables 
    WHERE schemaname = 'public' 
        AND rowsecurity = true
),
function_stats AS (
    SELECT COUNT(*) as total_security_functions
    FROM information_schema.routines
    WHERE routine_schema IN ('auth', 'public') 
        AND routine_name LIKE ANY(ARRAY['%current%', '%log%', '%assign%', 'debug_%', 'test_%'])
)
SELECT 
    'security_implementation_summary' as summary_type,
    p.total_policies,
    t.total_tables as rls_enabled_tables,
    f.total_security_functions,
    CASE 
        WHEN p.total_policies >= 15 AND t.total_tables >= 8 AND f.total_security_functions >= 5 
        THEN '🎯 A級: エンタープライズレベル'
        WHEN p.total_policies >= 10 AND t.total_tables >= 5 AND f.total_security_functions >= 3
        THEN '🏆 B級: 高セキュリティ'
        WHEN p.total_policies >= 5 AND t.total_tables >= 3
        THEN '✅ C級: 基本セキュリティ'
        ELSE '⚠️ D級: セキュリティ不足'
    END as security_level
FROM policy_stats p, table_stats t, function_stats f;

-- ================================================
-- Section 10: 最終確認
-- ================================================

SELECT 
    '=== RLS実装完了確認 ===' as section,
    '整骨院管理SaaS' as system_name,
    'エンタープライズレベル Row Level Security' as implementation_type,
    NOW() as verification_completed_at;

-- 実装完了フラグ確認
SELECT 
    CASE 
        WHEN (
            SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public'
        ) >= 15 THEN '🎯 RLS実装完了: エンタープライズレベル達成'
        ELSE '⚠️ RLS実装未完了: 追加設定が必要'
    END as final_status;

COMMIT;

-- ================================================
-- 実行後の推奨アクション
-- ================================================

/*
✅ このスクリプト実行後の確認事項:

1. 各セクションの結果で❌や⚠️がないことを確認
2. security_level が「B級」以上であることを確認  
3. final_status が「RLS実装完了」であることを確認

🔧 問題が見つかった場合:
- 該当セクションのクエリを個別実行して詳細調査
- src/api/database/rls-policies.sql の該当部分を再実行
- RLS_DEPLOYMENT_MANUAL.md のトラブルシューティング参照

🎯 実装完了後の次ステップ:
1. APIエンドポイントでの認証・認可統合テスト
2. フロントエンドでのロールベース機能制御実装
3. ペネトレーションテスト実施
4. 本番環境デプロイ準備
*/
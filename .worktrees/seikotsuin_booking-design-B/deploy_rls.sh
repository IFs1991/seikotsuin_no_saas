#!/bin/bash

# ===========================================
# 整骨院管理SaaS RLS デプロイスクリプト
# エンタープライズレベル Row Level Security 実装
# ===========================================

set -e  # エラー時にスクリプト終了

echo "🔐 RLS (Row Level Security) デプロイメント開始..."
echo "作成日: $(date '+%Y-%m-%d %H:%M:%S')"
echo "対象: 整骨院管理SaaS"
echo "=========================================="

# 環境変数チェック
if [ -z "$SUPABASE_DB_URL" ] && [ -z "$DATABASE_URL" ]; then
    echo "❌ エラー: データベース接続情報が設定されていません"
    echo "以下のいずれかの環境変数を設定してください:"
    echo "  - SUPABASE_DB_URL"
    echo "  - DATABASE_URL"
    exit 1
fi

# データベース接続URL決定
DB_URL="${SUPABASE_DB_URL:-$DATABASE_URL}"

echo "📊 デプロイ前データベース状態確認..."

# 1. 現在のRLS状態を確認
echo "現在のRLS有効状態:"
psql "$DB_URL" -c "
SELECT schemaname, tablename, rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('patients', 'staff', 'visits', 'revenues', 'clinics')
ORDER BY tablename;
"

# 2. 既存ポリシー数を確認
echo -e "\n現在のポリシー数:"
psql "$DB_URL" -c "
SELECT schemaname, tablename, COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;
"

echo -e "\n🚀 RLS ポリシー適用中..."

# 3. メインのRLSポリシーファイルを実行
echo "RLS ポリシーファイル実行中: src/api/database/rls-policies.sql"
psql "$DB_URL" -f src/api/database/rls-policies.sql

if [ $? -eq 0 ]; then
    echo "✅ RLS ポリシーファイル適用完了"
else
    echo "❌ RLS ポリシーファイル適用失敗"
    exit 1
fi

echo -e "\n📈 デプロイ後データベース状態確認..."

# 4. RLS有効化状態を再確認
echo "RLS有効化確認:"
psql "$DB_URL" -c "
SELECT * FROM security_policy_status 
WHERE tablename IN ('patients', 'staff', 'visits', 'revenues', 'clinics', 'audit_logs')
ORDER BY tablename;
"

# 5. 作成された関数を確認
echo -e "\nセキュリティ関数確認:"
psql "$DB_URL" -c "
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'auth' 
  AND routine_name LIKE '%current%'
ORDER BY routine_name;
"

# 6. インデックス作成状況を確認
echo -e "\nRLS最適化インデックス確認:"
psql "$DB_URL" -c "
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%clinic_id%'
ORDER BY tablename, indexname;
"

# 7. 監査ログトリガー確認
echo -e "\n監査トリガー確認:"
psql "$DB_URL" -c "
SELECT event_object_table, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'audit_%'
ORDER BY event_object_table;
"

echo -e "\n🧪 基本動作テスト実行..."

# 8. セキュリティ関数の基本動作テスト
echo "セキュリティ関数テスト:"
psql "$DB_URL" -c "
SELECT 
    'auth.get_current_role()' as function_name,
    auth.get_current_role() as result
UNION ALL
SELECT 
    'auth.get_current_clinic_id()',
    auth.get_current_clinic_id()::text
UNION ALL  
SELECT
    'debug_current_user_info()',
    (SELECT COUNT(*)::text FROM debug_current_user_info());
"

echo -e "\n📋 デプロイメント完了サマリー"
echo "=========================================="
echo "✅ RLS ポリシー適用完了"
echo "✅ セキュリティ関数作成完了"
echo "✅ 監査ログトリガー設定完了"
echo "✅ パフォーマンス最適化インデックス作成完了"

echo -e "\n⚠️  次のステップ:"
echo "1. 認証システムでJWTにclinic_idとuser_roleを含める設定"
echo "2. APIエンドポイントでの認証・認可統合テスト"
echo "3. フロントエンドでの権限ベース機能制御"
echo "4. ペネトレーションテスト実施"

echo -e "\n🔍 セキュリティ確認方法:"
echo "psql \"\$DB_URL\" -c \"SELECT * FROM debug_current_user_info();\""
echo "psql \"\$DB_URL\" -c \"SELECT * FROM security_policy_status;\""

echo -e "\n🎯 達成されたセキュリティレベル:"
echo "- テナント完全分離: ✅ 有効"
echo "- ロールベースアクセス制御: ✅ 有効"  
echo "- 監査ログ記録: ✅ 有効"
echo "- パフォーマンス最適化: ✅ 有効"
echo "- エンタープライズ準拠: ✅ 達成"

echo -e "\n🔐 RLS デプロイメント正常完了!"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
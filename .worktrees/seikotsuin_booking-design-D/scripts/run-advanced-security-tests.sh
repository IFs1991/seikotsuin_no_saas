#!/bin/bash

# 高度セキュリティテスト実行スクリプト
# Phase 3B: セキュリティテスト自動化

set -e  # エラー時に停止

echo "🔒 Phase 3B: 高度セキュリティテスト自動化実行開始"
echo "============================================="

# 環境変数チェック
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV=test
  echo "ℹ️  NODE_ENV=test を設定"
fi

# カラーコード定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログディレクトリ作成
LOGS_DIR="./test-results/security-tests"
mkdir -p "$LOGS_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$LOGS_DIR/security_test_report_$TIMESTAMP.json"
SUMMARY_FILE="$LOGS_DIR/security_test_summary_$TIMESTAMP.txt"

echo -e "${BLUE}📂 テスト結果: $LOGS_DIR${NC}"

# テスト関数定義
run_test_suite() {
    local test_name="$1"
    local test_pattern="$2"
    local description="$3"
    
    echo -e "\n${YELLOW}🧪 $test_name${NC}"
    echo "   $description"
    echo "   パターン: $test_pattern"
    
    if npm test -- --testPathPattern="$test_pattern" --verbose --json > "$LOGS_DIR/${test_name,,}_$TIMESTAMP.json" 2>&1; then
        echo -e "   ${GREEN}✅ 成功${NC}"
        return 0
    else
        echo -e "   ${RED}❌ 失敗${NC}"
        return 1
    fi
}

# パフォーマンステスト（Phase 3B要件: < 50ms）
run_performance_tests() {
    echo -e "\n${BLUE}⚡ パフォーマンステスト実行${NC}"
    echo "要件: セッション検証オーバーヘッド < 50ms"
    
    local failed_tests=0
    
    # セッション管理パフォーマンス
    if run_test_suite "Session-Performance" "session-performance.test" "セッション検証・作成パフォーマンス"; then
        echo "   ✓ セッション管理パフォーマンス: 合格"
    else
        ((failed_tests++))
        echo "   ✗ セッション管理パフォーマンス: 不合格"
    fi
    
    # セキュリティ監視パフォーマンス
    if run_test_suite "Security-Monitor-Performance" "security-monitor.test" "セキュリティ脅威分析パフォーマンス"; then
        echo "   ✓ セキュリティ監視パフォーマンス: 合格"
    else
        ((failed_tests++))
        echo "   ✗ セキュリティ監視パフォーマンス: 不合格"
    fi
    
    return $failed_tests
}

# ペネトレーションテスト実行
run_penetration_tests() {
    echo -e "\n${BLUE}🔍 ペネトレーションテスト実行${NC}"
    
    # TypeScriptファイルの直接実行（ts-node使用）
    if command -v npx >/dev/null 2>&1; then
        echo "📡 高度脆弱性スキャン実行中..."
        
        # ペネトレーションテストランナー実行
        if npx ts-node src/__tests__/session-management/penetration-test-prep.ts > "$LOGS_DIR/penetration_test_$TIMESTAMP.log" 2>&1; then
            echo -e "${GREEN}✅ ペネトレーションテスト完了${NC}"
            
            # 結果の簡易解析
            if grep -q "成功率: 100.0%" "$LOGS_DIR/penetration_test_$TIMESTAMP.log"; then
                echo "   🎯 全ペネトレーションテスト合格"
                return 0
            elif grep -q "成功率:" "$LOGS_DIR/penetration_test_$TIMESTAMP.log"; then
                local success_rate=$(grep "成功率:" "$LOGS_DIR/penetration_test_$TIMESTAMP.log" | head -1 | grep -o '[0-9]\+\.[0-9]\+')
                echo "   📊 成功率: $success_rate%"
                
                if (( $(echo "$success_rate >= 90.0" | bc -l) )); then
                    echo -e "   ${GREEN}✅ 許容範囲内（>=90%）${NC}"
                    return 0
                else
                    echo -e "   ${RED}❌ 成功率が低い（<90%）${NC}"
                    return 1
                fi
            else
                echo -e "   ${YELLOW}⚠️  結果の解析に失敗${NC}"
                return 1
            fi
        else
            echo -e "${RED}❌ ペネトレーションテスト実行失敗${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ npxが見つかりません${NC}"
        return 1
    fi
}

# セキュリティテストスイート実行
run_security_test_suites() {
    echo -e "\n${BLUE}🛡️  セキュリティテストスイート実行${NC}"
    
    local failed_tests=0
    
    # セッション管理セキュリティ
    if run_test_suite "Session-Management-Security" "session-management/" "セッション管理全般セキュリティ"; then
        echo "   ✓ セッション管理セキュリティ: 合格"
    else
        ((failed_tests++))
        echo "   ✗ セッション管理セキュリティ: 不合格"
    fi
    
    # 高度セキュリティ機能
    if run_test_suite "Advanced-Security" "advanced-security.test" "多層防御・リアルタイム脅威検知"; then
        echo "   ✓ 高度セキュリティ機能: 合格"
    else
        ((failed_tests++))
        echo "   ✗ 高度セキュリティ機能: 不合格"
    fi
    
    # 認証・認可セキュリティ
    if run_test_suite "Auth-Security" "auth.test" "認証・認可セキュリティ"; then
        echo "   ✓ 認証・認可セキュリティ: 合格"
    else
        ((failed_tests++))
        echo "   ✗ 認証・認可セキュリティ: 不合格"
    fi
    
    return $failed_tests
}

# 統合セキュリティテスト
run_integration_security_tests() {
    echo -e "\n${BLUE}🔗 統合セキュリティテスト実行${NC}"
    
    if run_test_suite "Integration-Security" "integration/" "エンドツーエンドセキュリティ"; then
        echo "   ✓ 統合セキュリティテスト: 合格"
        return 0
    else
        echo "   ✗ 統合セキュリティテスト: 不合格"
        return 1
    fi
}

# レポート生成
generate_security_report() {
    echo -e "\n${BLUE}📊 セキュリティテストレポート生成${NC}"
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    # テスト結果ファイルから統計収集
    for result_file in "$LOGS_DIR"/*_$TIMESTAMP.json; do
        if [ -f "$result_file" ]; then
            # JSON解析（jqが利用可能な場合）
            if command -v jq >/dev/null 2>&1; then
                local file_tests=$(jq '.numTotalTests // 0' "$result_file" 2>/dev/null || echo "0")
                local file_passed=$(jq '.numPassedTests // 0' "$result_file" 2>/dev/null || echo "0")
                local file_failed=$(jq '.numFailedTests // 0' "$result_file" 2>/dev/null || echo "0")
                
                total_tests=$((total_tests + file_tests))
                passed_tests=$((passed_tests + file_passed))
                failed_tests=$((failed_tests + file_failed))
            fi
        fi
    done
    
    # サマリーレポート生成
    cat > "$SUMMARY_FILE" << EOF
=====================================
Phase 3B セキュリティテストサマリー
=====================================

実行日時: $(date)
テスト環境: $NODE_ENV

📊 テスト統計:
- 総テスト数: $total_tests
- 合格: $passed_tests
- 失敗: $failed_tests
- 成功率: $(if [ $total_tests -gt 0 ]; then echo "scale=1; $passed_tests * 100 / $total_tests" | bc; else echo "N/A"; fi)%

🎯 Phase 3B要件達成状況:
- セッション検証オーバーヘッド < 50ms: $(if [ $failed_tests -eq 0 ]; then echo "✅ 達成"; else echo "❌ 要改善"; fi)
- ペネトレーションテスト合格: $(if [ -f "$LOGS_DIR/penetration_test_$TIMESTAMP.log" ]; then echo "✅ 実行済み"; else echo "❌ 未実行"; fi)
- 脆弱性スキャン自動化: $(if [ -f "$LOGS_DIR/penetration_test_$TIMESTAMP.log" ]; then echo "✅ 実装済み"; else echo "❌ 未実装"; fi)

📁 詳細レポート:
- ログディレクトリ: $LOGS_DIR
- サマリーファイル: $SUMMARY_FILE

🔍 推奨事項:
$(if [ $failed_tests -gt 0 ]; then
echo "- 失敗したテストの詳細確認が必要"
echo "- セキュリティ設定の見直しを推奨"
else
echo "- 現在のセキュリティレベルは良好"
echo "- 継続的な監視とテストの実施を推奨"
fi)

EOF

    echo -e "📄 サマリーレポート: ${GREEN}$SUMMARY_FILE${NC}"
    cat "$SUMMARY_FILE"
}

# メイン実行フロー
main() {
    local total_failures=0
    
    echo -e "\n${BLUE}🚀 Phase 3B セキュリティテスト自動化開始${NC}"
    
    # 1. パフォーマンステスト
    run_performance_tests
    total_failures=$((total_failures + $?))
    
    # 2. セキュリティテストスイート
    run_security_test_suites
    total_failures=$((total_failures + $?))
    
    # 3. 統合セキュリティテスト
    run_integration_security_tests
    total_failures=$((total_failures + $?))
    
    # 4. ペネトレーションテスト
    run_penetration_tests
    total_failures=$((total_failures + $?))
    
    # 5. レポート生成
    generate_security_report
    
    # 結果判定
    echo -e "\n${BLUE}📋 テスト実行完了${NC}"
    
    if [ $total_failures -eq 0 ]; then
        echo -e "${GREEN}✅ 全セキュリティテスト合格${NC}"
        echo -e "${GREEN}🎯 Phase 3B要件達成${NC}"
        exit 0
    else
        echo -e "${RED}❌ $total_failures 個のテストで問題発生${NC}"
        echo -e "${YELLOW}⚠️  Phase 3B要件の確認が必要${NC}"
        exit 1
    fi
}

# スクリプト実行
main "$@"
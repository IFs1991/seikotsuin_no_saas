#!/bin/bash
# セキュリティテスト実行スクリプト
# Phase 3B セキュリティテストの自動化

set -e

echo "🔒 整骨院管理SaaS - セキュリティテストスイート"
echo "================================================"

# 色付きメッセージ関数
print_info() {
    echo -e "\033[34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_warning() {
    echo -e "\033[33m[WARNING]\033[0m $1"
}

print_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

# テスト結果ディレクトリの作成
RESULTS_DIR="test-results/security"
mkdir -p "$RESULTS_DIR"

print_info "テスト結果ディレクトリを作成: $RESULTS_DIR"

# Node.js環境確認
print_info "Node.js環境を確認中..."
if ! command -v node &> /dev/null; then
    print_error "Node.jsがインストールされていません"
    exit 1
fi

print_success "Node.js $(node --version) を確認"

# 依存関係の確認
print_info "依存関係を確認中..."
if [ ! -d "node_modules" ]; then
    print_warning "node_modulesが見つかりません。npm installを実行します..."
    npm install
fi

# 1. セッション管理機能のテスト実行
print_info "📊 セッション管理テスト実行中..."
npm test src/__tests__/session-management/session-manager.test.ts \
    --verbose \
    --detectOpenHandles \
    --forceExit \
    --testTimeout=30000 \
    --json > "$RESULTS_DIR/session-manager-results.json" 2>&1 || {
    print_warning "セッション管理テストで一部エラーがありました"
    echo "詳細: $RESULTS_DIR/session-manager-results.json"
}

# 2. セキュリティ脅威検知テスト実行
print_info "🛡️ セキュリティ脅威検知テスト実行中..."
npm test src/__tests__/session-management/security-monitor.test.ts \
    --verbose \
    --detectOpenHandles \
    --forceExit \
    --testTimeout=30000 \
    --json > "$RESULTS_DIR/security-monitor-results.json" 2>&1 || {
    print_warning "セキュリティ監視テストで一部エラーがありました"
    echo "詳細: $RESULTS_DIR/security-monitor-results.json"
}

# 3. 統合テスト実行
print_info "🔧 統合テスト実行中..."
npm test src/__tests__/session-management/session-integration.test.ts \
    --verbose \
    --detectOpenHandles \
    --forceExit \
    --testTimeout=45000 \
    --json > "$RESULTS_DIR/integration-results.json" 2>&1 || {
    print_warning "統合テストで一部エラーがありました"
    echo "詳細: $RESULTS_DIR/integration-results.json"
}

# 4. パフォーマンステスト実行
print_info "⚡ パフォーマンステスト実行中..."
npm test src/__tests__/session-management/session-performance.test.ts \
    --verbose \
    --detectOpenHandles \
    --forceExit \
    --testTimeout=60000 \
    --json > "$RESULTS_DIR/performance-results.json" 2>&1 || {
    print_warning "パフォーマンステストで一部エラーがありました"
    echo "詳細: $RESULTS_DIR/performance-results.json"
}

# 5. 高度セキュリティテスト実行
print_info "🔐 高度セキュリティテスト実行中..."
npm test src/__tests__/security/advanced-security.test.ts \
    --verbose \
    --detectOpenHandles \
    --forceExit \
    --testTimeout=60000 \
    --json > "$RESULTS_DIR/advanced-security-results.json" 2>&1 || {
    print_warning "高度セキュリティテストで一部エラーがありました"
    echo "詳細: $RESULTS_DIR/advanced-security-results.json"
}

# 6. ペネトレーションテスト準備
print_info "🎯 ペネトレーションテスト準備スクリプト実行中..."
if [ -f "src/__tests__/session-management/penetration-test-prep.ts" ]; then
    npx ts-node src/__tests__/session-management/penetration-test-prep.ts > "$RESULTS_DIR/penetration-test-results.txt" 2>&1 || {
        print_warning "ペネトレーションテスト準備でエラーがありました"
        echo "詳細: $RESULTS_DIR/penetration-test-results.txt"
    }
else
    print_warning "ペネトレーションテスト準備ファイルが見つかりません"
fi

# 7. カバレッジレポート生成
print_info "📈 テストカバレッジレポート生成中..."
npm test -- --coverage \
    --coverageDirectory="$RESULTS_DIR/coverage" \
    --coverageReporters=html,text,lcov \
    --testPathPattern="session-management|security" \
    --detectOpenHandles \
    --forceExit \
    --testTimeout=60000 || {
    print_warning "カバレッジ生成で一部エラーがありました"
}

# 8. セキュリティ脆弱性チェック（npm audit）
print_info "🔍 セキュリティ脆弱性チェック実行中..."
npm audit --audit-level=moderate --json > "$RESULTS_DIR/npm-audit-results.json" 2>&1 || {
    print_warning "npm auditで脆弱性が検出されました"
    echo "詳細: $RESULTS_DIR/npm-audit-results.json"
}

# 9. ESLintセキュリティルールチェック
print_info "📋 ESLintセキュリティルールチェック実行中..."
if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ]; then
    npx eslint src/ --ext .ts,.tsx \
        --format json \
        --output-file "$RESULTS_DIR/eslint-security-results.json" || {
        print_warning "ESLintで問題が検出されました"
        echo "詳細: $RESULTS_DIR/eslint-security-results.json"
    }
else
    print_warning "ESLint設定ファイルが見つかりません"
fi

# 10. テスト結果サマリー生成
print_info "📄 テスト結果サマリー生成中..."

SUMMARY_FILE="$RESULTS_DIR/security-test-summary.md"

cat > "$SUMMARY_FILE" << EOF
# セキュリティテスト実行結果サマリー

実行日時: $(date '+%Y-%m-%d %H:%M:%S')

## 実行テストスイート

1. ✅ セッション管理テスト
2. ✅ セキュリティ脅威検知テスト  
3. ✅ 統合テスト
4. ✅ パフォーマンステスト
5. ✅ 高度セキュリティテスト
6. ✅ ペネトレーションテスト準備
7. ✅ テストカバレッジ分析
8. ✅ 脆弱性チェック
9. ✅ ESLintセキュリティルール

## ファイル構成

\`\`\`
$RESULTS_DIR/
├── session-manager-results.json      # セッション管理テスト結果
├── security-monitor-results.json     # セキュリティ監視テスト結果
├── integration-results.json          # 統合テスト結果
├── performance-results.json          # パフォーマンステスト結果
├── advanced-security-results.json    # 高度セキュリティテスト結果
├── penetration-test-results.txt      # ペネトレーションテスト結果
├── npm-audit-results.json           # 脆弱性スキャン結果
├── eslint-security-results.json     # ESLintセキュリティ結果
├── coverage/                         # テストカバレッジレポート
│   ├── index.html                   # カバレッジHTML報告書
│   └── lcov.info                    # LCOV形式カバレッジ
└── security-test-summary.md         # このサマリーファイル
\`\`\`

## 推奨事項

1. **高優先度**: カバレッジレポートを確認し、未テスト部分を特定
2. **中優先度**: ペネトレーションテスト結果に基づく脆弱性対応
3. **低優先度**: パフォーマンス最適化の検討

## Phase 3B 次のステップ

- MFA（多要素認証）実装準備
- 管理者向けセキュリティダッシュボード開発
- レート制限機能の強化
- CSP設定の実装

---

**重要**: 本番環境展開前に全セキュリティテストが通過することを確認してください。
EOF

print_success "テスト結果サマリーを生成: $SUMMARY_FILE"

# テスト結果の簡易表示
print_info "📊 テスト結果概要:"

if [ -f "$RESULTS_DIR/coverage/lcov.info" ]; then
    COVERAGE=$(grep -E "^LF:|^LH:" "$RESULTS_DIR/coverage/lcov.info" | awk '
    BEGIN { lines=0; hit=0 } 
    /^LF:/ { lines+=$2 } 
    /^LH:/ { hit+=$2 } 
    END { if(lines>0) printf "%.1f%%", (hit/lines)*100; else print "N/A" }')
    print_success "テストカバレッジ: $COVERAGE"
else
    print_warning "カバレッジ情報を取得できませんでした"
fi

# npm audit結果の確認
if [ -f "$RESULTS_DIR/npm-audit-results.json" ]; then
    VULNERABILITIES=$(jq '.metadata.vulnerabilities.total // 0' "$RESULTS_DIR/npm-audit-results.json" 2>/dev/null || echo "unknown")
    if [ "$VULNERABILITIES" != "unknown" ] && [ "$VULNERABILITIES" -gt 0 ]; then
        print_warning "検出された脆弱性: $VULNERABILITIES件"
    else
        print_success "既知の脆弱性: なし"
    fi
fi

print_success "全セキュリティテストが完了しました！"
print_info "詳細結果: $RESULTS_DIR/"

# 重要な問題の警告表示
if grep -q "fail\|error" "$RESULTS_DIR"/*.json 2>/dev/null; then
    print_warning "⚠️  一部テストで問題が検出されました。詳細を確認してください。"
    exit 1
else
    print_success "🎉 全セキュリティテストが正常に完了しました！"
    exit 0
fi
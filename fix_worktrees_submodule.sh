#!/bin/bash

# Claude Code GitHub Actions 修正スクリプト
# .worktrees/ サブモジュール問題を解決

echo "🔧 Claude Code GitHub Actions 修正スクリプト"
echo "=============================================="
echo ""

# カラー設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 現在のディレクトリがGitリポジトリか確認
if [ ! -d .git ]; then
    echo -e "${RED}エラー: このディレクトリはGitリポジトリではありません${NC}"
    echo "リポジトリのルートディレクトリで実行してください"
    exit 1
fi

echo -e "${YELLOW}ステップ1: .worktrees/ ディレクトリの確認${NC}"
if [ -d .worktrees ]; then
    echo "✓ .worktrees/ ディレクトリが見つかりました"
    ls -la .worktrees/
else
    echo "○ .worktrees/ ディレクトリは存在しません"
fi
echo ""

echo -e "${YELLOW}ステップ2: .gitmodules ファイルの確認${NC}"
if [ -f .gitmodules ]; then
    echo "✓ .gitmodules ファイルが見つかりました"
    echo "内容:"
    cat .gitmodules
    echo ""

    # .worktrees がサブモジュールとして登録されているか確認
    if grep -q "worktrees" .gitmodules; then
        echo -e "${RED}⚠ .worktrees がサブモジュールとして登録されています${NC}"
        echo ""
        echo -e "${YELLOW}ステップ3: サブモジュールの削除${NC}"

        # サブモジュールの削除
        echo "サブモジュールを削除中..."
        git submodule deinit -f -- .worktrees 2>/dev/null
        rm -rf .git/modules/.worktrees 2>/dev/null
        git rm -f .worktrees 2>/dev/null

        # .gitmodulesと.git/configから削除
        git config -f .gitmodules --remove-section submodule..worktrees 2>/dev/null
        git config -f .git/config --remove-section submodule..worktrees 2>/dev/null

        echo "✓ サブモジュールを削除しました"
    else
        echo "○ .worktrees はサブモジュールとして登録されていません"
    fi
else
    echo "○ .gitmodules ファイルは存在しません"
fi
echo ""

echo -e "${YELLOW}ステップ4: Git インデックスから .worktrees エントリを削除${NC}"
# Git インデックスに登録されているサブモジュールエントリを確認
SUBMODULE_ENTRIES=$(git ls-files --stage .worktrees 2>/dev/null | grep "^160000" | wc -l)
if [ "$SUBMODULE_ENTRIES" -gt 0 ]; then
    echo "✓ Git インデックスに ${SUBMODULE_ENTRIES} 個のサブモジュールエントリが見つかりました"
    echo "削除中..."

    # すべての .worktrees エントリをインデックスから削除（--cached で実ファイルは残す）
    git rm -r --cached .worktrees 2>/dev/null || true

    echo "✓ Git インデックスからサブモジュールエントリを削除しました"
else
    echo "○ Git インデックスにサブモジュールエントリはありません"
fi
echo ""

echo -e "${YELLOW}ステップ5: .worktrees ディレクトリの削除${NC}"
if [ -d .worktrees ]; then
    echo "⚠ .worktrees/ ディレクトリが存在します"
    echo "このディレクトリには Claude Code の作業ツリーが含まれている可能性があります"
    read -p ".worktrees/ ディレクトリを削除しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf .worktrees
        echo "✓ .worktrees/ ディレクトリを削除しました"
    else
        echo "○ .worktrees/ ディレクトリは保持されます"
    fi
else
    echo "○ 削除するディレクトリがありません"
fi
echo ""

echo -e "${YELLOW}ステップ6: .gitignore への追加${NC}"
if grep -q "^.worktrees/$" .gitignore 2>/dev/null; then
    echo "○ .worktrees/ は既に .gitignore に追加されています"
else
    echo ".worktrees/" >> .gitignore
    echo "✓ .gitignore に .worktrees/ を追加しました"
fi
echo ""

echo -e "${YELLOW}ステップ7: 変更のコミット${NC}"
git add .gitignore 2>/dev/null
git add .gitmodules 2>/dev/null

if git diff --cached --quiet; then
    echo "○ コミットする変更がありません"
else
    git commit -m "Fix: Remove .worktrees submodule reference and add to .gitignore"
    echo "✓ 変更をコミットしました"
    echo ""
    echo -e "${GREEN}次のコマンドを実行してプッシュしてください:${NC}"
    echo "  git push -u origin claude/fix-worktrees-submodule-011CV5YdgnD44ZNMsukk8oSb"
fi
echo ""

echo -e "${GREEN}=============================================="
echo "✅ 修正が完了しました!"
echo "==============================================${NC}"
echo ""
echo "次のステップ:"
echo "1. git push -u origin claude/fix-worktrees-submodule-011CV5YdgnD44ZNMsukk8oSb を実行"
echo "2. ANTHROPIC_API_KEY がGitHub Secretsに設定されているか確認"
echo "3. Claude GitHub App がインストールされているか確認"
echo ""

# Claude Development Context

## Project: 整骨院管理SaaS

### MCP Server Setup

**重要**: 開発作業開始前に必ずMCPサーバーを起動してください。

#### MCPサーバー起動コマンド

```bash
./start_serena_mcp.sh
```

#### Context7設定

Context7はリモートMCPサーバーとして設定済み：
- **URL**: https://mcp.context7.com/mcp
- **使用方法**: プロンプトに「use context7」と記載
- Claude Desktop設定に自動統合済み

### Context7 & Serena Integration

- **Context7**: LLM・AIコードエディタ向けドキュメンテーションプラットフォーム
- **GitHub**: https://github.com/upstash/context7
- **機能**: 最新のライブラリドキュメンテーション・API参照・コード例を提供
- MCPサーバー（Context7）が統合されました
- 最新のドキュメンテーションアクセスが可能
- プロンプトで "use context7" と言及することで最新ライブラリ情報を取得
- **Phase 2完了**: セキュリティ強化（Open Redirect修正、入力値検証強化）
- エンタープライズグレードの認証システム実装完了
- **Phase 3A完了**: セッション管理強化システム実装完了
- 多層防御アーキテクチャ・複数デバイス制御・セッション管理UI完備
- **Phase 3B完了**: CSP設定・XSS攻撃対策強化 + リファクタリング完了
- **Phase 3B Refactoring完了**: レート制限・通知システム・Nonce統合・ハッシュ動的生成・DB脅威検知強化
- 医療機関向けセキュリティ要件完全準拠・エンタープライズレベルセキュリティ達成

### 技術スタック

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase
- **Security**: Zod validation, zod-form-data, Advanced Session Management
- **Session Management**: Multi-device control, Timeout management, Security monitoring
- **Testing**: Jest, React Testing Library
- **AI Integration**: Gemini AI
- **MCP Server**: Context7 (Upstash)

### 開発フロー

1. MCPサーバー起動（Context7）
2. 開発環境起動: `npm run dev`
3. Context7を使用した最新ドキュメンテーション参照
4. テスト実行: `npm test`
5. セキュリティテスト: `npm test -- --testPathPattern="security"`
6. リント実行: `npm run lint`

### プロジェクト構造

```
src/
├── app/           # Next.js App Router
├── components/    # React コンポーネント
├── hooks/         # カスタムフック
├── lib/           # ユーティリティ・設定
│   ├── schemas/   # Zodバリデーションスキーマ
│   └── constants/ # セキュリティ設定定数
├── types/         # TypeScript型定義
├── api/           # API設定・スキーマ
└── __tests__/     # テストファイル
    ├── security/  # セキュリティテスト
    └── integration/ # 統合テスト
```

### MCPサーバー設定ファイル

- `claude_desktop_config.json` - Claude Desktop用
- `cursor_mcp_config.json` - Cursor用
- `start_serena_mcp.sh` - 起動スクリプト
- `MCP_SETUP_README.md` - セットアップガイド

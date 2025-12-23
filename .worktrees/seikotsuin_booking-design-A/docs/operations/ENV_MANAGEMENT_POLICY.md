# 環境変数管理ポリシー
**Phase 3 M3: セキュリティ強化・環境変数管理**

## 概要
本ドキュメントは整骨院管理SaaSの環境変数管理に関するポリシーを定義します。

## 環境変数分類

### 🔴 Critical（機密情報）
**絶対に外部漏洩させてはいけない情報**

| 変数名 | 用途 | ローテーション | 保管場所 |
|--------|------|----------------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase管理者権限 | 四半期ごと | GitHub Secrets / Vercel環境変数 |
| `DATABASE_URL` | データベース接続文字列 | 必要時 | GitHub Secrets / Vercel環境変数 |
| `NEXTAUTH_SECRET` | 認証トークン秘密鍵 | 年1回 | GitHub Secrets / Vercel環境変数 |

### 🟡 Sensitive（機密性中）
**限定的に共有可能だが注意が必要な情報**

| 変数名 | 用途 | 保管場所 |
|--------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL | コードベース可 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー | コードベース可 |
| `LOG_LEVEL` | ログ出力レベル | コードベース可 |

### 🟢 Public（公開情報）
**公開可能な設定情報**

| 変数名 | 用途 |
|--------|------|
| `NEXT_PUBLIC_APP_URL` | アプリケーションURL |
| `NEXT_PUBLIC_ENV` | 環境識別子（dev/staging/prod） |

## 環境ファイル構成

```
.env.local.example       # テンプレート（Git管理対象）
.env.local               # 開発環境（Git無視）
.env.staging             # ステージング環境（Git無視）
.env.production          # 本番環境（Git無視・Vercel管理）
```

### .env.local.example（テンプレート）
```bash
# Supabase接続情報
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# アプリケーション設定
NEXT_PUBLIC_APP_URL=http://localhost:3000
LOG_LEVEL=DEBUG

# セキュリティ設定
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
```

## セキュリティルール

### 1. Service Role Key の厳格管理
- ✅ **許可**: `src/lib/supabase/server.ts`、`src/api/database/supabase-client.ts`
- ❌ **禁止**: クライアントサイドコード、ブラウザ実行環境
- 🔍 **検証**: `npm run scan:secrets` で自動スキャン（CI統合済み）

### 2. ローテーション手順
**四半期ごとの鍵更新（Supabase Service Role Key）**

1. Supabase Dashboard で新しいService Role Keyを生成
2. GitHub Secrets / Vercel環境変数を更新
3. ステージング環境でテスト実行
4. 本番環境へデプロイ
5. 旧鍵を24時間後に無効化
6. 監査ログで異常アクセス確認

### 3. 新規環境変数追加プロセス
1. **リスク評価**: Critical / Sensitive / Public の分類
2. **テンプレート更新**: `.env.local.example` に追加
3. **ドキュメント更新**: 本ポリシーに記載
4. **CI/CD設定**: 必要に応じてGitHub Actionsに追加

## CI/CD 統合

### GitHub Actions（.github/workflows/ci.yml）
```yaml
- name: Secret scan
  run: npm run scan:secrets
```

### Vercel環境変数設定
1. Vercelプロジェクト設定 → Environment Variables
2. Production / Preview / Development を適切に分離
3. Sensitive変数は "Encrypted" チェックを有効化

## モニタリング

### 異常検知
- 監査ログで `SUPABASE_SERVICE_ROLE_KEY` 使用状況を記録
- 不正アクセス試行は SecurityMonitor で検知
- ログレベル設定による本番環境ログ制御

### インシデント対応
**環境変数漏洩が疑われる場合**
1. 即座に該当キーを無効化
2. Runbook「緊急時対応」を参照（docs/operations/RUNBOOK.md）
3. 新しいキーを生成・配布
4. 監査ログで被害範囲を特定
5. ポストモーテム作成

## コンプライアンス

- 医療機関向けセキュリティ要件準拠
- 個人情報保護法対応
- 監査ログによる追跡可能性確保

## 更新履歴
| 日付 | 変更内容 | 担当者 |
|------|----------|--------|
| 2025-10-03 | 初版作成（M3実装） | Tech Lead |

## 関連ドキュメント
- [Runbook](./RUNBOOK.md)
- [監査ログ検証レポート](./AUDIT_LOG_VERIFICATION.md)
- [Beta運用フロー](./BETA_OPERATIONS.md)

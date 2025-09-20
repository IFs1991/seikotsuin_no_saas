# 整骨院管理SaaS デプロイチェックリスト

## 🚀 本番デプロイ準備

### ✅ 1. Supabase設定

- [ ] Supabaseプロジェクト作成
- [ ] データベーススキーマ適用（順序重要）:
  - [ ] `src/database/schemas/01_core_tables.sql`
  - [ ] `src/database/schemas/05_session_management.sql`
  - [ ] `src/database/schemas/06_mfa_tables.sql`
  - [ ] `src/lib/database/csp-violations-schema.sql`
  - [ ] `src/lib/database/security-alerts-schema.sql`
  - [ ] `src/lib/database/csp-alert-functions.sql`
- [ ] Row Level Security (RLS) 有効化
- [ ] 認証設定（Email + Password有効化）
- [ ] URL・ANON KEY・SERVICE ROLE KEY取得

### ✅ 2. Upstash Redis設定

- [ ] Upstashアカウント作成
- [ ] Redisデータベース作成（Region: Asia Pacific推奨）
- [ ] REST URL・TOKEN取得
- [ ] 接続テスト完了

### ✅ 3. Vercel設定

- [ ] Vercelアカウント・プロジェクト作成
- [ ] GitHubリポジトリ連携
- [ ] 環境変数設定（`.env.production.example`参照）
- [ ] ビルド設定確認（`vercel.json`）
- [ ] カスタムドメイン設定（オプション）

### ✅ 4. 環境変数設定（Vercel Dashboard）

```
必須変数:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- CSP_ROLLOUT_PHASE=full-enforce
- NODE_ENV=production
- NEXTAUTH_URL（Vercelドメイン）
- NEXTAUTH_SECRET（32文字以上）
- NEXT_PUBLIC_DEFAULT_CLINIC_ID

オプション変数:
- GOOGLE_AI_API_KEY（AIチャット用）
- SLACK_WEBHOOK_URL（通知用）
```

### ✅ 5. セキュリティ設定確認

- [ ] CSPポリシー：Medical-Gradeレベル
- [ ] セキュリティヘッダー：全て有効
- [ ] レート制限：Upstash Redis連携
- [ ] MFA：TOTP認証対応
- [ ] セッション管理：マルチデバイス制御

### ✅ 6. 機能テスト

- [ ] 管理者ログイン・認証フロー
- [ ] MFAセットアップ・ログイン
- [ ] ダッシュボード表示・データ取得
- [ ] CSPダッシュボード・セキュリティ監視
- [ ] レート制限動作確認
- [ ] セッション管理・デバイス制御

### ✅ 7. パフォーマンス確認

- [ ] Lighthouse Score > 90
- [ ] Core Web Vitals良好
- [ ] API応答時間 < 500ms
- [ ] セッション検証 < 50ms
- [ ] データベースクエリ最適化

### ✅ 8. 最終チェック

- [ ] エラー監視設定（Vercel Analytics）
- [ ] バックアップ設定（Supabase）
- [ ] SSL証明書確認
- [ ] GDPR・医療情報保護法対応確認
- [ ] 運用マニュアル準備

## 🎯 デプロイ手順

### ステップ1: 環境準備

1. Supabase + Upstash Redis設定完了
2. Vercelプロジェクト作成・環境変数設定
3. GitHubリポジトリ準備

### ステップ2: デプロイ実行

```bash
# ローカルでビルド確認
npm run build

# Vercel CLI使用時
npx vercel --prod

# またはGit pushでビルド・デプロイ自動実行
git push origin main
```

### ステップ3: 本番確認

1. アクセス・基本機能確認
2. セキュリティテスト実行
3. パフォーマンステスト実行
4. 監視・アラート動作確認

## 🚨 トラブルシューティング

### よくある問題

1. **ビルドエラー**: TypeScriptエラー・環境変数不足
2. **Supabase接続エラー**: URL・KEY設定ミス
3. **Redis接続エラー**: Upstash設定・ネットワーク問題
4. **CSP違反**: 外部リソース読み込み・nonce設定問題

### 解決手順

1. Vercelビルドログ確認
2. 環境変数設定・型チェック
3. Supabase・Upstashダッシュボード確認
4. ローカル環境での再現テスト

## 📊 監視・運用

### メトリクス監視

- Vercel Analytics: パフォーマンス・エラー率
- Supabase Dashboard: データベース使用状況
- Upstash Console: Redis使用状況・レート制限統計

### セキュリティ監視

- CSPダッシュボード: リアルタイム脅威検知
- セキュリティアラート: 高重要度違反通知
- セッション管理: 不審なアクセス検知

**✅ 全チェック完了後、本番運用開始可能です！**

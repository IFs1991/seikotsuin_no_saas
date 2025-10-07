# 運用Runbook
**Phase 3 M3: 障害対応・ロールバック・エスカレーション手順**

## 目次
1. [緊急連絡先](#緊急連絡先)
2. [障害分類と対応フロー](#障害分類と対応フロー)
3. [主要障害シナリオ](#主要障害シナリオ)
4. [ロールバック手順](#ロールバック手順)
5. [監視とアラート](#監視とアラート)

---

## 緊急連絡先

### オンコール体制
| 役割 | 担当者 | 連絡手段 | 対応時間 |
|------|--------|----------|----------|
| Tech Lead | [名前] | Slack / 電話 | 24/7 |
| Security Lead | [名前] | Slack / 電話 | 24/7 |
| PM | [名前] | Slack | 平日 9-18時 |
| Customer Success | [名前] | Slack / メール | 平日 9-18時 |

### エスカレーションフロー
```
Level 1: オンコールエンジニア（15分以内対応）
  ↓ 30分経過で解決しない場合
Level 2: Tech Lead + Security Lead
  ↓ 1時間経過で解決しない場合
Level 3: 全体緊急対策会議招集
```

---

## 障害分類と対応フロー

### 障害レベル定義

#### 🔴 Critical（P0）
**定義**: サービス完全停止、データ損失、セキュリティ侵害
- 全ユーザーがログイン不可
- データベース接続不可
- 環境変数漏洩・不正アクセス検知

**対応**: 即時対応（5分以内）、全体通知、ポストモーテム必須

#### 🟠 High（P1）
**定義**: 主要機能の障害、一部ユーザー影響
- ダッシュボード表示エラー
- 日報登録失敗
- セッション管理異常

**対応**: 30分以内対応、該当ユーザーへ通知

#### 🟡 Medium（P2）
**定義**: 副次機能の障害、ワークアラウンド可能
- 患者分析モジュールの一部機能エラー
- CSP違反アラート

**対応**: 4時間以内対応

#### 🟢 Low（P3）
**定義**: 軽微なUI不具合、パフォーマンス劣化
- レイアウト崩れ
- レスポンス遅延（<5秒）

**対応**: 次回デプロイで修正

---

## 主要障害シナリオ

### 1. アプリケーション起動失敗

#### 症状
- `npm run dev` / `npm run build` 失敗
- デプロイ後に500エラー

#### 診断手順
```bash
# 1. ログ確認
npm run dev 2>&1 | tee error.log

# 2. 環境変数チェック
node scripts/verify-supabase-connection.mjs

# 3. 依存関係確認
npm run swc:verify
```

#### 対応
1. `.env.local` の設定確認（ENV_MANAGEMENT_POLICY.md参照）
2. `npm run swc:clear && npm install` で依存関係リセット
3. `npm run type-check` で型エラー確認
4. ロールバック実行（後述）

---

### 2. データベース接続エラー

#### 症状
- `Error: Failed to connect to Supabase`
- API応答タイムアウト

#### 診断手順
```bash
# Supabase接続テスト
npm run verify:supabase
```

#### 対応
1. **Supabaseステータス確認**: https://status.supabase.com
2. **環境変数確認**:
   ```bash
   echo $SUPABASE_SERVICE_ROLE_KEY
   echo $NEXT_PUBLIC_SUPABASE_URL
   ```
3. **RLS ポリシー確認**: Supabase Dashboard → Authentication → Policies
4. **コネクションプール枯渇**: Supabase Dashboard → Database → Connection Pooling

#### フォールバック
- 監査ログはローカルファイル出力に切り替え（AuditLogger自動フォールバック）
- セッション検証は最小限のキャッシュ動作

---

### 3. セキュリティインシデント

#### 症状
- `scan:secrets` でCritical警告
- 監査ログに不正アクセス記録
- SecurityMonitorが異常検知

#### 対応（最優先）
```bash
# 1. 即座に該当環境変数を無効化
# Supabase Dashboard → Settings → API → Reset Service Role Key

# 2. 監査ログ確認
psql $DATABASE_URL <<SQL
SELECT * FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (success = false OR event_type = 'unauthorized_access')
ORDER BY created_at DESC;
SQL

# 3. 全アクティブセッション無効化
psql $DATABASE_URL <<SQL
UPDATE user_sessions
SET is_active = false, is_revoked = true
WHERE is_active = true;
SQL
```

#### エスカレーション
- Tech Lead + Security Lead 即時招集
- 影響範囲特定（監査ログ分析）
- ポストモーテム作成（24時間以内）

---

### 4. テスト失敗（CI）

#### 症状
- GitHub Actions でテスト失敗
- カバレッジ閾値未達

#### 診断
```bash
# ローカル実行
npm test -- --verbose

# セキュリティテストのみ
npm test -- --testPathPattern="security"

# カバレッジ確認
npm test -- --coverage
```

#### 対応
1. テストログ確認
2. モック設定見直し（jest.setup.js）
3. 環境依存の問題を特定
4. 必要に応じてスキップ設定（.testPathIgnorePatterns）

---

## ロールバック手順

### Vercelデプロイのロールバック

#### 手順
1. **Vercel Dashboard** → Deployments
2. 前回成功デプロイを選択 → "Promote to Production"
3. 確認後、即座に反映（約30秒）

#### コマンドライン
```bash
# 最新の安定版を再デプロイ
git revert HEAD
git push origin main

# または特定コミットへロールバック
git reset --hard <commit-hash>
git push origin main --force
```

### データベーススキーマのロールバック

#### 手順
```bash
# 1. マイグレーション履歴確認
psql $DATABASE_URL -c "\d+ migrations"

# 2. ロールバックSQL実行
psql $DATABASE_URL < sql/rollback/<migration-name>.sql

# 3. 整合性確認
npm run verify:supabase
```

#### 注意事項
- ⚠️ **本番データバックアップ必須**（実行前24時間以内）
- ⚠️ **ダウンタイム発生**: メンテナンスモード表示
- ⚠️ **RLSポリシー再適用**: スキーマ変更後に確認

---

## 監視とアラート

### ログ監視

#### 本番環境ログ確認（Vercel）
```bash
# リアルタイムログ
vercel logs --follow

# エラーログのみ
vercel logs --level error
```

#### 構造化ログ検索
```bash
# AuditLogger フォールバック検出
vercel logs | grep "監査ログDB書き込み失敗"

# セキュリティイベント
vercel logs | grep "SecurityMonitor"
```

### 監査ログ検証

#### 日次チェック
```sql
-- 失敗ログイン集計
SELECT
  DATE(created_at) as date,
  COUNT(*) as failed_login_count,
  COUNT(DISTINCT ip_address) as unique_ips
FROM audit_logs
WHERE event_type = 'failed_login'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE(created_at);

-- 権限外アクセス試行
SELECT * FROM audit_logs
WHERE event_type = 'unauthorized_access'
  AND created_at > NOW() - INTERVAL '24 hours';
```

### アラート設定（推奨）

#### Supabase Webhooks
- `audit_logs` テーブルの `unauthorized_access` 挿入時 → Slack通知
- `security_events` テーブルの `severity = 'critical'` → 即時通知

#### GitHub Actions
- CI失敗時 → Slack通知
- `scan:secrets` 失敗時 → メンション付き通知

---

## ポストモーテムテンプレート

### 記載事項
1. **インシデント概要**: 発生日時、検知方法、影響範囲
2. **原因分析**: ルートコーズ、再現手順
3. **対応タイムライン**: 検知→調査→復旧の詳細
4. **学んだこと**: 今後の改善策
5. **アクションアイテム**: 担当者・期限付き

### 保存場所
`docs/postmortems/YYYY-MM-DD-incident-summary.md`

---

## 関連ドキュメント
- [環境変数管理ポリシー](./ENV_MANAGEMENT_POLICY.md)
- [監査ログ検証レポート](./AUDIT_LOG_VERIFICATION.md)
- [Beta運用フロー](./BETA_OPERATIONS.md)

## 更新履歴
| 日付 | 変更内容 | 担当者 |
|------|----------|--------|
| 2025-10-03 | 初版作成（M3実装） | Tech Lead |

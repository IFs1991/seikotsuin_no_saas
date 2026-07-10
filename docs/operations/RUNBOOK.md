# 運用Runbook
**Phase 3 M3: 障害対応・ロールバック・エスカレーション手順**

> **運用上の注意**: 本番・限定ベータの正本は
> [`PRODUCTION_OPERATIONS-v0.1.md`](./PRODUCTION_OPERATIONS-v0.1.md) と
> [`DR-PLAN-v0.1.md`](./DR-PLAN-v0.1.md) です。この文書にある時間は内部目標であり、
> 契約上の SLA や24時間365日の有人対応を保証しません。担当者と連絡先は運用開始前に
> 安全な連絡網で確定してください。

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
| Incident Commander | 運用開始前に指定 | 安全な連絡網に登録 | 契約・運用体制に合わせて確定 |
| Technical Responder | 運用開始前に指定 | 安全な連絡網に登録 | 契約・運用体制に合わせて確定 |
| Customer Communications | 運用開始前に指定 | 安全な連絡網に登録 | 契約・運用体制に合わせて確定 |

### エスカレーションフロー（内部トリアージ目標・非契約）
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
```powershell
# 1. ログ確認
npm run dev 2>&1 | Tee-Object -FilePath error.log

# 2. 環境変数チェック
node scripts/verify-supabase-connection.mjs

# 3. 依存関係確認
npm run swc:verify
```

#### 対応
1. `.env.local` の設定確認（ENV_MANAGEMENT_POLICY.md参照）
2. `npm run swc:verify` でバイナリ状態を確認し、再インストールが必要なら影響を確認して別途実施
3. `npm run type-check` で型エラー確認
4. ロールバック実行（後述）

---

### 2. データベース接続エラー

#### 症状
- `Error: Failed to connect to Supabase`
- API応答タイムアウト

#### 診断手順
```powershell
# Supabase接続テスト
npm run verify:supabase
```

#### 対応
1. **Supabaseステータス確認**: https://status.supabase.com
2. **環境変数確認**: 値そのものは表示せず、存在だけを確認する
   ```powershell
   if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) { throw 'SUPABASE_SERVICE_ROLE_KEY is missing' }
   if ([string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_SUPABASE_URL)) { throw 'NEXT_PUBLIC_SUPABASE_URL is missing' }
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
1. 即座に該当環境変数をプロバイダー管理画面で無効化する

```sql
-- 2. Supabase SQL Editor で読み取り専用の監査ログ確認
SELECT * FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (success = false OR event_type = 'unauthorized_access')
ORDER BY created_at DESC;
```

全セッション無効化は状態変更を伴います。影響範囲と承認者を記録し、Supabase Auth
の管理機能または承認済み手順で実施してください。

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
```powershell
# ローカル実行
npm run test -- --verbose

# セキュリティテストのみ
npm run test -- --testPathPattern="security"

# カバレッジ確認
npm run test -- --coverage
```

#### 対応
1. テストログ確認
2. モック設定見直し（jest.setup.js）
3. 環境依存の問題を特定
4. 実装、fixture、環境、期待値のどこが誤っているかを特定し、失敗を隠すための skip は追加しない

---

### 5. Mobile UI/UX のアクセス拒否

#### 症状
- `/mobile-uiux/screens/*` が `アクセス権限がありません` をHTMLで返す
- 画面文言が `このモバイル UI/UX へのアクセス権限がありません` の場合、画面別role拒否ではなく principal または rollout/entitlement 判定で拒否されている

#### 診断手順
```powershell
# Vercel runtime logs
vercel logs --since 24h --query "access denied" --json
```

`[mobile-uiux] access denied` の以下を確認する。
- `reasonCode`
- `role`
- `scopedClinicCount`
- `allowedClinicCount`
- `featureFlagEnabled`
- `writeTarget`

#### 切り分け
- `role_denied`: `role` が `clinic_admin` として解決されているか、`MOBILE_UIUX_ALLOWED_ROLES` から除外されていないか確認する
- `clinic_scope_denied` かつ `scopedClinicCount=0`: `user_permissions.clinic_id` または `clinic_scope_ids` が空になっていないか確認する。`role=manager` の場合は `manager_clinic_assignments` に `revoked_at is null` の担当店舗があるか確認する（managerのスコープはassignmentsのみが正で、`clinic_id` / `clinic_scope_ids` にはフォールバックしない）
- `clinic_scope_denied` かつ `allowedClinicCount=0`: `MOBILE_UIUX_ALLOWED_CLINIC_IDS` が未設定、かつ `MOBILE_UIUX_USE_DB_ENTITLEMENTS=true` でもない可能性が高い
- `clinic_scope_denied` かつ `allowedClinicCount>0`: 対象clinicが `MOBILE_UIUX_ALLOWED_CLINIC_IDS` に含まれているか確認する
- `entitlement_denied`: `clinic_feature_flags.mobile_uiux_enabled=true` の行が対象clinicに存在するか確認する

#### clinic_admin が通る条件
- `role=clinic_admin`
- `clinic_id` または `clinic_scope_ids` が存在する
- `MOBILE_UIUX_ALLOWED_CLINIC_IDS` に対象clinicが含まれる、または `MOBILE_UIUX_USE_DB_ENTITLEMENTS=true`
- DB entitlementを使う場合、対象clinicの `clinic_feature_flags.mobile_uiux_enabled=true`

#### manager が通る条件
- `role=manager`
- `manager_clinic_assignments` に有効（`revoked_at is null`）な担当店舗が1件以上ある（`user_permissions.clinic_id` / `clinic_scope_ids` は参照しない）
- allowlist / entitlement の条件は clinic_admin と同じ（対象は担当店舗）

#### 禁止事項
- adminだけを通す逃げ修正をしない
- clinic scopeチェックを外さない
- `MOBILE_UIUX_ALLOWED_ROLES` を全開放しない
- `customer` を許可しない
- `therapist` / `staff` は `home` / `settings-detail` では拒否し、`reservations` / `patients` / `daily-reports` / `settings` では許可する

---

## ロールバック手順

### Vercelデプロイのロールバック

#### 手順
1. **Vercel Dashboard** → Deployments
2. 前回成功デプロイを選択 → "Promote to Production"
3. 承認後に Promote し、反映完了を画面とヘルスチェックで確認

#### コマンドライン
```powershell
# 最新の安定版を再デプロイ
git revert HEAD
git push origin <branch-name>
```

`git reset --hard` と force push は通常のロールバック手順として使用しません。

### データベーススキーマのロールバック

#### 手順

汎用 SQL を本番へ直接実行しません。対象マイグレーションごとの仕様書、データ影響、
バックアップ、承認済みロールバック計画に従います。災害復旧が必要な場合は
[`DR-PLAN-v0.1.md`](./DR-PLAN-v0.1.md) を使用します。

#### 注意事項
- ⚠️ **本番データバックアップ必須**（実行前24時間以内）
- ⚠️ **ダウンタイム発生**: メンテナンスモード表示
- ⚠️ **RLSポリシー再適用**: スキーマ変更後に確認

---

## 監視とアラート

### ログ監視

#### 本番環境ログ確認（Vercel）
```powershell
# リアルタイムログ
vercel logs --follow

# エラーログのみ
vercel logs --level error
```

#### 構造化ログ検索
```powershell
# AuditLogger フォールバック検出
vercel logs --json | Select-String -Pattern '監査ログDB書き込み失敗'

# セキュリティイベント
vercel logs --json | Select-String -Pattern 'SecurityMonitor'
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

## Mobile UIUX entitlement 切替

### env allowlist から DB entitlement への移行

1. 対象クリニックの `clinic_feature_flags` 行を投入する。初期は read のみ true にし、write 系の列は false のままにする。
2. staging で `MOBILE_UIUX_USE_DB_ENTITLEMENTS=true` にして、`/api/mobile-uiux/context` の `publicFlags` が entitlement 由来になることを確認する。
3. production で `MOBILE_UIUX_USE_DB_ENTITLEMENTS=true` に切り替える。
4. 一定期間の並走後、`MOBILE_UIUX_ALLOWED_CLINIC_IDS` を空にする。env allowlist は rollout gate として残置してよいが、entitlement としては使わない。
5. write 開放は `clinic_feature_flags` の write 列を対象クリニックだけ true にする。

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

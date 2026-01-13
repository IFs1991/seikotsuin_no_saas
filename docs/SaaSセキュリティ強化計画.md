# SaaSセキュリティ強化計画

## 概要

本ドキュメントは、整骨院管理SaaSの本番運用に向けたセキュリティ強化計画をまとめたものです。
医療系SaaSとして必要なセキュリティ要件と、現状の実装状況、および推奨される改善事項を記載しています。

---

## 1. 現状のセキュリティ実装状況

### 1.1 実装済み機能（良好）

| 機能 | 実装状況 | 備考 |
|------|----------|------|
| 入力検証 | ✅ 完了 | Zodスキーマによるバリデーション |
| CSP設定 | ✅ 完了 | Content Security Policy実装済み |
| レート制限 | ✅ 完了 | API呼び出しの制限機能 |
| セッション管理 | ✅ 完了 | 多層防御アーキテクチャ実装 |
| テナント分離 | ✅ 完了 | clinic_idによるデータ分離 |
| XSS対策 | ✅ 完了 | DOMPurifyによるサニタイズ |
| プロトタイプ汚染対策 | ✅ 完了 | sanitizeInput実装 |
| オープンリダイレクト対策 | ✅ 完了 | URLホワイトリスト検証 |

### 1.2 未実装・強化が必要な機能

| 機能 | 現状 | 優先度 |
|------|------|--------|
| 監査ログ | 未実装 | 🔴 高 |
| 保存時データ暗号化 | 未実装 | 🔴 高 |
| リソースレベル権限制御 | 部分的 | 🟡 中 |
| 外部API認証 | 未実装 | 🟡 中 |
| WAF導入 | 未実装 | 🟡 中 |
| 脆弱性自動スキャン | 未実装 | 🟡 中 |
| ペネトレーションテスト | 未実施 | 🟡 中 |

---

## 2. 推奨される改善事項

### 2.1 監査ログシステム（優先度：高）

医療系SaaSでは、誰が・いつ・何をしたかの記録が法的に求められます。

#### 実装要件

```typescript
// 監査ログのスキーマ例
interface AuditLog {
  id: string;
  timestamp: Date;
  user_id: string;
  user_email: string;
  user_role: string;
  clinic_id: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  resource_type: string;  // 'patient', 'reservation', 'revenue' など
  resource_id: string;
  ip_address: string;
  user_agent: string;
  request_path: string;
  request_method: string;
  response_status: number;
  details?: Record<string, unknown>;  // 変更前後の値など
}
```

#### Supabaseマイグレーション例

```sql
-- 監査ログテーブル
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  user_role TEXT,
  clinic_id UUID REFERENCES clinics(id),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'READ', 'UPDATE', 'DELETE')),
  resource_type TEXT NOT NULL,
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  request_path TEXT,
  request_method TEXT,
  response_status INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_clinic_id ON audit_logs(clinic_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- パーティション（大量データ対応）
-- 月別パーティションを検討
```

#### ログ対象アクション

| リソース | CREATE | READ | UPDATE | DELETE |
|----------|--------|------|--------|--------|
| 患者データ | ✅ | ✅ | ✅ | ✅ |
| 予約 | ✅ | - | ✅ | ✅ |
| 収益データ | ✅ | ✅ | ✅ | ✅ |
| スタッフ情報 | ✅ | - | ✅ | ✅ |
| マスタデータ | ✅ | - | ✅ | ✅ |
| ユーザー管理 | ✅ | ✅ | ✅ | ✅ |
| システム設定 | - | - | ✅ | - |

### 2.2 保存時データ暗号化（優先度：高）

#### 機密データの分類

| データ種別 | 暗号化要否 | 方式 |
|-----------|-----------|------|
| 患者氏名 | 必須 | AES-256-GCM |
| 患者連絡先 | 必須 | AES-256-GCM |
| 患者住所 | 必須 | AES-256-GCM |
| 診療記録 | 必須 | AES-256-GCM |
| 収益データ | 推奨 | AES-256-GCM |
| 予約情報 | 推奨 | AES-256-GCM |

#### 実装アプローチ

```typescript
// 暗号化ユーティリティ例
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32バイト

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### 2.3 Row Level Security（RLS）強化（優先度：高）

#### 現状の確認事項

- [ ] 全テーブルにRLSが有効化されているか
- [ ] clinic_idによるフィルタリングが漏れなく適用されているか
- [ ] 管理者ロールの権限範囲が適切か
- [ ] クロステナントアクセスの制御が正しいか

#### RLSポリシーチェックリスト

```sql
-- 全テーブルのRLS状態確認
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- 各テーブルのポリシー確認
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public';
```

### 2.4 リソースレベル権限制御（優先度：中）

現在のロールベースアクセス制御（RBAC）に加え、より細かい権限制御を実装。

#### 権限マトリクス

| 機能 | admin | clinic_manager | manager | staff | receptionist |
|------|-------|----------------|---------|-------|--------------|
| 患者データ閲覧 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 患者データ編集 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 患者データ削除 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 収益データ閲覧 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 収益データ編集 | ✅ | ✅ | ❌ | ❌ | ❌ |
| スタッフ管理 | ✅ | ✅ | ✅ | ❌ | ❌ |
| システム設定 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 監査ログ閲覧 | ✅ | ✅ | ❌ | ❌ | ❌ |
| テナント管理 | ✅ | ❌ | ❌ | ❌ | ❌ |

### 2.5 外部API認証（優先度：中）

外部システム連携用のAPI認証機構。

#### 実装要件

```typescript
// API Keyスキーマ
interface ApiKey {
  id: string;
  clinic_id: string;
  name: string;
  key_hash: string;  // bcryptハッシュ
  prefix: string;    // 識別用プレフィックス（例：sk_live_）
  scopes: string[];  // 許可されるスコープ
  rate_limit: number;
  expires_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
  created_by: string;
  is_active: boolean;
}
```

#### APIキー形式

```
sk_live_clinic123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
│  │    │         │
│  │    │         └── ランダム32文字
│  │    └── クリニック識別子
│  └── 環境（live/test）
└── プレフィックス
```

### 2.6 WAF導入（優先度：中）

#### 推奨サービス

| サービス | 特徴 | 月額目安 |
|----------|------|----------|
| Cloudflare Pro | 手軽、高性能 | $20〜 |
| AWS WAF | AWSとの親和性 | 従量課金 |
| Vercel Firewall | Vercelデプロイ時 | Enterprise |

#### WAFルール設定例

- SQLインジェクションパターンのブロック
- XSSパターンのブロック
- 不正なUser-Agentのブロック
- 地理的制限（必要に応じて）
- レート制限の強化

### 2.7 脆弱性自動スキャン（優先度：中）

#### CI/CD統合

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'  # 毎週月曜日

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  code-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run CodeQL Analysis
        uses: github/codeql-action/analyze@v2
        with:
          languages: typescript, javascript
```

### 2.8 ペネトレーションテスト（優先度：中）

#### 実施計画

| フェーズ | 内容 | 頻度 |
|----------|------|------|
| 自動スキャン | OWASP ZAP等 | 月1回 |
| 内部診断 | 開発チームによる確認 | 四半期 |
| 外部診断 | 専門業者による診断 | 年1回 |

#### 診断対象

- [ ] 認証・認可機構
- [ ] セッション管理
- [ ] 入力検証
- [ ] API セキュリティ
- [ ] データ暗号化
- [ ] アクセス制御
- [ ] ログ・監視

---

## 3. 医療系SaaS特有の要件

### 3.1 法規制対応

#### 個人情報保護法

- [ ] 利用目的の明示
- [ ] 第三者提供の制限
- [ ] 安全管理措置の実施
- [ ] 本人からの開示請求対応
- [ ] 漏洩時の報告義務対応

#### 医療情報システムの安全管理ガイドライン

厚生労働省「医療情報システムの安全管理に関するガイドライン」準拠

- [ ] 組織的安全管理措置
- [ ] 物理的安全管理措置
- [ ] 技術的安全管理措置
- [ ] 人的安全管理措置

### 3.2 データ保持ポリシー

| データ種別 | 保持期間 | 根拠 |
|-----------|----------|------|
| 診療記録 | 5年以上 | 医師法 |
| 予約履歴 | 3年 | 業務要件 |
| 監査ログ | 5年以上 | セキュリティ要件 |
| 収益データ | 7年 | 税法 |
| バックアップ | 1年 | 業務要件 |

### 3.3 患者同意管理

```typescript
// 同意管理スキーマ
interface PatientConsent {
  id: string;
  patient_id: string;
  consent_type: 'data_collection' | 'ai_analysis' | 'marketing' | 'third_party';
  consented: boolean;
  consented_at: Date | null;
  revoked_at: Date | null;
  version: string;  // 同意書バージョン
  ip_address: string;
}
```

### 3.4 アクセスログ長期保存

- 監査ログは最低5年間保存
- コールドストレージへのアーカイブ戦略
- 検索可能な状態での保持

---

## 4. 実装ロードマップ

### Phase 1: 必須セキュリティ（1-2ヶ月）

1. **監査ログシステム実装**
   - テーブル設計・作成
   - ログ記録ミドルウェア実装
   - 管理画面での閲覧機能

2. **RLS完全レビュー**
   - 全テーブルのポリシー確認
   - 不足ポリシーの追加
   - テストケース作成

3. **保存時暗号化**
   - 暗号化ユーティリティ実装
   - 既存データの移行
   - キー管理戦略

### Phase 2: 強化セキュリティ（2-3ヶ月）

4. **外部API認証**
   - API Key管理機能
   - スコープ制御
   - 利用状況モニタリング

5. **WAF導入**
   - サービス選定
   - ルール設定
   - モニタリング設定

6. **CI/CDセキュリティ統合**
   - Dependabot設定
   - CodeQL設定
   - Snyk統合

### Phase 3: 運用セキュリティ（3-4ヶ月）

7. **ペネトレーションテスト**
   - 自動スキャン設定
   - 外部診断依頼
   - 指摘事項対応

8. **コンプライアンス対応**
   - 個人情報保護法対応
   - ガイドライン準拠確認
   - 文書整備

---

## 5. セキュリティチェックリスト

### デプロイ前チェック

- [ ] 環境変数に機密情報が含まれていないか
- [ ] デバッグモードが無効化されているか
- [ ] エラーメッセージに内部情報が露出していないか
- [ ] HTTPS が強制されているか
- [ ] セキュリティヘッダーが設定されているか

### 定期チェック（月次）

- [ ] 依存パッケージの脆弱性確認
- [ ] アクセスログの異常確認
- [ ] 権限設定の確認
- [ ] バックアップの動作確認

### 定期チェック（四半期）

- [ ] 権限マトリクスの見直し
- [ ] セキュリティポリシーの更新
- [ ] インシデント対応手順の確認
- [ ] セキュリティ教育の実施

---

## 6. インシデント対応計画

### 6.1 インシデント分類

| レベル | 定義 | 対応時間 |
|--------|------|----------|
| Critical | データ漏洩、システム侵害 | 即時 |
| High | 認証バイパス、権限昇格 | 4時間以内 |
| Medium | 情報露出、サービス影響 | 24時間以内 |
| Low | 軽微な脆弱性 | 1週間以内 |

### 6.2 対応フロー

```
1. 検知・報告
   ↓
2. 初期評価・分類
   ↓
3. 封じ込め
   ↓
4. 根本原因分析
   ↓
5. 復旧
   ↓
6. 事後レビュー
   ↓
7. 再発防止策実施
```

### 6.3 連絡体制

| 役割 | 担当 | 連絡先 |
|------|------|--------|
| インシデント管理者 | TBD | TBD |
| 技術リード | TBD | TBD |
| 法務担当 | TBD | TBD |
| 広報担当 | TBD | TBD |

---

## 7. 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [医療情報システムの安全管理に関するガイドライン](https://www.mhlw.go.jp/stf/shingi/0000516275.html)
- [個人情報保護委員会ガイドライン](https://www.ppc.go.jp/personalinfo/legal/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)

---

## 更新履歴

| 日付 | バージョン | 更新内容 | 更新者 |
|------|-----------|----------|--------|
| 2025-12-30 | 1.0 | 初版作成 | - |

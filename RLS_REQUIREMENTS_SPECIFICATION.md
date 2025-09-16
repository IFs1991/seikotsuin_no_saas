# 整骨院管理SaaS Row Level Security (RLS) 要件定義書

## 📋 プロジェクト概要
**文書バージョン**: 1.0  
**作成日**: 2025年8月23日  
**対象システム**: 整骨院管理SaaS  
**準拠法規**: 個人情報保護法、医療法、GDPR (将来の海外展開対応)

---

## 🎯 RLS実装の目的・方針

### 基本方針
- **デフォルト拒否原則**: すべてのデータアクセスを原則禁止、明示的許可のみ有効
- **知る必要性の原則**: ユーザーは職務上必要な情報にのみアクセス可能
- **テナント完全分離**: クリニック間のデータ漏洩を物理的に不可能にする
- **多層防御**: アプリケーション層とデータベース層の両方でセキュリティを担保

### 法規制準拠要件
- 個人情報保護法に基づく適正な取得・利用・提供の制限
- 医療情報の機密性確保 (医療法第1条の4)
- 監査証跡の確保 (7年間保存義務)

---

## 🏗️ システム アーキテクチャ設計

### 認証・認可フロー
```
1. ユーザーログイン → Supabase Auth
2. JWT発行 (clinic_id, role, user_id含む)
3. APIリクエスト → JWT検証
4. データベースアクセス → RLSポリシー適用
5. 監査ログ記録 → トリガー実行
```

### データベース設計原則
- 全テナント関連テーブルに`clinic_id`必須
- `NOT NULL`制約によるデータ整合性確保
- インデックス設計によるパフォーマンス最適化

---

## 👥 ロール定義・権限マトリクス

### 基本ロール
| ロール | 権限レベル | アクセス範囲 |
|--------|-----------|-------------|
| `super_admin` | システム全体 | 全クリニック・全データ (メンテナンス用) |
| `clinic_admin` | クリニック管理者 | 自院の全データ・全機能 |
| `therapist` | 施術者 | 担当患者のカルテ・予約情報 |
| `receptionist` | 受付・事務 | 予約・会計情報のみ |
| `patient` | 患者 | 自分の情報のみ閲覧 |

### 詳細権限マトリクス
| データ種別 | super_admin | clinic_admin | therapist | receptionist | patient |
|-----------|-------------|--------------|-----------|--------------|---------|
| 患者基本情報 | R/W/D | R/W/D | R/W | R/W | R |
| カルテ・診療記録 | R/W/D | R/W/D | R/W (担当のみ) | - | R |
| 会計・請求情報 | R/W/D | R/W/D | R | R/W | R |
| スタッフ情報 | R/W/D | R/W/D | R | R | - |
| システム設定 | R/W/D | R/W | - | - | - |

*R: 読取り, W: 書込み, D: 削除*

---

## 🔐 RLSポリシー詳細設計

### 1. テナント分離 (最優先)
**対象**: 全テーブル  
**条件**: `clinic_id = auth.get_current_clinic_id()`

```sql
-- ヘルパー関数
CREATE OR REPLACE FUNCTION auth.get_current_clinic_id()
RETURNS UUID AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'clinic_id')::uuid;
EXCEPTION
  WHEN others THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 基本テナント分離ポリシー
CREATE POLICY tenant_isolation ON {table_name}
FOR ALL
USING (clinic_id = auth.get_current_clinic_id())
WITH CHECK (clinic_id = auth.get_current_clinic_id());
```

### 2. ロールベースアクセス制御
**対象**: 管理機能・設定テーブル

```sql
CREATE OR REPLACE FUNCTION auth.get_current_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role');
EXCEPTION
  WHEN others THEN RETURN 'anonymous';
END;
$$ LANGUAGE plpgsql STABLE;

-- 管理者専用アクセス
CREATE POLICY admin_only_access ON system_settings
FOR ALL
USING (auth.get_current_role() IN ('super_admin', 'clinic_admin'));
```

### 3. 担当者制限 (施術者↔患者)
**対象**: 医療記録・カルテ

```sql
-- 担当関係チェック関数
CREATE OR REPLACE FUNCTION auth.is_assigned_to_patient(target_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- super_admin, clinic_adminは無制限
  IF auth.get_current_role() IN ('super_admin', 'clinic_admin') THEN
    RETURN TRUE;
  END IF;
  
  -- 担当関係の確認
  RETURN EXISTS (
    SELECT 1
    FROM public.therapist_patient_assignments
    WHERE patient_id = target_patient_id
      AND therapist_id = auth.uid()
      AND clinic_id = auth.get_current_clinic_id()
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 担当患者制限ポリシー
CREATE POLICY assigned_patients_only ON medical_records
FOR SELECT
USING (auth.is_assigned_to_patient(patient_id));
```

### 4. 患者本人アクセス
**対象**: 患者情報・診療履歴

```sql
CREATE POLICY patient_self_access ON patients
FOR SELECT
USING (
  id = auth.uid() -- 患者本人
  OR auth.get_current_role() IN ('super_admin', 'clinic_admin', 'therapist', 'receptionist')
);
```

---

## 📊 監査ログ設計

### 監査ログテーブル設計
```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  user_role TEXT NOT NULL,
  clinic_id UUID NOT NULL,
  operation_type TEXT NOT NULL, -- SELECT, INSERT, UPDATE, DELETE
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE
);

-- インデックス設計
CREATE INDEX idx_audit_logs_clinic_timestamp ON audit_logs(clinic_id, timestamp);
CREATE INDEX idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
```

### トリガー実装パターン
```sql
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_logs 
    (user_id, user_role, clinic_id, operation_type, table_name, record_id, new_data)
    VALUES (auth.uid(), auth.get_current_role(), auth.get_current_clinic_id(), 
            'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  -- UPDATE/DELETE の処理...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🚀 パフォーマンス最適化戦略

### 1. インデックス戦略
```sql
-- 必須インデックス (全テーブル)
CREATE INDEX CONCURRENTLY idx_{table}_clinic_id ON {table}(clinic_id);

-- ロール依存アクセス用
CREATE INDEX CONCURRENTLY idx_assignments_therapist_patient 
ON therapist_patient_assignments(therapist_id, patient_id, clinic_id);

-- 監査ログ検索用
CREATE INDEX CONCURRENTLY idx_audit_user_time ON audit_logs(user_id, timestamp DESC);
```

### 2. 関数最適化
- 関数揮発性の適切な設定: `STABLE`による結果キャッシュ
- セッション変数の効率的な取得
- 複雑なJOINの回避、`EXISTS`句の活用

### 3. 接続プール設定
- Supabase PgBouncer設定最適化
- セッションコンテキストの適切な維持

---

## 📋 実装チェックリスト

### Phase 1: 基盤実装
- [ ] ヘルパー関数作成 (clinic_id, role取得)
- [ ] 全テーブルでRLS有効化
- [ ] 基本テナント分離ポリシー適用
- [ ] 必須インデックス作成

### Phase 2: ロール制御
- [ ] ロール別アクセスポリシー作成
- [ ] 担当関係テーブル・関数実装
- [ ] 患者本人アクセス制御

### Phase 3: 監査・監視
- [ ] 監査ログテーブル・トリガー実装
- [ ] ログ分析・アラート機能
- [ ] パフォーマンス監視

### Phase 4: テスト・検証
- [ ] 単体テスト (各ポリシー)
- [ ] 統合テスト (認証フロー)
- [ ] ペネトレーションテスト
- [ ] パフォーマンステスト

---

## ⚠️ セキュリティ考慮事項

### 脆弱性対策
- SQL インジェクション: パラメータクエリの強制
- セッションハイジャック: JWT適切な管理・期限設定
- 権限昇格攻撃: ポリシー関数のSECURITY DEFINER慎重な使用
- データ漏洩: 開発環境での本番データ使用禁止

### 運用セキュリティ
- 定期的なアクセスログ監査
- 異常アクセスパターンの検出・アラート
- ロール権限の定期的な見直し
- インシデント対応手順の整備

---

## 🎯 成功基準・KPI

### セキュリティKPI
- 不正アクセス試行の100%検出・記録
- テナント間データ漏洩: 0件
- 監査ログ欠損: 0件
- 認証バイパス: 0件

### パフォーマンスKPI
- データベースクエリ応答時間: <100ms (95%ile)
- RLS適用によるオーバーヘッド: <20%
- 同時接続ユーザー: 1000+ (クリニックあたり50)

### 運用KPI
- セキュリティインシデント対応時間: <2時間
- 監査ログ分析・報告: 月次
- ユーザー権限見直し: 四半期

---

**承認**: _______________  **日付**: _______________  
**技術責任者**: _______________  **セキュリティ責任者**: _______________
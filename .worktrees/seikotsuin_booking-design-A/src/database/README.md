# 整骨院管理SaaS - データベース設計

## 概要

このディレクトリには、整骨院管理SaaSシステムのSupabase PostgreSQLデータベースの完全な設計が含まれています。

## ディレクトリ構造

```
src/database/
├── schemas/                    # テーブル定義
│   ├── 01_core_tables.sql     # コアテーブル（店舗、ユーザー、患者、スタッフ）
│   ├── 02_master_data.sql     # マスターデータテーブル
│   ├── 03_transaction_tables.sql # トランザクションテーブル
│   └── 04_system_tables.sql   # システム管理テーブル
├── policies/                   # RLSポリシー
│   └── auth_policies.sql      # 認証・権限制御ポリシー
├── functions/                  # 関数・トリガー
│   └── triggers.sql           # トリガー関数とストアドプロシージャ
├── seed_data/                  # 初期データ
│   └── 01_initial_data.sql    # マスターデータと初期設定
└── README.md                   # このファイル
```

## データベース設計の特徴

### 1. マルチテナント対応

- 全てのテーブルに `clinic_id` を設定し、店舗単位でのデータ分離を実現
- Row Level Security (RLS) による厳密なアクセス制御

### 2. Supabaseベストプラクティス準拠

- UUIDを主キーとして使用
- `created_at`、`updated_at` タイムスタンプの自動管理
- JSON/JSONBによる柔軟なデータ構造

### 3. 整骨院業界特化

- 保険診療・自費診療の区別
- 施術記録とカルテ管理
- レセプト処理対応

### 4. 監査・分析機能

- 全操作の監査ログ記録
- AI分析結果の保存
- パフォーマンス指標の自動計算

## セットアップ手順

### 1. 前提条件

- Supabaseプロジェクトの作成
- `uuid-ossp` エクステンションの有効化

### 2. データベース構築

スキーマファイルを順番に実行してください：

```bash
# 1. コアテーブルの作成
psql -h [your-supabase-host] -U postgres -d postgres -f schemas/01_core_tables.sql

# 2. マスターデータテーブルの作成
psql -h [your-supabase-host] -U postgres -d postgres -f schemas/02_master_data.sql

# 3. トランザクションテーブルの作成
psql -h [your-supabase-host] -U postgres -d postgres -f schemas/03_transaction_tables.sql

# 4. システムテーブルの作成
psql -h [your-supabase-host] -U postgres -d postgres -f schemas/04_system_tables.sql

# 5. RLSポリシーの設定
psql -h [your-supabase-host] -U postgres -d postgres -f policies/auth_policies.sql

# 6. トリガーと関数の作成
psql -h [your-supabase-host] -U postgres -d postgres -f functions/triggers.sql

# 7. 初期データの投入
psql -h [your-supabase-host] -U postgres -d postgres -f seed_data/01_initial_data.sql
```

### 3. Supabase設定

以下の設定をSupabaseダッシュボードで行ってください：

1. **Authentication**:
   - メール認証の有効化
   - カスタムクレームの設定

2. **Storage**:
   - `attachments` バケットの作成
   - ファイルアップロード用ポリシーの設定

3. **Realtime**:
   - 必要なテーブルでRealtimeを有効化

## 主要テーブル概要

### コアテーブル

- **clinics**: 整骨院店舗情報
- **profiles**: ユーザープロファイル（auth.usersと1:1対応）
- **patients**: 患者情報
- **staff**: スタッフ情報

### マスターデータ

- **treatment_menus**: 施術メニュー
- **insurance_types**: 保険種別
- **payment_methods**: 支払い方法
- **roles/permissions**: 権限管理

### トランザクション

- **appointments**: 予約管理
- **treatments**: 施術記録
- **revenues**: 売上管理
- **daily_reports**: 日報
- **ai_comments**: AI分析結果

### システム管理

- **audit_logs**: 監査ログ
- **notifications**: 通知
- **system_events**: システムイベント

## セキュリティ設計

### Row Level Security (RLS)

全てのテーブルでRLSが有効化され、以下の原則でアクセス制御：

1. **店舗分離**: ユーザーは所属店舗のデータのみアクセス可能
2. **ロールベース**: ユーザーロールに応じた権限制御
3. **操作制限**: 作成・更新・削除の操作権限を細かく制御

### 監査機能

- 全ての重要な操作を `audit_logs` テーブルに記録
- 変更前後のデータを保持
- セキュリティイベントの自動検出

## パフォーマンス最適化

### インデックス設計

- 外部キー制約のあるカラムに自動インデックス
- 検索頻度の高いカラムに追加インデックス
- 複合インデックスによるクエリ最適化

### データ分割

- 大容量テーブルでの日付ベースパーティショニング
- 履歴データの自動アーカイブ機能

## 運用・保守

### 自動化機能

- **トリガー**: データ整合性の自動維持
- **統計更新**: 患者・売上統計の自動計算
- **クリーンアップ**: 期限切れデータの自動削除

### 監視・アラート

- データ整合性チェック関数
- パフォーマンス監視
- 異常値検出とアラート

## 拡張予定

### 将来の機能拡張

1. **レセプト管理**: 電子レセプト対応
2. **在庫管理**: 消耗品・機器管理
3. **予約システム**: オンライン予約機能
4. **顧客ポータル**: 患者専用マイページ

### スケーラビリティ

- 読み取り専用レプリカの活用
- CDNによる静的コンテンツ配信
- バッチ処理の最適化

## トラブルシューティング

### よくある問題

1. **RLSポリシーエラー**

   ```sql
   -- 現在のユーザー情報を確認
   SELECT auth.uid(), auth.get_current_clinic_id();
   ```

2. **権限不足エラー**

   ```sql
   -- ユーザーの権限を確認
   SELECT p.name FROM permissions p
   JOIN role_permissions rp ON p.id = rp.permission_id
   JOIN roles r ON rp.role_id = r.id
   JOIN profiles pr ON r.name = pr.role
   WHERE pr.user_id = auth.uid();
   ```

3. **データ整合性エラー**
   ```sql
   -- 整合性チェックの実行
   SELECT * FROM check_data_integrity();
   ```

## サポート

データベース設計に関する質問や問題がある場合は、開発チームまでお問い合わせください。

### 関連ドキュメント

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**最終更新**: 2025-08-18  
**バージョン**: 1.0.0

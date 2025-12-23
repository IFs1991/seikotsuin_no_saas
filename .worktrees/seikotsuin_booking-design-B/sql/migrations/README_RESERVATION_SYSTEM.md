# 予約管理システム - データベースマイグレーションガイド

**作成日**: 2025-11-04
**バージョン**: 1.0
**対象**: 整骨院管理SaaS 予約機能

---

## 📋 目次

1. [概要](#概要)
2. [前提条件](#前提条件)
3. [ファイル構成](#ファイル構成)
4. [マイグレーション実行手順](#マイグレーション実行手順)
5. [テーブル構造](#テーブル構造)
6. [RLSポリシー](#rlsポリシー)
7. [トラブルシューティング](#トラブルシューティング)
8. [ロールバック手順](#ロールバック手順)

---

## 🎯 概要

このマイグレーションは、予約管理システムに必要な以下のデータベース要素を作成します：

### 作成されるオブジェクト

| カテゴリ | 数 | 詳細 |
|---------|---|------|
| **テーブル** | 6 | customers, menus, resources, reservations, blocks, reservation_history |
| **ビュー** | 1 | reservation_list_view（JOIN済み予約一覧） |
| **マテリアライズドビュー** | 1 | daily_reservation_stats（日別統計） |
| **関数** | 8 | 衝突チェック、時間スロット生成、履歴記録等 |
| **トリガー** | 9 | 自動更新、履歴記録 |
| **RLSポリシー** | 25 | ロール別アクセス制御 |
| **インデックス** | 40+ | パフォーマンス最適化 |

### 実装機能

- ✅ F001: 日表示タイムライン
- ✅ F002: ドラッグ&ドロップ編集
- ✅ F005: 電話予約手入力
- ✅ F006: 予約表印刷（データ基盤）
- ✅ F007: 予約枠設定
- ✅ F008: 販売停止設定
- ✅ F101: 複数日予約一括登録
- ✅ F103: 検索/フィルタ

---

## 🔧 前提条件

### 必須環境

- PostgreSQL 14以上
- Supabase CLI（推奨）または psql
- Node.js 18.18.0以上
- npm 10.0.0以上

### 環境変数

以下の環境変数が `.env.local` に設定されていること：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 📁 ファイル構成

```
sql/migrations/
├── README_RESERVATION_SYSTEM.md          # このファイル
├── reservation_system_schema.sql         # スキーマ定義
├── reservation_system_rls.sql            # RLSポリシー
├── apply_reservation_system.sql          # 実行スクリプト
└── rollback_reservation_system.sql       # ロールバックスクリプト
```

### ファイル詳細

#### 1. `reservation_system_schema.sql`

**内容**: テーブル、ビュー、関数、インデックス、サンプルデータ
**サイズ**: ~800行
**実行時間**: 約5-10秒

#### 2. `reservation_system_rls.sql`

**内容**: RLSポリシー、トリガー、セキュリティ設定
**サイズ**: ~600行
**実行時間**: 約3-5秒

#### 3. `apply_reservation_system.sql`

**内容**: マイグレーション実行 + 整合性チェック
**サイズ**: ~150行
**実行時間**: 約10-15秒

#### 4. `rollback_reservation_system.sql`

**内容**: 完全ロールバック（全削除）
**サイズ**: ~180行
**実行時間**: 約3-5秒

---

## 🚀 マイグレーション実行手順

### 方法1: Supabase CLI（推奨）

```bash
# 1. Supabaseプロジェクトにログイン
supabase login

# 2. プロジェクトID確認
supabase projects list

# 3. ローカルDB起動（開発環境）
supabase start

# 4. マイグレーション実行
supabase db reset  # 既存DBをリセット（開発環境のみ）

# 5. スキーマ適用
cd sql/migrations
psql -h localhost -p 54322 -U postgres -d postgres -f apply_reservation_system.sql

# 6. 型定義再生成
npm run supabase:types
```

### 方法2: psql直接実行

```bash
# 1. データベース接続
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# 2. マイグレーション実行
\i sql/migrations/apply_reservation_system.sql

# 3. 成功確認
\dt public.*
\dv public.*

# 4. 型定義再生成
npm run supabase:types
```

### 方法3: Supabase Dashboard（本番環境）

1. Supabase Dashboard → SQL Editor を開く
2. `reservation_system_schema.sql` の内容をコピー&ペースト → 実行
3. `reservation_system_rls.sql` の内容をコピー&ペースト → 実行
4. ローカルで型定義再生成: `npm run supabase:types`

---

## 📊 テーブル構造

### 1. Customers（顧客）

**目的**: 顧客マスターデータ管理

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | UUID | PK | 顧客ID |
| name | VARCHAR(255) | NOT NULL | 顧客名 |
| name_kana | VARCHAR(255) | | カタカナ名 |
| phone | VARCHAR(20) | NOT NULL | 電話番号 |
| email | VARCHAR(255) | | メールアドレス |
| line_user_id | VARCHAR(255) | UNIQUE | LINE連携ID |
| custom_attributes | JSONB | | カスタム属性 |
| consent_marketing | BOOLEAN | DEFAULT false | マーケティング同意 |
| consent_reminder | BOOLEAN | DEFAULT false | リマインド同意 |
| total_visits | INTEGER | DEFAULT 0 | 累計来院回数 |
| last_visit_date | TIMESTAMPTZ | | 最終来院日 |
| total_revenue | DECIMAL(10,2) | DEFAULT 0 | 累計売上 |
| lifetime_value | DECIMAL(10,2) | DEFAULT 0 | LTV |

**インデックス**:
- phone, email, line_user_id（高速検索）
- name（GIN, トライグラム検索）
- created_at, last_visit_date（ソート最適化）

---

### 2. Menus（施術メニュー）

**目的**: 施術メニューマスター管理

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | UUID | PK | メニューID |
| name | VARCHAR(255) | NOT NULL | メニュー名 |
| description | TEXT | | 説明 |
| category | VARCHAR(100) | | カテゴリ（整体/鍼灸等） |
| price | DECIMAL(10,2) | NOT NULL | 料金 |
| duration_minutes | INTEGER | NOT NULL | 所要時間 |
| insurance_type | VARCHAR(50) | | 保険区分 |
| buffer_before_minutes | INTEGER | DEFAULT 0 | 前準備時間 |
| buffer_after_minutes | INTEGER | DEFAULT 0 | 後片付け時間 |
| is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| is_public | BOOLEAN | DEFAULT true | Web公開フラグ |

---

### 3. Resources（リソース）

**目的**: スタッフ・施術室・設備管理

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | UUID | PK | リソースID |
| name | VARCHAR(255) | NOT NULL | リソース名 |
| type | VARCHAR(50) | NOT NULL | 種別（staff/room/bed/device） |
| staff_code | VARCHAR(50) | UNIQUE | 従業員コード |
| working_hours | JSONB | NOT NULL | 曜日別営業時間 |
| max_concurrent | INTEGER | DEFAULT 1 | 同時対応数 |
| supported_menus | UUID[] | | 対応可能メニュー配列 |
| is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| is_bookable | BOOLEAN | DEFAULT true | 予約受付可能フラグ |

**working_hours形式**:
```json
{
  "monday": {"start": "09:00", "end": "18:00"},
  "tuesday": {"start": "09:00", "end": "18:00"},
  ...
  "sunday": null
}
```

---

### 4. Reservations（予約）

**目的**: 予約トランザクション管理

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | UUID | PK | 予約ID |
| customer_id | UUID | FK → customers | 顧客ID |
| menu_id | UUID | FK → menus | メニューID |
| staff_id | UUID | FK → resources | スタッフID |
| start_time | TIMESTAMPTZ | NOT NULL | 開始時刻 |
| end_time | TIMESTAMPTZ | NOT NULL | 終了時刻 |
| status | VARCHAR(50) | NOT NULL | ステータス（8種類） |
| channel | VARCHAR(50) | NOT NULL | 予約チャネル |
| notes | TEXT | | 備考 |
| price | DECIMAL(10,2) | | 予約時料金 |
| actual_price | DECIMAL(10,2) | | 実際請求額 |
| payment_status | VARCHAR(50) | DEFAULT 'unpaid' | 支払いステータス |
| reservation_group_id | UUID | | 複数日予約グループID |

**ステータス種別**:
- `tentative`: 仮予約
- `confirmed`: 確定
- `arrived`: 来院
- `completed`: 完了
- `cancelled`: キャンセル
- `no_show`: 無断欠席
- `unconfirmed`: 未確認
- `trial`: 体験

**チャネル種別**:
- `line`: LINE予約
- `web`: Web予約
- `phone`: 電話予約
- `walk_in`: 来院予約

**重要インデックス**:
- `idx_reservations_staff_time`: 衝突検出用（staff_id, start_time, end_time）
- `idx_reservations_date_range`: 日付範囲検索用

---

### 5. Blocks（販売停止）

**目的**: 予約ブロック期間管理

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | UUID | PK | ブロックID |
| resource_id | UUID | FK → resources | リソースID |
| start_time | TIMESTAMPTZ | NOT NULL | 開始時刻 |
| end_time | TIMESTAMPTZ | NOT NULL | 終了時刻 |
| recurrence_rule | TEXT | | 繰り返しルール（RRULE） |
| reason | VARCHAR(255) | | ブロック理由 |
| block_type | VARCHAR(50) | DEFAULT 'manual' | ブロック種別 |

**block_type種別**:
- `manual`: 手動設定
- `holiday`: 祝日
- `vacation`: 休暇
- `training`: 研修
- `maintenance`: メンテナンス
- `emergency`: 緊急

---

### 6. Reservation History（予約変更履歴）

**目的**: 監査ログ・変更履歴

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | UUID | PK | 履歴ID |
| reservation_id | UUID | FK → reservations | 予約ID |
| action | VARCHAR(50) | NOT NULL | アクション種別 |
| old_value | JSONB | | 変更前データ |
| new_value | JSONB | | 変更後データ |
| change_reason | TEXT | | 変更理由 |
| created_by | UUID | FK → auth.users | 実行ユーザー |
| ip_address | INET | | IPアドレス |

---

## 🔒 RLSポリシー

### ロール定義

| ロール | 説明 | 権限レベル |
|-------|------|----------|
| `admin` | システム管理者 | 全操作可能 |
| `manager` | 店舗マネージャー | 顧客・予約管理可能 |
| `staff` | スタッフ | 予約閲覧・更新可能 |
| `customer` | 顧客（LINE連携時） | 自分の予約のみ操作可能 |
| `anon` | 未認証ユーザー | 公開メニュー閲覧のみ |

### アクセス権限マトリックス

#### Customersテーブル

| 操作 | admin | manager | staff | customer | anon |
|-----|-------|---------|-------|----------|------|
| SELECT | ✅ 全件 | ✅ 全件 | ✅ 全件 | ✅ 自分のみ | ❌ |
| INSERT | ✅ | ✅ | ✅ | ❌ | ❌ |
| UPDATE | ✅ | ✅ | ✅ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ❌ |

#### Reservationsテーブル

| 操作 | admin | manager | staff | customer | anon |
|-----|-------|---------|-------|----------|------|
| SELECT | ✅ 全件 | ✅ 全件 | ✅ 全件 | ✅ 自分のみ | ❌ |
| INSERT | ✅ | ✅ | ✅ | ✅ Web/LINE | ❌ |
| UPDATE | ✅ | ✅ | ✅ | ✅ キャンセルのみ | ❌ |
| DELETE | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🔧 トラブルシューティング

### エラー1: 「テーブルが既に存在します」

**原因**: 過去のマイグレーションが残存

**解決策**:
```sql
-- ロールバック実行
\i sql/migrations/rollback_reservation_system.sql

-- 再度マイグレーション
\i sql/migrations/apply_reservation_system.sql
```

---

### エラー2: 「権限がありません」

**原因**: 実行ユーザーに権限不足

**解決策**:
```sql
-- スーパーユーザーで接続
psql -U postgres ...

-- または権限付与
GRANT ALL PRIVILEGES ON SCHEMA public TO your_user;
```

---

### エラー3: 「関数が見つかりません」

**原因**: スキーマ作成前にRLSを実行

**解決策**:
```bash
# 正しい実行順序
1. reservation_system_schema.sql
2. reservation_system_rls.sql

# apply_reservation_system.sqlを使用すれば順序保証
```

---

### エラー4: 「型定義が更新されない」

**原因**: Supabase型定義が古い

**解決策**:
```bash
# 型定義再生成
npm run supabase:types

# Supabaseプロジェクト再起動（開発環境）
supabase stop
supabase start
```

---

## 🔄 ロールバック手順

### 完全ロールバック

```bash
# 警告: 全データ削除
psql ... -f sql/migrations/rollback_reservation_system.sql
```

### 部分ロールバック（手動）

```sql
-- RLSポリシーのみ削除
DROP POLICY ... ON public.reservations;

-- 特定テーブルのみ削除
DROP TABLE public.reservations CASCADE;

-- ビューのみ削除
DROP VIEW public.reservation_list_view;
```

---

## ✅ 動作確認

### 1. テーブル作成確認

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history');
```

期待結果: 6行

---

### 2. RLS有効化確認

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history');
```

期待結果: 全行で `rowsecurity = true`

---

### 3. サンプルデータ確認

```sql
SELECT
    (SELECT COUNT(*) FROM public.customers) AS customer_count,
    (SELECT COUNT(*) FROM public.menus) AS menu_count,
    (SELECT COUNT(*) FROM public.resources) AS resource_count;
```

期待結果:
- customer_count: 3
- menu_count: 4
- resource_count: 6（スタッフ3 + 施術室3）

---

### 4. 関数動作確認

```sql
-- 衝突チェック関数テスト
SELECT * FROM check_reservation_conflict(
    'staff1'::UUID,
    NOW()::TIMESTAMPTZ,
    (NOW() + INTERVAL '1 hour')::TIMESTAMPTZ
);
```

---

## 📞 サポート

### 問題が解決しない場合

1. Supabaseログ確認
   ```bash
   supabase logs
   ```

2. PostgreSQLログ確認
   ```bash
   tail -f /var/log/postgresql/postgresql.log
   ```

3. 開発チームへ問い合わせ

---

## 📝 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2025-11-04 | 1.0 | 初版作成 |

---

**🏥 整骨院管理SaaS - 予約システム**

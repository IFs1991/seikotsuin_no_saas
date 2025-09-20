# 整骨院管理SaaS バックエンドセットアップガイド

## 概要

フロントエンドの機能に合わせて完全なバックエンドAPIとデータベーススキーマを実装しました。

## 実装された機能

### 1. データベーススキーマ

- **更新されたテーブル**: 既存スキーマに patients.patient_id と revenues テーブルの改良
- **新しいビュー**:
  - `patient_visit_summary`: 患者来院履歴の分析用ビュー
  - `staff_performance_summary`: スタッフ成績サマリー
  - `daily_revenue_summary`: 日次収益サマリー
- **分析関数**:
  - `calculate_churn_risk_score()`: 患者離脱リスクスコア計算
  - `calculate_patient_ltv()`: 患者生涯価値計算
  - その他多数の分析関数

### 2. APIエンドポイント

#### ダッシュボード API (`/api/dashboard`)

- **GET**: リアルタイムダッシュボードデータ取得
- 日次売上、患者数、AIコメント、収益トレンド、ヒートマップデータ

#### 収益分析 API (`/api/revenue`)

- **GET**: 収益分析データ取得（期間別、メニュー別ランキング）
- **POST**: 新しい売上データ登録

#### 患者分析 API (`/api/patients`)

- **GET**: 患者分析データ（転換率、LTV、離脱リスク、セグメント分析）
- **POST**: 新規患者登録

#### スタッフ管理 API (`/api/staff`)

- **GET**: スタッフパフォーマンス分析
- **POST**: 新規スタッフ登録

#### 日報管理 API (`/api/daily-reports`)

- **GET**: 日報一覧とサマリー取得
- **POST**: 新しい日報作成・更新
- **DELETE**: 日報削除

#### チャット API (`/api/chat`)

- **GET**: チャット履歴取得
- **POST**: 新しいメッセージ送信とAI応答生成

#### AIコメント API (`/api/ai-comments`)

- **GET**: 日次AIコメント取得
- **POST**: AIコメント生成

### 3. フロントエンド統合

- `useDashboard` hookを新しいAPI構造に更新
- APIレスポンス形式の統一
- エラーハンドリングの改善

## セットアップ手順

### 1. 環境変数設定

```bash
cp env.example .env.local
```

以下の変数を設定:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_AI_API_KEY`

### 2. データベース初期化

```sql
-- schema.sqlを実行
psql -f src/api/database/schema.sql

-- functions.sqlを実行
psql -f src/api/database/functions.sql
```

### 3. 開発サーバー起動

```bash
# MCPサーバー起動
./start_serena_mcp.sh

# 開発サーバー起動
npm run dev
```

## API仕様

### 共通レスポンス形式

```typescript
{
  success: boolean;
  data?: T;
  error?: string;
}
```

### 主要エンドポイント

#### GET /api/dashboard?clinic_id={id}

ダッシュボード用のリアルタイムデータを取得

#### GET /api/patients?clinic_id={id}

患者分析データを取得（転換率、LTV、離脱リスク等）

#### GET /api/revenue?clinic_id={id}&period={period}

収益分析データを取得（メニュー別ランキング、トレンド等）

#### POST /api/chat

```json
{
  "user_id": "uuid",
  "clinic_id": "uuid",
  "message": "string",
  "session_id": "uuid?"
}
```

## 技術スタック

- **Next.js 15**: App Router使用
- **Supabase**: PostgreSQL + リアルタイム機能
- **TypeScript**: 型安全性確保
- **Tailwind CSS**: スタイリング
- **Context7 MCP**: 最新ドキュメンテーションアクセス

## 主要な分析機能

1. **患者分析**: 転換率、LTV、離脱リスク、セグメンテーション
2. **収益分析**: トレンド、メニュー別ランキング、予測
3. **スタッフ分析**: パフォーマンス、効率性、満足度相関
4. **リアルタイムダッシュボード**: 日次データ、AIコメント
5. **チャット機能**: コンテキスト対応AI分析

## データ整合性とパフォーマンス

- インデックス最適化済み
- ビューによる複雑クエリの最適化
- PostgreSQL関数による高速計算
- リアルタイムサブスクリプション対応

## 次のステップ

1. 認証システムの実装
2. テストカバレッジの拡充
3. 本番環境へのデプロイ設定
4. パフォーマンス監視の設置

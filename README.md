# 整骨院管理SaaS

46店舗展開の整骨院グループ向けリアルタイム経営分析システム

## 🏥 プロダクト概要

本システムは、複数店舗を展開する整骨院グループ向けの包括的な経営管理SaaSプラットフォームです。リアルタイムデータ分析とAI技術を活用し、効率的な店舗運営と収益最適化を実現します。

### 🎯 主要機能

#### 📊 ダッシュボード

- **リアルタイムデータ表示**: 本日の売上・患者数を即座に把握
- **AI分析コメント**: Gemini AIによる業績分析と改善提案
- **異常値アラート**: KPI異常の早期発見
- **クイックアクション**: よく使う機能への素早いアクセス

#### 📝 日報管理

- **デジタル日報入力**: 施術記録の効率的な入力
- **施術記録一覧**: 過去データの検索・閲覧
- **自動集計機能**: 日次・週次・月次レポート生成

#### 👥 患者分析

- **患者フロー分析**: 新患から再診への転換率追跡
- **LTVランキング**: 患者生涯価値の可視化
- **離脱リスク予測**: AI による離脱リスク診断
- **セグメント分析**: 年齢層・症状・地域別分析
- **フォローアップ管理**: 患者との継続的な関係構築

#### 💰 収益分析

- **収益トレンド**: 日次・週次・月次の売上推移
- **保険診療 vs 自費診療**: 収益構造の最適化
- **施術メニュー別ランキング**: 収益貢献度分析
- **時間帯・曜日別分析**: 運営効率の可視化
- **前年同期比較**: 成長率とトレンド分析
- **収益予測**: AIによる将来予測

#### 👨‍⚕️ スタッフ管理

- **パフォーマンス管理**: 施術者別収益分析
- **スキルマトリックス**: 技術レベル管理
- **研修・資格履歴**: キャリア開発支援
- **シフト最適化**: 効率的な人員配置

#### 🤖 AI分析

- **経営改善提案**: Gemini AIによるインサイト
- **カテゴリ別分析**: 収益向上・効率化・満足度
- **優先度別提案**: 高・中・低優先度での分類
- **PDFレポート出力**: 経営会議資料の自動生成

### 🚀 技術スタック

#### フロントエンド

- **Next.js 15.4.5**: React フルスタックフレームワーク
- **React 19.0.0**: 最新のReactライブラリ
- **TypeScript 5.7.2**: 型安全な開発環境
- **Tailwind CSS 3.4.17**: ユーティリティファーストCSS
- **Lucide React**: アイコンライブラリ

#### バックエンド・データベース

- **Supabase 2.46.1**: PostgreSQLベースのBaaS
- **リアルタイムデータ同期**: 即座に更新されるダッシュボード
- **Row Level Security**: セキュアなデータアクセス制御

#### AI・分析

- **Gemini AI**: Google製最先端AI
- **自然言語処理**: 業績分析とインサイト生成
- **予測分析**: 収益予測と患者行動予測

#### 開発・テスト

- **Jest 29.7.0**: JavaScriptテストフレームワーク
- **React Testing Library 16.1.0**: コンポーネントテスト
- **ESLint**: コード品質管理
- **Context7 MCP**: 開発ドキュメント管理

### 🛠️ 開発環境セットアップ

#### 前提条件

- Node.js 18.0.0以上
- npm 8.0.0以上
- Git

#### インストール手順

1. **リポジトリクローン**

```bash
git clone <repository-url>
cd seikotsuin_management_saas
```

2. **依存関係インストール**

```bash
npm install
```

3. **環境変数設定**

```bash
cp env.example .env.local
# .env.localファイルを編集して必要な環境変数を設定
```

必須環境変数（アプリケーション起動時に検証されます）:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`NODE_ENV=test` 以外では上記が未設定の場合に起動時エラーとなります。

4. **MCPサーバー起動**

```bash
./start_serena_mcp.sh
```

5. **開発サーバー起動**

```bash
npm run dev
```

6. **ブラウザアクセス**
   http://localhost:3001 でアプリケーションにアクセス

### 🧪 テスト実行

```bash
# 全テスト実行
npm test

# テストウォッチモード
npm run test:watch

# カバレッジレポート生成
npm run test:coverage
```

### 🎨 デザイン案の並列開発（git worktree）

予約管理UI/UXのデザイン案（A〜D）を`git worktree`を使って並列開発・比較できます。

#### 目的

複数のデザインパターンを同時に開発し、ブラウザで並べて比較することで、最適なUI/UXを選択できます。

#### 基本的な使い方

1. **mainブランチをclean状態にする**
   ```bash
   git status
   # 必要に応じて変更をコミットまたはstash
   ```

2. **A〜D案用のworktreeを作成**
   ```bash
   .\scripts\create_booking_design_worktrees.ps1
   ```

   これにより以下のworktreeが作成されます:
   - `C:\Users\seekf\Desktop\seikotsuin_booking-design-A` (ブランチ: `feature/booking-design-A`)
   - `C:\Users\seekf\Desktop\seikotsuin_booking-design-B` (ブランチ: `feature/booking-design-B`)
   - `C:\Users\seekf\Desktop\seikotsuin_booking-design-C` (ブランチ: `feature/booking-design-C`)
   - `C:\Users\seekf\Desktop\seikotsuin_booking-design-D` (ブランチ: `feature/booking-design-D`)

3. **main + A〜D案の開発サーバーを一括起動**
   ```bash
   .\scripts\start_booking_design_dev.ps1
   ```

   各デザイン案が異なるポートで起動します:
   - `http://localhost:3000` → main
   - `http://localhost:3001` → A案
   - `http://localhost:3002` → B案
   - `http://localhost:3003` → C案
   - `http://localhost:3004` → D案

4. **ブラウザでUI/UXを比較**

   複数のブラウザウィンドウを並べて、各デザイン案を比較検討します。

5. **各worktreeで開発**

   各worktreeは独立したブランチで管理されているため、自由に変更・コミットできます:
   ```bash
   cd C:\Users\seekf\Desktop\seikotsuin_booking-design-A
   # A案の開発...
   git add .
   git commit -m "A案: カレンダーUIを改善"
   ```

6. **採用する案をPRとして提出**

   最適なデザイン案を選択したら、そのブランチをGitHubにpushしてPRを作成します:
   ```bash
   git push origin feature/booking-design-A
   # GitHub上でPR作成
   ```

#### worktreeの削除

不要になったworktreeは以下のコマンドで削除できます:

```bash
# worktree一覧を確認
git worktree list

# 特定のworktreeを削除
git worktree remove C:\Users\seekf\Desktop\seikotsuin_booking-design-A

# ブランチも削除する場合
git branch -d feature/booking-design-A
```

#### 運用上の注意

- 各worktreeの変更は、それぞれ対応する`feature/booking-design-?`ブランチにコミットしてください
- mainブランチへのマージは、必ずPRレビューを経由してください
- 不要なworktreeは定期的に削除して、ディスク容量を節約してください
- 各worktreeで`npm install`を実行する必要がある場合があります

### 🔐 セキュリティスキャン & 型生成

```bash
# Supabase 型定義の再生成
npm run supabase:types

# 機密情報のバンドル混入チェック
npm run scan:secrets
```

### 📦 パッケージマネージャ方針（重要）

### 🐳 Docker Desktop での起動

Docker Desktop を利用した開発環境・検証環境のセットアップ手順です。

1. 事前準備
   - Docker Desktop と Docker Compose v2 をインストール
   - `env.example` を参考に、以下のファイルを用意  
     - `.env.development`（開発用）  
     - `.env.production`（動作確認・本番用）  
   - いずれのファイルにも Supabase/Gemini/API キーなど必須の環境変数を設定
2. 開発モードでの起動
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```
   - ブラウザから `http://localhost:3001` にアクセス
   - 停止する場合は `Ctrl+C` もしくは `docker compose -f docker-compose.dev.yml down`
3. 本番モード相当での起動
   ```bash
   docker compose up --build
   ```
   - `http://localhost:3000` が表示され、`curl -fsS http://localhost:3000/api/health` が `200` を返すことを確認
   - 停止する場合は `docker compose down`

Docker イメージは Next.js の standalone 出力を利用しており、`docker-compose.yml` では非 root・read only 実行やヘルスチェックを有効化しています。

- 本プロジェクトは npm を採用し、ロックファイルは `package-lock.json` に統一します。
- Yarn は使用しません（ロックファイルは1つのみに統一）。
- CI では再現性のため `npm ci` を使用してください。

推奨運用:

- 開発環境: `npm install`
- CI 環境: `npm ci`
- 依存更新: 明示的に `package.json` を変更し、`package-lock.json` をコミット

### 🚀 本番環境デプロイ

```bash
# ビルド実行
npm run build

# 本番サーバー起動
npm start
```

### 📁 プロジェクト構造

```
src/
├── app/                    # Next.js App Router
│   ├── dashboard/         # ダッシュボードページ
│   ├── daily-reports/     # 日報管理ページ
│   ├── patients/          # 患者分析ページ
│   ├── revenue/           # 収益分析ページ
│   ├── staff/             # スタッフ管理ページ
│   └── ai-insights/       # AI分析ページ
├── components/            # Reactコンポーネント
│   ├── ui/               # UIコンポーネント
│   ├── navigation/       # ナビゲーション関連
│   ├── dashboard/        # ダッシュボード関連
│   └── ...               # 機能別コンポーネント
├── hooks/                # カスタムフック
├── lib/                  # ユーティリティ・設定
├── types/                # TypeScript型定義
└── api/                  # API設定・スキーマ
```

### 🔧 主要コマンド

| コマンド                | 説明                 |
| ----------------------- | -------------------- |
| `npm run dev`           | 開発サーバー起動     |
| `npm run build`         | プロダクションビルド |
| `npm start`             | 本番サーバー起動     |
| `npm test`              | テスト実行           |
| `npm run lint`          | ESLintチェック       |
| `npm run type-check`    | TypeScriptチェック   |
| `./start_serena_mcp.sh` | MCPサーバー起動      |

### 🌟 主要ページ

| ページ         | パス             | 説明                     |
| -------------- | ---------------- | ------------------------ |
| ダッシュボード | `/dashboard`     | リアルタイム経営指標     |
| 日報管理       | `/daily-reports` | 施術記録入力・管理       |
| 患者分析       | `/patients`      | 患者行動・LTV分析        |
| 収益分析       | `/revenue`       | 売上トレンド・構造分析   |
| スタッフ管理   | `/staff`         | 人事・パフォーマンス管理 |
| AI分析         | `/ai-insights`   | 経営改善提案・インサイト |

### 🎨 デザインシステム

- **カラーパレット**: 医療系に適した清潔感のあるブルー基調
- **タイポグラフィ**: 可読性を重視したフォント選択
- **レスポンシブ**: モバイル・タブレット・デスクトップ対応
- **ダークモード**: 長時間利用に配慮した目に優しいUI

### 📊 パフォーマンス指標

- **初回読み込み時間**: < 3秒
- **ページ遷移時間**: < 1秒
- **テスト成功率**: 96% (95個中91個成功)
- **TypeScript覆盖率**: 100%

### 🔒 セキュリティ

- **認証・認可**: Supabase Auth実装予定
- **データ暗号化**: 患者情報の適切な保護
- **アクセス制御**: 役職別権限管理
- **監査ログ**: 全操作履歴記録

### 🤝 開発チーム

- **フロントエンド**: Next.js + React + TypeScript
- **バックエンド**: Supabase + PostgreSQL
- **AI・ML**: Gemini AI統合
- **DevOps**: 自動テスト・デプロイ

### 📈 ロードマップ

#### Phase 1: UIコンポーネント整備 (Week 1-3)

- [ ] Select, Dialog, Tabsコンポーネント実装
- [ ] フォームバリデーション強化
- [ ] レスポンシブ対応改善

#### Phase 2: Backend統合 (Week 4-6)

- [ ] Supabase完全統合
- [ ] リアルタイムデータ同期
- [ ] 認証・認可システム実装

#### Phase 3: 本番環境対応 (Week 7-8)

- [ ] パフォーマンス最適化
- [ ] セキュリティ強化
- [ ] 監視・ログシステム導入

### 📞 サポート

技術的な質問や問題については、開発チームまでお問い合わせください。

### 📄 ライセンス

本プロジェクトは社内限定の独自ライセンス（Internal Use Only）の方針です。社外での利用・改変・再配布・SaaS提供等を禁じます。詳細なライセンス文は今後`LICENSE`に明記予定です。

---

**🏥 整骨院の経営を、データとAIの力で革新する。**

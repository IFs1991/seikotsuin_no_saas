# ローカル開発環境（Supabase + Docker）要件定義書

## 1. 目的
- 本番は `Vercel + Supabase(Managed)` とし、ローカルでは **Docker を用いて Supabase を再現**して機能検証・動作確認を行える状態を作る。
- 個人開発前提で「迷わず起動できる」「壊してもすぐ復旧できる」「本番との差分が把握できる」ことを最優先にする。

## 2. スコープ
### 対象
- Supabase（ローカル）: DB/Auth/Storage/Realtime 等、Supabase CLI が提供するローカルスタック
- アプリ（Next.js）: `docker-compose.dev.yml` での起動・疎通
- マイグレーション運用: `supabase/migrations/*` を唯一のDB定義ソースとする

### 対象外（この段階ではやらない）
- Vercel 本番デプロイの最適化（後工程）
- チーム向けオンボーディング（個人開発のため）
- 監視/通知の本番統合（Sentry 等）

## 3. 現状観察（リポジトリの状態）
- Supabase: `supabase/migrations` は存在する一方、`supabase/config.toml` が見当たらない。
- Supabase: `supabase/.temp/` が存在し、生成物が混入しやすい（`.gitignore` で除外済みにする）。
- Docker:
  - `docker-compose.dev.yml` は Next.js のみ起動（Supabaseサービスは含まない）。
  - `docker-compose.yml` は production 用の Next.js のみ（standalone build）。
- 環境変数: `.env` に実値を置く運用は漏洩リスクが高い（ローカルは `.env.local`/`.env.development.local` に集約し、例は `*.example` のみコミット）。

## 4. 目指す構成（推奨）
### 原則
- Supabaseは **Supabase CLI** で起動し、内部的に Docker を使う（`supabase start`）。
- アプリは Docker（`docker-compose.dev.yml`）でもホストでもよいが、Docker テストを主とする。

### 構成イメージ
- Supabase（ローカル）: `supabase start`（Dockerコンテナ群）
- Next.js（ローカル）: `docker-compose -f docker-compose.dev.yml up --build`
- Next.js → Supabase: `NEXT_PUBLIC_SUPABASE_URL` 等をローカルSupabaseへ向ける

## 5. 機能要件
### 5.1 起動・停止
- ローカルSupabaseをコマンド一発で起動できること。
- ローカルSupabaseを停止し、状態をクリーンにして再起動できること（DBリセット含む）。

### 5.2 DBスキーマの反映
- `supabase/migrations/*` を適用してDBスキーマを再現できること。
- 「初期化→マイグレーション適用→疎通」までを毎回同じ手順で行えること。

### 5.3 型生成（TypeScript）
- ローカルSupabase（または本番Supabase）から `src/types/supabase.ts` を生成できること。
- 生成手順が1コマンド化されていること（例: `npm run supabase:types`）。

### 5.4 環境変数管理
- ローカル用の `.env.local`（または `.env.development.local`）で Supabase 接続先を切り替えられること。
- 秘密情報（service role key 等）を Git 管理しないこと。

## 6. 非機能要件
- 再現性: ローカル環境を壊しても 30分以内に復旧できること。
- 安全性: `SUPABASE_SERVICE_ROLE_KEY` をブラウザへ露出させないこと（サーバ専用）。
- 差分の可視化: 本番Supabaseとの差分は「migrationsの差」「envの差」として把握できること。

## 7. 成果物（この要件を満たすためにリポジトリに必要なもの）
- `supabase/config.toml`（秘匿情報を含まない設定のみ、作成・管理方針を明記）
- `supabase/migrations/*`（スキーマ定義の唯一ソース）
- `.env.local.example`（ローカルの接続先設定例）
- `docs/LOCAL_DEV_ENV_REQUIREMENTS.md`（本書）

## 8. 運用ルール（個人開発向け最小）
- DB変更は「ローカルで変更 → migration作成 → `supabase/migrations` に反映」の順に統一する。
- `supabase/.temp` のような生成物はコミットしない（`.gitignore`で除外）。
- 本番に反映するのは「migration」「RLS/関数/ビュー」などDB定義のみ。データは別管理。
- 秘密情報はローカルの `.env.local` 等に置き、Git管理しない。漏洩が疑われる場合はSupabase/Google側のキーをローテーションする。

## 9. 受け入れ条件（Acceptance Criteria）
- ローカルで以下が再現できること:
  - Supabase起動
  - migration適用（または reset で再構築）
  - Next.js（Docker）起動
  - API疎通（例: `/api/health` が成功）
  - 型生成が成功（`src/types/supabase.ts` が更新される）

## 10. 推奨手順（最短ルート）
### 10.1 Supabase（ローカル）
- 前提: Docker Desktop が起動していること
- 初期化（未実施の場合）: `supabase init`
- 起動: `supabase start`
- 接続情報確認: `supabase status -o env`
- DB再構築（migration含め再適用）: `supabase db reset`

### 10.2 Next.js（Dockerでテスト）
- 起動: `docker compose -f docker-compose.dev.yml up --build`
- アクセス: `http://localhost:3001`
- ヘルスチェック: `http://localhost:3001/api/health`

### 10.3 型生成（任意タイミング）
- 本リポジトリのスクリプト: `npm.cmd run supabase:types`
- 期待結果: `src/types/supabase.ts` が更新され、差分がコミット対象になる

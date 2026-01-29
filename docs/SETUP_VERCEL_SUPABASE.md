# Vercel + Supabase 本番セットアップ手引書

この手引書は、本リポジトリを Vercel と Supabase に本番デプロイして
SaaS として動作させるための最小手順です。
安定化方針に沿って、変更は小さく・確実に進めてください。

## 0. 前提（リポジトリ側）

- スキーマ/RLSの正は `supabase/migrations/*.sql`
  - 根拠: `RLS_DEPLOYMENT_MANUAL.md`
- 本番で必須の環境変数チェックは `src/lib/env.ts` の `REQUIRED_ENV_VARS`
- CSP/RateLimit などは `middleware.ts` と `src/lib/rate-limiting/middleware.ts` を参照

## 1. Supabase（Hosted）プロジェクト作成

1. Supabaseで新規プロジェクト作成
2. 以下を取得
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - 根拠: `src/lib/env.ts`

## 2. Supabase Auth 設定（本番URL対応）

1. 本番URLを Supabase Dashboard の Auth 設定に反映
   - `site_url` / `additional_redirect_urls`
   - ローカル値は `supabase/config.toml` の `[auth]` を参照
2. Custom Access Token Hook を有効化
   - `public.custom_access_token_hook`
   - 根拠: `supabase/config.toml` の `[auth.hook.custom_access_token]`

## 3. マイグレーション適用（本番）

1. 事前にバックアップを取得（本番にデータがある場合）
2. `supabase/migrations` を本番へ反映
   - 推奨フローは `RLS_DEPLOYMENT_MANUAL.md` の「Step 3」
3. 注意:
   - `supabase db push` は承認が必要
   - `src/api/database/rls-policies.sql` の手動実行は禁止（同ドキュメント参照）

## 4. Vercel プロジェクト作成

1. Vercelで新規プロジェクト作成
2. GitHub連携
3. `vercel.json` の設定を利用
   - `buildCommand`: `npm run build`
   - `installCommand`: `npm ci`
   - `framework`: `nextjs`

## 5. Vercel 環境変数（必須/推奨/任意）

### 必須（動作に必須）

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
  - 根拠: `src/lib/env.ts`
- `NEXT_PUBLIC_APP_URL`
  - 参照: `src/app/invite/actions.ts`, `src/app/api/onboarding/invites/route.ts`,
    `src/app/api/admin/staff/invites/route.ts`, `src/lib/api-helpers.ts`

### 推奨（セキュリティ/運用）

- `CSP_ROLLOUT_PHASE`（例: `full-enforce`）
  - 参照: `middleware.ts`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
  - 参照: `src/lib/rate-limiting/middleware.ts`

### 任意（機能が必要な場合のみ）

- `GEMINI_API_KEY`
  - 参照: `src/app/api/ai-insights/route.ts`, `src/api/gemini/ai-analysis-service.ts`

### 注意（変数名のズレ）

- `.env.production.example` では `GOOGLE_AI_API_KEY` になっていますが、
  コードは `GEMINI_API_KEY` を参照します。

## 6. 本番デプロイ

1. Vercelで Production デプロイ実行
2. ビルドログで `npm run build` 成功を確認

## 7. 本番動作チェック（最小）

- 管理者ログイン
- 招待URL動作（`NEXT_PUBLIC_APP_URL`）
- 主要画面の表示
- 余裕があれば RLS 検証（`RLS_DEPLOYMENT_MANUAL.md` のSQL）

## 8. ローカルでの事前検証（DoD）

DoDに沿って最低限の検証を行うと安全です:
- `docs/stabilization/DoD-v0.1.md` の DOD-01/02/03/04/08

注意: `supabase db reset --local` や `supabase db push` は承認が必要です。

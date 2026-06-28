# 整骨院管理SaaS

整骨院・治療院向けの業務管理 SaaS です。Next.js App Router と Supabase をベースに、予約、患者、日報、収益、管理設定、セキュリティ監視を 1 つのアプリで扱います。

現行の主眼は新規機能追加ではなく、`docs/stabilization/DoD-v0.1.md` に沿った安定化です。ローカル Supabase、Docker、Playwright、RLS の再現性を重視しています。

## 現在の実装範囲

### アプリケーション

- 公開導線
  - `/` ランディング
  - `/login` スタッフログイン
  - `/admin/login` 管理者ログイン
  - `/register`, `/invite`, `/forgot-password`, `/reset-password/[source]`
  - `/terms`, `/privacy`, `/unauthorized`
- 業務アプリ
  - `/dashboard` ダッシュボード
  - `/reservations`, `/reservations/new`, `/reservations/list`, `/reservations/register`
  - `/reservations/settings/menus`, `/reservations/settings/resources`
  - `/patients`, `/patients/list`, `/patients/[id]`
  - `/daily-reports`, `/daily-reports/input`, `/daily-reports/edit/[id]`
  - `/revenue`
  - `/staff`
  - `/multi-store`
  - `/onboarding`
  - `/chat`
  - `/ai-insights`
  - `/blocks`
  - `/master-data`
- 管理者機能
  - `/admin`
  - `/admin/users`
  - `/admin/tenants`
  - `/admin/settings`
  - `/admin/security-dashboard`
  - `/admin/security-monitor`
  - `/admin/session-management`
  - `/admin/mfa-setup`
  - `/admin/chat`
  - `/admin/master`
  - `/admin/beta-monitoring`

### API / バックエンド

- 業務 API
  - `src/app/api/reservations/route.ts`
  - `src/app/api/customers/route.ts`
  - `src/app/api/patients/route.ts`
  - `src/app/api/daily-reports/route.ts`
  - `src/app/api/revenue/route.ts`
  - `src/app/api/dashboard/route.ts`
  - `src/app/api/menus/route.ts`
  - `src/app/api/resources/route.ts`
  - `src/app/api/blocks/route.ts`
- 公開 API
  - `src/app/api/public/menus/route.ts`
  - `src/app/api/public/reservations/route.ts`
- オンボーディング / 認証補助
  - `src/app/api/onboarding/*`
  - `src/app/api/auth/profile/route.ts`
  - `src/app/api/mfa/*`
- 管理 API
  - `src/app/api/admin/settings/route.ts`
  - `src/app/api/admin/users/route.ts`
  - `src/app/api/admin/tenants/route.ts`
  - `src/app/api/admin/master-data/*`
  - `src/app/api/admin/security/*`
  - `src/app/api/admin/rate-limit/*`
- 通知 / 外部連携
  - `src/app/api/internal/process-email-outbox/route.ts`
  - `src/app/api/webhooks/resend/route.ts`
  - `src/app/api/security/csp-report/route.ts`
  - `src/app/api/health/route.ts`

## 技術スタック

- フロントエンド: Next.js 15, React 19, TypeScript, Tailwind CSS
- データ / 認証: Supabase, PostgreSQL, Row Level Security
- 状態管理 / フォーム: TanStack Query, React Hook Form, Zod, Zustand
- 監視 / セキュリティ: Sentry, Upstash Redis, CSP, rate limiting, MFA
- メール: Resend
- テスト: Jest, React Testing Library, Playwright

主要依存とスクリプトは [package.json](/C:/Users/seekf/Desktop/seikotsuin_management_saas/package.json) を正本としてください。

## セキュリティとアクセス制御

- 必須環境変数は `src/lib/env.ts` で起動時に検証します。
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
- 保護対象ルートとログイン分岐は [middleware.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/middleware.ts) で管理しています。
  - `/admin/**` は管理者ログインへ
  - それ以外の保護ルートはスタッフログインへ
- CSP ヘッダー、レート制限、Pilot mode の制御も `middleware.ts` に集約されています。
- ローカル Supabase は `supabase/config.toml` で管理し、`auth.hook.custom_access_token` により clinic scope を JWT claim に反映します。

## セットアップ

### 前提

- Node.js `>=18.18.0`
- npm `>=10.0.0`
- Docker Desktop
- Supabase CLI

### インストール

```bash
npm install
```

### 環境変数

最小構成は `.env.local.example` をベースに `.env.local` を作成します。

```bash
cp .env.local.example .env.local
```

最低限、以下は設定が必要です。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

用途別のテンプレート:

- 開発: `.env.local.example`
- テスト: `.env.test.example`
- 本番相当: `.env.production.example`
- 参考: `env.example`

環境変数の取り扱い方針は [docs/operations/ENV_MANAGEMENT_POLICY.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/operations/ENV_MANAGEMENT_POLICY.md) を参照してください。

## ローカル起動

### アプリ単体

```bash
npm run dev
```

- デフォルト URL: `http://localhost:5173`
- Vite の開発サーバー上で LP を確認できます
- `/api/gemini` は `vite.config.js` のローカルミドルウェア経由で動きます

## LP デモ用 Gemini API 設定

この LP の AI デモは Gemini API をサーバー側の `/api/gemini` 経由で呼び出します。ルートに `.env.local` を作成して設定してください。

```bash
copy .env.example .env.local
```

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
VITE_SHEETS_ENDPOINT=
```

- `GEMINI_API_KEY` は Google AI Studio / Gemini API のキーを指定します
- `GEMINI_MODEL` は任意です。未指定時は `gemini-2.5-flash` を使います
- `VITE_SHEETS_ENDPOINT` は Google Apps Script の Web App URL を指定します
- API キーはブラウザに露出しません
- 旧キー名の `VITE_GEMINI_API_KEY` / `VITE_GEMINI_MODEL` も互換のため当面は読み取れますが、今後は `GEMINI_*` を使ってください
- `VITE_SHEETS_ENDPOINT` はクライアントから直接参照されるため、公開前提の URL です

## Vercel デプロイ

このリポジトリは静的な Vite フロントエンド + Vercel Serverless Function `api/gemini.js` の構成です。

### Vercel に設定する環境変数

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `VITE_SHEETS_ENDPOINT`

### 手順

1. Vercel にこのリポジトリを Import する
2. Build Command を `npm run build` にする
3. Output Directory を `dist` にする
4. Environment Variables に `GEMINI_API_KEY`、必要なら `GEMINI_MODEL`、フォーム連携用に `VITE_SHEETS_ENDPOINT` を追加する
5. Deploy する

### 補足

- この LP はハッシュルーティングなので、追加の SPA rewrite は不要です
- `/api/gemini` は Vercel Functions として動作します
- 先行登録フォームは `VITE_SHEETS_ENDPOINT` に Apps Script Web App URL を入れると、Google スプレッドシートへ保存され、登録数も GET 集計で反映されます

### ローカル Supabase

```bash
supabase start
supabase status
npm run verify:supabase
```

ローカル構成の主要ポートは `supabase/config.toml` に定義されています。

- API: `54331`
- DB: `54332`
- Studio: `54333`
- Inbucket: `54334`

安定化 DoD では以下が基準です。

- `supabase start`
- `supabase status`
- `supabase db push --local --dry-run`
- `npm run verify:supabase`

詳細は [docs/stabilization/DoD-v0.1.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/DoD-v0.1.md) を参照してください。

### Docker

開発用:

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose ps
```

本番相当:

```bash
docker compose up -d
docker compose ps
```

ヘルスチェックは `GET /api/health` で確認できます。実装は [src/app/api/health/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/health/route.ts) です。

## テストと検証

### 日常的に使うコマンド

```bash
npm run lint
npm run type-check
npm run test -- --ci --testPathIgnorePatterns=e2e
npm run build
```

### E2E / Playwright

```bash
npm run e2e:validate-fixtures
npm run e2e:seed
npm run test:e2e:pw
npm run e2e:cleanup
```

- Playwright 設定は [playwright.config.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/playwright.config.ts) を参照してください。
- `PLAYWRIGHT_BASE_URL` 未指定時は `NEXT_PUBLIC_APP_URL`、それもなければ `http://127.0.0.1:3000` を使います。
- `webServer` は `npm run dev -- --port <baseURL port>` で起動します。

### Supabase 型生成 / セキュリティ補助

```bash
npm run supabase:types
npm run scan:secrets
```

## 運用ドキュメント

- 安定化 DoD: [docs/stabilization/DoD-v0.1.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/DoD-v0.1.md)
- Runbook: [docs/operations/RUNBOOK.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/operations/RUNBOOK.md)
- 環境変数管理: [docs/operations/ENV_MANAGEMENT_POLICY.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/operations/ENV_MANAGEMENT_POLICY.md)
- 全体概要: [docs/PROJECT_OVERVIEW.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/PROJECT_OVERVIEW.md)
- Playwright 手引き: [docs/Playwright_E2E手引書.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/Playwright_E2E手引書.md)

## ディレクトリ概要

```text
src/
  app/          Next.js App Router のページと API
  components/   画面コンポーネント
  hooks/        画面向けカスタムフック
  lib/          認証、Supabase、通知、セキュリティ、サービス層
  providers/    React Context
  types/        TypeScript 型
  __tests__/    Jest / Playwright テスト
supabase/
  config.toml   ローカル Supabase 設定
  migrations/   現行マイグレーション
  rollbacks/    ロールバック SQL
scripts/
  e2e/          E2E 用 seed / cleanup / preflight
docs/
  stabilization/ 安定化仕様と DoD
  operations/    Runbook と運用ドキュメント
```

## 補足

- 旧 README にあった「未実装予定」「古いポート前提」「予約機能 82% 完了」などの記述は、現行コードベースと一致しないため削除しています。
- マイグレーション変更はこの README 更新では行っていません。
- 破壊的な Supabase / Docker 操作は `AGENTS.md` の approval ルールに従ってください。

## ライセンス

`UNLICENSED`。社内利用前提です。

# 整骨院管理SaaS

整骨院・治療院向けのマルチテナント業務管理 SaaS です。Next.js 15 (App Router) と Supabase をベースに、予約、患者、日報、収益、スタッフ、管理設定、セキュリティ監視を 1 つのアプリで扱います。

テナント境界は `clinic_id`。患者情報を扱う医療系システムのため、認可・RLS・テナント分離を最優先しています。現行バージョンは `0.1.0-pilot` で、主眼は新規機能追加ではなく `docs/stabilization/DoD-v0.1.md` に沿った**安定化**です。ローカル Supabase、Docker、Playwright、RLS の再現性を重視しています。

## 現在の実装範囲

### ルーティング（ルートグループ構成）

App Router のルートグループでアクセス境界を分離しています。

- `(public)` — 未認証導線
  - `/` ランディング
  - `/login` スタッフログイン / `/admin/login` 管理者ログイン / `/admin/callback`
  - `/register`, `/register/verify`, `/invite`, `/forgot-password`, `/reset-password/[source]`
  - `/booking/[clinic_id]` 公開予約
  - `/terms`, `/privacy`, `/unauthorized`
- `(app)` — 認証必須の業務画面（AppShell レイアウト）
  - `/dashboard`
  - `/reservations`, `/reservations/new`, `/reservations/list`, `/reservations/register`, `/reservations/[id]`
  - `/reservations/settings/menus`, `/reservations/settings/resources`
  - `/patients`, `/patients/list`, `/patients/[id]`
  - `/daily-reports`, `/daily-reports/input`, `/daily-reports/edit/[id]`
  - `/revenue`, `/staff`, `/staff/shift-requests`, `/staff/shift-requests/admin`
  - `/multi-store`, `/onboarding`, `/chat`, `/ai-insights`, `/blocks`, `/master-data`
- `(app)/manager` — manager（多店舗統括）向け画面
  - `/manager/clinic-comparison`, `/manager/shift-requests`, `/manager/staff`, `/manager/staff-analysis`
- `(app)/admin/(protected)` — 管理者機能
  - `/admin/users`, `/admin/tenants`, `/admin/settings`, `/admin/managers`, `/admin/master`
  - `/admin/security-dashboard`, `/admin/security-monitor`, `/admin/session-management`
  - `/admin/mfa-setup`, `/admin/chat`, `/admin/beta-monitoring`, `/admin/shift-requests`

### API / バックエンド

API は `src/app/api/**/route.ts`。網羅一覧ではなく主要なドメイン単位で記載します（正本はソースを参照）。

- 業務 API: `reservations`, `customers`, `patients`, `daily-reports`（および `daily-reports/items` の pricing / tags / care-episode）, `revenue`, `revenue-estimates`, `dashboard`（`dashboard/bootstrap`）, `menus`, `menu-templates`（billing-profiles 含む）, `resources`, `blocks`, `clinics`, `care-episodes`, `customers/[id]/insurance-coverages`
- スタッフ / シフト: `staff`, `staff/shifts`, `staff/preferences`, `staff/demand-forecast`, `staff/shift-requests`（`convert` 含む）, `staff/shift-request-periods`
- manager 集計 API: `manager/dashboard`, `manager/assigned-clinics`, `manager/clinic-comparison`, `manager/revenue/analysis`, `manager/patients/analysis`, `manager/daily-reports/overview`, `manager/staff`, `manager/staff-analysis`
- 公開 API: `public/menus`, `public/reservations`, `public/resources`
- オンボーディング / 認証補助: `onboarding/*`（clinic / profile / invites / status / seed）, `auth/profile`, `mfa/*`（setup / verify / status / disable / backup-codes）
- 管理 API: `admin/settings`, `admin/users`（accounts / candidates / [permission_id]）, `admin/tenants/[clinic_id]`, `admin/managers/[managerUserId]/clinics`, `admin/master-data`（export / import / rollback）, `admin/security/*`, `admin/rate-limit/*`, `admin/staff/invites`, `admin/dashboard`, `admin/chat`, `admin/ai-insights`, `admin/notifications`, `admin/monitoring/sentry-test`, `admin/tables`
- AI: `ai-insights`, `ai-comments`, `chat`, `clinic/analysis`, `customers/analysis`
- ベータ運用: `beta/feedback`, `beta/backlog`, `beta/metrics`
- 通知 / 外部連携 / 監視: `internal/process-email-outbox`（outbox → Resend）, `webhooks/resend`, `security/csp-report`, `notifications`, `system/status`, `health`

## 技術スタック

- フロントエンド: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/Radix UI, lucide-react, Recharts
- データ / 認証: Supabase, PostgreSQL, Row Level Security
- 状態管理 / フォーム: TanStack Query, React Hook Form, Zod, Zustand
- 監視 / セキュリティ: Sentry, Upstash Redis（rate limiting）, CSP, MFA（speakeasy / QR）
- メール: Resend（`email_outbox` 経由の outbox パターン）
- テスト: Jest, React Testing Library, Playwright

主要依存とスクリプトは [package.json](package.json) を正本としてください。

## アーキテクチャの要点

- **Supabase クライアントは必ず `@/lib/supabase` から import**（`@/lib/supabase/server` の直 import は ESLint エラー）。
  - `createClient()` / `getServerClient()`: リクエスト毎の SSR クライアント（RLS 適用、通常はこれ）
  - `createAdminClient()`: service role で RLS バイパス（サーバー専用・最小限）
  - `createScopedAdminContext()`: clinic scope 検証付き admin クライアント（管理系・多店舗操作）
- **API ルートの定型**: Zod 検証（`src/lib/schemas/`）→ `processApiRequest()`（`src/lib/api-helpers.ts`、管理 API は `verifyAdminAuth()`）→ clinic scope 強制（`ensureClinicAccess()` / `processClinicScopedBody()`）→ 統一エンベロープ `{ success, data | error }` → `handleRouteError()` + `AppError`。
- **認可モデル**: `user_permissions` の `role` + `clinic_id`（単店舗）/ `clinic_scope_ids`（複数店舗）。manager スコープは `resolveEffectiveClinicScope()`、role 正規化は `normalizeRole()`（`clinic_manager` → `clinic_admin`）。**RLS が最後の砦**。
- **データベース SSOT は `supabase/migrations/` のみ**。`src/database/` 等は参照資料で直接適用禁止。予約は `reservations` が SSOT（`appointments` はレガシー読み取り専用）。`src/types/supabase.ts` は `npm run supabase:types` の生成物（手書き編集禁止）。
- **日付・時刻は必ず `src/lib/jst.ts` の JST ユーティリティを使う**（UTC/JST 混在で E2E が落ちた実績あり）。

## セキュリティとアクセス制御

- 必須環境変数は `src/lib/env.ts` で起動時に検証します（`NODE_ENV=test` は除外）。
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
- 保護対象ルート（`PROTECTED_ROUTE_PREFIXES`）とログイン分岐は [middleware.ts](middleware.ts) で管理しています。
  - `/admin/**` は管理者ログイン（`/admin/login`）へ
  - それ以外の保護ルートはスタッフログイン（`/login`、`redirectTo` 付き）へ
- middleware パイプラインの順序: ①レート制限（Upstash Redis、429 + Retry-After）②CSP nonce 生成 + ヘッダー付与（`CSP_ROLLOUT_PHASE`: `report-only` | `partial-enforce` | `full-enforce`、失敗時 fail-open）③保護ルート判定 ④Pilot mode リダイレクト。
- Pilot mode（`NEXT_PUBLIC_PILOT_MODE=true`）時は `/chat`, `/ai-insights`, `/admin/security-*`, `/admin/beta-monitoring`, `/admin/session-management`, `/admin/master`, `/admin/chat`, `/blocks`, `/master-data` を `/dashboard` へリダイレクトします。
- ローカル Supabase は `supabase/config.toml` で管理し、`auth.hook.custom_access_token` により clinic scope を JWT claim に反映します。

## セットアップ

### 前提

- Node.js `24.x`
- npm `>=10.0.0`
- Docker Desktop
- Supabase CLI

### インストール

```bash
npm install
```

> npm 固定です。他パッケージマネージャのロックファイル導入は禁止しています。

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

主要フラグ: `NEXT_PUBLIC_PILOT_MODE` / `NEXT_PUBLIC_ENABLE_CHAT` / `NEXT_PUBLIC_ENABLE_AI_INSIGHTS` / `CSP_ROLLOUT_PHASE`。

環境変数の取り扱い方針は [docs/operations/ENV_MANAGEMENT_POLICY.md](docs/operations/ENV_MANAGEMENT_POLICY.md) を参照してください。

## ローカル起動

### アプリ単体

```bash
npm run dev
```

- デフォルト URL: `http://localhost:3000`
- `dev` は `npx next dev --hostname 0.0.0.0` を実行します（`predev` で SWC バイナリを検証）。

### ローカル Supabase

```bash
supabase start
supabase status
npm run verify:supabase
```

ローカル構成の主要ポートは `supabase/config.toml` に定義されています（デフォルトと異なる点に注意）。

- API: `54331`
- DB: `54332`
- Studio: `54333`
- Inbucket: `54334`

安定化 DoD では以下が基準です。

- `supabase start`
- `supabase status`
- `supabase db push --local --dry-run`（スキーマ drift = diff ゼロが基準）
- `npm run verify:supabase`

詳細は [docs/stabilization/DoD-v0.1.md](docs/stabilization/DoD-v0.1.md) を参照してください。

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

ヘルスチェックは `GET /api/health` で確認できます。実装は [src/app/api/health/route.ts](src/app/api/health/route.ts) です。

## テストと検証

### 日常的に使うコマンド

```bash
npm run lint           # ESLint（lint:fix で自動修正）
npm run type-check     # tsc --noEmit
npm run test -- --ci --testPathIgnorePatterns=e2e
npm run build          # standalone 出力
```

- Jest は 2 プロジェクト構成: `*.test.tsx` → client (jsdom) / `*.test.ts` → server (node)。拡張子で実行環境が決まります。
- `scripts/run-jest.mjs` 経由で、Windows では `--runInBand` が自動付与されます。
- `src/__tests__/` は tsconfig 型チェック・ESLint の対象外（テスト内は `any` 許容）。

### CI 必須ゲート（`.github/workflows/ci.yml`）

PR 前にローカルで通すこと。

1. lint + type-check + `npm run scan:secrets`
2. build
3. `src/types/supabase.ts` の先頭が `export type Json`
4. `npm run e2e:validate-fixtures`（静的）
5. `npm run test:pr05:focused`（CI 必須ゲートの 9 スイート回帰）

### E2E / Playwright

```bash
npm run e2e:validate-fixtures
npm run e2e:seed
npm run test:e2e:pw
npm run e2e:cleanup
```

- Playwright 設定は [playwright.config.ts](playwright.config.ts) を参照してください。
- baseURL は `PLAYWRIGHT_BASE_URL` > `NEXT_PUBLIC_APP_URL` > `http://127.0.0.1:3000`。
- `webServer` は `npm run dev` を自動起動します（seed 必須）。

### Supabase 型生成 / セキュリティ補助

```bash
npm run supabase:types   # → src/types/supabase.ts
npm run scan:secrets     # 機密スキャン（CI 必須）
```

## 運用ドキュメント

- 作業規約（正本）: [AGENTS.md](AGENTS.md)
- 安定化 DoD: [docs/stabilization/DoD-v0.1.md](docs/stabilization/DoD-v0.1.md)
- 変更仕様書の置き場: `docs/stabilization/spec-*.md`
- Runbook: [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md)
- 環境変数管理: [docs/operations/ENV_MANAGEMENT_POLICY.md](docs/operations/ENV_MANAGEMENT_POLICY.md)
- DB 設計の参照資料: [src/database/README.md](src/database/README.md)（SSOT は `supabase/migrations/`）

## ディレクトリ概要

```text
src/
  app/
    (public)/     未認証導線（login, register, booking ほか）
    (app)/        認証必須の業務画面（manager / admin 配下を含む）
    api/          業務 / 公開 / 管理 / manager / internal API
  components/      画面・UI コンポーネント（ui/ は shadcn ベース）
  hooks/          React Query フック（queries/ にクエリ定義）
  lib/            auth, supabase, schemas, services, security, rate-limiting,
                  notifications, reservations, staff, insurance-fees, ai ほか
  providers/      query-provider / selected-clinic-context / user-profile-context
  types/          TypeScript 型（supabase.ts は生成物）
  __tests__/      Jest / Playwright テスト（api, lib, security, rls, stabilization ほか）
supabase/
  config.toml     ローカル Supabase 設定
  migrations/     現行マイグレーション（実行 SSOT）
  rollbacks/      ロールバック SQL（migration 追加時にセットで用意）
scripts/
  e2e/            E2E 用 seed / cleanup / validate-fixtures
docs/
  stabilization/  安定化仕様（spec-*）と DoD
  operations/     Runbook と運用ドキュメント
```

## 補足

- API / 画面の網羅一覧は記載していません。正本は `src/app/` のソースを参照してください。
- マイグレーションの追加・変更はこの README 更新では行っていません（追加時は仕様書 + ロールバック SQL をセットで用意）。
- 破壊的な Supabase / Docker 操作（`db reset` / `db push`、ボリューム削除、force-push 等）は `AGENTS.md` の approval ルールに従ってください。
- `src/legacy/` は lint・型チェック対象外のレガシーです。拡張・パターン流用は禁止しています。

## ライセンス

`UNLICENSED`。社内利用前提です。
</content>
</invoke>

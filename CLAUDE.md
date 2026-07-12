# CLAUDE.md — コードベース地図

作業規約（セキュリティ不変条件・型安全・破壊的操作の承認・テスト規律）の正本は @AGENTS.md（自動インポート）。本ファイルは事実情報のみ。

## プロジェクト概要

整骨院・治療院向けマルチテナント業務管理SaaS（予約・患者・日報・収益・スタッフ・管理設定・セキュリティ監視）。

- **スタック**: Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS / Supabase (PostgreSQL + RLS) / TanStack Query / React Hook Form + Zod / Upstash Redis / Resend / Sentry / Gemini AI
- **フェーズ**: `0.1.0-pilot`。新機能追加より**安定化**が主眼（DoD 12項目PASS済みを維持する）
- **テナント境界**: `clinic_id`。患者情報を扱う医療系システムのため、認可・RLS・テナント分離は最優先事項

## よく使うコマンド

```bash
npm run dev                                          # 開発サーバー (0.0.0.0、predevでSWC検証)
npm run build                                        # 本番ビルド (standalone出力)
npm run lint / npm run lint:fix                      # ESLint（CIは lint:ci、warning上限183）
npm run type-check                                   # tsc --noEmit

# テスト（scripts/run-jest.mjs 経由。Windowsでは --runInBand 自動付与）
npm run test -- --ci --testPathIgnorePatterns=e2e    # 単体テスト全体
npm run test -- --runTestsByPath src/__tests__/lib/foo.test.ts   # 単一ファイル
npm run test:pr05:focused                            # CI必須ゲートの9スイート回帰
npm test -- --ci --testPathPattern="security|session-management" # セキュリティテスト

# E2E (Playwright, src/__tests__/e2e-playwright/)
npm run e2e:validate-fixtures && npm run e2e:seed    # 事前準備
npm run test:e2e:pw                                  # 実行（終了後 npm run e2e:cleanup）

# Supabase / その他
supabase start && supabase status                    # ローカルSupabase起動
supabase db push --local --dry-run                   # スキーマdrift確認（diffゼロが基準）
npm run supabase:cli:verify                          # .supabase-cli-versionとの一致確認
npm run supabase:types                               # 型生成 → src/types/supabase.ts
npm run verify:supabase                              # 接続検証
npm run scan:secrets                                 # 機密スキャン（CI必須）
npm run mobile-uiux:check-production-assets          # mobile-uiux 生成資産のdrift確認（CI必須）
```

**CIゲート**（`.github/workflows/ci.yml`）: ①Quality Checks = `lint:ci` + `type-check` + commercial type-check + mobile-uiux資産drift + `scan:secrets` ②Build ③Supabase Types Contract（生成ファイル破損だけを見る移行用補助check）④Database Contract（固定CLI、clean migration replay、seed、pgTAP、完全なgenerated-type diff）⑤Fixture Preflight（静的）⑥Full Jest Regression ⑦Security Tests ⑧App E2E（Database Contract成功後にlocal Supabase + fixture検証 + Chromium smoke）。schema/type driftの正本ゲートはDatabase Contractであり、旧header-only checkはbranch protection移行完了後に解除する。

## アーキテクチャ

### ルーティング（src/app）

- **`(public)`**: 未認証導線 — `/`, `/login`, `/admin/login`, `/register`, `/invite`, `/forgot-password`, `/reset-password/[source]`, `/booking/[clinic_id]`（公開予約・LIFF）, `/terms`, `/privacy`, `/unauthorized`
- **`(app)`**: 認証必須の業務画面 — `/dashboard`, `/reservations/**`, `/patients/**`, `/daily-reports/**`, `/revenue`, `/staff/**`, `/multi-store`, `/manager/**`（manager集計）, `/mobile-uiux/**`, `/onboarding`, `/chat`, `/ai-insights`, `/blocks`, `/master-data`。AppShellレイアウト
- **`(app)/admin/(protected)`**: 管理者画面 — `/admin/users`, `/admin/tenants`, `/admin/settings`, `/admin/managers`, `/admin/security-*`, `/admin/session-management`, `/admin/mfa-setup` 等
- **API**: `src/app/api/**/route.ts` — 業務API、公開API（`/api/public/*`）、管理API（`/api/admin/*`）、manager集計API（`/api/manager/*`）、内部cron（`/api/internal/*`、`CRON_SECRET`）、ヘルスチェック（`/api/health`）

### middleware.ts のパイプライン（順序が重要）

1. レート制限（`src/lib/rate-limiting/`、Upstash Redisバック、429 + Retry-After）
2. CSP nonce生成 + CSPヘッダー付与（`CSP_ROLLOUT_PHASE`: `report-only` | `partial-enforce` | `full-enforce`。失敗時はfail-open。`/mobile-uiux` は専用CSP）
3. 保護ルート判定（`PROTECTED_ROUTE_PREFIXES`。`/manager`, `/mobile-uiux` も含む）→ 未認証は `/admin/**` → `/admin/login`、それ以外 → `/login`（`redirectTo` 付き）
4. Pilot mode（`NEXT_PUBLIC_PILOT_MODE=true`）時は `/chat`, `/ai-insights`, `/admin/security-*`, `/admin/beta-monitoring`, `/admin/session-management`, `/admin/master`, `/admin/chat`, `/blocks`, `/master-data` を `/dashboard` へリダイレクト（認証チェックより先に評価）

### APIルートの定型パターン

新規ルートは既存実装（例: `src/app/api/reservations/route.ts`）に倣う:

1. 入力検証は Zodスキーマ（`src/lib/schemas/`）
2. 認証 + Origin検証 + body解析は `processApiRequest()`（`src/lib/api-helpers.ts`）。管理APIは `verifyAdminAuth()`
3. クリニックスコープ強制は `ensureClinicAccess()`（`src/lib/supabase/guards.ts`）または `processClinicScopedBody()`（`src/lib/route-helpers.ts`）
4. レスポンスは統一エンベロープ `{ success, data | error }` — `createSuccessResponse()` / `createErrorResponse()`
5. 例外は `handleRouteError()` + `AppError` / `ERROR_CODES`（`src/lib/error-handler.ts`）。Supabaseエラーは `normalizeSupabaseError()` で正規化

### Supabaseクライアント（重要）

- import は**必ず `@/lib/supabase` から**（`@/lib/supabase/server` の直importはESLintエラー）
- `createClient()` / `getServerClient()`: リクエスト毎のSSRクライアント（**RLS適用**、通常はこれ）
- `createAdminClient()`: service role でRLSバイパス。サーバー専用・使用は最小限に
- `createScopedAdminContext()`: clinic scope 検証付き admin クライアント（管理系・多店舗操作はこちら）
- `requireAuth()` / `requireAdminAuth()` / `getUserAccessContext()` で認証・権限コンテキスト取得
- `process.env.SUPABASE_SERVICE_ROLE_KEY` の直接参照はESLintで禁止（`src/lib/env.ts` 経由のみ）

### 認可モデル（マルチテナント）

- `user_permissions` の `role` + `clinic_id`（単店舗）/ `clinic_scope_ids`（複数店舗）でスコープ解決
- manager はスコープ階層を `resolveEffectiveClinicScope()`（`src/lib/auth/manager-scope.ts`）で解決。`normalizeRole()`（`src/lib/constants/roles.ts`）が `clinic_manager` → `clinic_admin` に正規化する互換層あり
- `manager_revenue_*` 系RPCは service_role 専用で `p_clinic_ids` を無検証に信頼する。**アプリ層のスコープ解決が唯一のテナント保証**（RPC側にRLSの後ろ盾なし）
- JWT claims: `supabase/config.toml` の `auth.hook.custom_access_token`（`app_private.custom_access_token_hook`）で clinic scope を反映
- **RLSが最後の砦**。クライアント側チェックだけで認可を済ませない。判断に迷ったら fail-closed

### データベース

- **実行正本（SSOT）は `supabase/migrations/` のみ**。旧 `src/database/`・`sql/`・`src/api/database/*.sql` は `docs/archive/sql-reference-assets/` に隔離済みであり直接適用禁止
- マイグレーション追加時は仕様書 + ロールバックSQLをセットで用意（規範は AGENTS.md）
- 予約は `reservations` テーブルがSSOT。`appointments` はレガシー読み取り専用（書き込み禁止）
- `src/types/supabase.ts` は `npm run supabase:types` の生成物。手書き編集禁止
- 集計はRPC関数を活用（例: `manager_revenue_period_totals`, `convert_shift_requests`）
- メールは `email_outbox` にキュー → `/api/internal/process-email-outbox` がResendで送信（outboxパターン）

### フロントエンド

- データ取得は React Query フック（`src/hooks/`、クエリ定義は `src/hooks/queries/`）→ `/api/**` → エンベロープ検証
- Provider: `query-provider` / `selected-clinic-context`（選択中店舗）/ `user-profile-context`（`src/providers/`）
- UIは shadcn/Radix ベースの `src/components/ui/` を再利用。アイコンは lucide-react、チャートは Recharts
- フォームは React Hook Form + Zod（`@hookform/resolvers`）
- UI/UXに触れる変更は `Design.md` に従う（モード判定・Ethics Gate・既存デザイン保全。規範は AGENTS.md「UI/UX変更」）

## テスト

- Jest 2プロジェクト構成: **`*.test.tsx` → client (jsdom) / `*.test.ts` → server (node)**。拡張子で実行環境が決まる
- 配置: `src/__tests__/{api,lib,components,auth,security,rls,integration,e2e,e2e-playwright}/`
- セットアップ: `jest.setup.messagechannel.ts` → `jest.setup.js`（fetch/crypto polyfill、`next/navigation`・`next/headers`・`@supabase/ssr` のモック）
- `src/__tests__/` は tsconfig 型チェック・ESLint の対象外。テスト内は `any` 許容
- Playwright: baseURL は `PLAYWRIGHT_BASE_URL` > `NEXT_PUBLIC_APP_URL` > `http://127.0.0.1:3000`。webServer が `npm run dev` を自動起動。seed必須

## 環境変数

- **必須**（`src/lib/env.ts` がモジュールロード時に検証、欠落で例外。`NODE_ENV=test` は除外）: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_APP_URL`
- テンプレート: `.env.local.example`（開発）/ `.env.test.example` / `.env.production.example`
- 主要フラグ: `NEXT_PUBLIC_PILOT_MODE` / `NEXT_PUBLIC_ENABLE_CHAT` / `NEXT_PUBLIC_ENABLE_AI_INSIGHTS` / `CSP_ROLLOUT_PHASE`
- ローカルSupabaseポート（`supabase/config.toml`、デフォルトと異なる）: API **54331** / DB **54332** / Studio **54333** / Inbucket **54334**
- 方針詳細: `docs/operations/ENV_MANAGEMENT_POLICY.md`

## 落とし穴

- **日付・時刻は必ず `src/lib/jst.ts` のJSTユーティリティを使う**。UTC/JST混在でE2Eが落ちた実績あり（DoD-06）
- Supabase CLIの正本versionは `.supabase-cli-version`。`supabase:types` はversion不一致をfail-fastし、CIは生成型全体のdiffを検査する（先頭header検査だけではschema driftを保証しない）
- `src/legacy/` はlint・型チェック対象外のレガシー。拡張・パターン流用禁止
- `next.config.js` は `src/lib/security/csp-config.ts` をCJS requireする。このファイルはNodeのCJSから読める形を維持する
- middleware の matcher は静的アセットを除外。新規ルート追加時は `PROTECTED_ROUTE_PREFIXES`（middleware.ts）との整合を確認
- Sentry は `SENTRY_DSN` 設定時のみ有効（`instrumentation.ts` / `sentry.*.config.ts`）
- `predev` / `prebuild` / `pretest` がSWCバイナリを検証する（Windows環境での破損対策）。SWC問題は `npm run swc:clear` → 再インストール
- `@supabase/ssr` は 0.8.0 以上を維持（0.5.x は supabase-js 2.9x と型非互換で `.from()` が `never` になる事故あり）

## ドキュメントマップ

| 用途 | 場所 |
|------|------|
| 作業規約（正本） | `AGENTS.md`（本ファイル冒頭でインポート済み） |
| UI/UX規範（正本） | `Design.md` — 行動UXパターン（P01–P11）・Ethics Gate・ビジュアル規範（Section V/C）。UI変更時は必読 |
| 現状の実装範囲・セットアップ | `README.md` |
| 安定化基準（DoD 12項目） | `docs/stabilization/DoD-v0.1.md` |
| 変更仕様書の置き場 | `docs/stabilization/spec-*.md`（変更時はここに仕様を残す慣行） |
| 運用手順 | `docs/operations/RUNBOOK.md` |
| DB設計の参照資料 | `docs/archive/sql-reference-assets/README.md`（SSOTは `supabase/migrations/`） |

`docs/` 直下の多数の日本語ファイルや ルート直下の `PHASE*_REPORT.md` 等は歴史的経緯メモ。最新性は README と `docs/stabilization/` 配下を優先する。

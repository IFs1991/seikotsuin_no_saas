# パイロット稼働プロジェクト チーム編成計画

- 作成日: 2026-03-27
- 対象: 整骨院管理SaaS パイロット版
- 対象コード: `src/`
- 基準文書:
  - `docs/stabilization/DoD-v0.1.md`
  - `docs/stabilization/pilot-readiness-review-2026-03-27.md`
- 方針:
  - 1 task = 1 PR
  - migration変更は今回の計画に含めない
  - 証跡は DoD とファイルパス単位で残す
  - 人間チーム + サブエージェントで並列化する

## 1. 目的

この計画の主目的は、パイロット稼働に必要な安定化作業を「実装領域」ではなく「責任領域」で分け、各チームが小さいPRを連続投入できる体制を作ることです。

現時点の最重要論点は以下です。

- `DOD-06` Playwright残件の収束
  - `src/__tests__/e2e-playwright/dashboard.spec.ts` の 2 fail 切り分け
  - `playwright.config.ts` の起動前提維持
- `DOD-11` Jest whole-suite の維持
  - `src/__tests__/api/csp-security-migration.test.ts` は spec / rollback / migration SSOT まで完了
  - 今後は green を維持しつつ、migration 運用手順の実施段階へ移る
- `DOD-08` / `DOD-09` Tenant boundary と guard 証跡
  - `src/lib/supabase/guards.ts` の `ensureClinicAccess`
  - `src/lib/api-helpers.ts` の `processApiRequest`
  - `middleware.ts` の route protection
- `DOD-10` Build再現性
  - `package.json` の `build`
  - 2026-03-30 再検証で green 確認済み
- `DOD-01` から `DOD-07`, `DOD-12` のローカル再現性
  - `supabase/config.toml`
  - `playwright.config.ts`
  - `docker-compose.dev.yml`
  - `scripts/e2e/*`

## 2. 指揮系統

### 2-1. プロジェクト指揮

- Program Lead
  - 全体優先順位、GO/NO-GO判定、承認事項管理
- Release Captain
  - DoD進捗管理、PR投入順管理、日次のブロッカー解消
- Evidence Owner
  - DoD証跡、レビュー記録、設定差分記録の最終責任

### 2-2. 日次運営

- 朝会 15分
  - 各チームの前日完了、当日PR、ブロッカー確認
- 夕会 15分
  - DoD更新、翌日の依存解消、承認待ちコマンド確認
- ルール
  - `supabase db reset`, `supabase db push`, `supabase migration up` は承認必須
  - Docker volume / container 削除も承認必須
  - チームをまたぐ変更は原則禁止。必要時は Release Captain 承認

## 3. チーム編成

### Team A. App Stabilization

- ミッション:
  - `src/app`, `src/components`, `src/hooks` の実装契約を整理し、Build blocker と UI/API 契約ずれを潰す
- DoD主担当:
  - `DOD-10`
  - `DOD-11` のうち実装とテスト契約の整合
  - `DOD-09` のうちクライアント経路確認
- 主担当ファイル:
  - `src/app/api/public/reservations/route.ts`
  - `src/app/api/staff/shifts/route.ts`
  - `src/app/global-error.tsx`
  - `src/components/admin/system-settings.tsx`
  - `src/components/legal/legal-page.tsx`
  - `src/hooks/useSystemStatus.ts`
  - `src/lib/services/reservation-service.ts`
- 持つべき観点:
  - API契約と hook 契約の一致
  - ビルドを止める ESLint/Prettier 修正
  - 直接 Supabase 呼び出しの整理
- 推奨メンバー:
  - 1名: Next.js / React 実装担当
  - 1名: API契約レビュー担当
  - 1サブエージェント: `build-doctor`
  - 1サブエージェント: `api-contract-auditor`
- 最初のPR:
  - PR-01 Build Green
  - PR-02 `useSystemStatus` など契約ずれ修正

### Team B. Test and QA

- ミッション:
  - Jest / Playwright / fixture / global setup を安定化し、再現性のある回帰ゲートを作る
- DoD主担当:
  - `DOD-05`
  - `DOD-06`
  - `DOD-07`
  - `DOD-11`
- 主担当ファイル:
  - `playwright.config.ts`
  - `jest.config.js`
  - `src/__tests__/e2e-playwright/global-setup.ts`
  - `src/__tests__/e2e-playwright/global-teardown.ts`
  - `src/__tests__/session-management/*`
  - `src/__tests__/security/*`
  - `scripts/e2e/seed-e2e-data.mjs`
  - `scripts/e2e/cleanup-e2e-data.mjs`
  - `scripts/e2e/validate-e2e-fixtures.mjs`
- 担当設定:
  - `playwright.config.ts` の `baseURL`
  - `playwright.config.ts` の `webServer`
  - `playwright.config.ts` の `reuseExistingServer`
  - `playwright.config.ts` の `E2E_INVITE_MODE`
  - `package.json` の `test:e2e:pw`
  - `package.json` の `test`
- 推奨メンバー:
  - 1名: Jest回帰担当
  - 1名: Playwright / fixture担当
  - 1サブエージェント: `jest-triage`
  - 1サブエージェント: `playwright-preflight-runner`
- 最初のPR:
  - PR-03 未実装テストと契約ずれの棚卸し
  - PR-04 Session Management テスト整合

### Team C. Supabase and Data Reliability

- ミッション:
  - Supabase ローカル再現性、seed、型生成、RLSのソースオブトゥルース確認を担当する
- DoD主担当:
  - `DOD-01`
  - `DOD-02`
  - `DOD-03`
  - `DOD-04`
  - `DOD-08`
  - `DOD-12`
- 主担当ファイル:
  - `supabase/config.toml`
  - `supabase/seed.sql`
  - `supabase/migrations/00000000000001_squashed_baseline.sql`
  - `supabase/scripts/validate_rls.sql`
  - `src/types/supabase.ts`
  - `src/lib/supabase/server.ts`
  - `src/lib/supabase/guards.ts`
- 担当設定:
  - `supabase/config.toml` の `[db.seed]`
  - `supabase/config.toml` の `[auth.hook.custom_access_token]`
  - `supabase/config.toml` の `site_url`
  - `supabase/config.toml` の `additional_redirect_urls`
  - `src/lib/supabase/server.ts` の `clinic_scope_ids`
- 推奨メンバー:
  - 1名: Supabase CLI / seed担当
  - 1名: RLS / policy証跡担当
  - 1サブエージェント: `rls-evidence-collector`
  - 1サブエージェント: `supabase-type-guard`
- 最初のPR:
  - PR-05 RLS evidence bundle
  - PR-06 Supabase types / local reproducibility

### Team D. Security and Access Control

- ミッション:
  - route guard, redirect, CSP, rate limit, tenant boundary のアプリ層防御を固定化する
- DoD主担当:
  - `DOD-08`
  - `DOD-09`
  - `DOD-06` のCSP/起動条件部分
- 主担当ファイル:
  - `middleware.ts`
  - `src/lib/constants/security.ts`
  - `src/lib/api-helpers.ts`
  - `src/lib/rate-limiting/middleware.ts`
  - `src/lib/rate-limiting/rate-limiter.ts`
  - `src/app/api/admin/settings/route.ts`
  - `src/app/api/public/reservations/route.ts`
- 担当設定:
  - `middleware.ts` の `PILOT_BLOCKED_ROUTE_PREFIXES`
  - `middleware.ts` の `CSP_ROLLOUT_PHASE`
  - `src/lib/constants/security.ts` の `ALLOWED_REDIRECT_ORIGINS`
  - `src/lib/api-helpers.ts` の `processApiRequest`
  - `src/lib/supabase/guards.ts` の `ensureClinicAccess`
- 推奨メンバー:
  - 1名: middleware / auth guard担当
  - 1名: API security review担当
  - 1サブエージェント: `guard-path-scanner`
  - 1サブエージェント: `security-config-checker`
- 最初のPR:
  - PR-07 Redirect / CSP / route protection evidence

### Team E. Infra, Deploy, Observability

- ミッション:
  - Docker, Vercel, Sentry, Redis, env を整え、パイロット環境を起動可能にする
- DoD主担当:
  - `DOD-01`
  - `DOD-06`
  - `DOD-10`
  - 運用前セットアップ項目
- 主担当ファイル:
  - `docker-compose.dev.yml`
  - `vercel.json`
  - `next.config.js`
  - `src/lib/env.ts`
  - `src/lib/monitoring/sentry.ts`
  - `src/lib/feature-flags.ts`
- 担当設定:
  - `docker-compose.dev.yml` の `ports`
  - `docker-compose.dev.yml` の `env_file`
  - `docker-compose.dev.yml` の `CHOKIDAR_USEPOLLING`
  - `vercel.json` の `functions.maxDuration`
  - `vercel.json` の `headers`
  - `vercel.json` の `env.CSP_ROLLOUT_PHASE`
  - `next.config.js` の `output`
  - `next.config.js` の `headers`
  - `src/lib/env.ts` の `REQUIRED_ENV_VARS`
- 推奨メンバー:
  - 1名: Docker / local env担当
  - 1名: Vercel / Sentry / Redis担当
  - 1サブエージェント: `env-diff-checker`
  - 1サブエージェント: `deploy-readiness-scribe`
- 最初のPR:
  - PR-08 env / deploy checklist hardening

### Team F. Pilot Operations

- ミッション:
  - パイロット用の初期データ、ユーザー、運用手順、受け入れ確認を固める
- DoD主担当:
  - DoDの最終証跡確認
  - パイロット前の受け入れ条件
- 主担当ファイル:
  - `docs/stabilization/DoD-v0.1.md`
  - `docs/stabilization/pilot-readiness-review-2026-03-27.md`
  - `docs/stabilization/spec-shadow-operation-readiness-v0.1.md`
  - `src/app/onboarding/page.tsx`
  - `src/app/api/onboarding/*`
  - `src/app/admin/(protected)/settings/page.tsx`
- 担当内容:
  - 2院分データ投入
  - パイロットユーザー作成
  - ロール別の受け入れシナリオ実行
  - 最終GO資料取りまとめ
- 推奨メンバー:
  - 1名: 運用設計担当
  - 1名: UAT担当
  - 1サブエージェント: `acceptance-checklist-writer`
  - 1サブエージェント: `evidence-bundler`
- 最初のPR:
  - PR-09 pilot acceptance pack

## 4. サブエージェント運用ルール

サブエージェントは「調査専用」と「差分監査専用」に分ける。実装そのものは人間担当が最終責任を持つ。

### 4-1. 調査系サブエージェント

- `build-doctor`
  - ESLint / build blocker の一覧化
- `jest-triage`
  - 失敗テストの分類
- `rls-evidence-collector`
  - RLS policy と helper 利用箇所の収集
- `guard-path-scanner`
  - tenant table への危険経路の検索
- `env-diff-checker`
  - `.env.*`, `vercel.json`, `src/lib/env.ts` の差分確認

### 4-2. 監査系サブエージェント

- `api-contract-auditor`
  - hook と route の契約整合
- `playwright-preflight-runner`
  - `baseURL`, `webServer`, fixture 前提の確認
- `security-config-checker`
  - `CSP_ROLLOUT_PHASE`, `ALLOWED_REDIRECT_ORIGINS`, redirect系設定確認
- `supabase-type-guard`
  - `src/types/supabase.ts` の生成結果検証
- `evidence-bundler`
  - DoD証跡の文書化テンプレート作成

### 4-3. 禁止事項

- サブエージェント判断だけで migration を触らない
- サブエージェント判断だけで `.skip` を増やさない
- サブエージェントが発見した問題は、必ず担当チームが再確認してからPR化する

## 5. チーム別の初動順

### Day 0

- Team A
  - `npm run lint:fix` 前提の build blocker 棚卸し
- Team B
  - Jest失敗を `未実装`, `契約ずれ`, `モック陳腐化` に分類
- Team C
  - `supabase/config.toml` と `DoD-v0.1.md` を照合
- Team D
  - `middleware.ts` と `src/lib/constants/security.ts` の差分棚卸し
- Team E
  - `docker-compose.dev.yml`, `vercel.json`, `src/lib/env.ts` の設定一覧化
- Team F
  - パイロット受け入れ条件と必要アカウント一覧作成

### Day 1-2

- PR-01 Build Green
- PR-02 API / hook 契約ずれ修正
- PR-03 Jest棚卸し結果の固定
- PR-05 RLS / tenant evidence の下書き
- PR-08 env / deploy checklist の下書き

### Day 3-5

- PR-04 Session Management 整合
- PR-06 Supabase local reproducibility
- PR-07 Security / redirect / CSP evidence
- PR-09 Pilot acceptance pack

## 6. RACI

| 項目 | Responsible | Accountable | Consulted |
|------|-------------|-------------|-----------|
| `DOD-10` build | Team A | Release Captain | Team E |
| `DOD-11` jest | Team B | Release Captain | Team A |
| `DOD-05` fixture / seed | Team B | Release Captain | Team C |
| `DOD-01`-`04` Supabase local | Team C | Program Lead | Team E |
| `DOD-08` RLS evidence | Team C | Evidence Owner | Team D |
| `DOD-09` guard evidence | Team D | Evidence Owner | Team A |
| CSP / redirect | Team D | Program Lead | Team E |
| Vercel / Sentry / Redis | Team E | Program Lead | Team D |
| Pilot data / UAT | Team F | Program Lead | Team A, Team C |

## 7. パイロットGOの判定条件

以下を 2 段階で扱う。

### 7-1. クローズドベータ GO

以下が揃った時点で、少人数クローズドベータの GO 判定とする。

- `docs/stabilization/DoD-v0.1.md` の必要項目が完了記録付きで埋まっている
- `package.json` の `build` が再現確認できる
- `package.json` の `test -- --ci --testPathIgnorePatterns=e2e` 相当は、既知残件を明示した上で運用判断できる
- `playwright.config.ts` の `baseURL` と `webServer` が合意値で固定されている
- `supabase/config.toml` の `custom_access_token_hook` 運用手順が記録されている
- 既知残課題が `DOD-09 hardening` と運用セットアップ中心まで圧縮され、担当と次アクションが決まっている

### 7-2. 完全本番 GO

以下はクローズドベータ GO ではなく、完全本番 GO の条件として別管理する。

- `src/lib/constants/security.ts` の `ALLOWED_REDIRECT_ORIGINS` が実ドメイン化されている
- `middleware.ts` の `CSP_ROLLOUT_PHASE` が `partial-enforce` 以上で確認済み
- `src/lib/env.ts` の必須環境変数が本番値で設定済み
- Jest / E2E の残課題が解消されている

## 8. 今回の推奨チームサイズ

- 最小編成: 6名 + サブエージェント群
- 推奨編成: 8名
  - Program Lead 1
  - Release Captain 1
  - Team A 1
  - Team B 2
  - Team C 1
  - Team D 1
  - Team E 1
  - Team F 1

最小編成で回す場合は Team D と Team E を統合してよい。ただし `middleware.ts`, `vercel.json`, `src/lib/env.ts`, `docker-compose.dev.yml` を同時に持つため、レビューは必ず別担当を入れる。

## 9. 次アクション

チーム編成の開始順は以下とする。

1. Release Captain を決める
2. Team A と Team B を先に着手させる
3. Team C と Team D は証跡テンプレートを先に作る
4. Team E は外部設定の未確定項目を洗う
5. Team F は UAT 用の役割別チェックリストを作る

この順にすれば、Build/Jest/Security のボトルネックを先に潰しつつ、Supabase・Vercel・Redis・Sentry の運用準備を並列で進められる。

## 9-補足. クローズドベータ移行向けのPR順

`DOD-11` を全面 green にする前に、クローズドベータに必要な導線を先に固める。

2026-03-28 時点の確定方針は `docs/stabilization/pilot-go-execution-2026-03-27.md` の Release Captain 裁定に従う。

1. PR-10 beta-scope-freeze
   - Team A + Team B + Team F
   - 目的:
     - missing route / hook cluster のうち、beta 導線に直結するものだけを実装対象に固定する
   - `beta対象として実装`:
     - `src/app/api/clinics/accessible/route.ts`
     - `src/hooks/useAccessibleClinics.ts`
   - ~~`beta対象外として別キューへ送る`~~: → **§17 で全件実装済み、§19 でセルフレビュー修正完了**
     - ~~`src/app/api/notifications/route.ts`~~ → §17 実装、§19 limit=0 修正
     - ~~`src/hooks/useNotifications.ts`~~ → §17 実装、§19 冗長呼び出し削除
     - ~~`src/app/api/system/status/route.ts`~~ → §17 実装、§19 `system_events` クエリ削除・`fromUntyped` 除去
   - 根拠 (当初):
     - clinic selector は `src/app/client-layout.tsx` と `src/components/navigation/header.tsx` の全画面共通導線であり、`src/app/api/clinics/route.ts` の全 active clinics 契約を scope-limited に寄せる必要がある
     - ~~notifications は `src/app/api/admin/notifications/route.ts` 経由の別導線が成立している~~ → §17 で専用 route 実装
     - ~~system status は `src/hooks/useSystemStatus.ts` が `/api/clinics` + `/api/health` の暫定合成で既存画面を成立させており、beta直前では contract drift として後段扱いにする~~ → §17 で `/api/system/status` route 実装、§19 で `api-client` を単一エンドポイント呼び出しに統一
2. PR-11 beta-regression-auth-dashboard
   - Team A + Team B
   - 目的:
     - クローズドベータで直接踏む認証・ダッシュボード導線の回帰を、実装バグと stale mock を分離した上で最小PRで解消する
   - 対象:
     - `src/__tests__/integration/auth-flow.test.ts`
     - `src/__tests__/integration/api-staging-data.test.ts`
     - 関連する action / route / hook 実装
   - 着手順:
     - `auth-flow`: `AuditLogger.logFailedLogin` / `logLogin` / `logLogout` に追随していない test mock を先に更新する
     - `api-staging-data`: `src/app/api/dashboard/route.ts` の `ai_comments` と `count` 契約に test mock を先に更新する
   - beta導線の基準:
     - 認証導線は `src/app/login/page.tsx` -> `src/app/login/actions.ts` `clinicLogin` を優先して見る
3. PR-12 contract-drift-cleanup
   - Team B 主導
   - 目的:
     - mock 境界と現行実装契約のズレを解消
   - 対象:
     - `src/__tests__/hooks/useSystemStatus.test.ts`
     - `src/__tests__/lib/supabase-guards.test.ts`
     - `src/__tests__/lib/audit-logger-types.test.ts`
     - `src/__tests__/session-management/security-monitor.test.ts`
     - `src/__tests__/session-management/session-performance.test.ts`
   - 2026-03-29 最終状況: **全件完了**
     - `src/hooks/useSystemStatus.ts` / `src/lib/api-client.ts#api.system.getStatus` — §11 で解消
     - `src/lib/session-manager.ts#createSession` — §11 で解消
     - `src/__tests__/lib/supabase-guards.test.ts` — §12 で解消
     - `src/__tests__/lib/audit-logger-types.test.ts` — §12 で解消
     - `src/__tests__/session-management/security-monitor.test.ts` — §13 で解消 (`13 passed`)
     - `src/__tests__/session-management/session-performance.test.ts` — §14 で解消 (`11 passed`)
   - 備考:
     - `src/__tests__/lib/supabase-guards.test.ts` は `src/lib/supabase/guards.ts#ensureClinicAccess` の parent-scope 契約へ追随済み
     - `src/__tests__/lib/audit-logger-types.test.ts` は `src/lib/audit-logger.ts` の依存注入点を使う形で focused green
     - authoritative log は `docs/stabilization/pilot-go-execution-2026-03-27.md` `## 12. 2026-03-28 whole-suite contract drift cleanup (supabase-guards / audit-logger-types)`
4. PR-13a csp-migration-spec-followup
   - Team B + Team C
   - 状態:
     - **完了**
   - 完了内容:
     - `src/__tests__/api/csp-security-migration.test.ts` は Red 1 を含め green
     - `docs/stabilization/spec-csp-migration-v0.1.md`
     - `docs/stabilization/rollback-csp-migration-v0.1.md`
     - `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot.sql`
     - `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot_rollback.sql`
5. PR-13b e2e-fail-triage-followup
   - Team B 主導
   - 目的:
     - E2E 残件を `dashboard.spec.ts` 2件へ圧縮した状態から、サーバー不安定の再現条件を固定する
   - 対象:
     - `src/__tests__/e2e-playwright/dashboard.spec.ts`
   - 最新状況:
     - `src/__tests__/e2e-playwright/security-monitor.spec.ts` — 03-30 rerun で `12 passed / 0 failed`
     - `src/__tests__/e2e-playwright/patients-list.spec.ts` — 03-30 rerun で `6 passed / 0 failed`
     - `src/__tests__/e2e-playwright/public-menus-api.spec.ts` — 03-30 rerun で `4 passed / 0 failed` + 1 skipped
     - 残る既知 fail cluster は `dashboard.spec.ts` 2件 (`ERR_CONNECTION_REFUSED` / サーバー不安定)

## 10. 初期アサイン案

実名が未確定でも、最初は以下の役割で着席させる。

| 席 | 役割 | 初日アウトプット |
|---|---|---|
| Seat-01 | Program Lead | Go/No-Go 判定表、承認事項一覧 |
| Seat-02 | Release Captain | PR キュー、依存関係表、日次進行 |
| Seat-03 | Frontend/API Owner | `src/app` `src/hooks` `src/lib/api-client.ts` の修正候補一覧 |
| Seat-04 | Jest Owner | 失敗テスト分類表、修正優先順位 |
| Seat-05 | Playwright/Fixture Owner | `playwright.config.ts` と `scripts/e2e/*` の前提確認表 |
| Seat-06 | Supabase/RLS Owner | `DOD-08` の証跡採取手順、RLS確認対象一覧 |
| Seat-07 | Security/Guard Owner | `middleware.ts`, `src/lib/constants/security.ts`, `src/lib/api-helpers.ts` の論点表 |
| Seat-08 | Infra/Ops Owner | `vercel.json`, `docker-compose.dev.yml`, `src/lib/env.ts` の設定差分表 |

8名を置けない場合は以下の統合を許容する。

- Seat-04 と Seat-05 を統合して Team B を 1名運用にする
- Seat-06 と Seat-07 を統合して Team C/D を 1名運用にする
- Seat-02 と Seat-08 の兼務は不可
  - 承認待ちと外部設定待ちが同時に詰まりやすいため

## 11. サブエージェント起動順

初日は調査系だけを起動し、実装系は人間担当が受け持つ。

1. `build-doctor`
   - 対象: `src/app`, `src/components`, `src/lib/services`
   - 目的: `npm run build` の blocker 抽出
2. `jest-triage`
   - 対象: `src/__tests__`
   - 目的: 失敗テストの分類
3. `rls-evidence-collector`
   - 対象: `src/lib/supabase`, `docs/stabilization/spec-rls-tenant-boundary-v0.1.md`
   - 目的: `DOD-08` の証跡候補収集
4. `guard-path-scanner`
   - 対象: `src/app/api`, `src/lib/api-helpers.ts`, `middleware.ts`
   - 目的: `DOD-09` の bypass 候補収集
5. `env-diff-checker`
   - 対象: `package.json`, `docker-compose.dev.yml`, `vercel.json`, `src/lib/env.ts`
   - 目的: パイロット環境の未確定設定抽出

起動結果は Release Captain が同日中に取りまとめ、翌日の PR 順に反映する。

## 12. サブエージェント実行プロンプト

以下は、そのまま各サブエージェントに渡せる初期プロンプトです。調査専用で開始し、実装は担当チーム判断に戻す。

### 12-1. `build-doctor`

目的:

- `DOD-10` の build blocker を最短で列挙する

プロンプト:

```text
このリポジトリで `npm run build` を止める要因を、`src/app` `src/components` `src/lib` を中心に調査してください。`package.json` の `build`、`next.config.js` の `eslint.ignoreDuringBuilds` を前提に、修正対象ファイル、エラー種別、PRを小さく切る境界を主要ファイルパス付きで報告してください。変更はしないでください。
```

### 12-2. `jest-triage`

目的:

- `DOD-11` の失敗テストを 3 分類で確定する

プロンプト:

```text
このリポジトリの Jest 回帰を調査し、`src/__tests__` 配下の失敗候補を `未実装`, `契約ずれ`, `モック陳腐化` の3分類に分けてください。`package.json` の `test` と `test:windows`、`jest.config.js` を前提に、優先順位、関連する実装ファイル、最小PR単位を主要ファイルパス付きで報告してください。変更は不要です。
```

### 12-3. `rls-evidence-collector`

目的:

- `DOD-08` の証跡採取対象を固定する

プロンプト:

```text
このリポジトリで RLS と tenant boundary の証跡を集めてください。`supabase/config.toml` の `[auth.hook.custom_access_token]`、`src/lib/supabase/guards.ts` の `ensureClinicAccess`、`src/lib/supabase/server.ts`、`docs/stabilization/spec-rls-tenant-boundary-v0.1.md` を優先して、どのテーブル・helper・文書を証跡に使うべきかを主要ファイルパス付きで整理してください。変更は不要です。
```

### 12-4. `guard-path-scanner`

目的:

- `DOD-09` の bypass 候補を洗い出す

プロンプト:

```text
このリポジトリで tenant table への危険経路を調査してください。`middleware.ts`、`src/lib/api-helpers.ts` の `processApiRequest`、`src/lib/supabase/guards.ts` の `ensureClinicAccess`、`src/app/api` を見て、server guard を通らない可能性のある経路や直接 Supabase 参照の候補を主要ファイルパス付きで報告してください。変更はしないでください。
```

### 12-5. `env-diff-checker`

目的:

- パイロット投入前の設定不足を一覧化する

プロンプト:

```text
このリポジトリでパイロット稼働前に未確定の設定を洗い出してください。`package.json`、`docker-compose.dev.yml`、`vercel.json`、`src/lib/env.ts` の `REQUIRED_ENV_VARS`、`src/lib/constants/security.ts` の `ALLOWED_REDIRECT_ORIGINS`、`middleware.ts` の `CSP_ROLLOUT_PHASE`、`supabase/config.toml` の `site_url` と `additional_redirect_urls` を優先し、環境ごとの差分と担当チーム案を主要ファイルパス付きで報告してください。変更は不要です。
```

## 13. TDD 適用方針

今回のプロジェクトでは全面 TDD ではなく、チームごとに適用度を変える。

- Team A
  - build 修復が先
  - `npm run build` を通すまでは TDD より blocker 除去を優先
- Team B
  - 最も TDD 向き
  - 失敗テストで契約を固定し、実装を寄せる
- Team C
  - 証跡駆動
  - SQL と型生成結果を受け入れ条件として先に固定する
- Team D
  - セキュリティ検証駆動
  - grep 条件、guard 条件、redirect 条件を先に固定する
- Team E
  - チェックリスト駆動
  - env / deploy / observability は投入条件を先に固定する
- Team F
  - UAT 駆動
  - ロール別受け入れシナリオを先に決める

結論:

- Build は修復先行
- Jest / Security は TDD 寄り
- Infra / Ops は DoD とチェックリスト駆動

## 14. 2026-03-28 実施反映メモ

この計画書は execution log の詳細転記先ではないため、完了状況は要約のみを持つ。正本は `docs/stabilization/pilot-go-execution-2026-03-27.md` 冒頭の引き継ぎサマリ、および `## 17` `## 18` `## 19` を参照する。

- 実施済みの前段安定化:
  - `src/components/navigation/header.tsx`
  - `src/providers/selected-clinic-context.tsx`
  - `src/app/admin/actions.ts`
  - `src/app/login/actions.ts`
  - `src/lib/services/reservation-service.ts`
  - `src/app/api/public/reservations/route.ts`
- 2026-03-28 追加の完了:
  - PR-10: `src/app/api/clinics/accessible/route.ts`, `src/hooks/useAccessibleClinics.ts`, `src/app/client-layout.tsx`
  - PR-11: `src/__tests__/integration/auth-flow.test.ts`, `src/__tests__/integration/api-staging-data.test.ts`
  - PR-12: `src/lib/api-client.ts`, `src/hooks/useSystemStatus.ts`, `src/lib/session-manager.ts`, `src/hooks/useSessionManagement.ts`, `src/types/security.ts`
- これにより、PR-10 / PR-11 着手時の前提は次の通り
  - logout 導線は実 sign-out 経路に統一済み
  - clinic selector の非同期初期化ずれは局所解消済み
  - public reservation の slot validation は重複予約 / block を 409 で拒否する所まで安定化済み
  - auth success audit log は最終認可後のみ記録する前提に揃った
- 実施後サマリー:
  - PR-10 は完了。focused Jest: `clinics-accessible` `4 passed`, `useAccessibleClinics` `3 passed`
  - PR-11 は完了。focused Jest: `auth-flow` `9 passed`, `api-staging-data` `4 passed`
  - PR-12 は今回依頼範囲として完了。focused Jest: `useSystemStatus` `2 passed`, `session-manager` `19 passed`, `failsafe` `12 passed`
  - 上記残件は 2026-03-28〜29 に全て解消済み。証跡は execution log §12〜§14, §17 を参照
- 2026-03-31 時点の残課題は Cluster C 中心: `DOD-09` hardening の残件と、Vercel / Supabase / Sentry の運用セットアップ。詳細は execution log の引き継ぎサマリ参照
- 証跡の正本:
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` 冒頭の引き継ぎサマリ
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` の `## 17. 2026-03-28 Cluster A + B fix`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` の `## 18. 2026-03-29 Supabase stack 起動`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` の `## 19. 2026-03-30 セルフレビュー`

# 差分修正指示書

- 作成日: 2026-03-30
- 目的:
  - 進捗文書と実装実態の差分を、各チームがそのまま修正作業に落とせる形にする
- 基準文書:
  - `docs/stabilization/DoD-v0.1.md`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md`
  - `docs/stabilization/pilot-go-plan-2026-03-27.md`
  - `docs/stabilization/pilot-readiness-review-2026-03-27.md`
  - `docs/stabilization/closed-beta-ops-memo-2026-03-28.md`

## 1. 全体方針

- 1 task = 1 PR を維持する
- migration 変更本体は、spec + rollback plan なしでは着手しない
- 文書更新だけで終えず、実装・テスト・証跡を必ず揃える
- 各修正は `一致 / 不一致 / 要再検証` のどれを解消するか明記する

## 2. 全体サマリ

### 現時点の重要差分

1. `DOD-10`
   - `npm run build` は再成功済み
   - build blocker だった `admin/security` 3 route の修正は完了
2. `DOD-09`
   - 主要 tenant CRUD API は guard 導線あり
   - ただしコードベース全体では client-side Supabase 直アクセスが残る
3. E2E 12 fail
   - 文書上の「route 未実装」は古い
   - 2026-03-30 targeted rerun では `security-monitor` / `patients-list` / `public-menus-api` が **22 passed / 1 skipped** まで回復
   - 残る既知 fail cluster は `dashboard.spec.ts` 2件のサーバー不安定
4. Security monitor API
   - route は存在し、`security_events` / `notifications` / `user_sessions` の管理系書き込みは service-role client 経由へ更新済み
   - 現在の主論点は「未実装」ではなく「E2E 契約ずれ / fixture・selector / 一部RLS確認」
4. 運用文書
   - `notifications` と `system/status` を非提供扱いしていたが、実装は存在する

### 優先順位

1. P0: E2E fail の再分類
2. P1: dashboard サーバー不安定の切り分け
3. P1: client-side Supabase 直アクセスの棚卸し
4. P2: 運用文書と証跡の追随

## 3. チーム別指示

### Team A. App Stabilization

- ミッション:
  - build 再現性と暫定実装の明確化
- 対象:
  - `next.config.js`
  - `src/app/api/system/status/route.ts`
  - `src/hooks/useSystemStatus.ts`
  - `src/lib/api-client.ts`
- 根拠:
  - `docs/stabilization/DoD-v0.1.md` `DOD-10`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` `DOD-10`
- 作業:
  1. `npm run build` の再現失敗原因を切り分ける
  2. `.next` artifact 欠落の再現条件を記録する
  3. `system/status` を「暫定実装」として扱う範囲をコードコメントと文書で一致させる
- 完了条件:
  - `build` が再現成功する、または失敗条件が固定化されて Issue/PR に切り出されている
  - `system/status` の暫定性がコードと文書で一致する

### Team B. Test and QA

- ミッション:
  - E2E 12 fail の正体を「未実装」から正しく再分類する
- 対象:
  - `src/__tests__/e2e-playwright/security-monitor.spec.ts`
  - `src/__tests__/e2e-playwright/dashboard.spec.ts`
  - `src/__tests__/e2e-playwright/patients-list.spec.ts`
  - `src/__tests__/e2e-playwright/public-menus-api.spec.ts`
- 根拠:
  - `docs/stabilization/DoD-v0.1.md` `DOD-06`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` `DOD-06`
- 作業:
  1. `security-monitor.spec.ts` の期待値を実装レスポンスに合わせて確認する
  2. `metrics` は `createSuccessResponse(...)` 契約と spec の差分を確認する
  3. `sessions` は `user_id` と `userId` の差分を確認する
  4. POST / terminate 系は E2E 契約ずれだけでなく、RLS 失敗由来かを Team D と切り分ける
  5. 残 fail を `契約ずれ / selector問題 / fixture問題 / サーバー不安定 / RLS不整合` に再分類する
- 完了条件:
  - E2E 12 fail の一覧が原因別に再分類されている
  - `route 未実装` という古い表現を置き換えられるだけの証跡がある
  - 2026-03-30 実績:
    - `src/__tests__/e2e-playwright/security-monitor.spec.ts`: **12 passed / 0 failed**
    - `src/__tests__/e2e-playwright/patients-list.spec.ts`: **6 passed / 0 failed**
    - `src/__tests__/e2e-playwright/public-menus-api.spec.ts`: **4 passed / 0 failed / 1 skipped**
    - 残件は `src/__tests__/e2e-playwright/dashboard.spec.ts` 2件 (`サーバー不安定`)

## 3-B. Team B 向け即時指示 - E2E 12 fail 片付け

- 目的:
  - `DOD-06` の残件を、closed beta 判定に使える粒度まで切り分ける
- 対象 spec:
  - `src/__tests__/e2e-playwright/security-monitor.spec.ts`
  - `src/__tests__/e2e-playwright/dashboard.spec.ts`
  - `src/__tests__/e2e-playwright/patients-list.spec.ts`
  - `src/__tests__/e2e-playwright/public-menus-api.spec.ts`
- 前提:
  - `npm run build` は再成功済み
  - `security-monitor` route は存在し、`metrics` レスポンス互換、`sessions` の `user_id` 互換、管理系書き込みの service-role client 化は実装済み
  - `src/__tests__/api/security-events-authorization.test.ts` は `5 passed / 0 failed`
- 分類ラベル:
  - `契約ずれ`
  - `selector問題`
  - `fixture問題`
  - `サーバー不安定`
  - `RLS不整合`
- 作業順:
  1. Playwright fail 12件を spec / test case 単位で一覧化する
  2. `security-monitor.spec.ts` は API 期待値を現実装に合わせて再確認する
  3. `dashboard.spec.ts` は `ERR_CONNECTION_REFUSED` が再現するかを先に確認し、再現するならアプリ修正ではなく環境・起動問題として分離する
  4. `patients-list.spec.ts` は selector と fixture 前提を点検し、DOM 契約の変更かデータ前提の崩れかを分ける
  5. `public-menus-api.spec.ts` は API バリデーション期待値が現行 route 契約と一致しているかを確認する
  6. `security-monitor` POST / terminate 系は Team D の契約メモと突き合わせ、RLS 由来か E2E 期待値由来かを確定する
- 出力物:
  - fail 12件の再分類表
  - 各 fail の根拠ログまたは該当 route / selector / fixture のファイルパス
  - `今PRで直す` と `beta後回し` の仕分け
- 完了条件:
  - 12 fail 全件に分類ラベルが付いている
  - `security-monitor` 系について `未実装` という表現を使わず説明できる
  - closed beta を止める fail と、後段 hardening に送る fail が分離されている
  - 2026-03-30 時点の仕分け:
    - `今PRで直す`: `security-monitor` 契約ずれ 6件、`patients-list` selector/fixture 2件、`public-menus-api` 契約/実行前提 2件
    - `beta後回し`: `dashboard.spec.ts` 2件 (`サーバー不安定`)

### Team C. Supabase and Data Reliability

- ミッション:
  - client-side Supabase 直アクセスの残存を棚卸しし、hardening 対象を固定する
- 対象:
  - `src/lib/session-manager.ts`
  - `src/lib/security-monitor.ts`
  - `src/lib/multi-device-manager.ts`
  - `src/lib/ai/analysis-client.ts`
  - `src/components/dashboard/ai-analysis.tsx`
  - `docs/stabilization/spec-shadow-operation-readiness-v0.1.md`
- 根拠:
  - `docs/stabilization/DoD-v0.1.md` `DOD-09`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` `DOD-09`
- 作業:
  1. どの直アクセスが tenant table か、どれが security/session 系かを分類する
  2. 「クローズドベータでは許容」「本番前に必須修正」を分ける
  3. shadow-operation の次 PR 境界を提案する
- 完了条件:
  - 直アクセス一覧がファイル単位で確定している
  - hardening 対象と beta 許容対象が分離されている

### Team D. Security and Access Control

- ミッション:
  - security-monitor 系 route と認可/RLS の実態を証跡化する
- 対象:
  - `src/app/api/admin/security/events/route.ts`
  - `src/app/api/admin/security/metrics/route.ts`
  - `src/app/api/admin/security/sessions/route.ts`
  - `src/app/api/admin/security/sessions/terminate/route.ts`
  - `src/lib/api-helpers.ts`
  - `src/lib/supabase/guards.ts`
- 根拠:
  - `docs/stabilization/pilot-go-execution-2026-03-27.md` `DOD-06`, `DOD-09`
- 作業:
  1. route 実装済みであることを証跡化する
  2. `clinic_id` / role / response shape を E2E 目線で整理する
  3. `security_events` INSERT, `notifications` UPSERT, `user_sessions` UPDATE が現在の RLS で成立するかを確認する
  4. 「未実装」ではなく「契約ずれ」か「RLS不整合」かを結論づける
- 完了条件:
  - security-monitor 系の実装有無が証跡付きで確定している
  - Team B が E2E 修正できるだけの契約メモがある
  - Team C が DB/RLS 修正必要性を判断できるだけの証跡がある

### Team E. Infra, Deploy, Observability

- ミッション:
  - local port 差分と Playwright 起動条件を固める
- 対象:
  - `playwright.config.ts`
  - `.env.test`
  - `.env.local`
  - `docker-compose.dev.yml`
  - `next.config.js`
- 根拠:
  - `docs/stabilization/DoD-v0.1.md` `DOD-06`, `DOD-10`
- 作業:
  1. `3000` / `3001` の使い分けを文書化する
  2. Playwright の起動前提を Team B と合わせる
- 完了条件:
  - baseURL / dev server / docker port の前提が1枚で読める
  - Playwright 実行前提が Team B と一致している

### Team F. Pilot Operations / Evidence

- ミッション:
  - 文書正本と現実の差分を閉じる
- 対象:
  - `docs/stabilization/DoD-v0.1.md`
  - `docs/stabilization/pilot-go-execution-2026-03-27.md`
  - `docs/stabilization/pilot-go-plan-2026-03-27.md`
  - `docs/stabilization/pilot-readiness-review-2026-03-27.md`
  - `docs/stabilization/closed-beta-ops-memo-2026-03-28.md`
- 作業:
  1. 今回の差分修正後に文書の数値と表現を再統一する
  2. `DOD-10` の再確認結果を正本に反映する
  3. `security-monitor` を「未実装」と書いている箇所を全て洗う
  4. pilot mode で `/admin/security-monitor` 系 UI が middleware で塞がれている扱いを文書に反映する
- 完了条件:
  - 文書間で `DOD-06`, `DOD-09`, `DOD-10` の表現が一致する
  - チームが同じ前提で会話できる

## 4. 差分一覧

| 区分 | 状態 | 内容 | 主担当 |
|------|------|------|--------|
| Build | 一致 | `npm run build` 再成功。`DOD-10` は PASS に再同期済み | Team A / E |
| DOD-09 | 一部不一致 | 主要 API は guard 済み、コード全体では直アクセス残存 | Team C / D |
| Security-monitor | 一致 | route 実装済み。E2E 契約ずれ修正後、`security-monitor.spec.ts` は 12/12 green | Team B / D / C |
| Patients-list / Public menus | 一致 | selector / fixture / 契約前提を修正し、targeted rerun で green (`public-menus` は inactive-clinic case のみ skip) | Team B / E |
| Dashboard E2E | 要再検証 | `dashboard.spec.ts` 2件が `ERR_CONNECTION_REFUSED` / サーバー不安定として残存 | Team B / E |
| Notifications / System status | 不一致 | 運用メモは非提供、実装は存在 | Team F |
| Jest 残1 suite | 解消 | `csp-security-migration.test.ts` は spec / rollback / migration SSOT 整合後に green | Team B / C |

## 5. PR 推奨順

1. PR-A1 build-reverify
   - 完了済み。`DOD-10` は PASS に更新
2. PR-D1 security-monitor-rls-contract-audit
   - `security_events` / `notifications` / `user_sessions` の route と RLS の整合確認
3. PR-B1 e2e-security-monitor-contract-alignment
   - **完了**。`security-monitor.spec.ts` の期待値修正、通知可視化、pilot mode 前提の UI 導線修正
4. PR-B2 e2e-dashboard-server-stability
   - `dashboard.spec.ts` 2件の `ERR_CONNECTION_REFUSED` 切り分け
5. PR-C1 shadow-operation-direct-access-inventory
   - client-side direct access 一覧化
6. PR-F1 docs-sync-after-reverify
   - 文書正本の再同期

## 6. 配布時の一言

各チームは「文書が古いから直す」ではなく、「文書と実装の差分を閉じる」ことを目的に作業してください。  
特に今回の優先は `DOD-06` の E2E 12 fail で、`security-monitor` を「未実装」と誤認したまま直さないことが重要です。

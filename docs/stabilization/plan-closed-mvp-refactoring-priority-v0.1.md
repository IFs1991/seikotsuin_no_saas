# Closed MVP Refactoring Priority Plan v0.1

- 作成日: 2026-04-10
- 最終更新: 2026-04-11 (PR-01〜PR-08 完了)
- 目的:
  - クローズドMVP前に必要なリファクタリング対象を、`1 task = 1 PR` で実行できる粒度に整理する
  - `docs/stabilization/DoD-v0.1.md` の `DOD-08`, `DOD-09`, `DOD-10` を壊さずに、UI/UX改善と周辺機能追加をしやすくする
- 前提:
  - 現行 repo はクローズドベータ/クローズドMVP運用を優先する
  - 大規模な再設計や `Tiramisu2` 前提の分離は本計画の対象外
  - 変更は小さく、検証しやすく、ロールバックしやすい単位で行う

## 1. 基本方針

- 優先順位は「設計の美しさ」ではなく「変更しやすさ」「事故りにくさ」「MVPの詰まりを減らすこと」で決める
- tenant boundary に関わるコードは、重複していても一気に大改修しない
- `service_role` 利用箇所は最優先で scope helper に寄せる
- `clinic_scope_ids` と旧ロール互換の解決ロジックは散らしたままにしない
- 1 PR ごとに対象を限定し、既存の stabilization spec と矛盾しないことを確認する
- TDD は全面適用ではなく、`認可`, `scope`, `service_role`, `tenant CRUD` のような壊すと危険な領域に限定して先にテストを書く
- 純粋なファイル分割や normalize 切り出しは、厳格TDDではなく contract test と回帰確認を優先する

## 2. 今回の対象

### 対象に含めるもの

- 認可/スコープ解決の重複除去
- 認証コンテキスト取得の重複除去
- tenant CRUD route の共通化
- service role 利用 API の scoped wrapper 化
- 閉鎖βで触る頻度の高い肥大 route の分割

### 対象に含めないもの

- `core-api` / `agent-api` 分離
- `organization / clinic_group / clinic` 再設計
- Supabase migration の大規模整理
- UI 全面刷新
- `Tiramisu2` 前提の repo 再編

## 3. 現状のホットスポット

| 項目 | 現状 | 主な対象ファイル | 問題 |
|------|------|------------------|------|
| clinic scope 解決 | 複数箇所に重複 | `src/app/api/system/status/route.ts`, `src/app/api/admin/tenants/route.ts`, `src/app/api/clinics/accessible/route.ts`, `src/app/api/admin/security/events/route.ts`, `src/app/api/admin/security/sessions/terminate/route.ts` | `clinic_scope_ids` と `clinic_id` のフォールバック実装が散在 |
| 認証コンテキスト取得 | `middleware` / layout / profile API / guard で分散 | `middleware.ts`, `src/app/admin/(protected)/layout.tsx`, `src/app/api/auth/profile/route.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/guards.ts` | `user_permissions`, `profiles`, 旧ロール互換の扱いが重複 |
| tenant CRUD route | APIごとに似た処理を個別実装 | `src/app/api/reservations/route.ts`, `src/app/api/customers/route.ts`, `src/app/api/menus/route.ts`, `src/app/api/resources/route.ts` | `processApiRequest()` 二重呼び出しや error mapping の重複 |
| service_role API | ルート単位で hand-written scope 制御 | `src/app/api/admin/security/events/route.ts`, `src/app/api/admin/security/sessions/terminate/route.ts`, `src/app/api/admin/tenants/route.ts`, `src/app/api/public/reservations/route.ts`, `src/app/api/public/menus/route.ts` | 実装差分が多く、 cross-tenant 事故の説明が難しい |
| 肥大 route | 1ファイルが大きい | `src/app/api/admin/settings/route.ts` 473行, `src/app/api/admin/security/events/route.ts` 351行, `src/app/api/admin/tables/route.ts` 360行, `src/lib/api-helpers.ts` 379行 | UI/UX改善や機能追加時の変更コストが高い |

## 4. 優先順位

### High

- PR-01: clinic scope helper の一元化
- PR-02: auth access context の一元化
- PR-03: tenant CRUD route template 化
- PR-04: service role scoped wrapper 導入
- PR-05: admin settings route の分割

### Medium

- PR-06: public reservations route の service 化
- PR-07: analytics read model access の共通化
- PR-08: `admin/tables` の read-only 化または対象縮小

### Later

- 旧ロール互換コードの撤去
- 現行 repo の全面的な module 再編
- `Tiramisu2` 前提の新アーキテクチャ

## 5. 実行計画表

| PR | 優先 | 目的 | 主な対象ファイル / 関数 | DoD | 完了条件 | 状態 |
|----|------|------|--------------------------|-----|----------|------|
| PR-01 | High | `clinic_scope_ids` 解決を helper に統一する | `src/lib/supabase/server.ts` `canAccessClinicScope`, 新規 `resolveScopedClinicIds`, `src/app/api/system/status/route.ts`, `src/app/api/admin/tenants/route.ts`, `src/app/api/clinics/accessible/route.ts`, `src/app/api/admin/security/events/route.ts`, `src/app/api/admin/security/sessions/terminate/route.ts` | DOD-08, DOD-09 | scope 配列解決の手書き実装が主要ルートから消える | ✅ 完了 (2026-04-10) |
| PR-02 | High | 認証コンテキスト取得を一本化する | 新規 `src/lib/supabase/auth-context.ts`, `middleware.ts`, `src/app/admin/(protected)/layout.tsx`, `src/app/api/auth/profile/route.ts`, `src/lib/supabase/server.ts` `getUserPermissions`, `src/lib/supabase/guards.ts` `ensureClinicAccess` | DOD-08 | `user_permissions` / `profiles` / 旧ロール互換の説明を 1 系統でできる | ✅ 完了 (2026-04-10) |
| PR-03 | High | tenant CRUD route の共通パターンを作る | 新規 `src/lib/route-helpers.ts` (`handleRouteError`, `processClinicScopedBody`), `src/app/api/reservations/route.ts`, `src/app/api/customers/route.ts`, `src/app/api/menus/route.ts`, `src/app/api/resources/route.ts` | DOD-09, DOD-10 | POST/PATCH/GET の guard, validation, error mapping が共通テンプレートで書ける | ✅ 完了 (2026-04-11) |
| PR-04 | High | `createAdminClient()` 利用 API に scoped wrapper を入れる | 新規 `src/lib/supabase/scoped-admin.ts`, `src/app/api/admin/security/events/route.ts`, `src/app/api/admin/security/sessions/terminate/route.ts`, `src/app/api/admin/tenants/route.ts`, `src/app/api/public/reservations/route.ts`, `src/app/api/public/menus/route.ts` | DOD-08, DOD-09 | service role 利用時の scope check を helper 経由で説明できる | ✅ 完了 (2026-04-11) |
| PR-05 | High | 管理設定 API を分割して変更しやすくする | `src/app/api/admin/settings/route.ts`, 新規 `src/lib/admin-settings/defaults.ts`, `src/lib/admin-settings/schemas.ts`, `src/lib/admin-settings/normalize.ts` | DOD-10 | settings API が「default/schema/normalize/route」に分割される | ✅ 完了 (2026-04-11) |
| PR-06 | Medium | 公開予約 API を service 化し、LINE/メール追加に備える | `src/app/api/public/reservations/route.ts`, 新規 `src/lib/services/public-reservation-service.ts` | DOD-09, DOD-10 | clinic/menu/resource/customer/reservation の責務が service に分離される | ✅ 完了 (2026-04-11) |
| PR-07 | Medium | KPI/分析 read model の取得を共通 service に寄せる | `src/app/api/ai-insights/route.ts`, `src/app/api/clinic/analysis/route.ts`, `src/app/api/admin/tenants/route.ts`, 新規 analytics service | DOD-10 | `daily_revenue_summary` / `patient_visit_summary` / `staff_performance_summary` の読み方が1箇所に寄る | ✅ 完了 (2026-04-11) |
| PR-08 | Medium | `admin/tables` の blast radius を下げる | `src/app/api/admin/tables/route.ts`, `src/lib/table-metadata.ts` | DOD-08, DOD-10 | CRUDを縮小するか read-only にして、閉鎖MVPの運用範囲に合わせる | ✅ 完了 (2026-04-11) |

## 6. 推奨実行順

1. PR-01 `clinic scope helper 統一`
2. PR-02 `auth access context 統一`
3. PR-04 `service role scoped wrapper`
4. PR-03 `tenant CRUD route template 化`
5. PR-05 `admin settings 分割`
6. PR-08 `admin/tables` 縮小
7. PR-06 `public reservations service 化`
8. PR-07 `analytics service 化`

理由:

- PR-01 と PR-02 で認可/スコープの source of truth を揃える
- PR-04 で最も事故リスクの高い service role 利用を固める
- PR-03 以降で route の重複整理に入る
- PR-05 以降は UX改善や新機能追加に効く変更しやすさの改善

## 7. TDD運用方針

### TDD を強く適用する対象

- `clinic_scope_ids` / `clinic_id` の解決
- `middleware` / layout / auth profile の認可整合
- `createAdminClient()` を使う route の scope 制御
- tenant CRUD API の guard / validation / update scope

### 厳格TDDを必須にしない対象

- route の単純なファイル分割
- settings の defaults / schema / normalize の切り出し
- logging や命名の整理
- UI の見た目調整

### 実務ルール

- 各 PR は、実装前に「壊したくない振る舞い」を最低1つ以上テストで固定する
- 既存テストがある場合は、そのテストを先に失敗させるか、期待値を追加してから実装する
- 既存テストがない場合は、対象 route / helper の最小 unit test を先に追加する
- `DOD-08` / `DOD-09` に触れる変更は、必ず auth / API テストを先に追加してから実装する

## 8. PR別 TDD 先行テスト

### PR-01 `clinic scope helper 統一`

- 先に固定する既存テスト
  - `src/__tests__/api/clinics-accessible.test.ts`
  - `src/__tests__/api/admin-tenants-access.test.ts`
  - `src/__tests__/api/security-events-authorization.test.ts`
  - `src/__tests__/api/system-status.test.ts`
- 追加候補
  - `src/__tests__/lib/scoped-clinic-ids.test.ts`
- 先に固定する観点
  - `clinic_scope_ids` 優先
  - `clinic_id` フォールバック
  - scope 欠落時 fail-closed

### PR-02 `auth access context 統一`

- 先に固定する既存テスト
  - `src/__tests__/auth/middleware-auth.test.ts`
  - `src/__tests__/lib/api-helpers-auth.test.ts`
  - `src/__tests__/api/admin-tenants-access.test.ts`
- 追加候補
  - `src/__tests__/api/auth-profile-route.test.ts`
  - `src/__tests__/admin/admin-layout-auth.test.tsx`
- 先に固定する観点
  - `user_permissions` 優先
  - `profiles.is_active` のみ補助参照
  - `clinic_manager -> clinic_admin` 互換維持

### PR-03 `tenant CRUD route template 化`

- 先に固定する既存テスト
  - `src/__tests__/api/reservations-route.test.ts`
  - `src/__tests__/api/reservations-schema.test.ts`
  - `src/__tests__/stabilization/F01-blocks-reservations-snake-case.test.ts`
- 追加候補
  - `src/__tests__/api/customers-route.test.ts`
  - `src/__tests__/api/menus-route.test.ts`
  - `src/__tests__/api/resources-route.test.ts`
- 先に固定する観点
  - `processApiRequest()` 二重呼び出しを消しても認可が変わらない
  - `PATCH/UPDATE` に `clinic_id` scope が残る
  - error status の戻り値が変わらない

### PR-04 `service role scoped wrapper`

- 先に固定する既存テスト
  - `src/__tests__/api/security-events-authorization.test.ts`
  - `src/__tests__/api/security-events.test.ts`
  - `src/__tests__/api/admin-tenants-access.test.ts`
  - `src/__tests__/api/public-reservations-route.test.ts`
- 追加候補
  - `src/__tests__/api/public-menus-route.test.ts`
  - `src/__tests__/lib/scoped-admin-client.test.ts`
- 先に固定する観点
  - service role でも scope 外 clinic は拒否
  - public API は explicit `clinic_id` validation を維持
  - admin API は `allowedClinicIds` 相当の挙動を helper 経由で維持

### PR-05 `admin settings 分割`

- 先に固定する既存テスト
  - `src/__tests__/api/admin-settings.test.ts`
  - `src/__tests__/components/system-settings.test.tsx`
  - `src/__tests__/components/communication-settings.test.tsx`
  - `src/__tests__/e2e-playwright/admin-settings.spec.ts`
- 追加候補
  - `src/__tests__/lib/admin-settings-normalize.test.ts`
- 先に固定する観点
  - `communication` category の normalize 結果
  - GET default 値
  - PUT schema validation と `smtpSettings.password` 非保存契約

### PR-06 `public reservations service 化`

- 先に固定する既存テスト
  - `src/__tests__/api/public-reservations-route.test.ts`
  - `src/__tests__/e2e-playwright/reservations.spec.ts`
- 追加候補
  - `src/__tests__/lib/public-reservation-service.test.ts`
- 先に固定する観点
  - clinic/menu/resource/customer/reservation の検証順
  - slot conflict 判定
  - customer rollback の現行契約

### PR-07 `analytics service 化`

- 先に固定する既存テスト
  - `src/__tests__/api/clinic-analysis.test.ts`
  - `src/__tests__/api/customers-analysis-api.test.ts`
  - `src/__tests__/api/analysis-endpoint-parity.test.ts`
  - `src/__tests__/api/multi-store-kpi.test.ts`
- 追加候補
  - `src/__tests__/api/ai-insights-route.test.ts`
  - `src/__tests__/lib/analytics-read-model-service.test.ts`
- 先に固定する観点
  - `daily_revenue_summary` / `patient_visit_summary` / `staff_performance_summary` の集計結果
  - clinic scope による結果差分
  - fallback insight の挙動

### PR-08 `admin/tables` 縮小

- 先に固定する既存テスト
  - `src/__tests__/stabilization/F03-admin-tables-rpc-removal.test.ts`
- 追加候補
  - `src/__tests__/api/admin-tables-route.test.ts`
- 先に固定する観点
  - 閉鎖MVPで許す操作だけが通る
  - 管理対象外テーブルを拒否する
  - 削除または read-only 化後の contract が明確

## 9. 検証方針

### 共通

- `npm run type-check`
- `npm run build`
- 影響範囲の Jest 再実行

### 認可/スコープ系 PR

- `docs/stabilization/DoD-v0.1.md` `DOD-08`
- `docs/stabilization/DoD-v0.1.md` `DOD-09`
- `src/__tests__/auth/middleware-auth.test.ts`
- tenant / HQ 関連 API テスト

### route 分割系 PR

- `docs/stabilization/DoD-v0.1.md` `DOD-10`
- 対象 route の既存 unit test
- 必要なら focused Playwright

## 10. リスクと注意点

- `middleware.ts` は Edge 前提なので、server helper を安易に共有しすぎると壊れやすい
- `service_role` の helper 化で scope 条件を広げると `DOD-08` の説明が崩れる
- `clinic_manager -> clinic_admin` の互換コードは、データ移行完了までは削除しない
- `admin/tables` は便利でも、閉鎖MVP運用に不要な更新権限を広く残すと事故面が大きい
- migration 変更は本計画に含めない

## 11. 完了判定

この計画の完了条件は次とする。

- High 優先の PR-01 から PR-05 が完了している
- `DOD-08`, `DOD-09`, `DOD-10` の説明が変更後も明確である
- UI/UX 改修で毎回認可/route の重複修正に詰まらない
- メーリング機能、課金機能、LINE連携の実装前に、基盤変更の痛みを先に下げられている

## 12. 進捗ログ

| PR | 完了日 | 主な成果物 | テスト |
|----|--------|------------|--------|
| PR-01 | 2026-04-10 | `resolveScopedClinicIds`, `canAccessClinicScope` を `server.ts` に集約。5つの route から手書き scope 解決ロジックを除去 | `src/__tests__/lib/scoped-clinic-ids.test.ts` 追加 |
| PR-02 | 2026-04-10 | `src/lib/supabase/auth-context.ts` 新設。`fetchUserPermissionsRecord` / `fetchProfileStatus` / `resolvePermissionRecord` / `buildUserAuthAccessContext` の4関数で認証コンテキスト取得を一本化。middleware / layout / profile route / guards が全て同一パスを使用 | `src/__tests__/lib/auth-access-context.test.ts`, `src/__tests__/api/auth-profile-route.test.ts` 追加、計49テストパス |
| PR-03 | 2026-04-11 | `src/lib/route-helpers.ts` 新設。`handleRouteError` (catch共通化) と `processClinicScopedBody` (processApiRequest二重呼び出し解消) を実装。reservations / customers / menus / resources の POST/PATCH を移行 | `src/__tests__/lib/route-helpers.test.ts`(9件)、`src/__tests__/api/customers-route.test.ts`(6件) 追加、計85テストパス |
| PR-04 | 2026-04-11 | `src/lib/supabase/scoped-admin.ts` 新設。`createScopedAdminContext`（認証済みadmin API用）と `createPublicClinicContext`（公開API用）の2パターンでservice role利用を一元化。エラー型 `ScopeNotConfiguredError` / `ScopeAccessError` / `ClinicNotFoundError` / `ClinicInactiveError` で分類。5つのrouteから手書きscope解決+クリニック検証ロジックを除去 | `src/__tests__/lib/scoped-admin-client.test.ts`（10件）追加、関連8ファイル計77テストパス、型チェック通過 |
| PR-05 | 2026-04-11 | `src/lib/admin-settings/` ディレクトリ新設。`defaults.ts`（VALID_CATEGORIES, DEFAULT_SETTINGS, 型）、`schemas.ts`（全9カテゴリのZodスキーマ, CATEGORY_SCHEMAS）、`normalize.ts`（normalizeCommunicationSettings, legacy形式吸収）に分離。route.ts を526行→230行に縮小 | `src/__tests__/lib/admin-settings-normalize.test.ts`（13件）追加、既存4スイート計31テストパス、型チェック通過 |
| PR-06 | 2026-04-11 | `src/lib/services/public-reservation-service.ts` 新設。`PublicReservationService` クラスに予約フロー全体（booking設定確認・menu/resource検証・スロット重複判定・顧客検索/作成・予約作成・顧客ロールバック）を分離。route.ts を346行→198行に縮小。エラー型 `BookingDisabledError` / `MenuNotFoundError` / `ResourceNotFoundError` / `SlotConflictError` / `CustomerLookupError` / `CustomerCreateError` / `ReservationCreateError` で分類。既存テストを PR-04 の `createPublicClinicContext` モックに更新 | `src/__tests__/lib/public-reservation-service.test.ts`（19件）追加、route テスト（8件）更新、計27テストパス、型チェック通過 |
| PR-07 | 2026-04-11 | `src/lib/services/analytics-read-service.ts` 新設。`AnalyticsReadService` クラスに `fetchDailyRevenue` / `fetchStaffPerformance` / `fetchPatientVisitSummary`（単一クリニック用）と `fetchMultiClinicKPI`（多店舗集約用）の4メソッドを集約。`ai-insights` / `clinic/analysis` / `admin/tenants` の3ルートから直接クエリを除去。`admin/tenants` の `fetchClinicKPIData` ヘルパー関数（90行）を service に移行。`multi-store-kpi.test.ts` を PR-04 の `createScopedAdminContext` モックに更新 | `src/__tests__/lib/analytics-read-service.test.ts`（9件）追加、既存3スイート（17件）+ `multi-store-kpi`（7件更新）計26テストパス、型チェック通過 |
| PR-08 | 2026-04-11 | `admin/tables` の blast radius 縮小。DELETE ハンドラを完全削除。`isWritableTable()` を `table-metadata.ts` に追加し、`patients` / `staff` / `clinic_settings` を read-only 化（POST/PUT で 403 を返す）。`menus` / `menu_categories` / `resources` は引き続き書き込み可能。GET は全テーブル対象のまま維持 | `src/__tests__/api/admin-tables-route.test.ts`（10件）追加、既存 F03 テスト（21件）パス、計31テストパス、型チェック通過 |

## 13. 一言まとめ

クローズドMVP前の現 repo でやるべきリファクタリングは、
「全部きれいにすること」ではなく、
「認可・scope・service role・高頻度 route の変更コストを下げること」
に限定する。

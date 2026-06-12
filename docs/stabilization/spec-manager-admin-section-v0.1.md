# Manager Admin Section Spec v0.1

- Status: draft
- Date: 2026-06-13
- File: `docs/stabilization/spec-manager-admin-section-v0.1.md`
- Target repository: `IFs1991/seikotsuin_no_saas`
- Feature: manager 向け管理セクション（ナビゲーション再設計 + 専用画面群）
- Related specs:
  - `spec-manager-staff-analysis-v0.2.md`（assignment-scoped read-only パターンの正本）
  - manager dashboard spec v0.1.5
  - `spec-rls-tenant-boundary-v0.1.md`

---

## 0. Background / Problem Statement

manager のサイドバー管理セクション（`AREA_MANAGER_ADMIN_MENU_ITEMS`）は admin 向け
ルートへのリンクを表示しているが、実際には大半が機能しない。

### 現状の事実（2026-06-13 時点のコード調査結果）

| レイヤー | 現状 |
|---|---|
| ナビゲーション | manager に `管理ホーム /admin`、`スタッフ管理 /admin/users`、`希望シフト管理 /admin/shift-requests`、`Clinic設定 /admin/settings`、`店舗比較分析 /multi-store` の5リンクを表示（`src/lib/navigation/items.ts` の `AREA_MANAGER_ADMIN_MENU_ITEMS`） |
| ページ layout ガード | `src/lib/admin/routes.ts` の `canAccessAdminRouteWithCompat()` により、manager は `/admin`、`/admin/users`、`/admin/settings`、`/admin/shift-requests` に**入室自体は可能**。`/admin/managers` は admin 専用 |
| 管理 API | `/api/admin/*` は `verifyAdminAuth()` = `ADMIN_UI_ROLES (admin, clinic_admin)` のみ許可（`src/lib/api-helpers.ts`）。**manager は 403** |
| 結果 | manager はページを開けてもデータ取得が 403 になり、実質的に使えない管理セクションが表示されている |

### 既に manager 対応済みの資産（再利用する）

| 資産 | 内容 |
|---|---|
| 希望シフト API | `/api/staff/shift-requests*` は `SHIFT_REQUEST_MANAGER_ROLES = ['admin', 'manager', 'clinic_admin']`（閲覧・承認・却下）、`SHIFT_REQUEST_CONVERSION_ROLES = ['admin', 'manager']`（シフト変換）を許可済み（`src/lib/staff/shift-requests/access.ts`） |
| スコープ検証 | `ensureClinicAccess()`（`src/lib/supabase/guards.ts`）は manager のとき `resolveEffectiveClinicScope()`（= active `manager_clinic_assignments` ベース）で clinic アクセスを検証済み |
| 監査ログ | `shift_request_audit_logs` + `insertShiftRequestAuditLog()` が承認系操作を記録済み |
| 担当院解決 | `resolveManagerAssignedClinics()`（`src/lib/auth/manager-scope.ts`） |
| 期間ヘルパー | `src/lib/manager-analysis-period.ts` |
| 集計 RPC / lib | `manager_revenue_period_totals` 等、`src/lib/manager-dashboard.ts`、`src/lib/services/manager-revenue-service.ts` |

### 既知の不整合（本仕様の対象または open question）

- `/multi-store` の layout は manager スコープを `resolveScopedClinicIds(permissions)`
  （= `clinic_scope_ids` ベース）で解決しており、「manager の実効スコープは active
  `manager_clinic_assignments` のみ」という不変条件と不整合。
- manager の operation メニューに `希望シフト /staff/shift-requests`（セルフ提出画面）が
  残っている。manager は staff resource を持たない前提のため導線として不適切。

---

## 1. Summary

manager の管理セクションを admin ルート共用から **`/manager/**` 配下の専用画面群**に
再設計する。

役割階層は admin（本部）→ manager（担当エリア）→ clinic_admin（単店舗）であり、
manager は admin から割り振られた担当院（active `manager_clinic_assignments`）を
統括する。`/admin/**` は本部スコープ前提の画面群であり、manager を通すために
ガードへ穴を開けるのではなく、assignment-scoped な専用画面を積み上げる。

write 境界は以下に固定する。

- **希望シフトのレビュー（承認 / 却下 / シフト変換）のみ manager の write を許可する。**
  既存 `/api/staff/shift-requests*` を再利用し、**新規 write API は作らない**。
- それ以外の管理機能（スタッフ一覧、店舗比較、管理ホーム）はすべて read-only。

実装は 4 Phase に分割し、**1 Phase = 1 PR** とする。各 Phase は独立してマージ・
リリース可能であること。

| Phase | 内容 | Route | write |
|---|---|---|---|
| 1 | ナビ差し替え + 管理ホーム | `/manager` | なし |
| 2 | 担当院スタッフ一覧 | `/manager/staff` | なし |
| 3 | 担当院希望シフト確認・承認 | `/manager/shift-requests` | 承認 / 却下 / 変換のみ |
| 4 | 担当院店舗比較分析 | `/manager/clinic-comparison` | なし |

---

## 2. Core Decisions

### 2.1 manager 管理セクションは `/manager/**` 専用画面で構成する

- `/admin/**` ページの共用をやめ、manager のナビは `/manager/**` のみに向ける。
- `verifyAdminAuth()`、`ADMIN_UI_ROLES`、`/api/admin/*` は**変更しない**。
- `src/lib/admin/routes.ts` の manager 許可（`AREA_MANAGER_ADMIN_ROUTE_PREFIXES`）の
  撤去は v0.2 に送る（§19 Open Questions 参照）。v0.1 では導線のみ差し替える。

### 2.2 スコープは active `manager_clinic_assignments` のみ

`spec-manager-staff-analysis-v0.2.md` §7 と同一の不変条件を全 Phase に適用する。

以下は manager のアクセス権判定に使用しない。

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- クライアント側の clinic 選択状態
- URL query の `clinic_id`（必ずサーバー側で assignment と照合する）

担当外 `clinic_id` は fail-closed で `403`。担当院 0 件は `200` + 空データ。

### 2.3 write は希望シフトレビューのみ。既存 API を再利用する

- manager に開放する write は「希望シフトの承認・却下・シフト変換」のみ。
- 既存の `/api/staff/shift-requests/[id]`（レビュー）と
  `/api/staff/shift-requests/convert`（変換）を再利用する。これらは既に
  manager ロール + assignment スコープ + 監査ログに対応している。
- **新規 write API・新規テーブル・migration は追加しない。**
- スタッフ作成、ロール変更、権限変更、予約・患者・売上・日報の編集、
  シフト募集期間（`shift_request_periods`）の作成・編集は manager に開放しない。

### 2.4 ナビゲーションは Phase ごとに実在ページのみ追加する

- Phase 1 で `AREA_MANAGER_ADMIN_MENU_ITEMS` を全面差し替えし、403 リンクを排除する。
- 以降の Phase で画面が増えるたびに、同じ PR でナビ項目を 1 件追加する。
- 「ページは存在するがナビにない」「ナビにあるがページがない」状態を作らない。

最終形（Phase 4 完了時）:

```ts
export const AREA_MANAGER_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'manager-home', label: '管理ホーム', href: '/manager' },
  { id: 'manager-staff-list', label: '担当院スタッフ一覧', href: '/manager/staff' },
  {
    id: 'manager-shift-requests',
    label: '担当院希望シフト',
    href: '/manager/shift-requests',
  },
  {
    id: 'manager-clinic-comparison',
    label: '担当院比較分析',
    href: '/manager/clinic-comparison',
  },
];
```

注意:

- `Clinic設定`（`/admin/settings`）は manager 管理セクションに**含めない**（v0.1 決定）。
- `店舗比較分析`（`/multi-store`）への manager 導線は Phase 4 で
  `/manager/clinic-comparison` に置き換える。
- operation メニューの `希望シフト /staff/shift-requests` は Phase 3 で
  manager から削除する（管理セクションに移管）。

---

## 3. Goals

- manager のサイドバーから 403 になるリンクをなくす。
- manager が担当院一覧と管理機能への入口（管理ホーム）を持てる。
- manager が担当院の staff resource 一覧を read-only で確認できる。
- manager が担当院の希望シフトを横断確認し、承認・却下・シフト変換できる。
- manager が担当院のみの店舗比較分析を確認できる。
- すべての manager 向け API / 画面のスコープが active `manager_clinic_assignments`
  のみで解決される。
- admin / clinic_admin / therapist / staff の既存画面挙動は変更しない。

---

## 4. Non-Goals

- migration / RLS / manager assignment schema の変更（追加しない）。
- `verifyAdminAuth()` / `ADMIN_UI_ROLES` / `/api/admin/*` の変更。
- 希望シフトレビュー以外の write（スタッフ管理、設定変更、期間作成、予約・売上編集等）。
- シフト募集期間（`shift_request_periods`）の作成・編集・締切変更。
- スタッフの個人連絡先（email / phone）、アカウント情報、権限情報の表示。
- 人事評価・給与査定・勤怠承認機能。
- admin 向け `/admin/**`、`/multi-store` の機能変更（manager 導線の差し替えのみ）。
- `src/lib/admin/routes.ts` からの manager 許可撤去（v0.2 送り）。
- `supabase db push` / `supabase migration up` / `supabase db reset` の実行。

---

## 5. Current State / Schema Assumptions

Relevant files / modules:

- `src/lib/navigation/items.ts`（`AREA_MANAGER_ADMIN_MENU_ITEMS` ほか）
- `src/lib/admin/routes.ts`
- `src/lib/constants/roles.ts`（`ADMIN_UI_ROLES`, `isAreaManagerRole`, `normalizeRole`）
- `src/lib/auth/manager-scope.ts`（`resolveManagerAssignedClinics`, `resolveEffectiveClinicScope`）
- `src/lib/supabase/guards.ts`（`ensureClinicAccess`）
- `src/lib/api-helpers.ts`（`processApiRequest`, `verifyAdminAuth`）
- `src/lib/staff/shift-requests/access.ts`（ロール定義・監査ログ）
- `src/app/api/staff/shift-request-periods/route.ts`
- `src/app/api/staff/shift-requests/route.ts`
- `src/app/api/staff/shift-requests/[id]/route.ts`
- `src/app/api/staff/shift-requests/convert/route.ts`
- `src/app/api/manager/staff-analysis/route.ts`（fetchAllRows ページングパターンの正本）
- `src/lib/manager-staff-analysis.ts`
- `src/lib/manager-analysis-period.ts`
- `src/lib/manager-dashboard.ts` / `src/lib/services/manager-revenue-service.ts`
- `src/app/(app)/manager/staff-analysis/page.tsx`（manager ページガードの正本）
- `src/providers/user-profile-context.tsx`

Relevant tables / views:

- `public.manager_clinic_assignments`
- `public.clinics`
- `public.resources`（`type='staff'`, `is_deleted`, `is_active`, `is_bookable`）
- `public.shift_request_periods`（status: `draft | open | closed | finalized | cancelled`）
- `public.shift_requests`（status: `draft | submitted | approved | rejected | withdrawn | converted`）
- `public.shift_request_audit_logs`
- `public.staff_shifts`

Notes:

- PostgREST `max_rows = 1000`（`supabase/config.toml`）。一覧系 API は
  `/api/manager/staff-analysis` の `fetchAllRows()`（`.order('id').range()`）
  パターンでページングする。
- 日付・時刻は `src/lib/jst.ts` / `manager-analysis-period.ts` の JST ユーティリティを
  使う。UTC `slice(0,10)` での日付判定を書かない（DoD-06 既知の落とし穴）。
- 列名・RPC シグネチャは実装前に必ず現行スキーマ / 既存 helper で確認する。

---

## 6. Security Requirements（全 Phase 共通）

- `/api/manager/*` の新規ルートは `processApiRequest()` + `allowedRoles: ['manager']`
  + `normalizeRole()` 再確認の二段構えとする（`staff-analysis/route.ts` と同形）。
- manager の clinic scope は `resolveManagerAssignedClinics()` の結果のみ。
- クライアントから渡された `clinic_id` は必ず assignment と照合し、担当外は `403`。
- 担当院 0 件は `200` + 空データ + 空状態 UI。
- 未認証は `401`、manager 以外のロールは `403`。
- API response に担当外 clinic / staff / shift / patient データを含めない。
- 患者個人情報・スタッフ個人連絡先・権限情報は返さない。
- Phase 3 の write は既存 API のガード（ロール + `ensureClinicAccess` + 監査ログ）に
  全面依存し、ガードの緩和・バイパスを行わない。
- ページは `useUserProfileContext()` + `isAreaManagerRole()` でガードする
  （`/manager/staff-analysis/page.tsx` と同形）。ただし**ページガードは UX であり、
  認可の本体は API + RLS**。クライアント側チェックだけで認可を済ませない。

---

## 7. Phase 1: ナビ差し替え + 管理ホーム `/manager`

### 7.1 Scope

- `AREA_MANAGER_ADMIN_MENU_ITEMS` を以下に差し替える（Phase 1 時点）:

```ts
export const AREA_MANAGER_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'manager-home', label: '管理ホーム', href: '/manager' },
];
```

- 旧 5 項目（`/admin`、`/admin/users`、`/admin/shift-requests`、`/admin/settings`、
  `/multi-store`）を manager ナビから削除する。
- `/manager` ページ（管理ホーム）を新設する。

### 7.2 管理ホームの内容（read-only）

- タイトル: `管理ホーム`
- 説明: `担当院の管理機能の入口です。`
- 担当院一覧（院名のみのカードまたはリスト。assignments 由来）
- 機能カード（実装済み Phase のみ表示する。リンク先が存在しない機能カードは出さない）:
  - `担当院スタッフ分析`（`/manager/staff-analysis`、実装済）
  - Phase 2 以降の各画面（当該 Phase マージ後に追加）
- 担当院 0 件の空状態:

```txt
担当院がまだ設定されていません。
管理者にマネージャー管理から担当店舗の設定を依頼してください。
```

### 7.3 API

```txt
GET /api/manager/assigned-clinics
```

Response:

```ts
type ManagerAssignedClinicsResponse = {
  generatedAt: string;
  clinics: { id: string; name: string }[];
};
```

Rules:

- manager のみ。`resolveManagerAssignedClinics()` の結果をそのまま整形して返す。
- 担当院 0 件は `200` + `clinics: []`。
- 既存 `/api/manager/dashboard` が同等情報を返す場合は再利用してよい
  （実装前に response shape を確認し、流用可能ならこの API は作らない）。

### 7.4 Create / Update

Create:

- `src/app/(app)/manager/page.tsx`
- `src/components/manager/manager-home.tsx`
- （必要時）`src/app/api/manager/assigned-clinics/route.ts`
- `src/__tests__/components/manager/manager-home.test.tsx`
- （必要時）`src/__tests__/api/manager-assigned-clinics-route.test.ts`

Update:

- `src/lib/navigation/items.ts`
- `src/__tests__/lib/navigation-items.test.ts`

### 7.5 Acceptance Criteria

- manager のナビ管理セクションが `管理ホーム` 1 件になる。
- `/admin/**`・`/multi-store` への manager ナビリンクが消える。
- manager が `/manager` を開け、担当院一覧と機能カードが表示される。
- 非 manager が `/manager` を開くと権限なし表示になる。
- 担当院 0 件の空状態が表示される。
- admin / clinic_admin のナビは変更されない。

---

## 8. Phase 2: 担当院スタッフ一覧 `/manager/staff`

### 8.1 Scope

担当院の staff resource を read-only で横断確認できる一覧。
スタッフ分析（数値・評価系）とは役割を分け、「誰がどの院に居るか」の名簿に徹する。

### 8.2 API

```txt
GET /api/manager/staff
```

Query:

```txt
clinic_id=<uuid>   // optional。指定時はその院のみ。担当外は 403
```

Response:

```ts
type ManagerStaffListResponse = {
  generatedAt: string;
  clinics: { id: string; name: string }[];
  staff: ManagerStaffListRow[];
};

type ManagerStaffListRow = {
  staffId: string; // resources.id
  staffName: string; // resources.name
  clinicId: string;
  clinicName: string;
  isActive: boolean;
  isBookable: boolean | null;
};
```

Rules:

- canonical staff id は `resources.id`（`type='staff'`、`is_deleted=false`）。
  `public.staff` は使わない（staff-analysis v0.2 と同一）。
- email / phone / アカウント / 権限情報は返さない。
- 取得は `fetchAllRows()` パターンでページングする（max_rows=1000 対策）。
- 並び順: `clinicName asc` → `staffName asc`（ja locale）。

### 8.3 UI

- フィルター: 院選択（`全担当院` + 担当院のみ）
- テーブル列: スタッフ名 / 所属院 / 有効 / 予約受付可
- 各行に write action を表示しない（編集・無効化・招待等のボタンなし）。
- 空状態（担当院 0 件 / スタッフ 0 件）を表示する。

### 8.4 Create / Update

Create:

- `src/types/manager-staff-list.ts`
- `src/app/api/manager/staff/route.ts`
- `src/hooks/useManagerStaffList.ts`
- `src/components/manager/manager-staff-list.tsx`
- `src/app/(app)/manager/staff/page.tsx`
- `src/__tests__/api/manager-staff-route.test.ts`
- `src/__tests__/components/manager/manager-staff-list.test.tsx`

Update:

- `src/lib/navigation/items.ts`（`manager-staff-list` 追加）
- `src/components/manager/manager-home.tsx`（機能カード追加）
- `src/__tests__/lib/navigation-items.test.ts`

### 8.5 Acceptance Criteria

- manager が担当院全体・院別のスタッフ名簿を見られる。
- 担当外 `clinic_id` は `403`。
- staffId が `resources.id` である。
- email / phone / 権限情報が response にも UI にも存在しない。
- write action が UI に存在しない。
- 1000 行超でも全件取得される（route テストで証明）。

---

## 9. Phase 3: 担当院希望シフト確認・承認 `/manager/shift-requests`

### 9.1 Scope

担当院の希望シフトを院横断で確認し、承認・却下・シフト変換を行う画面。
**本仕様で唯一の write を含む Phase。**

バックエンドは既存 API をそのまま使う。**新規 API・新規スキーマ・ガード変更なし。**

| 操作 | 既存 API | manager 許可の根拠 |
|---|---|---|
| 期間一覧 | `GET /api/staff/shift-request-periods?clinic_id=...` | `SHIFT_REQUEST_MANAGER_ROLES` |
| 希望一覧 | `GET /api/staff/shift-requests?clinic_id=...&period_id=...` | 同上 |
| 承認 / 却下 | `PATCH /api/staff/shift-requests/[id]` | 同上 + `shift_request_audit_logs` |
| シフト変換 | `POST /api/staff/shift-requests/convert` | `SHIFT_REQUEST_CONVERSION_ROLES` |

Implementation note:

- 実装前に `[id]` route と `convert` route の実際のリクエスト形式
  （承認 / 却下のパラメータ名、convert の引数）を確認し、UI をそれに合わせる。
  **既存 API の仕様をこの画面の都合で変更しない。**
- `ensureClinicAccess()` が manager の clinic scope を assignments で検証することを
  前提とする（検証済み、§0 参照）。

### 9.2 UI

- フィルター: 院選択（担当院のみ。横断一覧は v0.2 検討、v0.1 は院単位で十分）
- 期間選択（`shift_request_periods` の一覧から選択）
- 希望シフト一覧: スタッフ名 / 種別（available, preferred, unavailable, day_off）/
  日時 / 優先度 / 状態 / 備考
- 状態が `submitted` の行に `承認` / `却下` ボタンを表示
- 却下時は理由（`rejection_reason`）必須（DB 制約に準拠）
- `approved` の行に `シフトに変換` を表示（変換対象は既存 API の制約に従う）
- 操作後は一覧を再取得し、結果（成功 / 失敗メッセージ）を表示
- 期間の作成・編集・締切変更 UI は**置かない**

### 9.3 Navigation

- 管理セクションに `担当院希望シフト`（`/manager/shift-requests`）を追加。
- operation メニューの `希望シフト`（`/staff/shift-requests`）を
  `AREA_MANAGER_OPERATION_MENU_ITEMS` から削除する（セルフ提出画面のため）。
- クイックアクセスに変更があれば同様に整合を取る。

### 9.4 Create / Update

Create:

- `src/components/manager/manager-shift-requests.tsx`
- `src/hooks/useManagerShiftRequests.ts`
- `src/app/(app)/manager/shift-requests/page.tsx`
- `src/__tests__/components/manager/manager-shift-requests.test.tsx`

Update:

- `src/lib/navigation/items.ts`
- `src/components/manager/manager-home.tsx`
- `src/__tests__/lib/navigation-items.test.ts`

Do not update:

- `src/app/api/staff/shift-requests/**`（読み取り専用の依存）
- `src/lib/staff/shift-requests/access.ts`
- migration / RLS

### 9.5 Acceptance Criteria

- manager が担当院の希望シフトを期間・院で絞って確認できる。
- manager が `submitted` を承認・却下できる（却下は理由必須）。
- manager が `approved` をシフト変換できる。
- 担当外 clinic の希望シフトは取得も操作もできない（既存ガードで 403）。
- 監査ログが既存の仕組みで記録される（既存 API 経由のため自動）。
- 期間の作成・編集 UI が存在しない。
- manager の operation メニューから `/staff/shift-requests` が消える。
- clinic_admin / therapist / staff の希望シフト画面・API 挙動は変更されない。

---

## 10. Phase 4: 担当院店舗比較分析 `/manager/clinic-comparison`

### 10.1 Scope

担当院のみを対象にした read-only の店舗比較。`/multi-store`（admin 向け、
permissions ベーススコープ）は変更せず、manager 導線をこの画面に置き換える。

### 10.2 API

```txt
GET /api/manager/clinic-comparison
```

Query（staff-analysis v0.2 と同一の期間体系）:

```txt
period=month | previous_month | last_3_months | year | custom | all
start_date=YYYY-MM-DD
end_date=YYYY-MM-DD
compare=previous_period | none
```

Response:

```ts
type ManagerClinicComparisonResponse = {
  generatedAt: string;
  period: {
    preset: string;
    startDate: string | null;
    endDate: string | null;
    bucket: 'daily' | 'weekly' | 'monthly';
    compare: 'previous_period' | 'none';
  };
  clinics: { id: string; name: string }[];
  rows: ManagerClinicComparisonRow[];
  disclaimers: string[];
};

type ManagerClinicComparisonRow = {
  clinicId: string;
  clinicName: string;
  totalRevenue: number;
  reservationCount: number;
  completedReservationCount: number;
  cancellationRate: number;
  revenueChangeRate: number | null;
  reservationChangeRate: number | null;
};
```

Rules:

- 期間処理は `manager-analysis-period.ts` を再利用する。
- 集計は既存の manager 系 RPC / lib
  （`manager_revenue_period_totals`、`src/lib/manager-dashboard.ts`、
  `src/lib/services/manager-revenue-service.ts`）を最優先で再利用する。
  **新規 RPC / migration は作らない。** 既存 RPC で賄えない指標は v0.2 に送るか、
  `fetchAllRows()` ページング + pure builder（`src/lib/manager-clinic-comparison.ts`）
  で集計する。
- 売上の定義（予約ベース / 日報明細ベース）は再利用する既存 helper の定義に従い、
  `disclaimers` に明記する。
- N+1（担当院数ぶんの直列クエリ）を避け、`clinic_id in (...)` でまとめて取得する。

### 10.3 UI

- フィルター: 期間 / 比較（staff-analysis と同じ select 構成）
- 院別比較テーブル + （任意）院別売上の簡易チャート
- write action なし。患者個人情報なし。
- 空状態（担当院 0 件 / データ 0 件）。

### 10.4 Navigation

- 管理セクションに `担当院比較分析`（`/manager/clinic-comparison`）を追加。
- manager ナビに `/multi-store` を**復活させない**（Phase 1 で削除済みのまま）。

### 10.5 Create / Update

Create:

- `src/types/manager-clinic-comparison.ts`
- `src/lib/manager-clinic-comparison.ts`（pure builder）
- `src/app/api/manager/clinic-comparison/route.ts`
- `src/hooks/useManagerClinicComparison.ts`
- `src/components/manager/manager-clinic-comparison.tsx`
- `src/app/(app)/manager/clinic-comparison/page.tsx`
- `src/__tests__/lib/manager-clinic-comparison.test.ts`
- `src/__tests__/api/manager-clinic-comparison-route.test.ts`
- `src/__tests__/components/manager/manager-clinic-comparison.test.tsx`

Update:

- `src/lib/navigation/items.ts`
- `src/components/manager/manager-home.tsx`
- `src/__tests__/lib/navigation-items.test.ts`

### 10.6 Acceptance Criteria

- manager が担当院のみの比較分析を見られる（担当外 clinic の行が存在しない）。
- スコープが assignments のみで解決される（`clinic_scope_ids` 不使用をテストで証明）。
- 期間切替・前期間比が機能する。
- `/multi-store` の admin 向け挙動は変更されない。

---

## 11. Domain / Architecture Rules（全 Phase 共通）

- API ルートの責務: auth → role guard → assignment 解決 → query 検証 → DB fetch →
  pure builder → JSON（staff-analysis v0.2 §15 と同一の分担）。
- 集計・整形ロジックは `src/lib/manager-*.ts` の pure builder に寄せ、
  UI component 内で重い集計を行わない。
- レスポンスは統一エンベロープ `{ success, data | error }`
  （`createSuccessResponse` / `createErrorResponse`）。
- 一覧取得は `fetchAllRows()`（`.order('id').range()`）パターンを共通化する。
  Phase 2 実装時に `staff-analysis/route.ts` 内の同関数を
  `src/lib/manager-fetch.ts` 等へ抽出して共有してよい（挙動変更なしのリファクタ）。
- タイムスタンプの日付判定は JST 変換を経由する（`manager-staff-analysis.ts` の
  `getDateKey` パターン）。

---

## 12. Error Handling（全 Phase 共通）

| ケース | Status |
|---|---|
| 未認証 | 401 |
| 非 manager | 403 |
| 担当外 `clinic_id` | 403 |
| 担当院 0 件 | 200 + 空データ |
| 不正 query（UUID 不正、period 不正、custom 日付不正等） | 400 |
| サーバーエラー | 500（詳細はログのみ、メッセージは汎用） |

---

## 13. TDD Plan

各 Phase で failing test を先に書く（t-wada 流、リポジトリ規約準拠）。

### 13.1 Navigation tests（Phase 1, 3, 4 で更新）

- manager 管理セクションが期待リスト（当該 Phase 時点）と一致する。
- manager ナビに `/admin/**`・`/multi-store` への href が存在しない。
- admin / clinic_admin のメニューが変更されていない。
- Phase 3: manager operation メニューに `/staff/shift-requests` が存在しない。

### 13.2 API tests（Phase 1, 2, 4）

- 未認証 401 / 非 manager 403。
- 担当院 0 件で 200 + 空データ。
- 担当外 `clinic_id` で 403。
- `permissions.clinic_id` / JWT `clinic_scope_ids` にフォールバックしない
  （担当 0 件 + permissions に clinic がある状態で空が返ることを証明）。
- Phase 2: 1000 行超のページング集約。
- Phase 4: 期間バリデーション 400、担当外 clinic の行が response に含まれない。

### 13.3 Component tests（全 Phase）

- タイトル・空状態・データ表示のレンダリング。
- read-only Phase: write action が描画されない。
- Phase 2: email / phone が描画されない。
- Phase 3: `submitted` 行に承認 / 却下が出る、却下に理由入力が要る、
  期間作成 UI が存在しない。
- 非 manager アクセスで権限なし表示。

---

## 14. Verification（各 Phase の PR ごと）

```powershell
npm run test -- --runInBand --runTestsByPath <当該Phaseのテストファイル> src\__tests__\lib\navigation-items.test.ts
npm run type-check
npm run lint
git diff --check
```

Do not run:

```powershell
supabase db push
supabase migration up
supabase db reset
```

---

## 15. Rollout / Ordering

1. Phase 1（ナビ + 管理ホーム）— 403 リンクの解消が最優先。単独でリリース価値がある。
2. Phase 2（スタッフ一覧）— read-only で低リスク。
3. Phase 3（希望シフト）— 唯一の write。既存 API 再利用のため backend リスクは低いが、
   UI の操作確認を重点的に行う。
4. Phase 4（比較分析）— 既存 RPC の再利用可否調査を含むため最後。

各 Phase は前の Phase のマージを前提とする（ナビ・管理ホームの累積更新があるため）。

---

## 16. Open Questions

実装前に確認する。Recommended answers は v0.1 の決定。

1. `src/lib/admin/routes.ts` の manager 許可（`/admin`, `/admin/users`,
   `/admin/settings`, `/admin/shift-requests`）を v0.1 で撤去するか。
   - **推奨: 撤去しない（v0.2 送り）。** v0.1 は導線差し替えのみとし、直リンクの
     挙動変更による回帰範囲を絞る。全 Phase 完了後に棚卸しする。
2. `/multi-store` layout の `resolveScopedClinicIds(permissions)` による manager
   スコープ解決を修正するか。
   - **推奨: v0.1 では修正しない。** manager 導線を Phase 4 で置き換え、
     `/multi-store` の manager 許可撤去は上記 1 と同時に v0.2 で判断する。
3. Phase 3 の承認操作はどこまで開放するか（承認 / 却下 / 変換 / 取り下げ）。
   - **推奨: 既存 API のロール定義に従い、承認・却下・変換の 3 操作。**
     取り下げ（withdrawn）は提出者本人の操作のため manager には出さない。
4. `/api/manager/assigned-clinics` を新設するか、既存 `/api/manager/dashboard` を
   流用するか。
   - **推奨: 実装時に dashboard response を確認し、担当院一覧が取れるなら流用。**
     取れない場合のみ新設する。
5. 管理ホームに KPI サマリーを置くか。
   - **推奨: 置かない。** dashboard と重複するため、v0.1 はリンク集 + 担当院一覧に
     徹する。

---

## 17. Acceptance Criteria（仕様全体）

- manager のサイドバーに 403 になるリンクが 1 つもない。
- manager の管理セクションが `/manager/**` のみで構成される。
- 全 manager API のスコープが active `manager_clinic_assignments` のみで解決される。
- manager の write が希望シフトの承認・却下・変換のみである。
- 新規 migration / RLS 変更 / `verifyAdminAuth` 変更が存在しない。
- admin / clinic_admin / therapist / staff の既存挙動が変更されていない。
- 各 Phase に API / component / navigation の targeted tests がある。
- 各 PR で `npm run type-check`、`npm run lint`、対象 test、`git diff --check` が通る。

---

## 18. Codex Implementation Prompt（Phase ごとに使用）

```txt
You are implementing the manager admin section for IFs1991/seikotsuin_no_saas.

Read this spec first:
docs/stabilization/spec-manager-admin-section-v0.1.md

Implement Phase <N> only. One phase = one PR.

Critical constraints:
- Do not create or modify Supabase migrations, RLS policies, or manager assignment schema.
- Do not run supabase db push, migration up, or db reset.
- Do not modify verifyAdminAuth, ADMIN_UI_ROLES, or any /api/admin/* route.
- Do not modify /api/staff/shift-requests* routes or src/lib/staff/shift-requests/access.ts
  (Phase 3 reuses them as-is).
- The only manager write is shift request review (approve / reject / convert) via the
  existing /api/staff/shift-requests APIs. Everything else is read-only.

Manager scope:
- Use active manager_clinic_assignments only (resolveManagerAssignedClinics).
- Never fall back to permissions.clinic_id, profiles.clinic_id, JWT clinic_scope_ids,
  client selected clinic, or URL clinic_id.
- Unassigned clinic_id must return 403. No assignments returns 200 with empty data.

Patterns to follow (read these files before writing code):
- src/app/api/manager/staff-analysis/route.ts  (auth guard, fetchAllRows pagination,
  JST-safe period bounds)
- src/lib/manager-staff-analysis.ts            (pure builder, JST date keys)
- src/app/(app)/manager/staff-analysis/page.tsx (page-level manager guard)
- src/lib/manager-analysis-period.ts           (period parsing/resolution)

Testing:
- TDD: add failing tests first (API / component / navigation as defined in the spec
  for this phase), then implement.
- Prove scope does not fall back to permissions/JWT/client clinic.
- For list APIs, prove aggregation works beyond the PostgREST 1000-row limit.
- Run targeted tests, npm run type-check, npm run lint, and git diff --check.
```

---

## 19. Future Extensions（v0.2 以降）

- `src/lib/admin/routes.ts` / `/multi-store` からの manager 許可棚卸し（Open Q 1, 2）
- 希望シフトの院横断一覧・一括承認
- 管理ホームへの軽量 KPI（要件が固まったら）
- 担当院スタッフ一覧と staff-analysis の相互リンク
- manager 専用の通知（承認待ち希望シフト件数バッジ等）
- export CSV

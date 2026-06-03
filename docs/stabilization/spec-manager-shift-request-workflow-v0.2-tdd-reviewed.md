# Manager Shift Request Workflow v0.2 TDD Reviewed

## Status

- Status: Reviewed Draft
- Version: v0.2
- Based on: `spec-manager-shift-request-workflow-v0.1-tdd.md`
- Review date: 2026-06-02
- Purpose: Therapist / staff / clinic_admin から各院の希望シフトを受け取り、Manager が担当Clinicごとに確認・調整・確定シフト化する機能の仕様を定義する
- Related specs:
  - `docs/stabilization/spec-area-manager-clinic-admin-scope-v0.2-tdd.md`
  - `docs/stabilization/spec-auth-role-alignment-v0.1.md`
  - `docs/stabilization/spec-rls-tenant-boundary-v0.1.md`
  - `docs/stabilization/spec-rls-menus-staff-preferences-hardening-v0.2.md`
- Expected implementation style:
  - DB migrationあり
  - rollback必須
  - migration / RLS / authorization helper / API / conversion RPC / UI を小さいPRに分割
  - 認可境界はTDDで固定
  - `staff_shifts` 既存APIを直接肥大化させず、承認済み希望から確定シフトへ変換する専用境界を追加する

---

## v0.2 Review Summary

v0.1 の方向性は維持する。

主な修正点:

1. `day_off` / `unavailable` は `staff_shifts` に変換しないことを仕様レベルで固定する。
2. self-submit の本人解決を `resolveActorStaffResourceId()` に集約し、fail-closed 条件を明文化する。
3. Manager 画面 `/admin/shift-requests` は現行 admin route guard と衝突し得るため、route allowlist 追加を実装対象に含める。
4. `shift_requests.clinic_id` と `period_id` / `staff_id` のClinic整合性を trigger または composite FK でDBレベル固定する。
5. `staff_preferences` は今回の提出ワークフローには再利用しない。加えて、有効RLS policyに therapist/staff の直接INSERT許可が残っていないか preflight で確認する。
6. legacy `staff` と新スキーマ `resources(type = 'staff')` の同一UUID運用を明文化し、データ不整合時は403または409で閉じる。

---

## Actual Implementation Review

2026-06-02 時点の既存実装との照合結果:

- `staff_shifts.staff_id` は `resources.id` を参照している。
- `staff_preferences.staff_id` も `resources.id` を参照している。
- `user_permissions.staff_id` は DB上 `staff.id` を参照している。
- 現行の管理者アカウント作成・権限付与実装では、非adminユーザーについて `auth.users.id = staff.id = resources.id = user_permissions.staff_id` の同一UUID運用をしている。
- ただし、この同一性はDB制約だけで完全保証されているわけではなく、アプリケーション実装の運用前提である。
- 現行 `UserPermissions` 型は `role`, `clinic_id`, `clinic_scope_ids` のみで、`staff_id` を持たない。
- self-submit のためには `user_permissions.staff_id` 相当を取得する専用lookup、または権限コンテキスト拡張が必要。
- `ensureClinicAccess()` は `canAccessClinicScope()` を使い、`clinic_scope_ids` 優先、なければ `clinic_id` フォールバックで検証している。
- admin も本ワークフローでは無条件グローバルではなく、解決済みClinicスコープ内で扱う。
- `staff_shifts` API は既に Manager / clinic_admin / admin による作成・取消を扱うため、新機能はこのAPIを直接拡張しない。
- `staff_preferences` は現行APIで therapist/staff の直接POSTを403にしているため、今回の提出・承認ワークフローの主データにはしない。
- Manager UI を `/admin/shift-requests` に置く場合、現行の area manager admin route allowlist に追加が必要。

---

## Decision

新規ワークフロー用テーブルを追加する。

既存の `staff_shifts` は最終勤務予定、またはその手前の draft/proposed 状態を扱うテーブルである。希望提出ワークフローとしては次が不足している。

- 提出期間
- 提出者と代理入力者の区別
- 希望種別
- 差戻し理由
- 承認者、承認日時
- 確定シフトへの変換履歴
- Manager / clinic_admin / therapist / staff の操作監査
- 休み希望・勤務不可希望を、勤務シフトへ誤変換しないための明示的な状態管理

そのため、希望提出は `shift_request_periods` と `shift_requests` に分離する。
確定勤務枠として反映する場合のみ `staff_shifts` に変換する。

---

## Non-goals for v0.2

- 自動シフト最適化
- AIによる勤務表自動生成
- `staff_preferences` のself-service化
- `resources.user_id` 導入
- `day_off` / `unavailable` の `blocks` 連携
- 変換済みリクエストの完全な巻き戻しUI
- clinic_admin による最終確定シフト化

---

## Role Meaning

| Role | 役割 |
| --- | --- |
| `admin` | 解決済みClinicスコープ内の提出状況、例外対応、監査確認、確定シフト化ができる |
| `manager` | 担当Clinic群の提出状況を確認し、承認・差戻し・確定シフト化できる |
| `clinic_admin` | 自Clinicの提出状況を確認し、スタッフ・セラピストの代理入力や一次調整ができる |
| `therapist` | 自分の希望シフトを提出・編集できる |
| `staff` | 自分の希望シフトを提出・編集できる |
| `customer` | 対象外 |

v0.2では、最終的な `staff_shifts` 変換は `manager` / `admin` のみ許可する。
`clinic_admin` は代理入力・承認・差戻しまで。

---

## Scope Model

全actorのClinic判定は既存 `ensureClinicAccess()` / `canAccessClinicScope()` の方針に合わせる。

1. `permissions.clinic_scope_ids` があれば、それを担当Clinic集合とする。
2. なければ `permissions.clinic_id` 単体にフォールバックする。
3. どちらもなければ403。
4. `clinic_id` を受け取るAPIは必ず `canAccessClinicScope(permissions, clinic_id)` 相当で検証する。
5. Managerを `HQ_ROLES` / `CROSS_CLINIC_ROLES` に入れない。
6. Adminもこのワークフローでは「解決済みClinicスコープ内の上位管理者」として扱う。
7. 全Clinicを見せる場合は、admin の `clinic_scope_ids` に全対象Clinicが入っていることを前提にする。

Therapist / staff は自分の `staff_id` に紐づく希望だけ操作できる。
自分以外の希望提出、承認、確定シフト化はできない。

---

## Staff Identity Mapping

既存実装ではIDの意味が分かれている。

| ID | 参照先 | 用途 |
| --- | --- | --- |
| `auth.users.id` | Supabase Auth | ログインユーザー |
| `user_permissions.staff_id` | `staff.id` | 認証ユーザーとスタッフ権限の対応。現行運用では auth user id と同一 |
| `staff.id` | legacy staff | legacy staff row。新規開発では主実体にしない |
| `resources.id` | resources | 予約・シフト対象のスタッフリソース |
| `staff_shifts.staff_id` | `resources.id` | 最終シフト対象者 |
| `shift_requests.staff_id` | `resources.id` | 本仕様での希望シフト対象者 |

現行実装では、非adminユーザー作成時に `auth.users.id = staff.id = resources.id = user_permissions.staff_id` の同一UUID運用を行っている。
ただし、これはDB制約だけで完全保証されているわけではない。

### `resolveActorStaffResourceId()`

self-submit の本人解決は必ず専用helperに集約する。
各routeで同じ判定を重複実装しない。

推奨配置:

- `src/lib/staff/shift-requests/actor.ts`

必須処理:

1. 認証済み `auth.uid()` を取得する。
2. `user_permissions.staff_id = auth.uid()` 相当の権限行を取得する。
3. actor role が `therapist` または `staff` であることを確認する。
4. `resources.id = user_permissions.staff_id` の行を取得する。
5. `resources.type = 'staff'` を確認する。
6. `resources.clinic_id = clinic_id` を確認する。
7. `resources.is_deleted = false` を確認する。
8. `user_permissions.clinic_id = clinic_id` または actor が `clinic_scope_ids` で当該Clinicにアクセス可能であることを確認する。
9. bodyの `staff_id` が指定されている場合、解決済み `resources.id` と一致しなければ403。
10. 一致確認できない場合は fail-closed。

返却基準:

| 状況 | HTTP |
| --- | --- |
| 他人の `staff_id` 指定 | 403 |
| actorに `user_permissions` がない | 403 |
| `user_permissions.staff_id` に対応する `resources` がない | 409 |
| `resources.type != 'staff'` | 409 |
| `resources.clinic_id` 不一致 | 403 または 409 |
| legacy data破損疑い | 409 |

---

## Existing Tables

| Table | 現状の役割 | この仕様での扱い |
| --- | --- | --- |
| `resources` | スタッフ・施術者などのリソース。`type = 'staff'` を使用 | シフト対象者の実体。`staff_id` は `resources.id` |
| `staff` | legacy staff table | self-submit の権限対応で間接的に関係するが、新規ワークフローの主参照先にはしない |
| `user_permissions` | ユーザー、Clinic、role、staff_id の権限対応 | actor role / clinic scope / staff identity mapping に使う |
| `staff_preferences` | 一般的な勤務希望テキスト。現行APIは therapist/staff の直接POSTを403 | 継続利用。ただし今回の提出・承認ワークフローの主データにはしない |
| `staff_shifts` | 確定・提案・下書き・取消のシフト | 承認済み `available/preferred` 希望から生成される出力先。最終的な勤務予定として使う |
| `blocks` | 予約枠ブロック | v0.2では未連携。将来 `day_off/unavailable` のブロック化候補 |

---

## Proposed Tables

### `shift_request_periods`

提出対象期間をClinic単位で管理する。

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | uuid | yes | `gen_random_uuid()` |
| `clinic_id` | uuid | yes | `clinics.id` FK |
| `title` | text | yes | 例: `2026年7月シフト希望` |
| `period_start` | date | yes | 希望対象期間の開始日 |
| `period_end` | date | yes | 希望対象期間の終了日 |
| `submission_deadline` | timestamptz | yes | 提出期限 |
| `status` | text | yes | `draft`, `open`, `closed`, `finalized`, `cancelled` |
| `created_by` | uuid | yes | 作成者。`auth.users.id` 想定 |
| `created_at` | timestamptz | yes | default `now()` |
| `updated_at` | timestamptz | yes | default `now()` |

制約:

- `period_end >= period_start`
- `submission_deadline` は `period_end` 以前でなくてもよい
- `status in ('draft', 'open', 'closed', 'finalized', 'cancelled')`

推奨index:

- `(clinic_id, period_start, period_end)`
- `(clinic_id, status, submission_deadline)`

DB整合性のため、以下のどちらかを採用する。

Option A: composite FK 用の unique constraint

```sql
alter table public.shift_request_periods
  add constraint shift_request_periods_id_clinic_unique unique (id, clinic_id);
```

Option B: `shift_requests` 側 trigger で `period_id` と `clinic_id` の一致を検証する。

---

### `shift_requests`

個々の希望枠を管理する。1日1件ではなく、時間帯ごとに複数行を許可する。

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | uuid | yes | `gen_random_uuid()` |
| `clinic_id` | uuid | yes | `clinics.id` FK。`period.clinic_id` と一致必須 |
| `period_id` | uuid | yes | `shift_request_periods.id` FK |
| `staff_id` | uuid | yes | `resources.id` FK。`resources.clinic_id` と一致必須 |
| `request_type` | text | yes | `available`, `preferred`, `unavailable`, `day_off` |
| `start_time` | timestamptz | yes | 希望開始 |
| `end_time` | timestamptz | yes | 希望終了 |
| `priority` | integer | yes | 1-5。5が最優先 |
| `status` | text | yes | `draft`, `submitted`, `approved`, `rejected`, `withdrawn`, `converted` |
| `note` | text | no | 提出者メモ |
| `submitted_by` | uuid | yes | 実際に提出・代理入力したユーザー |
| `submitted_for_role` | text | yes | 対象者のrole。リクエストbodyではなくAPI側で解決する |
| `reviewed_by` | uuid | no | Manager / clinic_admin / admin |
| `reviewed_at` | timestamptz | no | 承認・差戻し日時 |
| `rejection_reason` | text | no | 差戻し理由 |
| `converted_shift_id` | uuid | no | 生成した `staff_shifts.id`。`available/preferred` の converted のみ |
| `created_at` | timestamptz | yes | default `now()` |
| `updated_at` | timestamptz | yes | default `now()` |

制約:

- `end_time > start_time`
- `priority between 1 and 5`
- `request_type in ('available', 'preferred', 'unavailable', 'day_off')`
- `status in ('draft', 'submitted', 'approved', 'rejected', 'withdrawn', 'converted')`
- `clinic_id` は `period_id` の `clinic_id` と一致
- `clinic_id` は `staff_id` の `resources.clinic_id` と一致
- `staff_id` は `resources.type = 'staff'` であること
- `resources.is_deleted = false` であること
- `converted_shift_id` が入るのは `status = 'converted'` かつ `request_type in ('available', 'preferred')` のときだけ
- `request_type in ('unavailable', 'day_off')` は `converted_shift_id is null`
- `submitted_for_role` は `clinic_admin`, `therapist`, `staff` を想定する。`admin`, `manager` は実勤務対象ロールとしては原則使わない

推奨index:

- `(clinic_id, period_id, status)`
- `(clinic_id, staff_id, start_time, end_time)`
- `(period_id, staff_id)`
- `(converted_shift_id)` where `converted_shift_id is not null`
- `(clinic_id, request_type, status)`

DB整合性の実装方針:

Option A: composite FK

```sql
alter table public.resources
  add constraint resources_id_clinic_unique unique (id, clinic_id);

alter table public.shift_requests
  add constraint shift_requests_period_clinic_fkey
  foreign key (period_id, clinic_id)
  references public.shift_request_periods(id, clinic_id);

alter table public.shift_requests
  add constraint shift_requests_staff_clinic_fkey
  foreign key (staff_id, clinic_id)
  references public.resources(id, clinic_id);
```

Option B: trigger

```sql
create or replace function public.validate_shift_requests_clinic_refs()
returns trigger
language plpgsql
as $$
declare
  v_period_clinic_id uuid;
  v_staff_clinic_id uuid;
  v_resource_type text;
  v_resource_is_deleted boolean;
begin
  if new.clinic_id is null then
    raise exception 'shift_requests.clinic_id is required' using errcode = '23514';
  end if;

  select clinic_id into v_period_clinic_id
  from public.shift_request_periods
  where id = new.period_id;

  if not found then
    raise exception 'shift_request_periods.id not found' using errcode = '23503';
  end if;

  if v_period_clinic_id <> new.clinic_id then
    raise exception 'shift_requests.period_id clinic mismatch' using errcode = '23514';
  end if;

  select clinic_id, type, is_deleted
    into v_staff_clinic_id, v_resource_type, v_resource_is_deleted
  from public.resources
  where id = new.staff_id;

  if not found then
    raise exception 'resources.id not found' using errcode = '23503';
  end if;

  if v_staff_clinic_id <> new.clinic_id then
    raise exception 'shift_requests.staff_id clinic mismatch' using errcode = '23514';
  end if;

  if v_resource_type <> 'staff' then
    raise exception 'shift_requests.staff_id must reference resources(type=staff)' using errcode = '23514';
  end if;

  if coalesce(v_resource_is_deleted, false) = true then
    raise exception 'shift_requests.staff_id references deleted resource' using errcode = '23514';
  end if;

  if new.request_type in ('unavailable', 'day_off') and new.converted_shift_id is not null then
    raise exception 'unavailable/day_off request cannot have converted_shift_id' using errcode = '23514';
  end if;

  if new.converted_shift_id is not null
     and not (new.status = 'converted' and new.request_type in ('available', 'preferred')) then
    raise exception 'converted_shift_id is allowed only for converted available/preferred requests' using errcode = '23514';
  end if;

  return new;
end;
$$;
```

既存Tiramisuの tenant reference integrity は trigger 方針と相性がよいため、v0.2では Option B を推奨する。

---

### `shift_request_audit_logs`

ワークフロー操作を監査する。RLSとAPIログだけに依存しない。

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | uuid | yes | `gen_random_uuid()` |
| `clinic_id` | uuid | yes | 監査対象Clinic |
| `period_id` | uuid | no | 対象提出期間 |
| `request_id` | uuid | no | 対象希望 |
| `actor_user_id` | uuid | yes | 操作者 |
| `actor_role` | text | yes | 操作時role |
| `action` | text | yes | 例: `period_open`, `request_submit`, `request_approve`, `request_reject`, `request_convert` |
| `before_data` | jsonb | no | 変更前 |
| `after_data` | jsonb | no | 変更後 |
| `created_at` | timestamptz | yes | default `now()` |

推奨index:

- `(clinic_id, created_at desc)`
- `(period_id, created_at desc)`
- `(request_id, created_at desc)`
- `(actor_user_id, created_at desc)`

RLS方針:

- `admin`, `manager`, `clinic_admin`: 解決済みClinicスコープ内でSELECT可
- INSERTは原則 service_role / server route / RPC 経由のみ
- therapist/staff は v0.2 では audit log 直接閲覧不可

---

## Request Type Semantics

| request_type | 意味 | 変換可否 | 備考 |
| --- | --- | --- | --- |
| `available` | 勤務可能 | 可 | approved 後、manager/admin が `staff_shifts` へ変換可能 |
| `preferred` | 優先勤務希望 | 可 | approved 後、manager/admin が `staff_shifts` へ変換可能 |
| `unavailable` | 勤務不可 | 不可 | 変換候補との conflict 判定材料にする |
| `day_off` | 休み希望 | 不可 | v0.2では `staff_shifts` に変換しない |

`mode = all_approved` でも、`unavailable` / `day_off` は変換対象外。

v0.2では `unavailable` / `day_off` は `blocks` にも変換しない。
将来、`staff_unavailability_blocks` または `blocks` 連携を別仕様で扱う。

---

## State Machine

### Period status

| From | To | Actor | Notes |
| --- | --- | --- | --- |
| `draft` | `open` | `manager`, `clinic_admin`, `admin` | 提出受付開始 |
| `open` | `closed` | `manager`, `clinic_admin`, `admin` | 提出受付終了 |
| `closed` | `finalized` | `manager`, `admin` | 確定シフト化完了 |
| `draft/open/closed` | `cancelled` | `manager`, `admin` | 誤作成の取消 |

### Request status

| From | To | Actor | Notes |
| --- | --- | --- | --- |
| `draft` | `submitted` | 対象本人, `clinic_admin`, `manager`, `admin` | 本人または代理入力 |
| `submitted` | `approved` | `clinic_admin`, `manager`, `admin` | 一次承認または承認 |
| `submitted` | `rejected` | `clinic_admin`, `manager`, `admin` | 差戻し理由必須 |
| `submitted` | `withdrawn` | 対象本人 | 期限内のみ |
| `approved` | `converted` | `manager`, `admin` | `available/preferred` のみ `staff_shifts` へ変換 |
| `rejected` | `submitted` | 対象本人, `clinic_admin` | 修正再提出 |

禁止遷移:

- `unavailable/day_off` -> `converted`
- `converted` -> `submitted`
- `converted` -> `withdrawn`
- `approved` を本人が編集
- `submitted` を期限後に本人が編集

---

## API Design

### Common API Rules

- すべてのAPIで `clinic_id` は `canAccessClinicScope(permissions, clinic_id)` 相当で検証する。
- `therapist` / `staff` の本人判定は `resolveActorStaffResourceId()` を使う。
- `submitted_for_role` は client body を信用せずAPI側で解決する。
- `staff_id` は `resources.id` として扱う。
- `staff_id` が `resources(type='staff')` でない場合は400または409。
- bodyの `clinic_id`, `period_id`, `staff_id` の整合性はAPIとDBの両方で検証する。
- `staff_preferences` APIは呼ばない。
- `staff_shifts` APIをサーバー側からループ呼び出ししない。

---

### `GET /api/staff/shift-request-periods`

Query:

- `clinic_id`
- `from`
- `to`
- `status` optional

Authorization:

- `admin`: resolved clinic scope only
- `manager`: scoped clinic only
- `clinic_admin`: own clinic only
- `therapist` / `staff`: own clinic only, visible fields limited

Response:

- `periods[]`
- `total`

---

### `POST /api/staff/shift-request-periods`

Creates a period.

Allowed:

- `admin`
- `manager` for scoped clinic
- `clinic_admin` for own clinic

Denied:

- `therapist`
- `staff`
- `customer`

Rules:

- `period_end >= period_start`
- `submission_deadline` 必須
- initial status は原則 `draft`
- `created_by = auth.uid()`
- audit log: `period_create`

---

### `PATCH /api/staff/shift-request-periods/[id]`

Updates period status or metadata.

Rules:

- `draft -> open`: manager / clinic_admin / admin
- `open -> closed`: manager / clinic_admin / admin
- `closed -> finalized`: manager / admin
- `draft/open/closed -> cancelled`: manager / admin
- `finalized` 以後の編集は不可
- audit log required

---

### `GET /api/staff/shift-requests`

Query:

- `clinic_id`
- `period_id`
- `staff_id` optional
- `status` optional
- `request_type` optional

Visibility:

- `admin`: matching rows within resolved clinic scope
- `manager`: scoped clinic rows
- `clinic_admin`: own clinic rows
- `therapist` / `staff`: rows where `staff_id` is their own resolved resource id

Therapist/staff に返すfieldは制限する。

---

### `POST /api/staff/shift-requests`

Creates or submits request rows.

Rules:

- `therapist` / `staff`: can create only for self.
- `clinic_admin`: can create for staff in own clinic.
- `manager`: can create for staff in scoped clinics.
- `admin`: can create within resolved clinic scope.
- API must verify `staff_id` belongs to `resources(type = 'staff')` in the same `clinic_id`.
- API must derive `submitted_for_role`; clients cannot choose it.
- `request_type = day_off` should normalize to full-day range in UI, but API accepts explicit `start_time` / `end_time`.
- Period must be `open` for self-submit.
- `clinic_admin` / `manager` can draft during `draft` or `open`, but cannot submit into `finalized` or `cancelled`.
- audit log: `request_create` or `request_submit`.

Self-submit behavior:

- body の `staff_id` は未指定でもよい。
- body の `staff_id` が指定され、解決済み actor resource id と一致しない場合は403。
- `clinic_id` が actor の clinic scope 外なら403。

---

### `PATCH /api/staff/shift-requests/[id]`

Updates request status or content.

Rules:

- Self can edit `draft`, `submitted`, `rejected` before deadline.
- Self cannot edit `approved`, `converted`, `withdrawn`.
- `clinic_admin` can approve/reject own clinic rows, but cannot convert to final shifts in v0.2.
- `manager` can approve/reject/convert scoped clinic rows.
- `admin` can approve/reject/convert within resolved clinic scope.
- `rejected` requires `rejection_reason`.
- `converted` should normally be performed via `POST /api/staff/shift-requests/convert`, not ad hoc PATCH.
- audit log required for status changes.

---

### `POST /api/staff/shift-requests/convert`

Converts approved `available/preferred` requests to `staff_shifts`.

Input:

- `clinic_id`
- `period_id`
- `request_ids`
- `mode`: `selected` or `all_approved`

Allowed:

- `manager`
- `admin`

Denied:

- `clinic_admin`
- `therapist`
- `staff`
- `customer`

Rules:

- Conversion target is only approved `request_type in ('available', 'preferred')`.
- `unavailable` / `day_off` are never inserted into `staff_shifts`.
- `mode = all_approved` must still exclude `unavailable` / `day_off`.
- Must validate no overlap with existing non-cancelled `staff_shifts`.
- Must validate no internal overlap by `staff_id` among conversion candidates.
- Must validate conversion candidates do not overlap approved `unavailable/day_off` requests for the same `staff_id` and period.
- Writes `staff_shifts.status = 'confirmed'`.
- Updates each converted request to `converted` and stores `converted_shift_id`.
- Leaves approved `unavailable/day_off` as `approved` unless future workflow defines another state.
- Writes audit logs.
- Must not call existing `POST /api/staff/shifts` repeatedly from the server route.
- Use transaction/RPC boundary so shift creation and request conversion are atomic.

Preferred implementation:

- `public.convert_shift_requests(...)` Postgres function or equivalent transactional server boundary.
- Route-level validation + DB-level validation both required.
- If service-role route calls RPC, RPC must still validate `clinic_id`, `period_id`, statuses, overlap, request_type, and conversion target consistency.

---

## Manager Route Guard Requirement

If Manager screen uses `/admin/shift-requests`, update admin route guard.

Required change:

- Add `/admin/shift-requests` to area manager admin route allowlist.

Suggested target:

- `src/lib/admin/routes.ts`

Expected behavior:

| Role | Path | Expected |
| --- | --- | --- |
| `manager` | `/admin/shift-requests` | allow |
| `manager` | `/admin/shift-requests/<child>` | allow |
| `manager` | unrelated `/admin/**` | deny unless already allowlisted |
| `therapist/staff` | `/admin/shift-requests` | deny |

If route guard modification is not desired, move Manager screen to a non-admin path such as `/staff/shift-requests/manager`.

v0.2 recommendation: keep `/admin/shift-requests` and add allowlist.

---

## UI Design

### Therapist / Staff

Screen: `/staff/shift-requests`

Capabilities:

- View current open period for own clinic
- Submit own available/preferred/unavailable/day-off requests
- Edit before deadline if not approved/converted/withdrawn
- See rejected reason and resubmit
- See converted result as final shift read-only
- Cannot choose another staff member

### Clinic Admin

Screen: `/staff/shift-requests/admin`

Capabilities:

- View own clinic's submission status by staff
- Proxy input for therapist/staff
- Approve or reject requests
- See unsubmitted staff list
- Cannot convert to final shifts in v0.2
- Cannot view other clinics

### Manager

Screen: `/admin/shift-requests`

Capabilities:

- Clinic selector for scoped clinics
- Area summary: submitted / missing / approved / rejected / converted by clinic
- Drill into one clinic and one period
- Approve/reject selected requests
- Convert approved `available/preferred` requests to confirmed `staff_shifts`
- See conflicts before conversion
- See `day_off/unavailable` as constraints, not shift candidates

### Admin

Screen can reuse Manager view with resolved clinic-scope access.

---

## Preflight Checks

Before implementation, run data and RLS preflight.

### Staff/resource identity consistency

```sql
select
  up.staff_id,
  up.role,
  up.clinic_id as permission_clinic_id,
  r.id as resource_id,
  r.type as resource_type,
  r.clinic_id as resource_clinic_id,
  r.is_deleted
from public.user_permissions up
left join public.resources r
  on r.id = up.staff_id
where up.role in ('clinic_admin', 'therapist', 'staff', 'manager')
  and (
    r.id is null
    or r.type <> 'staff'
    or r.clinic_id is distinct from up.clinic_id
    or coalesce(r.is_deleted, false) = true
  );
```

Expected:

- 0 rows.

If rows exist:

- Do not implement self-submit as fail-open.
- Either fix data first or return 409 for affected actors.

### `staff_preferences` INSERT policy check

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'staff_preferences'
  and cmd = 'INSERT';
```

Expected:

- therapist/staff が直接INSERT可能な permissive policy が残っていない。

If unsafe policy exists:

- Fix or explicitly document why it is safe.
- This workflow must not rely on `staff_preferences` for self-submit.

---

## TDD Plan

### PR-1: Database spec + migration + RLS tests

Files:

- `supabase/migrations/<timestamp>_shift_request_workflow.sql`
- `supabase/rollbacks/<timestamp>_shift_request_workflow_rollback.sql`
- DB tests under existing Supabase test convention

Red tests:

- Migration creates `shift_request_periods`, `shift_requests`, `shift_request_audit_logs`.
- FK/check constraints reject unknown period status.
- FK/check constraints reject unknown request status.
- FK/check constraints reject unknown request_type.
- Time checks reject `end_time <= start_time`.
- `shift_requests.period_id` and `clinic_id` mismatch is rejected.
- `shift_requests.staff_id` and `clinic_id` mismatch is rejected.
- `resources.type != 'staff'` as `staff_id` is rejected.
- deleted resource as `staff_id` is rejected.
- `day_off/unavailable` with `converted_shift_id` is rejected.
- RLS denies cross-clinic select/insert/update.
- Therapist cannot read another staff member's request.
- Manager cannot read outside-scope clinic request.
- Audit log direct INSERT is denied to normal authenticated users if service-role-only policy is selected.

Verification:

```powershell
supabase test db
npm run supabase:types
npm run type-check
```

---

### PR-2: Authorization helpers and API tests

Files:

- `src/lib/staff/shift-requests/access.ts`
- `src/lib/staff/shift-requests/actor.ts`
- `src/app/api/staff/shift-request-periods/route.ts`
- `src/app/api/staff/shift-request-periods/[id]/route.ts`
- `src/app/api/staff/shift-requests/route.ts`
- `src/app/api/staff/shift-requests/[id]/route.ts`

Red tests:

- Therapist can submit only own request.
- Staff can submit only own request.
- Therapist cannot submit for another `staff_id`.
- Staff cannot submit for another `staff_id`.
- Therapist request body `staff_id` is ignored or rejected when it does not match resolved actor resource.
- Actor resource resolution fails closed when `user_permissions.staff_id` has no matching `resources.id`.
- Actor resource resolution returns 409 on legacy mapping inconsistency.
- Clinic_admin can submit/approve own clinic request.
- Clinic_admin cannot access another clinic.
- Manager can access scoped clinic.
- Manager cannot access outside-scope clinic.
- Staff cannot approve/reject/convert.
- Rejection without reason returns 400.
- Self cannot edit after deadline.
- Self cannot edit approved/converted/withdrawn.

---

### PR-3: Conversion API and conflict tests

Files:

- `src/app/api/staff/shift-requests/convert/route.ts`
- `supabase/migrations/<timestamp>_convert_shift_requests_rpc.sql` if using RPC
- existing `src/app/api/staff/shifts/route.ts` only if types/helpers need reuse; do not route-call it

Red tests:

- Manager converts approved `available` requests to confirmed `staff_shifts`.
- Manager converts approved `preferred` requests to confirmed `staff_shifts`.
- Converted request stores `converted_shift_id`.
- Conversion rejects overlapping shifts.
- Conversion rejects internal overlap among candidates.
- Conversion rejects unapproved requests.
- Conversion excludes `day_off/unavailable` in `all_approved` mode.
- Conversion rejects candidate overlapping approved `day_off/unavailable` for same staff.
- Conversion is scoped by clinic.
- Partial conversion failure does not leave mixed request/shift state.
- Clinic_admin cannot convert in v0.2.

Implementation note:

- Use a DB transaction/RPC if Supabase route-level client cannot guarantee atomic multi-step writes.
- If no transaction helper exists, implement conversion as a Postgres function with tests, not as best-effort multi-step API writes.
- RPC should validate `clinic_id`, `period_id`, request statuses, request_type, overlap, and actor scope again server-side or be callable only through a service-role API after route-level validation.

---

### PR-4: UI for self-submit and clinic admin review

Red tests:

- Therapist sees only own form and own submitted rows.
- Staff sees only own form and own submitted rows.
- Therapist cannot choose another staff member.
- Staff cannot choose another staff member.
- Clinic_admin sees own clinic staff list.
- Clinic_admin can proxy input.
- Clinic_admin can reject with reason.
- Deadline closed state disables self-submit.
- `day_off/unavailable` are visually distinct from shift candidates.

---

### PR-5: Manager area dashboard + route guard

Files:

- `src/lib/admin/routes.ts`
- `src/app/(app)/admin/shift-requests/**` or existing app route convention
- manager dashboard components

Red tests:

- Manager can access `/admin/shift-requests`.
- Manager cannot access unrelated admin routes outside allowlist.
- Manager sees only scoped clinics.
- Manager area summary counts match API fixture.
- Manager can filter by clinic/period/status/request_type.
- Manager can convert approved `available/preferred` requests.
- Manager cannot convert `day_off/unavailable`.
- Outside-scope clinic is not rendered and direct API call gets 403.

---

## Security Review

Controls required:

- Do not add `manager` to HQ or global cross-clinic roles.
- Do not rely on UI filtering for clinic scope.
- Validate `clinic_id`, `period_id`, and `staff_id` consistency on every write.
- Therapist/staff self-scope must use authenticated permission/resource mapping, not request body trust.
- Do not reuse `staff_preferences` for self-submit unless its current admin-only policy is intentionally redesigned in a separate spec.
- Conversion must be atomic.
- RLS must deny cross-tenant access even if API bug exists.
- Audit log must record submit/approve/reject/withdraw/convert actions.
- `day_off/unavailable` must never become confirmed working shifts.

High-risk cases:

- Manager converting shifts for an outside-scope clinic.
- Therapist submitting for another therapist by changing `staff_id`.
- Therapist with legacy permission data failing open because `user_permissions.staff_id` and `resources.id` do not match.
- Clinic_admin approving another clinic's requests.
- Conversion creating `staff_shifts` but failing to mark requests converted.
- `day_off` requests accidentally becoming confirmed working shifts.
- `all_approved` converting non-working requests.
- Manager UI route blocked by admin route guard despite API permission.

---

## Performance Notes

- Manager dashboard should aggregate by `period_id` and `clinic_id` in one query or RPC.
- Request list should filter by `clinic_id`, `period_id`, and `status`; avoid loading all area requests at once.
- Conflict detection should query only candidate staff IDs and candidate time range.
- Conversion should bulk insert `staff_shifts` and bulk update requests where possible.
- Add indexes before UI rollout, not after production traffic.
- Do not perform N+1 staff/resource lookups in Manager dashboard.

---

## Migration Plan

This feature requires migration because it introduces workflow history.

Migration should include:

1. Create enum-like check constraints or Postgres enums for period/request statuses and request_type.
2. Create `shift_request_periods`.
3. Create `shift_requests`.
4. Create `shift_request_audit_logs`.
5. Add indexes.
6. Enable RLS.
7. Add RLS policies for select/insert/update.
8. Add FK/consistency triggers if plain FK cannot enforce cross-table clinic consistency.
9. Add trigger or check to prevent `day_off/unavailable` having `converted_shift_id`.
10. Add or document actor-resource mapping expectations for legacy rows.
11. Add optional conversion RPC if PR-3 uses DB transaction.
12. Regenerate Supabase types.

No existing data migration is required for v0.2.
Existing `staff_shifts` remain unchanged.

---

## Rollback

Rollback must be included with the migration PR.

Rollback order:

1. Drop conversion RPC if created.
2. Drop RLS policies for new tables.
3. Drop triggers/functions created for clinic consistency.
4. Drop indexes.
5. Drop `shift_request_audit_logs`.
6. Drop `shift_requests`.
7. Drop `shift_request_periods`.
8. Drop custom enum types if used.

Rollback does not touch existing `staff_shifts`.
Rollback does not touch existing `staff_preferences`.

---

## Acceptance Criteria

- [ ] Therapist can submit only own shift requests.
- [ ] Staff can submit only own shift requests.
- [ ] Clinic_admin can review only own clinic requests.
- [ ] Manager can review only scoped clinic requests.
- [ ] Admin can review resolved-scope clinic requests.
- [ ] Manager can access `/admin/shift-requests` if that path is used.
- [ ] Manager can convert approved `available/preferred` requests into confirmed `staff_shifts`.
- [ ] Conversion excludes `unavailable/day_off`.
- [ ] Conversion rejects candidate overlapping approved `unavailable/day_off` for same staff.
- [ ] Conversion rejects overlapping shifts.
- [ ] Rejection requires reason.
- [ ] Audit logs are written for submit/approve/reject/withdraw/convert.
- [ ] RLS prevents cross-clinic access.
- [ ] DB rejects period/clinic mismatch.
- [ ] DB rejects staff resource/clinic mismatch.
- [ ] DB rejects non-staff resources as shift request staff.
- [ ] No existing `staff_shifts` behavior regresses.
- [ ] Supabase types are regenerated after migration.

---

## Open Questions

1. Should clinic_admin be allowed to convert approved requests to confirmed shifts in v0.3?
   - v0.2 answer: no. Manager/admin only.
2. Should day-off requests be stored as all-day timestamptz ranges or date-only rows?
   - v0.2 answer: explicit `start_time` / `end_time`; UI can normalize full-day.
3. Should submitted requests be editable after deadline by the owner?
   - v0.2 answer: no. After deadline, only clinic_admin/manager/admin can adjust.
4. Should a converted request be reversible?
   - v0.2 answer: not directly. Reversal should cancel generated `staff_shifts` row and record a correction flow in a separate spec.
5. Should `unavailable/day_off` become `blocks` in the future?
   - v0.2 answer: not now. Treat as conversion constraints only.

---

## Self Review

### Verdict

Conditional Approve.

この仕様は実装に進められる。ただし、PR-1着手前に次の4点を明確に満たす必要がある。

1. `day_off/unavailable` が絶対に `staff_shifts` へ変換されないこと。
2. `resolveActorStaffResourceId()` が fail-closed で実装されること。
3. Manager UI path を `/admin/shift-requests` にするなら route guard を更新すること。
4. `shift_requests` の clinic consistency をDBレベルで固定すること。

### Strong Points

- `staff_shifts` を直接希望提出テーブルにしない判断は正しい。
- workflow history を独立テーブルに切り出しているため、監査・差戻し・変換履歴を持てる。
- Manager / clinic_admin / therapist / staff の責務がv0.2で分離されている。
- conversionをRPC/transaction境界に寄せる判断は安全。

### Remaining Weak Points

- `auth.users.id = staff.id = resources.id = user_permissions.staff_id` の同一UUID運用は、現状のアプリ実装に依存している。
- `staff_preferences` のRLSが環境によって古い permissive policy を残している場合、同じドメインで別経路の穴になる。
- `day_off` を full-day timestamptz で表現する場合、Timezone/JST境界のテストが必要。
- 変換済みシフトの修正・取消導線はv0.2では別仕様に逃がしているため、運用上は「取り消す時は既存staff_shifts取消」を明示する必要がある。

### Implementation Priority

1. DB/RLS/consistency trigger
2. `resolveActorStaffResourceId()`
3. request periods + requests API
4. conversion RPC/API
5. minimal UI
6. Manager dashboard aggregation

### Final Recommendation

v0.2としてはこの仕様で進めてよい。
ただし、Codex/Claudeに投げるときは以下を冒頭に固定する。

```md
Do not convert `day_off` or `unavailable` requests into `staff_shifts` under any mode.
All self-submit authorization must go through `resolveActorStaffResourceId()`.
Do not trust client-provided `staff_id`, `submitted_for_role`, or `clinic_id` without server-side and DB-side verification.
Conversion must be atomic.
```

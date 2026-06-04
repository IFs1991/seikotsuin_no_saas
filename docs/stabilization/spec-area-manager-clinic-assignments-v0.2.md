# Area Manager Clinic Assignments v0.2

## Status

- Status: Reviewed Implementation Spec
- Target: `seikotsuin_no_saas`
- Base spec: `spec-area-manager-clinic-assignments-v0.1`
- Purpose: `manager` / エリアマネージャーが、任意の複数店舗を担当できる権限・DB・API・UI・RLS設計を追加する
- Primary design decision:
  - `manager_clinic_assignments` を `manager` の担当店舗 source of truth にする
  - `manager` の実効 clinic scope は `user_permissions.clinic_id` / JWT `clinic_scope_ids` ではなく、active assignment から解決する
  - `clinic_scope_ids` は `manager` のアクセス判定には使わない
- Implementation style:
  - DB migration あり
  - rollback 必須
  - helper / API / UI / tests を小さい PR に分割
  - `clinic_scope_ids` の運用ハックに依存しない
  - RLS helper は既存方針に合わせて `app_private` schema を使う
  - `public.get_current_role()` は新規作成しない

---

## 0. v0.2 Review Summary

v0.1 の方向性は正しい。

ただし、現行 `seikotsuin_no_saas` はすでに以下の構造を持つ。

```txt
src/lib/constants/roles.ts
  HQ_ROLES = admin only
  CROSS_CLINIC_ROLES = admin only
  AREA_ANALYTICS_ROLES = admin + manager
  CLINIC_ADMIN_ROLES = admin + clinic_admin + manager

src/lib/supabase/server.ts
  resolveScopedClinicIds():
    clinic_scope_ids > clinic_id fallback

src/lib/supabase/guards.ts
  ensureClinicAccess():
    canAccessClinicScope(permissions, clinicId)

supabase/migrations/*
  RLS helper:
    app_private.get_current_role()
    app_private.can_access_clinic(uuid)
```

そのため、単に `manager_clinic_assignments` table を追加するだけでは不足する。

v0.2 では以下を必須修正とする。

1. RLS policy は `app_private.get_current_role()` を使う
2. `app_private.can_access_clinic()` に `manager` 専用分岐を追加する
3. `manager` の場合、JWT `clinic_scope_ids` / `user_permissions.clinic_id` fallback をアクセス権として使わない
4. `ensureClinicAccess()` / API guard 側も `manager_clinic_assignments` を見る
5. `/api/clinics/accessible` は `manager` を最初に分岐し、assignment table から返す
6. `/api/admin/users` の area manager scope も `manager_clinic_assignments` に差し替える
7. role downgrade / permission revoke 時、active assignment が残る manager は 409 で拒否する
8. assignment replace は atomic に行う
9. migration には `GRANT` を含める
10. Supabase Database types を更新する

---

## 1. Background

現状の `seikotsuin_no_saas` には `manager` ロール自体は存在する。

ただし現状の権限モデルは主に以下で構成されている。

```txt
UserPermissions:
  role: string
  clinic_id: string | null
  clinic_scope_ids?: string[]
```

`manager_user_id -> clinic_id[]` のような正規化された担当店舗割当は first-class な形では存在していない。

また、`user_permissions` は基本的に `staff_id` 単位で role / clinic_id を持つ設計であり、1人の manager に対して複数店舗を任意に紐づけるための中間テーブルはない。

### Interpretation

現状は「manager が複数店舗を扱う余地」はあるが、エリアマネージャーごとに任意の担当店舗を管理する設計にはなっていない。

`clinic_scope_ids` は既にあるが、これは JWT / app_metadata / 親子テナント展開に寄ったスコープ表現であり、担当店舗の追加・削除・監査・退職時の剥奪・画面管理には弱い。

---

## 2. Goals

1. `manager` に任意の複数店舗を割り当てられる
2. `manager` は担当店舗のデータだけ閲覧・操作できる
3. 担当店舗は `admin` が管理画面から変更できる
4. 担当変更の履歴を残せる
5. `clinic_scope_ids` を手動更新する運用から脱却する
6. 既存の `clinic_admin`, `admin`, `therapist`, `staff` の権限境界を壊さない
7. 将来のシフト希望、売上集計、予約、MEO分析、複数店舗レポートに使い回せる
8. RLS と server-side API guard の判定ロジックを二重化させない
9. `manager` の role downgrade / permission revoke 時に権限残骸を残さない

---

## 3. Non-Goals

v0.2 では以下はやらない。

- `manager` を全店舗閲覧可能な本部権限にする
- `manager` を `HQ_ROLES` に入れる
- `manager` を `CROSS_CLINIC_ROLES` に入れる
- `manager` を全 `/admin/**` へアクセス可能にする
- `user_permissions` を複数行モデルに変更する
- `clinic_scope_ids` を完全廃止する
- 自動シフト最適化
- 組織階層、ブロック、エリア、ブランド単位の複雑な組織管理
- `clinic_admin` に担当店舗割当権限を与える
- `manager` が他の manager を管理できるようにする
- `manager` が自分の担当店舗を自己割当できるようにする

---

## 4. Role Meaning

| Role | Meaning |
|---|---|
| `admin` | 全体管理者。manager の担当店舗割当を作成・変更・剥奪できる |
| `manager` | 担当店舗群に対してのみ、集計・確認・承認・一部管理操作ができる |
| `clinic_admin` | 自店舗または既存 clinic scope 内の店舗管理者。manager の担当割当はできない |
| `therapist` | 自分の業務データ・シフト・予約に関わる操作のみ |
| `staff` | 自分または許可された店舗業務に関わる操作のみ |
| `customer` | 対象外 |

---

## 5. Core Decision

`manager` の担当店舗は新規テーブル `manager_clinic_assignments` で管理する。

`user_permissions.clinic_id` は引き続き「主所属店舗 / primary clinic」として使う。

ただし、`manager` の実効アクセス範囲は `user_permissions.clinic_id` ではなく、`manager_clinic_assignments` の active assignment で決める。

```txt
auth.users.id
  ↓
user_permissions.staff_id
  ↓ role = manager
  ↓ primary clinic_id = 所属/代表店舗
  ↓
manager_clinic_assignments
  ├── clinic_A
  ├── clinic_C
  └── clinic_F
```

### Must

```txt
role = manager:
  effective clinic scope = active manager_clinic_assignments only
```

### Must Not

```txt
role = manager:
  effective clinic scope != user_permissions.clinic_id fallback
  effective clinic scope != JWT clinic_scope_ids
```

---

## 6. DB Design

### 6.1 New Table

```sql
create table public.manager_clinic_assignments (
  id uuid primary key default gen_random_uuid(),

  manager_user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),

  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint manager_clinic_assignments_revoke_reason_length
    check (revoke_reason is null or char_length(revoke_reason) <= 500)
);
```

### 6.2 Active Assignment Unique Index

同じ manager が同じ clinic に active assignment を重複して持てないようにする。

```sql
create unique index manager_clinic_assignments_active_unique
on public.manager_clinic_assignments (manager_user_id, clinic_id)
where revoked_at is null;
```

### 6.3 Indexes

```sql
create index manager_clinic_assignments_manager_active_idx
on public.manager_clinic_assignments (manager_user_id, clinic_id)
where revoked_at is null;

create index manager_clinic_assignments_clinic_active_idx
on public.manager_clinic_assignments (clinic_id, manager_user_id)
where revoked_at is null;

create index manager_clinic_assignments_assigned_at_idx
on public.manager_clinic_assignments (assigned_at desc);

create index manager_clinic_assignments_revoked_at_idx
on public.manager_clinic_assignments (revoked_at)
where revoked_at is not null;
```

### 6.4 updated_at Trigger

既存repoでは `public.update_updated_at_column()` を使っているため、新規 `set_updated_at()` は増やさない。

```sql
create trigger update_manager_clinic_assignments_updated_at
before update on public.manager_clinic_assignments
for each row execute function public.update_updated_at_column();
```

---

## 7. DB Integrity Rules

### 7.1 Manager Role Enforcement

`manager_clinic_assignments.manager_user_id` は `user_permissions.role = 'manager'` のユーザーだけ許可する。

```sql
create or replace function app_private.assert_manager_clinic_assignment_valid()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  manager_role text;
  clinic_is_active boolean;
  clinic_parent_id uuid;
begin
  select up.role
  into manager_role
  from public.user_permissions up
  where up.staff_id = new.manager_user_id
  limit 1;

  if manager_role is distinct from 'manager' then
    raise exception 'manager_user_id must have manager role'
      using errcode = '23514';
  end if;

  select c.is_active, c.parent_id
  into clinic_is_active, clinic_parent_id
  from public.clinics c
  where c.id = new.clinic_id
  limit 1;

  if clinic_is_active is distinct from true then
    raise exception 'clinic must be active'
      using errcode = '23514';
  end if;

  -- 店舗だけを割り当て対象にする。親テナントは対象外。
  if clinic_parent_id is null then
    raise exception 'clinic assignment target must be a child clinic, not parent tenant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger assert_manager_clinic_assignment_valid_insert
before insert on public.manager_clinic_assignments
for each row
execute function app_private.assert_manager_clinic_assignment_valid();

create trigger assert_manager_clinic_assignment_valid_update
before update of manager_user_id, clinic_id, revoked_at
on public.manager_clinic_assignments
for each row
when (new.revoked_at is null)
execute function app_private.assert_manager_clinic_assignment_valid();
```

### 7.2 Role Downgrade / Permission Revoke Guard

`manager` から別 role に変更する時、active assignment が残っていたら API 側で拒否する。

これは以下の両方に必要。

```txt
POST /api/admin/users
PATCH /api/admin/users/[permission_id]
```

対象ケース:

```txt
existing role = manager
and active manager_clinic_assignments exists
and (
  next role exists and next role != manager
  or revoke = true
)
```

Response:

```json
{
  "error": "担当店舗が残っているためロールを変更できません"
}
```

HTTP:

```txt
409 Conflict
```

---

## 8. RLS

### 8.1 Enable RLS

```sql
alter table public.manager_clinic_assignments enable row level security;
```

### 8.2 SELECT Policy

admin は全件参照可能。

manager は自分の active assignment のみ参照可能。

```sql
create policy "manager_clinic_assignments_select_admin_or_self_active"
on public.manager_clinic_assignments
for select
to authenticated
using (
  app_private.get_current_role() = 'admin'
  or (
    manager_user_id = auth.uid()
    and revoked_at is null
  )
);
```

### 8.3 INSERT / UPDATE / DELETE Policies

assignment の作成・変更・剥奪は admin のみ。

```sql
create policy "manager_clinic_assignments_insert_admin_only"
on public.manager_clinic_assignments
for insert
to authenticated
with check (
  app_private.get_current_role() = 'admin'
);

create policy "manager_clinic_assignments_update_admin_only"
on public.manager_clinic_assignments
for update
to authenticated
using (
  app_private.get_current_role() = 'admin'
)
with check (
  app_private.get_current_role() = 'admin'
);

create policy "manager_clinic_assignments_delete_admin_only"
on public.manager_clinic_assignments
for delete
to authenticated
using (
  app_private.get_current_role() = 'admin'
);
```

### 8.4 GRANT

RLS policy だけでは足りないため、明示的にGRANTする。

```sql
grant select, insert, update, delete on public.manager_clinic_assignments to authenticated;
grant all on public.manager_clinic_assignments to service_role;

grant execute on function app_private.assert_manager_clinic_assignment_valid() to service_role;
```

### 8.5 Soft Revoke

原則 `DELETE` は使わない。

UI/API では以下を更新する。

```txt
revoked_at
revoked_by
revoke_reason
```

`DELETE` policy は緊急運用・テスト cleanup 用に残してもよいが、通常 API からは呼ばない。

---

## 9. Critical RLS Helper Change

### 9.1 Why Required

現行の `app_private.can_access_clinic(target_clinic_id)` は JWT `clinic_scope_ids` / primary clinic fallback に依存している。

このままだと、`manager_clinic_assignments` を作っても RLS が DB assignment を見ない。

結果として以下が起きる。

| Case | Bug |
|---|---|
| manager にDBで新店舗を追加 | JWTが古いと見られない |
| manager から店舗を剥奪 | 古いJWTが残っていると見えてしまう |
| manager にassignmentなし | primary clinic fallbackで主所属店舗が見えてしまう |

したがって、`app_private.can_access_clinic()` に manager 専用分岐を追加する。

### 9.2 Required Behavior

```txt
if current role = manager:
  return exists active manager_clinic_assignments row
else:
  keep existing clinic_scope_ids / clinic_id behavior
```

### 9.3 SQL Patch Shape

既存の `app_private.can_access_clinic(uuid)` を `create or replace` で更新する。

```sql
create or replace function app_private.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  scope_ids_json jsonb;
  scope_ids uuid[];
  primary_clinic_id uuid;
  current_role text;
begin
  if target_clinic_id is null then
    return false;
  end if;

  current_role := app_private.get_current_role();

  -- manager must use DB assignments as source of truth.
  -- Do not use JWT clinic_scope_ids or primary clinic fallback for manager.
  if current_role = 'manager' then
    return exists (
      select 1
      from public.manager_clinic_assignments mca
      where mca.manager_user_id = auth.uid()
        and mca.clinic_id = target_clinic_id
        and mca.revoked_at is null
    );
  end if;

  -- Existing behavior for non-manager.
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    scope_ids_json := coalesce(
      claims -> 'app_metadata' -> 'clinic_scope_ids',
      claims -> 'clinic_scope_ids'
    );

    if scope_ids_json is not null
       and jsonb_typeof(scope_ids_json) = 'array'
       and jsonb_array_length(scope_ids_json) > 0
    then
      select array_agg(elem::text::uuid)
      into scope_ids
      from jsonb_array_elements_text(scope_ids_json) as elem;

      return target_clinic_id = any(scope_ids);
    end if;
  exception when others then
    null;
  end;

  primary_clinic_id := app_private.get_current_clinic_id();

  if primary_clinic_id is null then
    return false;
  end if;

  return target_clinic_id = primary_clinic_id;
end;
$$;

grant execute on function app_private.can_access_clinic(uuid) to anon, authenticated;
```

### 9.4 Rollback Requirement

Rollback must restore the previous `app_private.can_access_clinic(uuid)` definition.

Do not simply drop the function.

---

## 10. Authorization Helpers

### 10.1 New File

```txt
src/lib/auth/manager-scope.ts
```

### 10.2 Types

```ts
export type ManagerClinicAssignment = {
  id: string;
  manager_user_id: string;
  clinic_id: string;
  clinic_name: string | null;
  assigned_at: string;
  revoked_at: string | null;
};

export type EffectiveClinicScope = {
  source: 'admin' | 'manager_assignments' | 'clinic_scope_ids' | 'clinic_id';
  clinicIds: string[];
};
```

### 10.3 resolveManagerAssignedClinicIds

```ts
export async function resolveManagerAssignedClinicIds(
  adminClient: SupabaseServerClient,
  managerUserId: string
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('manager_clinic_assignments')
    .select('clinic_id')
    .eq('manager_user_id', managerUserId)
    .is('revoked_at', null);

  if (error) {
    throw error;
  }

  return Array.from(new Set((data ?? []).map(row => row.clinic_id)));
}
```

### 10.4 resolveEffectiveClinicScope

既存の `resolveScopedClinicIds()` は残す。

ただし `manager` の場合だけ、新規 assignment table を source of truth にする。

```ts
export async function resolveEffectiveClinicScope({
  adminClient,
  userId,
  permissions,
}: {
  adminClient: SupabaseServerClient;
  userId: string;
  permissions: UserPermissions;
}): Promise<EffectiveClinicScope> {
  const role = normalizeRole(permissions.role);

  if (role === 'manager') {
    const assignedClinicIds = await resolveManagerAssignedClinicIds(
      adminClient,
      userId
    );

    return {
      source: 'manager_assignments',
      clinicIds: assignedClinicIds,
    };
  }

  const scopedClinicIds = resolveScopedClinicIds(permissions);

  if (scopedClinicIds?.length) {
    return {
      source: 'clinic_scope_ids',
      clinicIds: scopedClinicIds,
    };
  }

  if (permissions.clinic_id) {
    return {
      source: 'clinic_id',
      clinicIds: [permissions.clinic_id],
    };
  }

  return {
    source: 'clinic_id',
    clinicIds: [],
  };
}
```

### 10.5 assertClinicInEffectiveScope

```ts
export class ScopeAccessError extends Error {
  constructor(message = '対象クリニックへのアクセス権がありません') {
    super(message);
    this.name = 'ScopeAccessError';
  }
}

export function assertClinicInEffectiveScope(
  scope: EffectiveClinicScope,
  clinicId: string
): void {
  if (!scope.clinicIds.includes(clinicId)) {
    throw new ScopeAccessError();
  }
}
```

---

## 11. Server-Side Guard Integration

### 11.1 Problem

現行 `ensureClinicAccess()` は `canAccessClinicScope(permissions, clinicId)` を使う。

これは `resolveScopedClinicIds()` に依存するため、manager に対して `clinic_scope_ids` / `clinic_id` fallback を許してしまう。

### 11.2 Required Change

`clinicId` が指定され、role が `manager` の場合は `manager_clinic_assignments` で判定する。

Pseudo:

```ts
if (requireClinicMatch) {
  if (!clinicId) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'clinic_idは必須です', 400);
  }

  const normalizedRole = normalizeRole(permissions.role);

  if (normalizedRole === 'manager') {
    const adminClient = createAdminClient();
    const scope = await resolveEffectiveClinicScope({
      adminClient,
      userId: user.id,
      permissions,
    });

    try {
      assertClinicInEffectiveScope(scope, clinicId);
    } catch {
      throw new AppError(ERROR_CODES.FORBIDDEN, undefined, 403);
    }
  } else {
    const hasClinicAccess = canAccessClinicScope(permissions, clinicId);

    if (!hasClinicAccess) {
      throw new AppError(ERROR_CODES.FORBIDDEN, undefined, 403);
    }
  }
}
```

### 11.3 Test Requirement

- manager with assignment can pass `ensureClinicAccess(..., assignedClinicId)`
- manager with no assignment cannot pass primary `permissions.clinic_id`
- manager with stale JWT `clinic_scope_ids` cannot pass unassigned clinic
- clinic_admin existing behavior remains unchanged

---

## 12. JWT / clinic_scope_ids Policy

### Decision

`manager` の担当店舗は DB assignment table を source of truth にする。

`clinic_scope_ids` は以下の用途に限定する。

1. 既存互換
2. `admin` / `clinic_admin` の既存 scope 解決
3. 移行期間中の fallback for non-manager
4. RLS smoke test for non-manager

### Prohibited

`manager` の担当店舗を `auth.users.raw_app_meta_data.clinic_scope_ids` の手動編集だけで管理しない。

### Reason

- セッション更新まで古いJWTが残る
- 担当変更履歴が残らない
- 管理画面で扱いづらい
- 退職・異動時の権限剥奪が漏れる
- 監査に弱い
- 実装者が「なぜこの manager がこの店舗を見られるのか」を追いづらい

---

## 13. API Design

## 13.1 GET `/api/admin/managers`

### Purpose

manager 一覧と担当店舗数を取得する。

### Authorization

- allowed: `admin`
- denied: others

### Response

```json
{
  "items": [
    {
      "user_id": "uuid",
      "email": "manager@example.com",
      "full_name": "山田 太郎",
      "primary_clinic_id": "uuid",
      "primary_clinic_name": "渋谷院",
      "assigned_clinic_count": 3,
      "assigned_clinics": [
        { "id": "uuid", "name": "渋谷院" },
        { "id": "uuid", "name": "池袋院" }
      ]
    }
  ],
  "total": 1
}
```

### Implementation Notes

- Query managers from `user_permissions.role = 'manager'`
- Join/fetch `profiles` for `email` / `full_name`
- Join/fetch `clinics` for primary clinic name
- Fetch active assignments from `manager_clinic_assignments`
- Return count and compact clinic chips

---

## 13.2 GET `/api/admin/managers/[managerUserId]/clinics`

### Purpose

特定 manager の担当店舗を取得する。

### Authorization

- `admin`: any manager
- `manager`: self only, read only
- others: denied

### Response

```json
{
  "manager_user_id": "uuid",
  "items": [
    {
      "assignment_id": "uuid",
      "clinic_id": "uuid",
      "clinic_name": "渋谷院",
      "assigned_at": "2026-06-03T00:00:00Z"
    }
  ]
}
```

### Notes

- manager self read は任意。
- v0.2 UI上は admin 管理画面用途が主。
- self read を入れる場合でも active のみ返す。

---

## 13.3 PUT `/api/admin/managers/[managerUserId]/clinics`

### Purpose

manager の active 担当店舗を置換する。

### Authorization

- allowed: `admin`
- denied:
  - manager self update
  - clinic_admin
  - therapist
  - staff
  - customer

### Request

```json
{
  "clinic_ids": [
    "clinic-a-uuid",
    "clinic-c-uuid",
    "clinic-f-uuid"
  ],
  "revoke_reason": "担当エリア変更"
}
```

### Validation

- `managerUserId` が uuid
- `managerUserId` が存在する
- 対象ユーザーの `user_permissions.role = 'manager'`
- `clinic_ids` は空配列でもよい
  - 空配列は「担当なし」
  - ただし担当なし manager は業務画面で 403 / empty state
- `clinic_ids` は全て uuid
- `clinic_ids` は重複排除する
- `clinic_ids` は全て active clinic
- `clinic_ids` は全て child clinic
- `revoke_reason` は optional
- `revoke_reason` は最大500文字
- `admin` 以外は 403

### Behavior

現在 active な assignment と request の `clinic_ids` を diff する。

```txt
current = [A, B]
next    = [B, C]

add: C
keep: B
revoke: A
```

- add: insert
- keep: no-op
- revoke: `revoked_at`, `revoked_by`, `revoke_reason` を更新

### Atomicity Requirement

この replace は atomic に行う。

推奨は DB function。

```sql
public.replace_manager_clinic_assignments(
  p_manager_user_id uuid,
  p_clinic_ids uuid[],
  p_revoke_reason text,
  p_actor_user_id uuid
)
```

API側で複数クエリを雑に順番実行しない。

### Response

```json
{
  "manager_user_id": "uuid",
  "added": ["clinic-c-uuid"],
  "kept": ["clinic-b-uuid"],
  "revoked": ["clinic-a-uuid"],
  "items": [
    { "clinic_id": "clinic-b-uuid", "clinic_name": "池袋院" },
    { "clinic_id": "clinic-c-uuid", "clinic_name": "新宿院" }
  ]
}
```

---

## 14. Atomic Replace DB Function

### 14.1 Purpose

assignment replacement を atomic にする。

API route は service role client からこの関数を呼ぶ。

### 14.2 Function Sketch

```sql
create or replace function public.replace_manager_clinic_assignments(
  p_manager_user_id uuid,
  p_clinic_ids uuid[],
  p_revoke_reason text,
  p_actor_user_id uuid
)
returns table(action text, clinic_id uuid)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_manager_role text;
  v_now timestamptz := now();
  v_next_clinic_ids uuid[];
  v_invalid_count integer;
begin
  if p_actor_user_id is null then
    raise exception 'actor user id is required'
      using errcode = '23514';
  end if;

  select up.role
  into v_manager_role
  from public.user_permissions up
  where up.staff_id = p_manager_user_id
  limit 1;

  if v_manager_role is distinct from 'manager' then
    raise exception 'target user must have manager role'
      using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct x.clinic_id), array[]::uuid[])
  into v_next_clinic_ids
  from unnest(coalesce(p_clinic_ids, array[]::uuid[])) as x(clinic_id);

  select count(*)
  into v_invalid_count
  from unnest(v_next_clinic_ids) as requested(clinic_id)
  left join public.clinics c on c.id = requested.clinic_id
  where c.id is null
     or c.is_active is distinct from true
     or c.parent_id is null;

  if v_invalid_count > 0 then
    raise exception 'clinic_ids must reference active child clinics'
      using errcode = '23514';
  end if;

  -- revoke missing
  update public.manager_clinic_assignments mca
  set
    revoked_at = v_now,
    revoked_by = p_actor_user_id,
    revoke_reason = nullif(btrim(coalesce(p_revoke_reason, '')), ''),
    updated_at = v_now
  where mca.manager_user_id = p_manager_user_id
    and mca.revoked_at is null
    and not (mca.clinic_id = any(v_next_clinic_ids));

  -- return revoked
  return query
  select 'revoked'::text, mca.clinic_id
  from public.manager_clinic_assignments mca
  where mca.manager_user_id = p_manager_user_id
    and mca.revoked_at = v_now;

  -- return kept
  return query
  select 'kept'::text, mca.clinic_id
  from public.manager_clinic_assignments mca
  where mca.manager_user_id = p_manager_user_id
    and mca.revoked_at is null
    and mca.clinic_id = any(v_next_clinic_ids);

  -- insert added
  insert into public.manager_clinic_assignments (
    manager_user_id,
    clinic_id,
    assigned_by,
    assigned_at
  )
  select
    p_manager_user_id,
    requested.clinic_id,
    p_actor_user_id,
    v_now
  from unnest(v_next_clinic_ids) as requested(clinic_id)
  where not exists (
    select 1
    from public.manager_clinic_assignments existing
    where existing.manager_user_id = p_manager_user_id
      and existing.clinic_id = requested.clinic_id
      and existing.revoked_at is null
  );

  -- return added
  return query
  select 'added'::text, mca.clinic_id
  from public.manager_clinic_assignments mca
  where mca.manager_user_id = p_manager_user_id
    and mca.assigned_at = v_now
    and mca.assigned_by = p_actor_user_id;

end;
$$;

revoke all on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid) from public;
grant execute on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid) to service_role;
```

### 14.3 Notes

- API側で actor が admin であることを確認してから呼ぶ。
- 関数内でも actor role を検証してもよいが、service role経由の場合 `auth.uid()` に依存しない。
- `p_actor_user_id` を必須にする。
- `assigned_at = v_now` で added を返す実装は同時実行に弱くはないが、より厳密にするなら `insert ... returning` を temp table に入れる。
- 実装時にSQLテストで必ず検証する。

---

## 15. GET `/api/clinics/accessible`

### Current

現状は `resolveScopedClinicIds(permissions)` を使って accessible clinics を返している。

### Required Change

`manager` の場合は `manager_clinic_assignments` を最優先する。

```txt
role = manager:
  assigned clinic ids from manager_clinic_assignments
role != manager:
  existing resolveScopedClinicIds behavior
```

### Important

`manager` は `resolveScopedClinicIds()` より前に分岐する。

悪い例:

```ts
const scopedClinicIds = resolveScopedClinicIds(permissions);
if (!scopedClinicIds) return 403;
if (role === 'manager') ...
```

良い例:

```ts
if (normalizeRole(permissions.role) === 'manager') {
  const adminClient = createAdminClient();
  const assignedClinicIds = await resolveManagerAssignedClinicIds(
    adminClient,
    auth.id
  );

  if (assignedClinicIds.length === 0) {
    return createSuccessResponse({
      clinics: [],
      currentClinicId: null,
    });
  }

  const clinicsResult = await fetchDirectScopedClinics(
    adminClient,
    assignedClinicIds
  );

  return createSuccessResponse({
    clinics: clinicsResult.clinics ?? [],
    currentClinicId: resolveCurrentAccessibleClinicId(
      clinicsResult.clinics ?? [],
      permissions.clinic_id
    ),
  });
}
```

### Empty State

manager に active assignment がない場合:

```json
{
  "clinics": [],
  "currentClinicId": null
}
```

HTTP:

```txt
200 OK
```

ただし業務APIで具体的な `clinic_id` を要求する場合は 403。

---

## 16. Existing API Guard Changes

### 16.1 `/api/admin/users`

現行では area manager が `/api/admin/users` で一部ユーザー管理できる。

この area manager の操作範囲も `manager_clinic_assignments` に差し替える。

#### Required Change

現在のように以下を使わない。

```ts
getAreaManagerScopedClinicIds = resolveScopedClinicIds(permissions)
canAreaManagerAccessClinic = canAccessClinicScope(permissions, clinicId)
```

代わりに、manager actor の場合は active assignment を使う。

```ts
role = manager:
  admin/users scope = active manager_clinic_assignments
```

### 16.2 `/api/admin/users` GET

manager actor の場合:

- 表示対象 clinic_id は active assigned clinics に限定
- `clinic_id` query parameter が assigned clinics 外なら 403
- 表示対象 role は既存通り `AREA_MANAGER_ASSIGNABLE_ROLES`

### 16.3 `/api/admin/users` POST

manager actor の場合:

- 作成/付与対象の `clinic_id` は active assigned clinics に含まれている必要がある
- `clinic_scope_ids` / `permissions.clinic_id` fallback は使わない

### 16.4 `/api/admin/users/[permission_id]` PATCH

manager actor の場合:

- 既存permissionの `clinic_id` が active assigned clinics に含まれている必要がある
- 更新後 `clinic_id` も active assigned clinics に含まれている必要がある
- `clinic_scope_ids` / `permissions.clinic_id` fallback は使わない

### 16.5 Role Downgrade/Revoke Guard

`admin` が操作する場合でも、active assignment がある manager を downgrade/revoke しようとしたら409。

対象API:

```txt
POST /api/admin/users
PATCH /api/admin/users/[permission_id]
```

---

## 17. Existing Role Constants

### Must Not Change

```ts
HQ_ROLES = new Set(['admin']);
CROSS_CLINIC_ROLES = new Set(['admin']);
```

`manager` を追加してはいけない。

### Do Not Add

```ts
ADMIN_UI_ROLES
```

`manager` を global `ADMIN_UI_ROLES` に追加しない。

現行 repo では `manager` 専用 admin route whitelist があるため、必要ならそこに `/admin/managers` を入れるのではなく、`/admin/managers` は `admin` only にする。

### Note

`CLINIC_ADMIN_ROLES` に `manager` が含まれている現行仕様と、今回の assignment source of truth は衝突しうる。

`manager` が clinic settings へアクセスする場合も、最終的な clinic access check は `manager_clinic_assignments` を使うこと。

---

## 18. UI Design

### 18.1 New Page

```txt
/admin/managers
```

### 18.2 Access

- `admin` only

この画面は admin only なので、manager を global `ADMIN_UI_ROLES` に追加しない。

manager 自身にこの画面を見せない。

### 18.3 UI Components

#### Manager List

| Column | Content |
|---|---|
| 氏名 | `profiles.full_name` |
| メール | `profiles.email` |
| 主所属店舗 | `user_permissions.clinic_id` |
| 担当店舗数 | active assignment count |
| 担当店舗 | clinic chips |
| 操作 | 編集 |

#### Assignment Editor

- manager name
- email
- primary clinic
- multi-select clinics
- current assignments
- save button
- revoke reason optional

### 18.4 Empty State

manager が存在しない場合:

```txt
マネージャー権限のユーザーがまだ存在しません。
先に「ユーザー管理」から manager ロールのアカウントを作成してください。
```

manager に担当店舗がない場合:

```txt
担当店舗が未設定です。
このマネージャーは店舗データにアクセスできません。
```

### 18.5 Navigation

HQ admin menu にだけ追加する。

```ts
ADMIN_MENU_ITEMS:
  { id: 'admin-managers', label: 'エリアマネージャー管理', href: '/admin/managers' }
```

Do not add to:

```txt
CLINIC_ADMIN_MENU_ITEMS
AREA_MANAGER_ADMIN_MENU_ITEMS
```

---

## 19. Manager Runtime Behavior

### 19.1 Manager With Assignments

```txt
manager A:
  assigned clinics = 渋谷院, 池袋院

アクセス可能:
  /multi-store?clinic=渋谷院
  /multi-store?clinic=池袋院

アクセス不可:
  新宿院
  横浜院
```

### 19.2 Manager Without Assignments

- `/api/clinics/accessible`: 200 with empty clinics
- 店舗指定API: 403
- UI: empty state

### 19.3 Primary clinic_id

`user_permissions.clinic_id` は以下に使う。

- 初期表示
- 所属表示
- legacy display
- staff/resource 同一UUID運用との互換

ただし、manager の実効アクセス権ではない。

---

## 20. Tests

## 20.1 Unit Tests

### `resolveManagerAssignedClinicIds`

Cases:

- active assignment のみ返す
- revoked assignment は返さない
- 重複なし
- DB error は throw

### `resolveEffectiveClinicScope`

| Case | Expected |
|---|---|
| admin with clinic_scope_ids | existing scope |
| clinic_admin with clinic_scope_ids | existing scope |
| manager with assignments | assignment clinic ids |
| manager without assignments | empty array |
| manager with `clinic_id` but no assignment | empty array |
| manager with stale `clinic_scope_ids` but no assignment | empty array |
| staff with clinic_id | clinic_id fallback |

重要:

```txt
manager は clinic_id fallback でアクセスさせない。
manager は clinic_scope_ids fallback でアクセスさせない。
```

### `assertClinicInEffectiveScope`

- assigned clinic passes
- unassigned clinic throws `ScopeAccessError`
- empty scope always throws

---

## 20.2 API Tests

### `GET /api/admin/managers`

- admin can list managers
- clinic_admin gets 403
- manager gets 403
- therapist gets 403
- staff gets 403

### `GET /api/admin/managers/[managerUserId]/clinics`

- admin can read any manager assignments
- manager can read self active assignments if self read is implemented
- manager cannot read other manager assignments
- clinic_admin gets 403

### `PUT /api/admin/managers/[managerUserId]/clinics`

- admin can assign multiple clinics
- admin can revoke missing clinics by replacement
- non-manager target returns 400 or 409
- inactive clinic returns 400
- parent tenant clinic returns 400
- duplicate clinic_ids are deduped
- manager cannot self-assign
- clinic_admin cannot assign
- empty clinic_ids clears assignments
- replace is atomic

### `/api/clinics/accessible`

- manager gets only assigned clinics
- manager with no assignments gets empty list
- manager with primary clinic but no assignment gets empty list
- manager with stale clinic_scope_ids but no assignment gets empty list
- clinic_admin behavior remains unchanged
- admin behavior remains unchanged
- revoked assignment disappears

### `/api/admin/users`

- manager actor scope uses active assignments
- manager actor cannot access users in unassigned clinic
- manager actor cannot use stale clinic_scope_ids
- manager actor cannot use primary clinic fallback
- admin behavior remains unchanged
- clinic_admin behavior remains unchanged

### Role Downgrade / Revoke

- manager with active assignments cannot be downgraded to clinic_admin
- manager with active assignments cannot be downgraded to therapist
- manager with active assignments cannot be downgraded to staff
- manager with active assignments cannot have permission revoked
- manager after clearing assignments can be downgraded
- non-manager role update behavior remains unchanged

---

## 20.3 RLS Tests

Use SQL tests or integration tests.

Required assertions:

```sql
-- manager can select own active assignments
-- manager cannot select own revoked assignments
-- manager cannot select other manager assignments
-- clinic_admin cannot insert assignment
-- manager cannot insert assignment
-- admin can insert assignment
-- revoked assignment is still visible to admin but should not count as active
-- app_private.can_access_clinic(assigned_clinic_id) returns true for manager
-- app_private.can_access_clinic(unassigned_clinic_id) returns false for manager
-- app_private.can_access_clinic(primary_clinic_id) returns false for manager if no active assignment exists
-- app_private.can_access_clinic(stale_jwt_scope_id) returns false for manager if no active assignment exists
```

---

## 20.4 E2E Tests

### Admin Assignment Flow

1. login as admin
2. open `/admin/managers`
3. select manager
4. assign 渋谷院 and 池袋院
5. save
6. reload
7. assignments persist

### Manager Access Flow

1. login as manager
2. accessible clinics contains 渋谷院 and 池袋院
3. does not contain 新宿院
4. direct API access to 新宿院 returns 403

### Revoke Flow

1. admin removes 池袋院
2. manager reloads
3. 池袋院 disappears
4. direct API access to 池袋院 returns 403

### No Assignment Flow

1. admin clears all assignments
2. manager reloads
3. accessible clinics is empty
4. primary clinic is not accessible unless explicitly assigned
5. concrete clinic API returns 403

---

## 21. Migration Plan

### PR-01: DB Migration + RLS Helper

Files:

```txt
supabase/migrations/YYYYMMDDHHMMSS_manager_clinic_assignments.sql
supabase/rollbacks/YYYYMMDDHHMMSS_manager_clinic_assignments_rollback.sql
```

Includes:

- table
- indexes
- trigger
- integrity trigger function
- RLS
- policies
- grants
- `app_private.can_access_clinic()` manager assignment branch
- `replace_manager_clinic_assignments()` atomic function
- smoke test

DoD:

```bash
supabase db reset --local --no-seed
npm run type-check
npm test -- manager-clinic-assignments
```

---

### PR-02: Auth Helper + Server Guard

Files:

```txt
src/lib/auth/manager-scope.ts
src/lib/supabase/guards.ts
src/app/api/admin/users/access.ts
src/__tests__/lib/manager-scope.test.ts
src/__tests__/lib/guards-manager-scope.test.ts
```

Includes:

- `resolveManagerAssignedClinicIds`
- `resolveEffectiveClinicScope`
- `assertClinicInEffectiveScope`
- manager branch in `ensureClinicAccess`
- area manager admin/users scope replacement

DoD:

```bash
npm run type-check
npm test -- manager-scope
npm test -- guards-manager-scope
```

---

### PR-03: `/api/clinics/accessible` Integration

Files:

```txt
src/app/api/clinics/accessible/route.ts
src/__tests__/api/accessible-clinics-route.test.ts
```

Change:

- manager uses `manager_clinic_assignments`
- non-manager keeps existing behavior
- manager empty assignment returns 200 with empty clinics

DoD:

```bash
npm test -- accessible-clinics-route
```

---

### PR-04: Admin Manager Assignment API

Files:

```txt
src/app/api/admin/managers/route.ts
src/app/api/admin/managers/[managerUserId]/clinics/route.ts
src/__tests__/api/admin-managers-route.test.ts
```

Includes:

- list managers
- get assignments
- replace assignments
- authorization
- validation
- atomic replace function call
- audit log

DoD:

```bash
npm test -- admin-managers-route
```

---

### PR-05: Role Downgrade / Revoke Guard

Files:

```txt
src/app/api/admin/users/route.ts
src/app/api/admin/users/[permission_id]/route.ts
src/__tests__/api/admin-users-route.test.ts
src/__tests__/api/admin-users-permission-route.test.ts
```

Includes:

- active assignment check before manager downgrade
- active assignment check before permission revoke
- 409 response
- no behavior change for non-manager

DoD:

```bash
npm test -- admin-users
```

---

### PR-06: Admin UI

Files:

```txt
src/app/(app)/admin/(protected)/managers/page.tsx
src/hooks/useManagerAssignments.ts
src/lib/admin/manager-assignments.ts
src/lib/navigation/items.ts
```

Includes:

- manager list
- clinic multi-select
- save/revoke flow
- empty state
- HQ admin navigation only

DoD:

```bash
npm run type-check
npm test -- admin-manager
```

---

### PR-07: E2E / Regression

Files:

```txt
e2e/admin-manager-assignments.spec.ts
e2e/manager-access-scope.spec.ts
```

Includes:

- assignment flow
- access flow
- revoke flow
- no assignment flow
- direct API 403

DoD:

```bash
npm run test:e2e -- admin-manager-assignments
npm run test:e2e -- manager-access-scope
```

---

## 22. Rollback

### SQL Rollback Must

1. Drop `manager_clinic_assignments`
2. Drop `app_private.assert_manager_clinic_assignment_valid()`
3. Drop `public.replace_manager_clinic_assignments(...)`
4. Restore previous `app_private.can_access_clinic(uuid)` definition
5. Re-grant previous function execute permissions if necessary

### Rollback SQL Shape

```sql
begin;

drop table if exists public.manager_clinic_assignments cascade;
drop function if exists app_private.assert_manager_clinic_assignment_valid();
drop function if exists public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid);

-- Restore previous app_private.can_access_clinic(uuid) definition here.
-- Do not drop it.

commit;
```

### Application Rollback

- revert PR-02〜PR-07
- `/api/clinics/accessible` returns to existing `resolveScopedClinicIds()` behavior
- manager assignment UI disappears
- existing `user_permissions` remains untouched

Because this is mostly additive, rollback risk is moderate-low.

However, the RLS helper patch is not purely additive. Rollback must restore the previous helper definition.

---

## 23. Security Notes

### Must

- manager assignment write is admin only
- manager cannot self-assign
- manager cannot access unassigned clinic by direct API call
- revoked assignment must not count as access
- `clinic_scope_ids` must not override DB assignment for manager after v0.2 release
- `user_permissions.clinic_id` must not grant manager access after v0.2 release
- all service role reads must pass explicit scope assertion
- role downgrade/revoke must be blocked while active assignments exist
- RLS and server-side guard must agree

### Must Not

- do not create multiple `user_permissions` rows per manager
- do not store comma-separated clinic IDs in `user_permissions`
- do not rely on JWT `clinic_scope_ids` as source of truth for manager assignment
- do not let `manager` enter `HQ_ROLES`
- do not let `manager` enter `CROSS_CLINIC_ROLES`
- do not let `manager` enter global `ADMIN_UI_ROLES`
- do not use `public.get_current_role()` in new policies
- do not bypass `manager_clinic_assignments` in service role APIs
- do not use `any` / `as any`

---

## 24. Implementation Risk

| Risk | Severity | Mitigation |
|---|---:|---|
| manager が未担当店舗を見られる | High | helper + API guard + RLS + E2E |
| JWT と DB assignment がズレる | High | manager は DB source of truth |
| RLS はDB、API guardはJWTを見る | High | `ensureClinicAccess` manager branch |
| users API が肥大化する | Medium | `/admin/managers` に分離 |
| role downgrade 後も assignment が残る | Medium | role update/revoke API で 409 |
| RLS と service role API の二重管理 | Medium | server-side helper に集約 |
| clinic parent を割り当ててしまう | Medium | trigger / API validation |
| 既存 clinic_admin scope を壊す | High | manager 分岐だけ追加 |
| atomic replace 失敗で半端なassignmentになる | Medium | DB functionで置換 |

---

## 25. Acceptance Criteria

v0.2 完了条件。

- `manager_clinic_assignments` が migration で作成される
- migration に indexes / triggers / RLS / policies / grants が含まれる
- `app_private.can_access_clinic()` が manager assignment を見る
- `manager` の `clinic_scope_ids` はアクセス権として使われない
- `manager` の `user_permissions.clinic_id` だけではアクセスできない
- admin が manager に複数店舗を割り当てられる
- admin が担当店舗を削除できる
- assignment replacement が atomic
- manager は担当店舗だけ accessible clinics に表示される
- manager は未担当店舗 API に direct access しても 403
- manager with no assignment は accessible clinics が 200 / empty
- `/api/admin/users` の manager actor scope が assignment table を使う
- manager role downgrade / permission revoke は active assignment があれば409
- `clinic_admin` の既存挙動が変わらない
- `admin` の既存挙動が変わらない
- revoked assignment はアクセス権として扱われない
- unit / API / RLS / E2E tests が通る
- `src/types/supabase.ts` が更新される
- `npm run type-check` が通る
- `npm run build` が通る

---

## 26. Codex Implementation Prompt

```md
# Task: Implement Area Manager Clinic Assignments v0.2

Read:
- docs/stabilization/spec-area-manager-clinic-assignments-v0.2.md
- src/lib/constants/roles.ts
- src/lib/supabase/server.ts
- src/lib/supabase/guards.ts
- src/app/api/clinics/accessible/route.ts
- src/app/api/admin/users/access.ts
- src/app/api/admin/users/route.ts
- src/app/api/admin/users/[permission_id]/route.ts
- src/lib/admin/routes.ts
- src/lib/navigation/items.ts
- supabase/migrations/20260508000300_app_private_jwt_app_metadata_rls_helpers.sql
- supabase/migrations/20260602000100_shift_request_workflow.sql

Goal:
Implement first-class manager-to-multiple-clinic assignment.

Core security decision:
For role = manager, effective clinic scope must come from active rows in public.manager_clinic_assignments.
Do not use JWT clinic_scope_ids or user_permissions.clinic_id as manager effective access fallback.

Repo-specific constraints:
- Existing RLS helpers live in app_private, not public.
- Do not create public.get_current_role().
- Use app_private.get_current_role() in new RLS policies.
- Update app_private.can_access_clinic(uuid) so manager access is resolved from manager_clinic_assignments active rows.
- For manager, clinic_scope_ids and user_permissions.clinic_id must not grant effective access.
- Update ensureClinicAccess or equivalent server-side guard so concrete clinic_id API checks use manager_clinic_assignments for manager.
- Update /api/admin/users area-manager scoped access to use manager_clinic_assignments, not resolveScopedClinicIds().
- Add role downgrade/revoke guard: active assignments block manager role downgrade or permission revoke with 409.
- PUT replacement of assignments must be atomic. Prefer a DB function callable by service_role.
- Add GRANT statements for authenticated and service_role.
- Regenerate/update Supabase Database types.

Do not:
- Do not add manager to HQ_ROLES.
- Do not add manager to CROSS_CLINIC_ROLES.
- Do not add manager to global ADMIN_UI_ROLES.
- Do not model multiple manager clinics by creating multiple user_permissions rows.
- Do not rely on JWT clinic_scope_ids as source of truth for manager access.
- Do not use public.get_current_role().
- Do not broaden existing clinic_admin access.
- Do not use any/as any.

Required PR order:
1. DB migration + rollback:
   - manager_clinic_assignments
   - RLS policies
   - grants
   - app_private.can_access_clinic manager branch
   - atomic replace function
2. manager scope helper + server guard + unit tests
3. /api/clinics/accessible integration
4. admin manager assignment API + API tests
5. role downgrade/revoke guard in admin users APIs
6. admin UI for /admin/managers
7. E2E/RLS regression

Security requirement:
manager effective clinic scope must come from manager_clinic_assignments active rows.
If a manager has no active assignments, return empty accessible clinics and deny concrete clinic access.
Revoked assignments must not grant access.
Stale JWT clinic_scope_ids must not grant manager access.

Validation:
- supabase db reset --local --no-seed
- npm run type-check
- npm test targeted tests
- npm run build
- npm run test:e2e targeted tests if available
```

---

## 27. Final Judgment

これは実装すべき。

整骨院・鍼灸院チェーン向け SaaS では「エリアマネージャーが複数店舗を見る」は高確率で出る権限要件。

ただし、v0.1のままでは不十分。

最大の問題は、DB assignment table を作っても、現行のRLS/helper/API guardが `clinic_scope_ids` / primary `clinic_id` を見続けること。

正解は以下。

```txt
manager_clinic_assignments で正規化
  ↓
app_private.can_access_clinic() に manager branch
  ↓
server-side effective scope helper に集約
  ↓
/api/clinics/accessible / admin/users / business APIs で一貫適用
  ↓
role downgrade / revoke guard で権限残骸を防ぐ
```

雑にやると SaaS として一番まずい「見えてはいけない店舗データが見える」事故に直結する。

v0.2では、RLS・API guard・UI・role lifecycle まで含めて整合させる。

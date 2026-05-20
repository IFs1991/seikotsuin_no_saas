# Tiramisu 売上文脈・care episode・療養費見込み分析 仕様書 v0.5 修正版

作成日: 2026-05-15  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象プロダクト: Tiramisu  
実装優先度: Phase 1 高 / Phase 2 中 / Phase 3 中〜低  
実装方針: 既存互換を壊さず、`daily_report_items` を日報明細SSOTとして拡張する

---

## 0. v0.5での修正判断

v0.5では、v0.4の方針を維持しつつ、以下の実装上の危険を潰す。

### 0.1 v0.4からの主要修正

1. `revenue_context_source` を追加し、予約arrived triggerが手動分類を上書きしないようにする
2. `amount_source` は金額の由来、`revenue_context_source` は分類の由来として分離する
3. `mixed` はPhase 1では選択不可・分析対象外にする
4. master table / view にRLSとgrantを明示する
5. `/api/revenue` POST はSSOT方針と矛盾するため、Phase 1で `410 Gone` にする
6. Supabase ISO表現は「Supabase基盤の認証」と「Tiramisu自体の認証」を厳密に分ける
7. Phase 1 migrationに、arrived予約triggerの置き換えと権限再hardeningを含める
8. `security_invoker = true` viewを必須化する
9. `src/types/supabase.ts` は手編集ではなくCLI生成をDoDに入れる
10. E2E/DBテストに「手動分類が予約更新で戻らない」を必須追加する

### 0.2 最終判断

Phase 1は即実装してよい。  
ただし、`revenue_context_source` なしで実装してはいけない。

理由は、既存の `sync_arrived_reservation_daily_report_item()` は予約更新時にも `daily_report_items` を upsert するため、一度スタッフが `traffic_accident` / `workers_comp` などへ手動分類した行が、予約側の `notes` / `price` / `selected_options` 更新で `insurance` / `private` に戻る危険があるため。

---

## 1. 現行リポジトリ前提

現行の売上・日報の実務中心は以下。

```txt
reservations
  ↓ arrived trigger
daily_reports
  ↓
daily_report_items
  ↓
revenue aggregation
```

現行 `daily_report_items` は以下を持つ。

```txt
billing_type: insurance | private
fee: numeric(10,2)
source: reservation | manual
```

現行の `daily_reports` 集計は、`daily_report_items.billing_type` をもとに以下を更新する。

```txt
daily_reports.total_patients
daily_reports.total_revenue
daily_reports.insurance_revenue
daily_reports.private_revenue
```

したがって、既存互換のため `billing_type` は多値化しない。

---

## 2. 採用する設計原則

### 2.1 SSOT

`daily_report_items` を日報明細SSOTとして維持する。

```txt
予約由来の来院済み売上
手動追加の売上
保険/自費/交通事故/労災/物販/回数券などの分析分類
care episode / 来院ステージ
療養費見込みスナップショット
```

これらは最終的に `daily_report_items` を起点に扱う。

### 2.2 既存互換

`billing_type` は既存互換用。

```ts
type BillingType = 'insurance' | 'private';
```

`revenue_context_code` は分析分類用。

```ts
type RevenueContextCode =
  | 'insurance'
  | 'private'
  | 'traffic_accident'
  | 'workers_comp'
  | 'product'
  | 'ticket'
  | 'mixed'
  | 'other';
```

### 2.3 分類の由来と金額の由来を分ける

```txt
amount_source
  = 金額がどこから来たか

revenue_context_source
  = 売上分類がどこから来たか
```

これは混ぜない。

| column | 意味 | 例 |
|---|---|---|
| `amount_source` | 金額の由来 | `reservation`, `menu_price`, `manual`, `estimate`, `override` |
| `revenue_context_source` | 分類の由来 | `derived`, `manual`, `override`, `system` |
| `estimate_status` | 見込み計算状態 | `not_calculated`, `calculated`, `needs_review`, `blocked`, `overridden` |

### 2.4 禁止事項

1. `billing_type` を多値化しない
2. `patients` を新規主役にしない
3. `public.can_access_clinic()` で新規RLSを書かない
4. `daily_reports` に大量の集計カラムを先に足さない
5. `revenue_context_code text not null default 'private'` を既存データに直接入れない
6. `security_invoker = true` なしでviewを作らない
7. arrived予約triggerで手動分類を上書きしない
8. `mixed` をPhase 1のUI選択肢に出さない
9. `/api/revenue` POSTで旧 `revenues` テーブルへ書かない
10. SupabaseのISO認証をTiramisu自体の認証のように表現しない
11. 療養費見込みを請求確定額に見せない

---

## 3. 実装フェーズ

## Phase 1: 売上文脈分類

最優先。

### 対象

```txt
revenue_contexts
daily_report_items.revenue_context_code
daily_report_items.revenue_context_source
daily_report_items.amount_source
daily_report_items.estimate_status
daily_report_item_tag_definitions
daily_report_item_tags
daily_report_revenue_context_summary view
sync_arrived_reservation_daily_report_item() 更新
/api/daily-reports/items revenueContextCode対応
/api/daily-reports/items/:id/tags
/api/revenue revenueContextSummary対応
revenue UI表示
TypeScript型更新
```

### ファイル

```txt
supabase/migrations/20260514000100_revenue_context_phase1.sql
supabase/rollbacks/20260514000100_revenue_context_phase1_rollback.sql
docs/stabilization/spec-revenue-context-phase1-v0.5.md
src/__tests__/api/revenue-context-phase1-migration.test.ts
src/__tests__/api/daily-report-items-revenue-context-route.test.ts
src/__tests__/api/revenue-context-summary-api.test.ts
```

---

## Phase 2: care episode / visit stage

Phase 1とは別マイグレーションにする。

```txt
care_episodes
visit_stage_definitions
daily_report_items.care_episode_id
daily_report_items.visit_ordinal_in_episode
daily_report_items.visit_stage_code
recalculate visit stages API
初診2回目到達率
初診5回目到達率
```

### ファイル

```txt
supabase/migrations/20260514000200_care_episode_visit_stage_phase2.sql
supabase/rollbacks/20260514000200_care_episode_visit_stage_phase2_rollback.sql
docs/stabilization/spec-care-episode-visit-stage-phase2-v0.5.md
src/__tests__/api/care-episode-visit-stage-phase2-migration.test.ts
```

---

## Phase 3: 療養費/売上見込み計算

Phase 1/2後に実装する。

```txt
revenue_estimates
revenue_estimate_lines
revenue_estimate_warnings
revenue_estimate_overrides
自費/物販/回数券の手入力見込み
事故/労災は要確認warningつき概算
保険は鍼灸1術/2術・初検/継続から開始
```

### ファイル

```txt
supabase/migrations/20260514000300_revenue_estimates_phase3.sql
supabase/rollbacks/20260514000300_revenue_estimates_phase3_rollback.sql
docs/stabilization/spec-revenue-estimates-phase3-v0.5.md
src/__tests__/api/revenue-estimates-phase3-migration.test.ts
```

---

# Phase 1 詳細仕様

---

## 4. Phase 1 DB仕様

## 4.1 `revenue_contexts`

売上文脈のmaster table。

```sql
create table if not exists public.revenue_contexts (
  code text primary key,
  name text not null,
  rollup_category text not null,
  description text,
  is_insurance_related boolean not null default false,
  is_analysis_target boolean not null default true,
  is_selectable boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint revenue_contexts_rollup_category_check
    check (rollup_category in (
      'insurance',
      'private',
      'traffic_accident',
      'workers_comp',
      'product',
      'ticket',
      'other'
    ))
);
```

### Seed

```sql
insert into public.revenue_contexts (
  code,
  name,
  rollup_category,
  description,
  is_insurance_related,
  is_analysis_target,
  is_selectable,
  sort_order
)
values
  (
    'insurance',
    '保険',
    'insurance',
    '健康保険等の保険施術。既存billing_type=insuranceに対応。',
    true,
    true,
    true,
    10
  ),
  (
    'private',
    '自費',
    'private',
    '自費施術。既存billing_type=privateに対応。',
    false,
    true,
    true,
    20
  ),
  (
    'traffic_accident',
    '交通事故',
    'traffic_accident',
    '交通事故・自賠責関連。請求確定ではなく分析分類。',
    false,
    true,
    true,
    30
  ),
  (
    'workers_comp',
    '労災',
    'workers_comp',
    '労災関連。請求確定ではなく分析分類。',
    false,
    true,
    true,
    40
  ),
  (
    'product',
    '物販',
    'product',
    '物販・サプリ・備品等の販売。',
    false,
    true,
    true,
    50
  ),
  (
    'ticket',
    '回数券',
    'ticket',
    '回数券・プリペイド・チケット関連。',
    false,
    true,
    true,
    60
  ),
  (
    'mixed',
    '混合',
    'other',
    '保険・自費等が混在する将来拡張用。Phase 1では選択不可・分析対象外。',
    true,
    false,
    false,
    70
  ),
  (
    'other',
    'その他',
    'other',
    'その他分類。',
    false,
    true,
    true,
    999
  )
on conflict (code) do update set
  name = excluded.name,
  rollup_category = excluded.rollup_category,
  description = excluded.description,
  is_insurance_related = excluded.is_insurance_related,
  is_analysis_target = excluded.is_analysis_target,
  is_selectable = excluded.is_selectable,
  sort_order = excluded.sort_order,
  updated_at = now();
```

---

## 4.2 `revenue_contexts` RLS / grants

master tableはauthenticated select only。

```sql
alter table public.revenue_contexts enable row level security;

drop policy if exists "revenue_contexts_select_for_authenticated"
on public.revenue_contexts;

create policy "revenue_contexts_select_for_authenticated"
on public.revenue_contexts
for select
to authenticated
using (true);

grant select on table public.revenue_contexts to authenticated;
grant all on table public.revenue_contexts to service_role;
```

anonには原則grantしない。  
公開LP等で必要になった場合のみ別途検討。

---

## 4.3 `daily_report_items` 拡張

既存保険行を誤ってprivateにしないため、以下の順序を厳守する。

```sql
alter table public.daily_report_items
  add column if not exists revenue_context_code text,
  add column if not exists revenue_context_source text not null default 'derived',
  add column if not exists amount_source text not null default 'manual',
  add column if not exists estimate_status text not null default 'not_calculated';
```

### Backfill

```sql
update public.daily_report_items
set
  revenue_context_code =
    case
      when billing_type = 'insurance' then 'insurance'
      else 'private'
    end,
  revenue_context_source =
    case
      when source = 'reservation' then 'derived'
      else 'manual'
    end,
  amount_source =
    case
      when source = 'reservation' then 'reservation'
      else 'manual'
    end,
  estimate_status = 'not_calculated'
where revenue_context_code is null;
```

### not null / default / constraints

```sql
alter table public.daily_report_items
  alter column revenue_context_code set default 'private',
  alter column revenue_context_code set not null;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_revenue_context_code_fkey,
  add constraint daily_report_items_revenue_context_code_fkey
    foreign key (revenue_context_code)
    references public.revenue_contexts(code);

alter table public.daily_report_items
  drop constraint if exists daily_report_items_revenue_context_source_check,
  add constraint daily_report_items_revenue_context_source_check
    check (revenue_context_source in (
      'derived',
      'manual',
      'override',
      'system'
    ));

alter table public.daily_report_items
  drop constraint if exists daily_report_items_amount_source_check,
  add constraint daily_report_items_amount_source_check
    check (amount_source in (
      'menu_price',
      'manual',
      'estimate',
      'override',
      'reservation'
    ));

alter table public.daily_report_items
  drop constraint if exists daily_report_items_estimate_status_check,
  add constraint daily_report_items_estimate_status_check
    check (estimate_status in (
      'not_calculated',
      'calculated',
      'needs_review',
      'blocked',
      'overridden'
    ));
```

### Index

```sql
create index if not exists idx_daily_report_items_revenue_context
  on public.daily_report_items (clinic_id, report_date, revenue_context_code);

create index if not exists idx_daily_report_items_staff_context_date
  on public.daily_report_items (
    clinic_id,
    staff_resource_id,
    revenue_context_code,
    report_date
  );

create index if not exists idx_daily_report_items_estimate_status
  on public.daily_report_items (clinic_id, report_date, estimate_status);
```

---

## 4.4 arrived予約trigger更新

対象関数。

```txt
public.sync_arrived_reservation_daily_report_item()
```

現行関数を `create or replace function` で置き換える。

### 4.4.1 insert側に追加するcolumn

`insert into public.daily_report_items (...)` に以下を追加。

```sql
revenue_context_code,
revenue_context_source,
amount_source,
estimate_status
```

### 4.4.2 values側

```sql
case when v_is_insurance then 'insurance' else 'private' end,
'derived',
'reservation',
'not_calculated'
```

### 4.4.3 update側の上書き防止

`on conflict do update set` では、分類は手動・overrideを守る。

```sql
revenue_context_code =
  case
    when public.daily_report_items.revenue_context_source in ('manual', 'override')
      then public.daily_report_items.revenue_context_code
    else excluded.revenue_context_code
  end,

revenue_context_source =
  case
    when public.daily_report_items.revenue_context_source in ('manual', 'override')
      then public.daily_report_items.revenue_context_source
    else excluded.revenue_context_source
  end,

amount_source = excluded.amount_source,

estimate_status =
  case
    when public.daily_report_items.estimate_status in ('overridden', 'blocked')
      then public.daily_report_items.estimate_status
    else excluded.estimate_status
  end,
```

### 4.4.4 fee更新について

予約由来の明細では `fee` は予約価格更新に追従してよい。

ただし、将来 `amount_source='override'` の明細では `fee` 上書きを止める必要がある。Phase 1では以下の仕様にする。

```sql
fee =
  case
    when public.daily_report_items.amount_source = 'override'
      then public.daily_report_items.fee
    else excluded.fee
  end,
```

### 4.4.5 function権限

`create or replace function` 後、念のため再hardeningする。

```sql
revoke execute on function public.sync_arrived_reservation_daily_report_item()
from public, anon, authenticated;

grant execute on function public.sync_arrived_reservation_daily_report_item()
to service_role;

alter function public.sync_arrived_reservation_daily_report_item()
set search_path = public, auth, extensions;
```

trigger実行に通常ユーザーのexecute grantは不要。  
RPC露出は避ける。

---

## 4.5 `daily_report_item_tag_definitions`

```sql
create table if not exists public.daily_report_item_tag_definitions (
  code text primary key,
  name text not null,
  category text not null,
  severity text not null default 'info',
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint daily_report_item_tag_category_check
    check (category in (
      'payer',
      'clinical',
      'operation',
      'billing_review',
      'analysis',
      'system',
      'other'
    )),
  constraint daily_report_item_tag_severity_check
    check (severity in (
      'info',
      'warning',
      'needs_review',
      'excluded',
      'blocked'
    ))
);
```

### Seed

```sql
insert into public.daily_report_item_tag_definitions (
  code,
  name,
  category,
  severity,
  description,
  sort_order
)
values
  (
    'TRAFFIC_ACCIDENT_REVIEW',
    '交通事故 要確認',
    'billing_review',
    'needs_review',
    '交通事故・自賠責関連として確認が必要な明細。',
    10
  ),
  (
    'WORKERS_COMP_REVIEW',
    '労災 要確認',
    'billing_review',
    'needs_review',
    '労災関連として確認が必要な明細。',
    20
  ),
  (
    'ESTIMATE_EXCLUDED',
    '見込み計算対象外',
    'analysis',
    'excluded',
    '療養費・売上見込み計算から除外する明細。',
    30
  ),
  (
    'MANUAL_CLASSIFICATION',
    '手動分類',
    'operation',
    'info',
    'スタッフが売上文脈を手動変更した明細。',
    40
  )
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  severity = excluded.severity,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();
```

### RLS / grants

```sql
alter table public.daily_report_item_tag_definitions enable row level security;

drop policy if exists "daily_report_item_tag_definitions_select_for_authenticated"
on public.daily_report_item_tag_definitions;

create policy "daily_report_item_tag_definitions_select_for_authenticated"
on public.daily_report_item_tag_definitions
for select
to authenticated
using (true);

grant select on table public.daily_report_item_tag_definitions to authenticated;
grant all on table public.daily_report_item_tag_definitions to service_role;
```

---

## 4.6 `daily_report_item_tags`

```sql
create table if not exists public.daily_report_item_tags (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  daily_report_item_id uuid not null,
  tag_code text not null,
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint daily_report_item_tags_pkey primary key (id),
  constraint daily_report_item_tags_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint daily_report_item_tags_item_id_fkey
    foreign key (daily_report_item_id) references public.daily_report_items(id) on delete cascade,
  constraint daily_report_item_tags_tag_code_fkey
    foreign key (tag_code) references public.daily_report_item_tag_definitions(code),
  constraint daily_report_item_tags_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint daily_report_item_tags_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint daily_report_item_tags_unique
    unique (daily_report_item_id, tag_code)
);
```

### Index

```sql
create index if not exists idx_daily_report_item_tags_clinic_item
  on public.daily_report_item_tags (clinic_id, daily_report_item_id);

create index if not exists idx_daily_report_item_tags_clinic_tag
  on public.daily_report_item_tags (clinic_id, tag_code);
```

---

## 4.7 `daily_report_item_tags` tenant整合性trigger

```sql
create or replace function public.validate_daily_report_item_tags_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_item_clinic_id uuid;
begin
  select clinic_id
  into v_item_clinic_id
  from public.daily_report_items
  where id = new.daily_report_item_id;

  if not found then
    raise exception 'daily_report_items.id not found' using errcode = '23503';
  end if;

  if v_item_clinic_id <> new.clinic_id then
    raise exception 'daily_report_item_tags.daily_report_item_id clinic mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_report_item_tags_ref_check
on public.daily_report_item_tags;

create trigger daily_report_item_tags_ref_check
before insert or update on public.daily_report_item_tags
for each row execute function public.validate_daily_report_item_tags_refs();

drop trigger if exists update_daily_report_item_tags_updated_at
on public.daily_report_item_tags;

create trigger update_daily_report_item_tags_updated_at
before update on public.daily_report_item_tags
for each row execute function public.update_updated_at_column();
```

### Function権限

```sql
revoke execute on function public.validate_daily_report_item_tags_refs()
from public, anon, authenticated;

grant execute on function public.validate_daily_report_item_tags_refs()
to service_role;
```

---

## 4.8 `daily_report_item_tags` RLS / grants

```sql
alter table public.daily_report_item_tags enable row level security;

drop policy if exists "daily_report_item_tags_select_for_staff"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_select_for_staff"
on public.daily_report_item_tags
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "daily_report_item_tags_insert_for_staff"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_insert_for_staff"
on public.daily_report_item_tags
for insert
to authenticated
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "daily_report_item_tags_update_for_staff"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_update_for_staff"
on public.daily_report_item_tags
for update
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "daily_report_item_tags_delete_for_managers"
on public.daily_report_item_tags;

create policy "daily_report_item_tags_delete_for_managers"
on public.daily_report_item_tags
for delete
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager']
  )
  and app_private.can_access_clinic(clinic_id)
);

grant select, insert, update, delete on table public.daily_report_item_tags to authenticated;
grant all on table public.daily_report_item_tags to service_role;
```

---

## 4.9 集計view

新規viewは必ず `security_invoker = true`。

```sql
create or replace view public.daily_report_revenue_context_summary
with (security_invoker = true)
as
select
  dri.clinic_id,
  dri.report_date,
  dri.revenue_context_code,
  rc.name as revenue_context_name,
  rc.rollup_category,
  count(*)::integer as item_count,
  coalesce(sum(dri.fee), 0)::numeric(10,2) as total_revenue,
  count(*) filter (where dri.estimate_status = 'needs_review')::integer as needs_review_count,
  count(*) filter (where dri.estimate_status = 'blocked')::integer as blocked_count
from public.daily_report_items dri
join public.revenue_contexts rc
  on rc.code = dri.revenue_context_code
where rc.is_analysis_target = true
group by
  dri.clinic_id,
  dri.report_date,
  dri.revenue_context_code,
  rc.name,
  rc.rollup_category;
```

### grants

```sql
grant select on public.daily_report_revenue_context_summary to authenticated;
grant select on public.daily_report_revenue_context_summary to service_role;
```

---

# 5. Phase 1 API仕様

---

## 5.1 TypeScript types

```ts
export type BillingType = 'insurance' | 'private';

export type RevenueContextCode =
  | 'insurance'
  | 'private'
  | 'traffic_accident'
  | 'workers_comp'
  | 'product'
  | 'ticket'
  | 'mixed'
  | 'other';

export type RevenueContextSource =
  | 'derived'
  | 'manual'
  | 'override'
  | 'system';

export type AmountSource =
  | 'menu_price'
  | 'manual'
  | 'estimate'
  | 'override'
  | 'reservation';

export type EstimateStatus =
  | 'not_calculated'
  | 'calculated'
  | 'needs_review'
  | 'blocked'
  | 'overridden';
```

---

## 5.2 互換ルール

```ts
export function deriveLegacyBillingType(
  revenueContextCode: RevenueContextCode
): BillingType {
  return revenueContextCode === 'insurance' ? 'insurance' : 'private';
}

export function deriveRevenueContextCodeFromBillingType(
  billingType: BillingType
): RevenueContextCode {
  return billingType === 'insurance' ? 'insurance' : 'private';
}
```

### 矛盾判定

```ts
export function assertBillingTypeCompatible(
  billingType: BillingType | undefined,
  revenueContextCode: RevenueContextCode | undefined
): void {
  if (!billingType || !revenueContextCode) return;

  const derived = deriveLegacyBillingType(revenueContextCode);

  if (billingType !== derived) {
    throw new Error('billingType and revenueContextCode are incompatible');
  }
}
```

### 許可/拒否

| 入力 | 結果 |
|---|---|
| `billingType=insurance`, `revenueContextCode=insurance` | OK |
| `billingType=private`, `revenueContextCode=private` | OK |
| `billingType=private`, `revenueContextCode=traffic_accident` | OK |
| `billingType=private`, `revenueContextCode=workers_comp` | OK |
| `billingType=private`, `revenueContextCode=product` | OK |
| `billingType=private`, `revenueContextCode=ticket` | OK |
| `billingType=insurance`, `revenueContextCode=traffic_accident` | 400 |
| `billingType=private`, `revenueContextCode=insurance` | 400 |
| `revenueContextCode=mixed` | Phase 1 UI/APIでは原則400 |

---

## 5.3 `/api/daily-reports/items`

### 更新対象

```txt
src/app/api/daily-reports/items/route.ts
```

### ITEM_SELECT追加

```ts
const ITEM_SELECT =
  'id, clinic_id, daily_report_id, report_date, reservation_id, customer_id, menu_id, staff_resource_id, patient_name, treatment_name, duration_minutes, fee, billing_type, revenue_context_code, revenue_context_source, amount_source, estimate_status, payment_method_id, next_reservation_start_time, next_reservation_end_time, next_reservation_id, source, notes, created_at, updated_at, created_by, updated_by';
```

### DTO追加

```ts
const revenueContextSchema = z.enum([
  'insurance',
  'private',
  'traffic_accident',
  'workers_comp',
  'product',
  'ticket',
  'other',
]);

const itemCreateSchema = z.object({
  // existing...
  billingType: billingTypeSchema.default('private'),
  revenueContextCode: revenueContextSchema.optional(),
  tagCodes: z.array(z.string()).max(20).optional(),
}).strict();

const itemUpdateSchema = z.object({
  // existing...
  billingType: billingTypeSchema.optional(),
  revenueContextCode: revenueContextSchema.optional(),
  tagCodes: z.array(z.string()).max(20).optional(),
}).strict();
```

Phase 1では `tagCodes` の同一トランザクション処理は行わない。  
tagsは専用endpointで処理する。

### POST挙動

1. `revenueContextCode` が未指定なら `billingType` から導出
2. `billingType` と `revenueContextCode` が矛盾したら400
3. `billing_type` は `deriveLegacyBillingType(revenueContextCode)`
4. `revenue_context_source` は手動POSTなら `manual`
5. `amount_source` は明示がなければ `manual`

```ts
const revenueContextCode =
  dto.revenueContextCode ??
  deriveRevenueContextCodeFromBillingType(dto.billingType);

const billingType = deriveLegacyBillingType(revenueContextCode);
```

insert payload。

```ts
const insertPayload: DailyReportItemInsert = {
  // existing...
  billing_type: billingType,
  revenue_context_code: revenueContextCode,
  revenue_context_source: 'manual',
  amount_source: dto.reservationId ? 'reservation' : 'manual',
  estimate_status: 'not_calculated',
};
```

### PATCH挙動

`revenueContextCode` が変更された場合。

```ts
updatePayload.revenue_context_code = dto.revenueContextCode;
updatePayload.billing_type = deriveLegacyBillingType(dto.revenueContextCode);
updatePayload.revenue_context_source = 'manual';
```

`billingType` だけが変更された場合は、従来互換として `revenue_context_code` も `insurance/private` に同期する。

```ts
if (dto.billingType !== undefined && dto.revenueContextCode === undefined) {
  updatePayload.billing_type = dto.billingType;
  updatePayload.revenue_context_code =
    deriveRevenueContextCodeFromBillingType(dto.billingType);
  updatePayload.revenue_context_source = 'manual';
}
```

### Response追加

```ts
type DailyReportItemApi = {
  // existing...
  billingType: BillingType;
  revenueContextCode: RevenueContextCode;
  revenueContextSource: RevenueContextSource;
  amountSource: AmountSource;
  estimateStatus: EstimateStatus;
};
```

---

## 5.4 `/api/daily-reports/items/:id/tags`

### POST

```txt
POST /api/daily-reports/items/:id/tags
```

body。

```ts
{
  clinic_id: string;
  tagCode: string;
  note?: string | null;
}
```

処理。

1. `processClinicScopedBody`
2. item存在確認
3. tag definition存在確認
4. `daily_report_item_tags` upsert
5. `created_by` / `updated_by` 設定

### DELETE

```txt
DELETE /api/daily-reports/items/:id/tags/:tagCode?clinic_id=...
```

処理。

1. `processApiRequest`
2. item存在確認
3. tag削除
4. manager以上でなくても自分が付けたタグの削除を許可するかはPhase 1では未実装
5. Phase 1ではRLS上はstaff deleteを許可しないため、API側ではmanager以上に絞る

---

## 5.5 `/api/revenue` GET

### 追加レスポンス型

```ts
export type RevenueContextSummary = {
  code: RevenueContextCode;
  name: string;
  rollupCategory: string;
  totalRevenue: number;
  itemCount: number;
  needsReviewCount: number;
  blockedCount: number;
};

export interface RevenueAnalysisData {
  // existing...
  revenueContextSummary: RevenueContextSummary[];
  trafficAccidentRevenue: number;
  workersCompRevenue: number;
  ticketRevenue: number;
  productRevenue: number;
}
```

### 取得元

既存。

```txt
daily_reports
daily_report_items
```

追加。

```txt
daily_report_revenue_context_summary
```

### 集計ロジック

```ts
const contextSummary = buildRevenueContextSummary(
  revenueContextRows
);

const responseData: RevenueAnalysisData = {
  // existing...
  revenueContextSummary: contextSummary,
  trafficAccidentRevenue: sumByCode(contextSummary, 'traffic_accident'),
  workersCompRevenue: sumByCode(contextSummary, 'workers_comp'),
  ticketRevenue: sumByCode(contextSummary, 'ticket'),
  productRevenue: sumByCode(contextSummary, 'product'),
};
```

既存の `insuranceRevenue` / `selfPayRevenue` は `daily_reports` 由来のまま維持する。

---

## 5.6 `/api/revenue` POST

現行POSTは旧 `revenues` テーブルへinsertしており、SSOT方針と矛盾する。  
Phase 1で停止する。

```ts
export async function POST() {
  return NextResponse.json(
    {
      error:
        'POST /api/revenue is deprecated. Use /api/daily-reports/items instead.',
    },
    { status: 410 }
  );
}
```

---

# 6. Phase 1 UI仕様

## 6.1 日報明細UI

対象。

```txt
src/app/(app)/daily-reports/input/page.tsx
```

### 追加表示

各明細に以下を表示。

```txt
売上文脈 dropdown
タグ badge
要確認 badge
```

### 売上文脈 dropdown

表示対象。

```txt
insurance
private
traffic_accident
workers_comp
product
ticket
other
```

非表示。

```txt
mixed
```

### UX

- 予約由来の行は初期状態で `derived`
- 手動変更したら `revenue_context_source='manual'`
- 手動変更済み行には小さく「手動分類」badgeを出す
- `traffic_accident` / `workers_comp` 選択時は `TRAFFIC_ACCIDENT_REVIEW` / `WORKERS_COMP_REVIEW` tag追加導線を出す
- Phase 1では自動tag付与はしない。ユーザー操作で付与する

---

## 6.2 Revenue UI

対象。

```txt
src/app/(app)/revenue/page.tsx
src/hooks/useRevenue.ts
```

### 追加カード

```txt
交通事故売上
労災売上
物販売上
回数券売上
要確認件数
ブロック件数
```

### 追加表

```txt
売上文脈別サマリ
```

columns。

```txt
分類
ロールアップ
件数
売上
要確認
ブロック
```

---

# 7. TypeScript更新対象

必須。

```txt
src/types/supabase.ts
src/types/api.ts
src/app/api/daily-reports/items/route.ts
src/app/api/daily-reports/items/[id]/tags/route.ts
src/app/api/daily-reports/items/[id]/tags/[tagCode]/route.ts
src/app/api/revenue/route.ts
src/hooks/useRevenue.ts
src/app/(app)/daily-reports/input/page.tsx
src/app/(app)/revenue/page.tsx
src/__tests__/api/daily-report-items-route.test.ts
src/__tests__/api/revenue-api.test.ts
```

### `src/types/supabase.ts`

手編集ではなく生成する。

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

その後。

```bash
npm run type-check
npm test -- revenue
npm test -- daily-report-items
```

---

# 8. Phase 1 migration test仕様

## 8.1 migration文字列テスト

```ts
expect(sql).toContain('create table if not exists public.revenue_contexts');
expect(sql).toContain('add column if not exists revenue_context_code text');
expect(sql).toContain('add column if not exists revenue_context_source text');
expect(sql).toContain('alter column revenue_context_code set not null');
expect(sql).toContain('with (security_invoker = true)');
expect(sql).toContain('app_private.can_access_clinic(clinic_id)');
expect(sql).toContain('validate_daily_report_item_tags_refs');
expect(sql).toContain('sync_arrived_reservation_daily_report_item');
expect(sql).toContain("revenue_context_source in ('manual', 'override')");
expect(sql).toContain('POST /api/revenue is deprecated');
```

禁止。

```ts
expect(sql).not.toContain(
  "add column if not exists revenue_context_code text not null default 'private'"
);
expect(sql).not.toContain('public.can_access_clinic(clinic_id)');
expect(sql).not.toContain('security_invoker = false');
```

---

## 8.2 DB smoke test

ローカルDBで以下を検証する。

```bash
supabase db reset --local --no-seed
```

検証内容。

1. `revenue_contexts` seedが入る
2. 既存 `billing_type=insurance` 行の `revenue_context_code` が `insurance`
3. 既存 `billing_type=private` 行の `revenue_context_code` が `private`
4. `daily_report_revenue_context_summary` が読める
5. viewが他clinicデータを返さない
6. `daily_report_item_tags` の `clinic_id` 不一致insertが失敗する
7. `mixed` は `is_selectable=false`
8. `mixed` は view集計対象外

---

## 8.3 route test

### `/api/daily-reports/items`

追加。

```txt
POST revenueContextCode=traffic_accident を登録できる
traffic_accident は billing_type=private に丸められる
revenueContextCode=insurance は billing_type=insurance になる
billingType=insurance + revenueContextCode=traffic_accident は400
billingType=private + revenueContextCode=insurance は400
GET が revenueContextCode / revenueContextSource / amountSource / estimateStatus を返す
PATCH で workers_comp に変更できる
PATCH で revenueContextCode変更時 revenue_context_source='manual' になる
mixed は400
```

### `/api/revenue`

追加。

```txt
GET が revenueContextSummary を返す
trafficAccidentRevenue が summary から計算される
workersCompRevenue が summary から計算される
productRevenue が summary から計算される
ticketRevenue が summary から計算される
POST は410を返す
POST は revenues table にinsertしない
```

---

## 8.4 E2E

Phase 1 E2E。

1. LINE/通常予約を作成
2. `arrived` にする
3. `daily_report_items` が自動生成される
4. `revenue_context_code` が保険/自費に正しく入る
5. 明細を `traffic_accident` に変更
6. `TRAFFIC_ACCIDENT_REVIEW` tagを付ける
7. 本部 revenue context summary に交通事故売上が出る
8. 他clinicユーザーから見えない
9. 予約の `notes` を更新する
10. `traffic_accident` が `insurance/private` に戻らない
11. `revenue_context_source='manual'` が維持される

9〜11は必須。  
ここが通らない実装はマージ不可。

---

# Phase 2 詳細仕様

---

## 9. care episode / visit stage

Phase 2は患者単位の長期分析を入れる。  
ただし `patients` ではなく現行 `customers` を起点にする。

## 9.1 `care_episodes`

```sql
create table if not exists public.care_episodes (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  customer_id uuid not null,
  episode_name text,
  primary_problem_text text,
  started_on date not null,
  ended_on date,
  status text not null default 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint care_episodes_pkey primary key (id),
  constraint care_episodes_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint care_episodes_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete cascade,
  constraint care_episodes_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint care_episodes_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint care_episodes_status_check
    check (status in ('active', 'paused', 'completed', 'cancelled')),
  constraint care_episodes_date_check
    check (ended_on is null or ended_on >= started_on)
);
```

## 9.2 `visit_stage_definitions`

```sql
create table if not exists public.visit_stage_definitions (
  code text primary key,
  name text not null,
  ordinal integer not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Seed。

```sql
insert into public.visit_stage_definitions (
  code,
  name,
  ordinal,
  description,
  sort_order
)
values
  ('first_visit', '初診', 1, 'episode内の初回来院', 10),
  ('second_visit', '2回目', 2, 'episode内の2回目来院', 20),
  ('third_visit', '3回目', 3, 'episode内の3回目来院', 30),
  ('fifth_visit', '5回目', 5, 'episode内の5回目来院', 50),
  ('repeat', '継続', 999, '継続来院', 999)
on conflict (code) do update set
  name = excluded.name,
  ordinal = excluded.ordinal,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();
```

## 9.3 `daily_report_items` 拡張

```sql
alter table public.daily_report_items
  add column if not exists care_episode_id uuid,
  add column if not exists visit_ordinal_in_episode integer,
  add column if not exists visit_stage_code text;
```

Constraints。

```sql
alter table public.daily_report_items
  drop constraint if exists daily_report_items_care_episode_id_fkey,
  add constraint daily_report_items_care_episode_id_fkey
    foreign key (care_episode_id)
    references public.care_episodes(id)
    on delete set null;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_visit_stage_code_fkey,
  add constraint daily_report_items_visit_stage_code_fkey
    foreign key (visit_stage_code)
    references public.visit_stage_definitions(code);

alter table public.daily_report_items
  drop constraint if exists daily_report_items_visit_ordinal_check,
  add constraint daily_report_items_visit_ordinal_check
    check (
      visit_ordinal_in_episode is null
      or visit_ordinal_in_episode >= 1
    );
```

## 9.4 `validate_daily_report_items_analysis_refs()`

care episodeとitemのclinic/customer整合性を検証する。

```sql
create or replace function public.validate_daily_report_items_analysis_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_episode_clinic_id uuid;
  v_episode_customer_id uuid;
begin
  if new.care_episode_id is not null then
    select clinic_id, customer_id
    into v_episode_clinic_id, v_episode_customer_id
    from public.care_episodes
    where id = new.care_episode_id;

    if not found then
      raise exception 'care_episodes.id not found' using errcode = '23503';
    end if;

    if v_episode_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.care_episode_id clinic mismatch' using errcode = '23514';
    end if;

    if new.customer_id is not null and v_episode_customer_id <> new.customer_id then
      raise exception 'daily_report_items.care_episode_id customer mismatch' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
```

Trigger。

```sql
drop trigger if exists daily_report_items_analysis_ref_check
on public.daily_report_items;

create trigger daily_report_items_analysis_ref_check
before insert or update on public.daily_report_items
for each row execute function public.validate_daily_report_items_analysis_refs();
```

## 9.5 API

```txt
POST /api/care-episodes
PATCH /api/care-episodes/:id
POST /api/daily-reports/items/:id/care-episode
POST /api/care-episodes/recalculate-visit-stages
```

Phase 2で出す指標。

```txt
初診2回目到達率
初診5回目到達率
episode継続率
episode平均売上
episode平均来院回数
```

---

# Phase 3 詳細仕様

---

## 10. revenue estimates

Phase 3では療養費/売上見込みを扱う。  
ただし「請求確定額」ではなく、経営分析用の概算として扱う。

UI固定文言。

```txt
経営分析用の概算です。請求確定額ではありません。
```

---

## 10.1 `revenue_estimates`

```sql
create table if not exists public.revenue_estimates (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  daily_report_item_id uuid not null,
  revenue_context_code text not null,
  estimate_status text not null default 'not_calculated',
  estimated_total numeric(10,2) not null default 0,
  disclaimer text not null default '経営分析用の概算です。請求確定額ではありません。',
  calculated_at timestamptz,
  calculation_version text not null default 'v1',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint revenue_estimates_pkey primary key (id),
  constraint revenue_estimates_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimates_item_id_fkey
    foreign key (daily_report_item_id) references public.daily_report_items(id) on delete cascade,
  constraint revenue_estimates_context_fkey
    foreign key (revenue_context_code) references public.revenue_contexts(code),
  constraint revenue_estimates_status_check
    check (estimate_status in (
      'not_calculated',
      'calculated',
      'needs_review',
      'blocked',
      'overridden'
    )),
  constraint revenue_estimates_unique_item
    unique (daily_report_item_id)
);
```

---

## 10.2 `revenue_estimate_lines`

```sql
create table if not exists public.revenue_estimate_lines (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  revenue_estimate_id uuid not null,
  line_type text not null,
  label text not null,
  quantity numeric(10,2) not null default 1,
  unit_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),

  constraint revenue_estimate_lines_pkey primary key (id),
  constraint revenue_estimate_lines_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimate_lines_estimate_id_fkey
    foreign key (revenue_estimate_id) references public.revenue_estimates(id) on delete cascade
);
```

---

## 10.3 `revenue_estimate_warnings`

```sql
create table if not exists public.revenue_estimate_warnings (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  revenue_estimate_id uuid not null,
  warning_code text not null,
  severity text not null default 'warning',
  message text not null,
  created_at timestamptz not null default now(),

  constraint revenue_estimate_warnings_pkey primary key (id),
  constraint revenue_estimate_warnings_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimate_warnings_estimate_id_fkey
    foreign key (revenue_estimate_id) references public.revenue_estimates(id) on delete cascade,
  constraint revenue_estimate_warnings_severity_check
    check (severity in ('info', 'warning', 'needs_review', 'blocked'))
);
```

---

## 10.4 `revenue_estimate_overrides`

```sql
create table if not exists public.revenue_estimate_overrides (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  revenue_estimate_id uuid not null,
  previous_amount numeric(10,2),
  override_amount numeric(10,2) not null,
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint revenue_estimate_overrides_pkey primary key (id),
  constraint revenue_estimate_overrides_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint revenue_estimate_overrides_estimate_id_fkey
    foreign key (revenue_estimate_id) references public.revenue_estimates(id) on delete cascade,
  constraint revenue_estimate_overrides_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null
);
```

---

## 10.5 Phase 3 tenant整合性trigger

対象。

```txt
revenue_estimates
revenue_estimate_lines
revenue_estimate_warnings
revenue_estimate_overrides
```

必須条件。

```txt
子テーブルの clinic_id は親 revenue_estimates.clinic_id と一致
revenue_estimates.clinic_id は daily_report_items.clinic_id と一致
```

このtriggerなしで実装してはいけない。

---

## 10.6 Phase 3 計算対象

初期対応。

```txt
自費: manual/feeベース
物販: manual/feeベース
回数券: manual/feeベース
交通事故: needs_review warning付き概算
労災: needs_review warning付き概算
保険: 鍼灸1術/2術・初検/継続から開始
```

Phase 3では法令・制度の完全対応を目指さない。  
「請求確定ではなく、経営分析上の見込み」であることをUI/API/DB disclaimerで固定する。

---

# 11. Auth / Enterprise補助線

## 11.1 Supabase Custom OAuth/OIDC Providers

初期MVPでは実装しない。  
Enterprise導入時の拡張余地として仕様に残す。

### 方針

```txt
外部IdP = 本人確認・ログイン入口
Tiramisu = 院権限・本部権限・tenant境界の正
```

外部IdP claimをそのままRLS判定に使わない。

### 設計

```txt
Supabase Auth user
  ↓ JWT app_metadata
app_private.get_current_role()
app_private.get_current_clinic_id()
app_private.can_access_clinic()
  ↓
RLS tenant boundary
```

### Custom Provider導入時の必須DoD

```txt
provider identifier は custom:<idp-name>
PKCEは原則有効
email optionalは原則false
外部IdP claimを直接clinic権限に使わない
profiles / user_permissions / clinic_scope_ids へ正規化する
provider secret rotation手順をdocsに残す
provider削除時の既存ユーザー影響をdocsに残す
E2Eで外部IdPログイン後にRLS境界が破れないことを検証する
```

---

## 11.2 将来DB候補: `auth_identity_provider_links`

初期MVPでは追加しない。

Enterprise対応時に追加候補。

```sql
create table if not exists public.auth_identity_provider_links (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  user_id uuid not null,
  provider_identifier text not null,
  external_subject text not null,
  external_email text,
  external_claims jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),

  constraint auth_identity_provider_links_pkey primary key (id),
  constraint auth_identity_provider_links_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint auth_identity_provider_links_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint auth_identity_provider_links_provider_subject_unique
    unique (provider_identifier, external_subject)
);
```

これは監査・紐付け用。  
RLS権限判定の正にはしない。

---

# 12. Supabase ISO / セキュリティ営業表現

## 12.1 位置づけ

Supabaseのセキュリティ認証は、Tiramisuの営業・調達説明で信用補強になる。  
ただし、それはTiramisu自体のISO認証ではない。

## 12.2 使ってよい表現

```txt
Tiramisuは、セキュリティ認証を取得しているSupabase基盤上で、
PostgreSQL/RLS/Auth/Storage/Edge Functions等を利用して構築します。

Tiramisu側では、RLSによるtenant境界、監査ログ、権限管理、
バックアップ/復旧手順を個別に整備します。
```

より厳密な商談時表現。

```txt
基盤として利用しているSupabaseは、ISO 27001等のセキュリティ認証情報を公開しています。
証明書の版・適用範囲は、商談・調達時点のSupabase公式情報または証明書原本に基づき確認します。
```

## 12.3 禁止表現

```txt
TiramisuはISO 27001認証済みです。
Tiramisuは医療情報管理として完全準拠しています。
療養費・請求・個人情報管理はすべて保証済みです。
Supabaseが認証済みなのでTiramisuも認証済みです。
```

---

# 13. Rollback方針

Rollbackは破壊的である。  
本番適用後に安易に実行しない。

## Phase 1 rollback順序

```txt
1. drop view daily_report_revenue_context_summary
2. drop triggers for daily_report_item_tags
3. drop function validate_daily_report_item_tags_refs()
4. drop daily_report_item_tags
5. drop daily_report_item_tag_definitions
6. remove constraints/indexes from daily_report_items
7. drop columns:
   - revenue_context_code
   - revenue_context_source
   - amount_source
   - estimate_status
8. drop revenue_contexts
9. restore sync_arrived_reservation_daily_report_item() previous definition
```

注意。  
`daily_report_items` の追加列をdropすると、分類データは消える。  
本番rollback前には必ずdumpを取る。

---

# 14. DoD

## 14.1 DB DoD

```bash
supabase db reset --local --no-seed
npx supabase db push --local
```

成功条件。

```txt
全migrationが順序通り再生できる
RLS helperは app_private を参照している
viewは security_invoker = true
手動分類が予約更新で戻らない
tenant mismatch triggerが効く
```

## 14.2 TypeScript DoD

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
npm run type-check
npm test -- daily-report-items
npm test -- revenue
```

成功条件。

```txt
any / as any を増やさない
型生成後にAPI routeが通る
RevenueAnalysisData が旧UIと互換
```

## 14.3 E2E DoD

```bash
npx playwright test
```

最低限。

```txt
予約作成
arrived変更
daily_report_items自動生成
売上文脈変更
タグ付与
revenue summary反映
他clinic不可視
予約更新後も手動分類維持
```

---

# 15. Codex実装指示

以下の順で実装する。

```txt
1. Phase 1 migration作成
2. rollback作成
3. migration文字列テスト作成
4. supabase db reset --local --no-seed
5. src/types/supabase.ts再生成
6. /api/daily-reports/items 更新
7. tag endpoints 作成
8. /api/revenue GET拡張・POST停止
9. useRevenue / revenue page 更新
10. daily report input UI 更新
11. route test追加
12. E2E追加
13. npm run type-check
14. npm test
15. Playwright対象テスト
```

実装時の禁止。

```txt
billing_typeを多値化しない
public.can_access_clinicで新規RLSを書かない
mixedをPhase 1 UIに出さない
予約triggerでmanual/override分類を上書きしない
/api/revenue POSTでrevenues tableに書かない
src/types/supabase.tsを手編集で済ませない
```

---

# 16. 最終結論

Phase 1は実装してよい。  
売上分類はTiramisuの本部向け価値を明確に押し上げる。

ただし、Phase 1の勝ち筋は「DBにカラムを足すこと」ではない。

勝ち筋は以下。

```txt
予約 → 来院済み → 日報明細 → 売上文脈分類 → 本部集計
```

この流れを壊さず、現場が手動で補正した分類を守り、本部が文脈別売上を見られる状態を最短で作ること。

Phase 2/3は後でよい。  
特に療養費見込みは、請求確定と誤認されると法務・評判リスクが高い。  
まずはPhase 1で「売上文脈の見える化」を完成させる。

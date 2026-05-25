# Tiramisu Phase 4A 仕様書 v0.1

## メニュー課金プロファイル・患者別保険設定・売上内訳スナップショット

| 項目 | 内容 |
|---|---|
| 対象プロダクト | Tiramisu / `IFs1991/seikotsuin_no_saas` |
| 対象ブランチ | `main` |
| 作成日 | 2026-05-25 |
| ステータス | 実装前設計案 / TDD 起点仕様 |
| フェーズ名 | **Phase 4A: Menu Billing Profiles, Patient Coverage Defaults & Revenue Breakdown Snapshots** |
| 主目的 | 保険・自費・交通事故・労災の金額入力を業務運用に接続し、日報時点の売上見込み内訳を改定非影響の snapshot として保存する |

---

## 1. 要約

Phase 3A〜3C により、制度マスタ、見積 calculation、revenue 表示、柔道整復・健康保険の令和6年現行マスタ seed が導入された。Phase 4A では、これを実運用のメニュー選択・患者負担割合・日報・売上見込みへ接続する。

本フェーズで採用する設計判断は以下である。

1. `menu_templates` / `menus` は既存資産として維持し、新規に **課金プロファイル** を追加する。
2. 健康保険の患者負担額は、料金表に 0割/1割/2割/3割の固定額として保存せず、制度マスタ由来の算定総額と患者別負担割合から都度計算する。
3. 再来患者については、`customers` に紐づく **有効期間付き患者別保険設定** を自動初期値として利用する。
4. 日報の金額確定時点で、患者負担見込み・保険者請求見込み・自費・要確認概算の内訳を snapshot 保存する。
5. 料金マスタや患者設定の後日変更で、過去の確定済 snapshot を自動変更しない。
6. 交通事故・労災は Phase 4A では手入力概算かつ `needs_review` とし、請求確定額に見せない。
7. 正確性と速度の双方を守るため、TDD と atomic pricing confirmation を採用する。

---

## 2. 現行実装で確認済みの事実

> この章は現行 `main` の確認結果であり、提案ではない。

### 2.1 メニュー継承基盤は既に存在する

確認ファイル:

- `docs/stabilization/spec-menu-template-inheritance-v0.1.md`
- `supabase/migrations/20260425000100_menu_template_inheritance.sql`
- `src/app/api/menu-templates/route.ts`
- `src/app/api/menu-templates/import/route.ts`
- `src/app/api/menus/route.ts`
- `src/app/api/menus/schema.ts`

現行構造:

```text
menu_templates                         # 親院/単独院が所有する共通メニュー
  ↓ import 時にコピー
menus                                  # 院所有の実運用メニュー
  ↓ 以後は院ごとに独立編集
reservation / daily_report_items
```

現行は「標準テンプレートを参照し続ける override 型」ではなく「取り込み時コピー型」である。Phase 4A ではこの方針を維持し、既存の import 動線を壊さない。

### 2.2 現行メニュー価格は単一金額である

`menu_templates` および `menus` は、主に以下を保持する。

```text
price
is_insurance_applicable
options
```

患者負担額・保険者請求見込み・交通事故概算・労災概算のような金額内訳は、現在の `price` 一つでは表現できない。

### 2.3 日報明細は売上入力の基盤である

確認ファイル:

- `docs/stabilization/spec-daily-report-items-v0.1.md`
- `supabase/migrations/20260507000100_daily_report_items.sql`
- `supabase/migrations/20260514000100_revenue_context_phase1.sql`
- `src/app/api/daily-reports/items/route.ts`

現在の `daily_report_items` は以下を保持する。

```text
clinic_id
customer_id
menu_id
fee
billing_type
revenue_context_code
revenue_context_source
amount_source
estimate_status
```

予約が `arrived` になると、`sync_arrived_reservation_daily_report_item()` により明細が作成または更新される。現行の金額解決順は概ね以下である。

```text
reservation.actual_price
  → reservation.price
  → menus.price + selected_options.priceDelta
  → 0
```

また、`daily_report_items` の insert/update/delete 後に `daily_reports` の集計更新 trigger が動作する。

### 2.4 revenue estimate 基盤は既に存在する

確認ファイル:

- `supabase/migrations/20260514000300_revenue_estimates_phase3.sql`
- `src/lib/revenue-estimate.ts`
- `src/app/api/revenue-estimates/recalculate/route.ts`
- `src/app/api/revenue/route.ts`
- `src/__tests__/lib/revenue-estimate.test.ts`
- `src/__tests__/api/revenue-estimates-recalculate-route.test.ts`

現行には以下が存在する。

```text
revenue_estimates
revenue_estimate_lines
revenue_estimate_warnings
revenue_estimate_overrides
daily_report_revenue_estimate_summary
```

ただし、現行 `calculateRevenueEstimate()` は `daily_report_items.fee` の単一額を一行の見込みとして扱う。患者負担見込みと保険者請求見込みの分解は未実装である。

### 2.5 公式療養費マスタは制度根拠層である

確認ファイル:

- `supabase/migrations/20260521000100_insurance_fee_system_master_phase3a.sql`
- `supabase/migrations/20260524000100_seed_judo_hi_r6_active_master.sql`
- `docs/stabilization/spec-insurance-fee-system-master-phase3a2-v0.9.md`
- `docs/stabilization/spec-revenue-estimate-fee-item-link-phase3b-v0.9.md`

現行制度マスタ:

```text
insurance_fee_sources
insurance_fee_source_snapshots
insurance_fee_schedules
insurance_fee_items
insurance_fee_warning_definitions
insurance_fee_revision_diffs
```

この層は出典、適用期間、lock、source snapshot hash、自動計算可否を保持する。自費価格や院別運用価格をここへ保存してはならない。

### 2.6 患者 SSOT は `public.customers` である

確認ファイル:

- `docs/stabilization/spec-customers-ssot-step1-v0.1.md`
- `src/app/api/customers/route.ts`
- `src/app/api/customers/schema.ts`

`public.patients` はレガシー読み取り用途であり、新規・更新は `/api/customers` を経由し `public.customers` に集約する方針である。患者別保険設定は `customers` に紐づける。

---

## 3. 解決したい業務課題

### 3.1 初回来院時

保険施術患者について、受付または施術者が次を選択しなければならない。

```text
売上区分: 健康保険
患者負担割合: 0割 / 1割 / 2割 / 3割
施術メニュー
```

この入力を元に、患者負担見込みと保険者請求見込みを計算し、当日の日報に保存する必要がある。

### 3.2 再来院時

同一患者について毎回来院時に負担割合を選ぶのは、入力工数と誤選択リスクがある。患者ごとの現在有効な保険設定を自動候補として表示し、確認のみで金額確定できるようにする。

### 3.3 改定・変更後の過去データ保護

以下の変更後も、過去日報と過去 revenue snapshot は変えてはならない。

- 公式療養費マスタの改定
- 標準メニュー料金変更
- 院別料金変更
- 患者の負担割合変更
- 予約情報の後日修正

### 3.4 revenue 分析

院・本部が、以下を期間別に把握できる必要がある。

- 売上見込み合計
- 患者負担見込み
- 保険者請求見込み
- 自費売上見込み
- 交通事故概算
- 労災概算
- 要確認件数
- override 件数

---

## 4. 設計原則 / Invariants

本フェーズの実装とテストは、以下を不変条件として固定する。

| ID | 不変条件 |
|---|---|
| INV-01 | 公式制度マスタと院独自料金設定を同一テーブルで管理しない |
| INV-02 | 健康保険の0割/1割/2割/3割別固定金額を料金テンプレートに保存しない |
| INV-03 | 患者別負担割合は有効期間付きで保存し、永久固定属性にしない |
| INV-04 | 同一患者について同一日に有効な `confirmed` 健康保険設定は最大1件である |
| INV-05 | 再来時には現在有効な患者別保険設定を自動初期値として解決できる |
| INV-06 | 日報の金額確定時に採用した負担割合・課金プロファイル・計算内訳を snapshot 保存する |
| INV-07 | マスタや患者設定の後日変更で確定済み過去 snapshot を自動更新しない |
| INV-08 | 再計算は明示操作のみであり、override/confirmed の保護規則を持つ |
| INV-09 | 交通事故・Phase 4A 時点の労災は手入力概算かつ `needs_review` とする |
| INV-10 | tenant boundary を越えた患者設定・課金プロファイル・snapshot 参照を拒否する |
| INV-11 | 不要な列更新で日次合計の再集計 trigger を発火させない |
| INV-12 | 金額確定処理は中途半端な保存状態を作らない atomic command とする |

---

## 5. Scope / Non-Goals

### 5.1 Phase 4A Scope

- 標準メニューに対応する課金プロファイル定義
- 院別実運用メニューに対応する課金プロファイル定義
- 患者別健康保険設定（負担割合、有効期間、確認状態）
- 日報明細への coverage / pricing snapshot 入力保存
- 健康保険の患者負担見込み・保険者請求見込み内訳計算
- 自費の固定額計算
- 交通事故・労災の手入力概算と要確認表示
- 金額確定 API / atomic transaction
- revenue 内訳集計 view と API 表示
- RLS / 権限再設計
- TDD、E2E、性能 baseline / benchmark
- trigger 発火最適化、必要 index の追加

### 5.2 Non-Goals

- 請求確定処理
- 入金消込・未収金管理
- レセプト作成・送信
- オンライン資格確認連携
- 保険者番号・記号番号等の詳細資格情報管理
- 公費・助成制度の完全対応
- 交通事故の保険会社別請求計算
- 交通事故案件管理の完成形
- 労災の自動算定完成形
- 本部標準料金変更の既存院メニューへの自動伝播
- Redis、materialized view、partitioning 等の先行導入

---

## 6. 責務分離モデル

### 6.1 四層構造

| 層 | 正本データ | 責務 | 主な更新主体 |
|---|---|---|---|
| 制度マスタ層 | `insurance_fee_*` | 公式療養費、出典、適用期間、revision | system/admin 運用 |
| 標準課金テンプレート層 | `menu_templates` + 新規 billing profiles | 本部/標準の課金方式 | admin |
| 院別課金設定層 | `menus` + 新規 billing profiles | 院で使用する実価格・課金方式 | clinic_admin |
| 実績 snapshot 層 | `daily_report_items` + `revenue_estimates/lines` | 来院時点の採用条件と売上内訳 | 金額確定 command |

### 6.2 既存コピー型継承を維持する理由

既存 `menu_templates → menus` import は、テンプレートを取り込んだ後に院別独立編集するモデルである。Phase 4A はこれを維持し、billing profile も import 時に院別 profile としてコピーする。

```text
menu_template_billing_profiles
  ↓ import 時にコピー
menu_billing_profiles
  ↓ 日報確定時に参照
revenue snapshot
```

これにより、毎回来院時に「本部テンプレート + 院別差分」を動的解決する必要がなく、実装複雑性と read latency を抑える。

---

## 7. 金額種別と計算方針

### 7.1 課金方式

| `calculation_method` | 対象 | 金額解決 |
|---|---|---|
| `fixed_amount` | 自費・物販・回数券 | 院別 profile の固定金額 |
| `insurance_master` | 健康保険 | 公式療養費マスタから算定総額を解決し、患者負担割合で内訳計算 |
| `manual_estimate` | 交通事故・Phase 4A の労災・例外 | 入力金額を概算として保存し `needs_review` |

### 7.2 健康保険の負担割合

料金テンプレートに負担割合別金額を保存しない。

```text
公式算定総額 gross_estimated_total
× 患者負担割合 patient_burden_rate
= 患者負担見込み patient_copay_estimated

公式算定総額 gross_estimated_total
- 患者負担見込み patient_copay_estimated
= 保険者請求見込み insurer_receivable_estimated
```

> 丸め規則は実装前に制度根拠に基づき `calculation_version` とともに固定する。Phase 4A で曖昧な独自丸めを入れてはならない。

### 7.3 自費

自費は院別 profile の固定金額を用いる。

```text
private_revenue_estimated = fixed_amount_yen
```

### 7.4 交通事故

Phase 4A では自動算定しない。

```text
calculation_method = manual_estimate
estimate_status = needs_review
amount_role = traffic_accident_receivable_estimated
```

UI 上は必ず「概算」「要確認」「公式マスタ由来の自動請求額ではない」を表示する。

### 7.5 労災

制度マスタ構造上は将来の自動解決余地があるが、Phase 4A では安全側に倒す。

```text
calculation_method = manual_estimate
estimate_status = needs_review
amount_role = workers_comp_receivable_estimated
```

労災の自動算定は、公式 seed と計算条件テストが揃った後続フェーズに分離する。

---

## 8. 提案 DB 設計

> 以下は追加提案であり、現時点では未実装である。

### 8.1 `menu_template_billing_profiles`

標準メニューテンプレートに対する課金方式を保持する。

```sql
create table public.menu_template_billing_profiles (
  id uuid primary key default extensions.uuid_generate_v4(),
  owner_clinic_id uuid not null references public.clinics(id) on delete cascade,
  menu_template_id uuid not null references public.menu_templates(id) on delete cascade,

  revenue_context_code text not null references public.revenue_contexts(code),
  calculation_method text not null check (
    calculation_method in ('fixed_amount', 'insurance_master', 'manual_estimate')
  ),

  fixed_amount_yen numeric(10,2),
  default_patient_burden_rate integer check (
    default_patient_burden_rate is null
    or default_patient_burden_rate in (0, 10, 20, 30)
  ),
  profession_type text,
  requires_review boolean not null default false,

  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  is_deleted boolean not null default false,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint menu_template_billing_profiles_effective_range_check
    check (effective_to is null or effective_to >= effective_from),
  constraint menu_template_billing_profiles_fixed_amount_check
    check (fixed_amount_yen is null or fixed_amount_yen >= 0),
  constraint menu_template_billing_profiles_method_values_check
    check (
      (calculation_method = 'fixed_amount' and fixed_amount_yen is not null)
      or (calculation_method <> 'fixed_amount' and fixed_amount_yen is null)
    )
);
```

Index:

```sql
create index idx_menu_template_billing_profiles_resolve
on public.menu_template_billing_profiles (
  owner_clinic_id,
  menu_template_id,
  revenue_context_code,
  effective_from desc
)
where is_active = true and is_deleted = false;
```

### 8.2 `menu_billing_profiles`

院別の実運用メニューに対する課金方式を保持する。日報確定時の profile 解決は原則このテーブルから行う。

```sql
create table public.menu_billing_profiles (
  id uuid primary key default extensions.uuid_generate_v4(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  source_template_profile_id uuid references public.menu_template_billing_profiles(id) on delete set null,

  revenue_context_code text not null references public.revenue_contexts(code),
  calculation_method text not null check (
    calculation_method in ('fixed_amount', 'insurance_master', 'manual_estimate')
  ),

  fixed_amount_yen numeric(10,2),
  default_patient_burden_rate integer check (
    default_patient_burden_rate is null
    or default_patient_burden_rate in (0, 10, 20, 30)
  ),
  profession_type text,
  requires_review boolean not null default false,

  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  is_deleted boolean not null default false,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint menu_billing_profiles_effective_range_check
    check (effective_to is null or effective_to >= effective_from),
  constraint menu_billing_profiles_fixed_amount_check
    check (fixed_amount_yen is null or fixed_amount_yen >= 0),
  constraint menu_billing_profiles_method_values_check
    check (
      (calculation_method = 'fixed_amount' and fixed_amount_yen is not null)
      or (calculation_method <> 'fixed_amount' and fixed_amount_yen is null)
    )
);
```

Index:

```sql
create index idx_menu_billing_profiles_resolve
on public.menu_billing_profiles (
  clinic_id,
  menu_id,
  revenue_context_code,
  effective_from desc
)
where is_active = true and is_deleted = false;
```

### 8.3 `customer_insurance_coverages`

患者ごとの健康保険負担割合を、有効期間と確認状態付きで保持する。`customers.custom_attributes` に格納してはならない。

```sql
create table public.customer_insurance_coverages (
  id uuid primary key default extensions.uuid_generate_v4(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,

  payer_context_code text not null default 'insurance'
    check (payer_context_code = 'insurance'),

  patient_burden_rate integer not null
    check (patient_burden_rate in (0, 10, 20, 30)),

  effective_from date not null,
  effective_to date,

  verification_status text not null default 'confirmed'
    check (verification_status in ('confirmed', 'needs_review', 'expired', 'inactive')),

  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_insurance_coverages_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);
```

Current coverage lookup index:

```sql
create index idx_customer_insurance_coverages_current_lookup
on public.customer_insurance_coverages (
  clinic_id,
  customer_id,
  effective_from desc
)
where verification_status = 'confirmed';
```

#### 重複禁止

同一 `clinic_id` / `customer_id` について、同じ treatment date に複数の `confirmed` coverage が解決されてはならない。

実装候補:

- PostgreSQL exclusion constraint に date range を使用する方法
- または `before insert or update` trigger で期間 overlap を拒否する方法

受入条件:

```text
confirmed coverage の有効期間重複 insert/update は DB で拒否される。
```

### 8.4 `daily_report_items` 拡張

日報明細には、実施時点で採用した入力条件を保存する。

```sql
alter table public.daily_report_items
  add column menu_billing_profile_id uuid
    references public.menu_billing_profiles(id) on delete set null,
  add column customer_insurance_coverage_id uuid
    references public.customer_insurance_coverages(id) on delete set null,
  add column patient_burden_rate integer
    check (patient_burden_rate is null or patient_burden_rate in (0, 10, 20, 30)),
  add column coverage_resolution_source text
    check (
      coverage_resolution_source is null
      or coverage_resolution_source in ('customer_default', 'manual', 'recalculated')
    ),
  add column pricing_snapshot_status text not null default 'pending'
    check (
      pricing_snapshot_status in ('pending', 'confirmed', 'needs_review', 'recalculated')
    ),
  add column pricing_confirmed_at timestamptz;
```

Index:

```sql
create index idx_daily_report_items_coverage
on public.daily_report_items (
  clinic_id,
  customer_insurance_coverage_id
)
where customer_insurance_coverage_id is not null;
```

### 8.5 `revenue_estimate_lines` 拡張

既存 lines を売上内訳 snapshot に利用する。

```sql
alter table public.revenue_estimate_lines
  add column amount_role text;

alter table public.revenue_estimate_lines
  add constraint revenue_estimate_lines_amount_role_check
  check (
    amount_role is null
    or amount_role in (
      'gross_estimated_total',
      'patient_copay_estimated',
      'insurer_receivable_estimated',
      'private_revenue_estimated',
      'traffic_accident_receivable_estimated',
      'workers_comp_receivable_estimated',
      'adjustment'
    )
  );
```

Index:

```sql
create index idx_revenue_estimate_lines_amount_role
on public.revenue_estimate_lines (
  clinic_id,
  amount_role,
  revenue_estimate_id
);
```

### 8.6 Snapshot revision 方針

最低実装では既存 `revenue_estimates` の overwrite 設計を維持可能だが、明示再計算の監査性を強化するなら後続または同フェーズ後半で revision 化する。

推奨追加候補:

```sql
alter table public.revenue_estimates
  add column revision_no integer not null default 1,
  add column previous_estimate_id uuid references public.revenue_estimates(id),
  add column recalculation_reason text,
  add column superseded_at timestamptz;
```

Phase 4A MVP では、少なくとも以下を守る。

- マスタ変更では既存 estimate を自動再計算しない
- 患者 coverage 変更では既存 estimate を自動再計算しない
- confirmed / overridden 明細は自動同期で壊さない
- 明示再計算操作には理由入力を求める設計余地を残す

---

## 9. `daily_report_items.fee` の意味と移行方針

### 9.1 問題

現行は `daily_report_items.fee` を元に、日報合計・保険/自費合計・メニューランキングが構成されている。一方、Phase 4A の健康保険では、患者窓口負担と保険者請求見込みを分解する必要がある。

### 9.2 Phase 4A 方針

`fee` を直ちに売上内訳の正本へ再定義しない。

```text
daily_report_items.fee
  = 既存互換と日報入力上の基準金額

revenue_estimates / revenue_estimate_lines
  = 売上見込み内訳の正本
```

revenue UI では以下を明確に区別する。

- 入力ベース売上 / 既存集計
- 売上見込み合計
- 患者負担見込み
- 保険者請求見込み
- 自費売上見込み
- 要確認概算

### 9.3 後続検討

実入金・未収・請求確定を扱うフェーズでは、`fee` と売上/入金の意味を改めて分離する必要がある。Phase 4A でその全てを解決しようとしてはならない。

---

## 10. 金額確定フロー

### 10.1 予約 arrived 時

現行の予約到着 trigger は日報明細の下書き作成用途として残す。ただし Phase 4A では、金額確定済 snapshot を自動上書きしない。

```text
予約 status = arrived
  ↓
daily_report_items upsert
  - patient / menu / staff / duration 等を反映
  - pricing_snapshot_status = pending（未確定の場合）
  - 確定済みなら金額 snapshot を触らない
```

### 10.2 日報入力画面での確定

```text
日報明細表示
  ↓
患者 current coverage を解決
  ↓
院別 menu billing profile を解決
  ↓
健康保険なら負担割合を自動初期値表示
  ↓
スタッフ/権限者が確認または今回のみ変更
  ↓
「金額確定」
  ↓
revenue estimate / lines / warnings を atomic 保存
```

### 10.3 再来患者 UX

```text
患者を選択
  ↓
健康保険: 3割負担（確認済 / 有効期間内）を自動表示
  ↓
対応メニューを選択
  ↓
患者負担見込み・保険者請求見込みをプレビュー
  ↓
金額確定
```

### 10.4 期限切れまたは未確認患者 UX

```text
患者を選択
  ↓
「保険設定の確認が必要です」
前回設定: 3割負担（期限切れ）
  ↓
今回設定を確認して保存または今回のみ適用
```

### 10.5 今回のみ変更 / 患者設定更新

UI は以下を明確に分ける。

| 操作 | 今回の日報 | 患者 default |
|---|---:|---:|
| 今回のみ変更 | 更新 | 変更しない |
| 患者設定も更新 | 更新 | 新しい有効期間付き設定を登録/更新 |

---

## 11. API 設計

### 11.1 患者保険設定 API

候補 endpoint:

```text
GET    /api/customers/:customerId/insurance-coverages?clinic_id=...&date=YYYY-MM-DD
POST   /api/customers/:customerId/insurance-coverages
PATCH  /api/customers/:customerId/insurance-coverages/:coverageId
```

#### GET Response 例

```json
{
  "success": true,
  "data": {
    "current": {
      "id": "uuid",
      "patientBurdenRate": 30,
      "effectiveFrom": "2026-01-01",
      "effectiveTo": null,
      "verificationStatus": "confirmed",
      "verifiedAt": "2026-01-01T00:00:00Z"
    },
    "requiresReview": false,
    "previous": []
  }
}
```

### 11.2 課金プロファイル API

候補 endpoint:

```text
GET    /api/menu-templates/:id/billing-profiles?owner_clinic_id=...
POST   /api/menu-templates/:id/billing-profiles
PATCH  /api/menu-templates/:id/billing-profiles/:profileId

GET    /api/menus/:id/billing-profiles?clinic_id=...
POST   /api/menus/:id/billing-profiles
PATCH  /api/menus/:id/billing-profiles/:profileId
```

既存 `/api/menu-templates/import` の import 処理を拡張し、template menu だけでなく active billing profiles も `menu_billing_profiles` にコピーする。

### 11.3 金額確定 API

新設を推奨する。

```text
POST /api/daily-reports/items/:id/pricing/confirm
```

Request 例:

```json
{
  "clinic_id": "uuid",
  "dailyReportItemId": "uuid",
  "patientBurdenRateOverride": null,
  "manualEstimatedAmount": null,
  "updateCustomerCoverage": false,
  "confirmationNote": null
}
```

責務:

1. clinic scope と role を検証する
2. 日報明細を取得する
3. `pricing_snapshot_status` と override 状態を確認する
4. menu billing profile を treatment date で解決する
5. 健康保険なら current customer coverage または今回指定値を解決する
6. 公式療養費 schedule/items を必要に応じて解決する
7. calculation を行う
8. estimate / lines / warnings を保存する
9. 日報明細に profile / coverage / burden rate / status を snapshot 保存する
10. `updateCustomerCoverage = true` の場合のみ患者設定を更新する

### 11.4 明示再計算 API

既存 `/api/revenue-estimates/recalculate` の責務を見直す。

推奨方針:

- 未確定明細の初回確定には使用しない
- confirmed snapshot の再計算は manager 以上に限定
- `recalculationReason` を必須化する余地を持たせる
- overridden 明細は既存通り自動上書きしない

---

## 12. Atomic 書き込み設計

### 12.1 必要性

金額確定処理は以下をまとめて扱う。

```text
coverage 解決
billing profile 解決
official schedule/items 解決
estimate 保存
lines 保存
warnings 保存
daily_report_items snapshot 状態更新
任意の customer coverage 更新
```

これを API から逐次 insert/update すると、途中失敗により不整合な業務データが残り得る。

### 12.2 推奨 RPC / DB command

```text
confirm_daily_report_item_pricing(
  p_clinic_id uuid,
  p_daily_report_item_id uuid,
  p_patient_burden_rate_override integer default null,
  p_manual_estimated_amount numeric default null,
  p_update_customer_coverage boolean default false,
  p_confirmation_note text default null,
  p_actor_user_id uuid
)
```

実装条件:

- DB transaction 内で完結させる
- tenant mismatch を DB でも拒否する
- `security definer` を使用する場合は `search_path` を固定する
- direct execute 権限は `service_role` のみに限定し、クライアントは server API 経由とする
- confirmed / overridden snapshot の保護規則を DB 側でも検証する

---

## 13. 権限 / RLS 設計

### 13.1 現行との衝突

現行 `CLINIC_ADMIN_ROLES` は `admin`, `clinic_admin`, `manager` を含む。また、現行再計算 API は `STAFF_ROLES` を許可している。Phase 4A の料金信頼性要件では、価格設定と再計算を同じ role set に任せるべきではない。

### 13.2 新規 role set 提案

```ts
export const PRICING_TEMPLATE_ADMIN_ROLES = new Set(['admin']);

export const CLINIC_PRICING_ADMIN_ROLES = new Set([
  'admin',
  'clinic_admin',
]);

export const REVENUE_REVIEW_ROLES = new Set([
  'admin',
  'clinic_admin',
  'manager',
]);
```

### 13.3 操作権限表

| 操作 | admin | clinic_admin | manager | therapist/staff |
|---|---:|---:|---:|---:|
| 標準課金 profile 作成/更新 | ○ | × | × | × |
| 院別課金 profile 作成/更新 | ○ | ○ | × | × |
| 患者 current coverage 閲覧 | ○ | ○ | ○ | ○ |
| 患者 coverage 登録/変更 | ○ | ○ | 運用判断 | 原則 × |
| メニュー選択 | ○ | ○ | ○ | ○ |
| 自動適用された負担割合確認 | ○ | ○ | ○ | ○ |
| 今回のみ手動変更 | ○ | ○ | ○ | 運用判断 |
| 初回金額確定 | ○ | ○ | ○ | 運用判断 |
| confirmed snapshot 再計算 | ○ | ○ | ○ | × |
| 料金 override | ○ | ○ | ○ | × |

### 13.4 RLS 要件

新規 tenant table では以下を守る。

- `clinic_id` を必ず持つ
- `app_private.can_access_clinic(clinic_id)` による院スコープ制限
- API 側の scope guard と DB RLS を二重に持つ
- `customer_id` / `menu_id` / `daily_report_item_id` の clinic 一致を trigger または constraint で検証する
- 他院の coverage/profile を参照した insert/update は拒否する

---

## 14. Trigger 最適化 / 書き込み速度改善

### 14.1 現行課題

現行 `daily_report_items_recalculate_totals` は `daily_report_items` の `insert or update or delete` すべてで日報合計を再計算する。

Phase 4A では、以下の更新が増える。

```text
customer_insurance_coverage_id
patient_burden_rate
coverage_resolution_source
pricing_snapshot_status
pricing_confirmed_at
estimate_status
amount_source
```

これらの一部は既存 `daily_reports.total_revenue` の再計算に不要である。

### 14.2 改善方針

日報合計に影響する列の変更時のみ再集計する。

```sql
drop trigger if exists daily_report_items_recalculate_totals
on public.daily_report_items;

create trigger daily_report_items_recalculate_totals
after insert or delete or update of
  fee,
  billing_type,
  daily_report_id
on public.daily_report_items
for each row execute function public.sync_daily_report_item_totals();
```

> 実装前に、`report_date` や将来追加する集計影響列を含む必要がないかをテストで確認する。

### 14.3 確定済 snapshot の同期禁止

`sync_arrived_reservation_daily_report_item()` は、未確定 item については予約由来情報を追従させてもよい。しかし確定済 item については、価格関連情報を自動更新してはならない。

```text
pricing_snapshot_status = pending
  → 予約更新由来の fee / context 更新を許容

pricing_snapshot_status in (confirmed, recalculated)
  → fee、burden rate、estimate、line を予約 update で変更しない
  → 非価格情報の同期範囲のみ仕様化する
```

これにより、不要な DB write と誤った過去金額更新を同時に防ぐ。

---

## 15. Read 性能改善 / revenue 集計

### 15.1 患者 current coverage lookup

以下の query が index 経由で高速に解決できることを前提とする。

```sql
select *
from public.customer_insurance_coverages
where clinic_id = :clinic_id
  and customer_id = :customer_id
  and verification_status = 'confirmed'
  and effective_from <= :treatment_date
  and (effective_to is null or effective_to >= :treatment_date)
order by effective_from desc
limit 1;
```

### 15.2 N+1 の禁止

日報一覧で複数患者を表示する場合、各明細ごとに coverage API を呼ばない。

推奨:

- 単一患者選択 UI: 選択時に一件解決
- 日報一覧: 対象 `customer_id` 群を batch 解決する route または join query

禁止:

```text
当日の明細 N件 × coverage GET N回
```

### 15.3 revenue breakdown view

既存 summary に加え、`amount_role` ごとの集計 view を追加する。

```sql
create or replace view public.daily_report_revenue_breakdown_summary
with (security_invoker = true)
as
select
  dri.clinic_id,
  dri.report_date,
  rel.amount_role,
  count(*)::integer as line_count,
  coalesce(sum(rel.total_amount), 0)::numeric(10,2) as estimated_amount
from public.daily_report_items dri
join public.revenue_estimates re
  on re.daily_report_item_id = dri.id
join public.revenue_estimate_lines rel
  on rel.revenue_estimate_id = re.id
where re.estimate_status in ('calculated', 'needs_review', 'overridden')
group by
  dri.clinic_id,
  dri.report_date,
  rel.amount_role;
```

`/api/revenue` はこの view を期間・院で取得し、次を返す。

```text
patientCopayEstimated
insurerReceivableEstimated
privateRevenueEstimated
trafficAccidentEstimated
workersCompEstimated
```

### 15.4 先送りする性能施策

以下は実測で必要性が出るまで実装しない。

- materialized view
- Redis / external cache
- 非同期 eventual consistency 化
- table partitioning
- 大規模 precompute pipeline

---

## 16. UI / UX 仕様

### 16.1 日報入力フロー

```text
1. 患者を選択または予約由来の患者を表示
2. 売上区分を表示/選択
   - 健康保険
   - 自費
   - 交通事故
   - 労災
3. 健康保険の場合のみ current coverage を自動表示
4. メニュー候補を区分に応じて絞り込み/並び替え
5. 金額内訳プレビュー
6. 金額確定
```

### 16.2 健康保険表示例

```text
柔整 後療料・捻挫

負担割合                 3割（患者設定から自動入力）
患者負担見込み           600円
保険者請求見込み       1,400円
売上見込み合計         2,000円

※ 経営分析用の概算です。請求確定額ではありません。
```

### 16.3 自費表示例

```text
骨盤矯正

自費売上見込み         4,500円
適用価格               A院設定
```

### 16.4 交通事故表示例

```text
交通事故施術

概算入力額             5,000円
状態                   要確認

※ 交通事故・自賠責関連の手入力概算です。
※ 公式マスタ由来の自動請求額ではありません。
```

### 16.5 労災表示例

```text
労災施術

概算入力額             4,800円
状態                   要確認

※ Phase 4A では自動算定未対応です。請求前に確認してください。
```

---

## 17. revenue 表示仕様

### 17.1 Dashboard サマリー

| 指標 | 意味 |
|---|---|
| 売上見込み合計 | snapshot lines に基づく期間合計 |
| 患者負担見込み | 窓口収入見込み |
| 保険者請求見込み | 後日請求対象の見込み |
| 自費売上見込み | 固定自費料金の見込み |
| 交通事故概算 | 要確認の事故売上概算 |
| 労災概算 | 要確認の労災売上概算 |
| 要確認件数 | `needs_review` item / estimate 数 |
| override 件数 | 手動補正済み件数 |

### 17.2 詳細表示

明細 drill-down では以下を表示可能にする。

- 患者名
- メニュー名
- revenue context
- 患者負担割合
- 各 amount role の金額
- 使用した `menu_billing_profile_id`
- 使用した `customer_insurance_coverage_id`
- 使用した official `schedule_code`
- `source_snapshot_hash`
- `calculation_version`
- warning
- override / 再計算状態

---

## 18. TDD 戦略

### 18.1 基本方針

テスト先行の対象は「数字・期間・権限・不変性・tenant boundary」である。見た目の微調整を過剰にテスト固定しない。

実装順:

```text
仕様の invariant 固定
  ↓
純粋関数 unit test
  ↓
DB migration / constraint / RLS test
  ↓
API route test
  ↓
最小 E2E
  ↓
UI polish
```

### 18.2 Pure function tests

新規候補:

```text
src/__tests__/lib/customer-insurance-coverage.test.ts
src/__tests__/lib/menu-billing-calculation.test.ts
```

#### Coverage resolver test cases

```text
- treatment date に有効な confirmed 3割設定を返す
- 有効な coverage がない場合は needs_review を返す
- expired coverage を current default として使用しない
- 複数 current coverage が存在する不正状態を拒否する
```

#### Billing calculation test cases

```text
- 総額2,000円・3割 → 患者600円 / 保険者1,400円
- 総額2,000円・0割 → 患者0円 / 保険者2,000円
- 自費固定額4,500円 → private line 4,500円
- 交通事故 manual 5,000円 → needs_review + warning
- 労災 manual 4,800円 → needs_review + warning
```

### 18.3 Migration / RLS tests

新規候補:

```text
src/__tests__/api/customer-insurance-coverages-migration.test.ts
src/__tests__/api/menu-billing-profiles-migration.test.ts
src/__tests__/api/revenue-breakdown-snapshot-migration.test.ts
```

Test cases:

```text
- 新規テーブル/列/index/constraint が存在する
- burden rate が 0/10/20/30 以外なら拒否される
- effective_to < effective_from を拒否する
- confirmed coverage の有効期間重複を拒否する
- RLS が有効である
- 他院 customer/menu/item 参照を拒否する
- amount_role の許可値以外を拒否する
- trigger は対象列以外の update で集計を再実行しない
```

### 18.4 API route tests

新規候補:

```text
src/__tests__/api/customer-insurance-coverages-route.test.ts
src/__tests__/api/menu-billing-profiles-route.test.ts
src/__tests__/api/daily-report-item-pricing-confirm-route.test.ts
src/__tests__/api/revenue-breakdown-summary-api.test.ts
```

Test cases:

```text
- current coverage が再来時に解決される
- 今回のみ変更では患者 coverage を更新しない
- 患者設定も更新を選択した場合のみ次回 default が変わる
- pricing confirm で estimate/lines/warnings/item snapshot が整合して保存される
- 交通事故/労災は自動確定されない
- confirmed snapshot は予約 update で金額上書きされない
- manager 未満の再計算を拒否する仕様を固定する
- override 済み estimate は再計算による write churn を生じない
```

### 18.5 E2E 最小シナリオ

```text
1. 患者に健康保険3割設定を登録
2. 保険メニューを選択して金額確定
3. 患者負担・保険者請求見込みが表示される
4. 同患者の再来明細で3割が自動初期値になる
5. 患者設定を1割へ変更
6. 過去の日報 snapshot が3割のまま変化しない
7. revenue 表示に内訳が反映される
```

---

## 19. 性能設計と計測

### 19.1 性能改善の目的

本フェーズの速度改善対象は、次の優先順とする。

1. 日報入力時の不要な再計算削減
2. 再来患者の coverage 解決速度
3. 金額確定時の DB round trip と途中失敗削減
4. revenue breakdown 読込の単純化

### 19.2 Baseline 計測

機能実装前に以下の P50 / P95 を記録する。

```text
- 患者検索 API
- 日報一覧 API
- arrived 予約 → daily_report_item 反映
- revenue estimate 再計算 API
- revenue 月次表示 API
```

### 19.3 MVP 性能目標

> 初期運用目標であり、計測後に見直す。

| 操作 | 目標 |
|---|---:|
| 患者選択後 current coverage 表示 | P95 200ms 以下 |
| 日報一件の金額確定 | P95 500ms 以下 |
| revenue 月次表示 | P95 800ms 以下 |
| 確定済 snapshot の不要再計算 | 0 回 |

### 19.4 性能テスト方針

Jest に不安定な ms 閾値 test を大量導入しない。代わりに、以下を守る構造テストと DB query 計測を行う。

```text
- current lookup 用 index の存在
- N+1 を発生させない API contract
- atomic confirmation の一 command 化
- confirmed snapshot update で estimate write を行わない
- 不要な column update で日次集計 trigger を発火させない
- representative dataset に対する EXPLAIN ANALYZE
```

### 19.5 Representative dataset

初期 benchmark 用の目安:

```text
1院: 100件/日 × 365日 = 36,500 daily_report_items
50院: 1,825,000 daily_report_items 相当
coverage: 各患者1〜3履歴
revenue lines: 日報明細あたり平均1〜2行
```

---

## 20. 実装順序

### Phase 4A-0: Contract / Baseline

- 本仕様書を確定
- `daily_report_items.fee` と snapshot の責務をレビュー
- 権限表を確定
- 現行 API 性能 baseline を記録

### Phase 4A-1: Trigger / Permission Hardening

- pricing 専用 role set を追加
- 現行 menu / template / recalculate route の role 再確認と変更
- `daily_report_items` 集計 trigger を必要列 update 限定へ変更
- confirmed snapshot の予約同期保護ルールを migration/test に追加

### Phase 4A-2: DB Schema / RLS / Index

- `menu_template_billing_profiles`
- `menu_billing_profiles`
- `customer_insurance_coverages`
- `daily_report_items` snapshot 入力列
- `revenue_estimate_lines.amount_role`
- index / tenant validation / overlap guard / RLS
- rollback SQL

### Phase 4A-3: Calculation Domain Logic

- current coverage resolver
- active menu billing profile resolver
- insurance breakdown calculator
- manual estimate behavior
- calculation version / rounding rule 固定

### Phase 4A-4: Atomic Pricing Confirmation API

- pricing confirm endpoint
- hardened RPC / transaction
- warning / provenance / snapshot 保存
- optional customer coverage update

### Phase 4A-5: UI

- 患者 coverage 自動表示
- 区分別メニュー候補
- 内訳 preview
- 今回のみ変更 / 患者設定更新
- 金額確定 status 表示

### Phase 4A-6: Revenue Breakdown

- breakdown summary view
- `/api/revenue` response 拡張
- dashboard cards / detail drill-down
- disclaimer / needs_review 表示

### Phase 4A-7: Verification / Benchmark

- unit / migration / route / E2E 完了
- tenant boundary 検証
- performance benchmark
- rollback 検証
- documentation / handover 更新

---

## 21. Definition of Done

### 21.1 Functional DoD

- [ ] admin が標準課金 profile を管理できる
- [ ] clinic_admin が院別課金 profile を管理できる
- [ ] 患者別健康保険設定を有効期間付きで登録できる
- [ ] 再来患者の日報入力で current coverage が自動初期値として出る
- [ ] 健康保険で患者負担見込みと保険者請求見込みが生成される
- [ ] 自費で固定額売上見込みが生成される
- [ ] 交通事故・労災は手入力概算かつ要確認で保存される
- [ ] 金額確定時に snapshot が保存される
- [ ] 後日マスタ/患者設定変更で過去 snapshot が変わらない
- [ ] revenue で内訳が確認できる

### 21.2 Security / Integrity DoD

- [ ] tenant boundary を越える CRUD が拒否される
- [ ] 公式制度マスタに院独自価格を保存していない
- [ ] 料金設定変更は許可 role のみに限定される
- [ ] confirmed snapshot 再計算は許可 role のみに限定される
- [ ] 重複 coverage は DB レベルで拒否される
- [ ] RPC/function の権限と `search_path` が hardening される
- [ ] rollback SQL が用意される

### 21.3 Test DoD

- [ ] pure calculation unit tests pass
- [ ] coverage resolution unit tests pass
- [ ] migration tests pass
- [ ] RLS / tenant boundary tests pass
- [ ] route tests pass
- [ ] override / confirmed snapshot protection tests pass
- [ ] minimal E2E passes
- [ ] `npm run type-check` passes
- [ ] relevant lint / format checks pass
- [ ] `git diff --check` passes

### 21.4 Performance DoD

- [ ] baseline が記録されている
- [ ] current lookup index が適用される
- [ ] profile resolver index が適用される
- [ ] 不要 trigger 発火が削減される
- [ ] confirm が atomic に完結する
- [ ] confirmed snapshot の予約同期 write が発生しない
- [ ] representative dataset で query plan を確認する

---

## 22. リスクと対策

| 分類 | リスク | 致命度 | 対策 |
|---|---|---:|---|
| 技術 | `fee` と売上見込み内訳を混同する | 高 | `revenue_estimate_lines` を内訳正本として明示 |
| 技術 | 金額確定の途中失敗で不整合になる | 高 | atomic RPC / transaction |
| 技術 | 患者設定変更で過去売上が変わる | 高 | snapshot 不変性 test / 自動再計算禁止 |
| 技術 | 追加列 update で不要な集計 trigger が走る | 高 | update-of trigger 限定 |
| 技術 | N+1 により日報画面が遅くなる | 中 | batch lookup / index |
| 技術 | 期間重複 coverage で自動解決不能になる | 高 | DB overlap guard |
| 市場 | 入力短縮だけでは導入訴求が弱い | 中 | 内訳可視化・本部比較分析とセットで訴求 |
| 法務/制度 | 概算を請求確定額として誤認させる | 高 | disclaimer / needs_review / UI 表示固定 |
| オペ | 古い患者設定を無確認で適用する | 高 | verification status / 有効期間 / 確認 UI |
| 資金/時間 | 自賠責・労災完全対応へ膨張する | 中 | Phase 4A は manual estimate に限定 |

---

## 23. Rollback 方針

各 migration は rollback SQL を併設する。

### Rollback 対象

- billing profile tables と index
- customer insurance coverage table と overlap guard
- `daily_report_items` 追加列/index
- `revenue_estimate_lines.amount_role` と index
- breakdown summary view
- trigger 変更
- 新規 RLS policy / function / RPC

### Rollback で削除してはならないもの

本番または pilot で snapshot data が作成された後は、rollback によって業務履歴を破壊してはならない。列やテーブルを drop する rollback は、実データ存在時には migration rollback ではなく退避・移行手順を別途必要とする。

---

## 24. 実装エージェント向け着手指示

### 最初に読むファイル

```text
docs/stabilization/spec-menu-template-inheritance-v0.1.md
supabase/migrations/20260425000100_menu_template_inheritance.sql
src/app/api/menu-templates/route.ts
src/app/api/menu-templates/import/route.ts
src/app/api/menus/route.ts
src/app/api/menus/schema.ts

docs/stabilization/spec-daily-report-items-v0.1.md
supabase/migrations/20260507000100_daily_report_items.sql
supabase/migrations/20260514000100_revenue_context_phase1.sql
src/app/api/daily-reports/items/route.ts

supabase/migrations/20260514000300_revenue_estimates_phase3.sql
src/lib/revenue-estimate.ts
src/app/api/revenue-estimates/recalculate/route.ts
src/app/api/revenue/route.ts
src/__tests__/lib/revenue-estimate.test.ts
src/__tests__/api/revenue-estimates-recalculate-route.test.ts

supabase/migrations/20260521000100_insurance_fee_system_master_phase3a.sql
supabase/migrations/20260524000100_seed_judo_hi_r6_active_master.sql

docs/stabilization/spec-customers-ssot-step1-v0.1.md
src/app/api/customers/route.ts
src/app/api/customers/schema.ts
src/lib/constants/roles.ts
```

### 実装開始条件

1. 本仕様の invariant を test case 名へ落とす。
2. migration 名、rollback 名、追加 API path を事前に一覧化する。
3. `fee` の既存互換方針を壊す変更を入れない。
4. `insurance_fee_*` に院別価格や患者負担 default を保存しない。
5. `customers.custom_attributes` に課金計算根拠を埋め込まない。
6. UI より先に unit / migration / route tests を red にする。

---

## 25. 推奨フェーズ分割

| Phase | 内容 | 判定 |
|---|---|---|
| 4A-0 | Contract・baseline・権限再整理 | 必須 |
| 4A-1 | Billing profile / patient coverage / snapshot schema | 必須 |
| 4A-2 | 金額確定 command・日報 UX・revenue breakdown | 必須 |
| 4A-3 | trigger/read 性能検証・benchmark・hardening | 必須 |
| 4B | 本部標準料金の未override院への動的伝播/一括改定 | 後続 |
| 4C | 労災自動算定・事故/労災案件管理 | 後続 |
| 5+ | 請求確定・入金消込・資格確認連携 | 別プロダクト責務に近いため慎重判断 |

---

## 26. 最終設計判断

Phase 4A は、単なる料金設定画面の追加ではない。

```text
制度マスタ
  + 院別課金設定
  + 患者別保険 default
  + 日報確定 snapshot
  + revenue 内訳表示
  + TDD / 性能最適化
```

を接続し、Tiramisu の売上数字を業務上信用できる状態へ引き上げるフェーズである。

最優先で守るべきことは、機能数ではなく以下である。

```text
- 過去数値が後から揺れない
- 概算を確定額に見せない
- 毎回の入力を減らしつつ確認可能性を失わない
- 不要な再計算と DB write を増やさない
- tenant boundary と権限を価格計算にも貫徹する
```

この条件を守れば、健康保険を扱う現場での日報入力効率と、本部の売上構造把握の双方に直結する実装となる。

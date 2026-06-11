# Manager Patient Analysis Period Charts Spec v0.2

## Summary

Manager 向け患者分析ページに、期間指定とチャート分析を追加する。

現在の `/patients` の manager 分岐は、担当院合計・院別サマリー・選択院の患者分析を表示できる。一方で、期間別の推移や任意期間の比較はまだ十分ではない。今後は、全期間だけでなく「1月から4月まで」「今月」「直近3か月」などの期間を選び、担当院合計と院別の両方で分析できるようにする。

この仕様では、UI だけで数字を作るのではなく、`public.reservations` を日付軸の source of truth として扱い、期間集計は DB 側の stable SQL function（RPC）で行う。manager の実効 clinic scope は引き続き active `manager_clinic_assignments` のみに限定する。

## Changes from v0.1

- データ取得方針を「reservations の生行を API で取得して集計」から「DB 側 RPC で集計」に変更。`supabase/config.toml` の `max_rows = 1000` により、PostgREST 経由の行取得は 1000 行で暗黙に切り捨てられ、集計が静かに不正確になるため。
- 新患/再来判定に必要なデータ窓（期間開始前の履歴）と判定アルゴリズムを明記。
- 離脱リスク高は常に「現在時点」基準に変更。過去 `end_date` 時点のリスク再計算は Non-Goals へ移動（v0.1 の Metric Rules と Data Design の矛盾を解消）。
- `患者数` を「期間内来院患者数」として全期間にも統一。現行 `totalPatients`（来院0回の登録患者を含む）とは異なる値になることを意図的変更として明記し、UI ラベルを `来院患者数` に変更。
- `target` と `clinic_id` の組み合わせ挙動を表で定義。
- query から `bucket` パラメータを削除（API が期間長から決定）。custom 期間に最大長 1095 日を追加。
- バケット境界（JST、週は月曜開始）、ラベル形式、`period=all` の系列開始点を定義。
- period type から `week` を削除（既存 parser からの意図的 breaking change）。`periodApplied` を response から削除。
- チャートライブラリは既存依存の recharts を使用と確定。
- 期間集計 RPC の execute 権限を service_role のみに限定する要件を追加。

## Goals

- `/patients` の manager 画面で期間フィルタを使えるようにする。
- 全期間 / プリセット期間 / 任意期間を切り替えられるようにする。
- 担当院合計と各院個別の分析を切り替えられるようにする。
- 売上・来院患者数・新患・再来・来院数・患者単価をチャートで見られるようにする。
- 離脱リスク高（現在時点基準）をサマリーと院別比較で見られるようにする。
- 院別比較で、担当院間の差と変化を見られるようにする。
- manager の患者分析は read-only のまま維持する。
- manager の実効 clinic scope は active `manager_clinic_assignments` のみとする。

## Non-Goals

- 患者一覧や患者詳細を manager に開放しない。
- manager から患者情報を編集できるようにしない。
- manager から予約・日報・売上データを書き換えられるようにしない。
- 過去時点（期間終了日時点）の離脱リスク再計算は含めない。離脱リスクは常に現在時点基準とする。
- 登録患者数（来院0回を含む患者マスタ件数）の期間分析は含めない。
- AI 予測や高度な将来予測モデルは含めない。
- LINE 連絡、フォローアップタスク作成、通知送信は含めない。
- 既存の clinic_admin / therapist / staff 向け患者分析の挙動を変更しない。

## Current State

Relevant files:

- `src/app/(app)/patients/page.tsx`
- `src/hooks/useManagerPatientAnalysis.ts`
- `src/lib/manager-patient-analysis.ts`
- `src/app/api/manager/patients/analysis/route.ts`
- `src/lib/services/patient-analysis-service.ts`
- `public.patient_visit_summary`
- `public.reservations`

Current manager API:

- `GET /api/manager/patients/analysis`
- manager only
- active `manager_clinic_assignments` から担当院を解決する
- `permissions.clinic_id` / `profiles.clinic_id` / JWT `clinic_scope_ids` には fallback しない
- `period`, `start_date`, `end_date` の query parsing は存在する
- 現行の period types は `all | week | month | custom`。`week` を送る呼び出しは存在しない。
- 現状の `periodApplied` は `false` で、期間別の正確な集計には未対応
- active assignments がない場合、`clinic_id` 指定の有無にかかわらず empty data（200）を返す

Current data limitation:

- `public.patient_visit_summary` は患者単位の累計ビューである。
- `visit_count`, `total_revenue`, `first_visit_date`, `last_visit_date` は全期間集計として有用。
- `totalPatients`（現行 manager 画面の患者数）は customers LEFT JOIN のため来院0回の登録患者を含む。
- しかし「2026-01-01 から 2026-04-30 の売上推移」「月別新患数」「期間中の再来数」などを正確に出すには、`reservations.start_time` を使った期間集計が必要。

Infrastructure facts:

- `supabase/config.toml` は `max_rows = 1000`。PostgREST 経由の select は1リクエスト最大1000行で暗黙に切り捨てられる。
- `recharts@^2.14.1` が既存依存（`src/components/dashboard/revenue-chart.tsx` 等で使用実績あり）。
- native `<input type="date">` は日報入力等で使用実績あり。
- `api-client.ts` の `managerPatients.getAnalysis` は既に `start_date` / `end_date` を送出可能。
- 既存 index に `idx_reservations_clinic_status` と `idx_reservations_status_clinic` の重複あり（どちらも `(clinic_id, status) WHERE is_deleted = false`）。

## Recommended PR Split

### PR-01: Data/API Foundation

- Supabase migration を追加し、期間集計用の stable SQL function（RPC）を作る。rollback SQL を `supabase/rollbacks/` に追加する。
- RPC の execute 権限は service_role のみ（public / anon / authenticated から revoke）。
- manager 患者分析 API を RPC ベースの期間集計に切り替え、response に chart-ready な series を追加する。
- query parser を更新する（`week` 削除、プリセット期間追加、custom 最大長、`bucket` パラメータ削除）。
- 単体テスト / API テストを追加する。UI は大きく変えない。

### PR-02: Manager UI Charts

- `/patients` の manager 分岐に期間フィルタ、カレンダー（native date input）、recharts チャート、院別比較 UI を追加する。
- 現行 UI の `periodApplied` 依存の表示分岐を `period.type` ベースに更新する。
- 既存の read-only 方針と fail-closed 方針を維持する。UI テストを追加する。

### PR-03: Polish / Performance

- チャートのローディング状態、空状態、比較表示を調整する。
- 集計クエリを計測し、必要なら partial index を追加する。重複 index（`idx_reservations_status_clinic`）の削除も検討する。
- キャッシュ方針を見直す。

## Access Control Requirements

Manager:

- allowed: `/patients` の manager 分析画面
- denied: `/patients/list`
- denied: `/patients/[id]`
- denied: patient write actions

Manager effective clinic scope:

```txt
public.manager_clinic_assignments
where manager_user_id = auth.uid()
and revoked_at is null
```

The implementation must not use the following as manager access grants:

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- client-side selected clinic state

API must fail closed:

- manager が未担当 clinic_id を指定した場合は `403`
- manager に active assignments がない場合は empty data（`clinic_id` 指定があっても `403` ではなく empty data を返す。現行挙動を維持し、API テストで固定する）
- invalid period/date query は `400`

## UX Requirements

### Page Layout

Manager の `/patients` は次の構成にする。

1. Header
   - title: `患者分析`
   - subtitle: `担当院の患者動向を期間別に確認できます。`

2. Filter Bar
   - 対象:
     - `担当院合計`
     - 各担当院
   - 期間:
     - `全期間`
     - `今月`
     - `先月`
     - `直近3か月`
     - `今年`
     - `任意期間`
   - 任意期間:
     - start date
     - end date
     - カレンダー UI（native `<input type="date">`）
   - apply button
   - reset button

3. Summary Cards
   - 担当院数
   - 来院患者数
   - 新患数
   - 再来患者数
   - 新患再来率
   - 来院数
   - 平均来院回数
   - 総売上
   - 患者単価
   - 離脱リスク高（現在）

4. Charts
   - 売上推移
   - 来院患者数推移
   - 新患 / 再来 推移
   - 来院数推移
   - 新患再来率推移
   - 院別売上比較
   - 院別来院患者数比較

5. Clinic Comparison
   - 院名
   - 来院患者数
   - 新患数
   - 再来患者数
   - 新患再来率
   - 来院数
   - 総売上
   - 患者単価
   - 離脱リスク高（現在）

6. Selected Clinic Detail
   - 選択中の院のセグメント
   - 選択中の院の離脱リスク（現在時点基準であることを表記）
   - 選択中の院の LTV 上位
   - follow-up 候補
   - `連絡する` などの write action は表示しない

### Period UX

Default:

- period: `month`
- start/end: 当月の開始日から終了日
- target: `担当院合計`

When `全期間` is selected:

- `start_date` / `end_date` は送らない。
- UI label は `全期間`。

When `任意期間` is selected:

- start date と end date は必須。
- start date > end date はクライアントで送信前に止める。
- 期間は最大 1095 日。超過もクライアントで送信前に止める。
- API でもいずれも `400` を返す。

### Chart Bucket Rules

期間の長さに応じて bucket を切り替える。

- 31日以内: daily
- 32日から 180日: weekly
- 181日以上: monthly
- 全期間: monthly

bucket は API が期間長から決定する。client からは指定できない。UI は API から返された `bucket` をそのまま表示し、フロント側で独自に再集計しない。

### Bucket Boundary and Label Rules

- すべて Asia/Tokyo 基準。
- daily: JST の暦日。
- weekly: 月曜開始。期間の先頭・末尾の部分週は start_date / end_date でクリップする。
- monthly: JST の暦月。部分月も同様にクリップする。
- `period=all` の系列開始点: 対象スコープ（担当院合計または選択院）の最古の qualifying reservation を含む月。データがない場合は空配列。
- `bucketStart` / `bucketEnd`: クリップ後の JST 日付（`YYYY-MM-DD`、両端 inclusive）。
- `label`: daily は `M/D`、weekly は `M/D週`（バケット開始日）、monthly は `YYYY/M`。

## Metric Rules

Qualifying reservation:

```txt
public.reservations
where is_deleted = false
and status in ('completed', 'arrived')
```

Date basis:

- `reservations.start_time`
- display timezone: `Asia/Tokyo`
- start date: selected day 00:00:00 Asia/Tokyo inclusive
- end date: selected day 23:59:59.999 Asia/Tokyo inclusive
- JST に DST はないため、アプリ側で日付計算する場合は +9 時間固定オフセットで安全。SQL 側では `patient_visit_summary` と同じ `AT TIME ZONE 'Asia/Tokyo'` を使う。

### Patient Count

`来院患者数` は、対象期間内に qualifying reservation が1件以上ある distinct `customer_id` 数。

NOTE: これは意図的な定義変更。現行 manager 画面の `totalPatients` は来院0回の登録患者を含むため、`period=all` でも本メトリクスは現行値より小さくなり得る。UI ラベルは `来院患者数` とし、登録患者数とは区別する。平均来院回数・患者単価の分母もこの値を使う。

### New Patients

`新患数` は、患者の最初の qualifying reservation（全履歴での最初。期間内での最初ではない）が対象期間内にある distinct `customer_id` 数。

判定アルゴリズム:

- 患者ごとの初回来院は、期間で絞らない全履歴に対する `min(start_time)` で決定する（RPC 内で算出する）。
- 期間内の行だけから初回来院を推定してはならない。期間前から通院している患者の期間内最初の来院が新患に誤分類されるため。
- 参考: `patient_visit_summary.first_visit_date` も同じ定義の JST 日付だが、`visit_count = 0` の患者では `customers.created_at` にフォールバックするため、利用する場合は `visit_count >= 1` で除外すること。同日複数来院など timestamp 精度が必要な判定は RPC 側の `min(start_time)` を正とする。

### Repeat Patients

`再来患者数` は、対象期間内に「その患者にとって全履歴で2回目以降にあたる qualifying reservation」が1件以上ある distinct `customer_id` 数。

- 期間前に1回来院済みの患者が期間内に1回来院した場合、新患ではなく再来としてカウントする（テストで固定する）。
- 判定は timestamp ベース（`start_time` がその患者の `min(start_time)` より後）。同一 timestamp が並ぶ場合は `id` 等の安定順序で1件のみを初回とみなす。

### Conversion Rate

`新患再来率` は、対象期間内に初回来院した患者のうち、対象期間終了日時点で2回目の qualifying reservation が存在する患者の割合。

```txt
conversion_rate = converted_new_patients / new_patients * 100
```

`new_patients = 0` の場合は `0`。

チャート `新患再来率推移` の各バケットは、「そのバケット内に初回来院した患者」をコホートとし、対象期間終了日までに2回目の qualifying reservation がある患者の割合とする。直近バケットは観測打ち切りにより低く出るため、UI に注記を表示する。

### Visit Count

`来院数` は、対象期間内の qualifying reservation 件数。

### Average Visit Count

```txt
average_visit_count = visit_count / patient_count
```

`patient_count = 0` の場合は `0`。

### Revenue

`総売上` は対象期間内の qualifying reservation の金額合計。

```txt
amount = coalesce(actual_price, price, 0)
```

### Average Revenue Per Patient

```txt
average_revenue_per_patient = total_revenue / patient_count
```

`patient_count = 0` の場合は `0`。

### High Risk Patients

`離脱リスク高` は常に現在時点（today, JST）の最終来院日を基準に算出する。現行のリスク算出ロジック（`patient-analysis-service.ts`）を変更しない。

- 期間フィルタの影響を受けない。サマリーカードと院別比較では「現在時点」であることを UI ラベルで明示する（例: `離脱リスク高（現在）`）。
- 過去の `end_date` 時点でのリスク再計算は本仕様の対象外（Non-Goals 参照）。
- 患者名つきリストは selected clinic detail のみに含める。
- 担当院合計や非選択院では、件数だけ返す。

## API Contract

### GET `/api/manager/patients/analysis`

Allowed:

- manager only

Denied:

- admin
- clinic_admin
- therapist
- staff
- customer

Query:

```txt
clinic_id?: uuid
target?: total | clinic        # default: total
period?: all | month | previous_month | last_3_months | year | custom
start_date?: YYYY-MM-DD        # period=custom のみ
end_date?: YYYY-MM-DD          # period=custom のみ
```

NOTE: `bucket` は指定不可。API が期間長から決定する。
NOTE: period type `week`（現行 parser に存在）は削除する。意図的な breaking change であり、既存の parser テストも更新する。現在 `week` を送る呼び出しは存在しない。

`target` と `clinic_id` の組み合わせ:

| target | clinic_id | summary / 推移チャートの対象 | selectedClinic |
| --- | --- | --- | --- |
| total（既定） | なし | 担当院合計 | 既定の担当院（名前順の先頭。現行挙動） |
| total | あり | 担当院合計 | 指定院 |
| clinic | あり | 指定院 | 指定院 |
| clinic | なし | `400` | - |

Rules:

- 院別比較（`clinicRevenueComparison` / `clinicPatientComparison` / Clinic Comparison テーブル）は target にかかわらず常に全担当院を対象とする。
- `clinic_id` が指定された場合は active assignments に含まれる clinic のみ許可。未担当は `403`。
- `period=custom` では `start_date` と `end_date` が必須。範囲は最大 1095 日。超過は `400`。
- `period=all` では start/end を無視する。

Response:

```ts
type ManagerPatientAnalysisResponse = {
  target: 'total' | 'clinic';
  summary: ManagerPatientAnalysisSummary;
  clinics: ManagerPatientClinicSummary[];
  selectedClinic: ManagerPatientClinicDetail | null;
  period: {
    type:
      | 'all'
      | 'month'
      | 'previous_month'
      | 'last_3_months'
      | 'year'
      | 'custom';
    startDate: string | null; // period=all のとき null
    endDate: string | null; // period=all のとき null
    bucket: 'daily' | 'weekly' | 'monthly';
  };
  charts: {
    revenue: TimeSeriesPoint[];
    patients: TimeSeriesPoint[];
    newPatients: TimeSeriesPoint[];
    repeatPatients: TimeSeriesPoint[];
    visits: TimeSeriesPoint[];
    conversionRate: TimeSeriesPoint[];
    clinicRevenueComparison: ClinicSeriesPoint[];
    clinicPatientComparison: ClinicSeriesPoint[];
  };
};
```

```ts
type TimeSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  value: number;
};

type ClinicSeriesPoint = {
  clinicId: string;
  clinicName: string;
  value: number;
};
```

NOTE: v0.1 にあった `periodApplied` は削除する。現行 UI（`/patients` manager 分岐）の `periodApplied` による表示分岐は PR-02 で `period.type` ベースに更新する。

## Data Design

### Preferred Data Source

期間集計は `public.reservations` を source of truth とし、集計は DB 側 RPC で行う。

The current `public.patient_visit_summary` can still be used for:

- selected clinic detail（セグメント、LTV ranking、フォロー候補）
- 現在時点の churn risk（変更しない）

But period trend charts must not be derived only from `patient_visit_summary`, because it is cumulative and does not contain per-day revenue or per-day visit records.

### Required DB Support

`supabase/config.toml` は `max_rows = 1000` であり、PostgREST 経由で reservations の生行を取得して API 側で集計する方式は、1000 行を超えた時点で黙って切り捨てられ集計が不正確になる。したがって v0.1 実装の時点から DB 側集計（stable SQL function）を必須とする。reservations の生行の取得・転送は行わない。

Migration 内容（関数名・分割は実装で調整可）:

1. `manager_patient_period_totals(p_clinic_ids uuid[], p_start timestamptz, p_end timestamptz)`
   - 院別の期間合計を返す: `clinic_id`, `patient_count`, `new_patients`, `repeat_patients`, `converted_new_patients`, `visit_count`, `total_revenue`
   - 新患判定用の患者ごとの初回来院は、期間で絞らない全履歴の `min(start_time)` から算出する。
   - `p_start` / `p_end` が null の場合は全期間として扱う。
2. `manager_patient_period_series(p_clinic_ids uuid[], p_start timestamptz, p_end timestamptz, p_bucket text)`
   - バケット別系列を返す: `bucket_start`, `patient_count`, `new_patients`, `repeat_patients`, `visit_count`, `total_revenue`, `converted_new_patients`
   - 担当院合計の推移は全担当院 id を、選択院の推移は単一 id を渡して取得する。

共通要件:

- `stable` / `security invoker` で作成し、service role client から `rpc()` で呼ぶ。
- `revoke execute on function ... from public, anon, authenticated;` を行い、`service_role` のみ execute 可能にする。clinic_ids を引数に取るため、authenticated に開放すると manager scope の迂回経路になる。
- API は RPC 呼び出し前に clinic_ids を active assignments で検証し、担当 clinic の id のみを渡す。
- timezone 変換は関数内で `AT TIME ZONE 'Asia/Tokyo'` を使う。
- materialized view は v0.1 では追加しない。

Recommended index review:

- まず既存の `idx_reservations_clinic_status` / `idx_reservations_date_range` で計測する。
- 不足する場合は PR-03 で partial index を追加する:

```sql
create index if not exists idx_reservations_clinic_start_completed
on public.reservations (clinic_id, start_time)
where is_deleted = false
  and status in ('completed', 'arrived');
```

- migration runner が concurrent index creation に対応していないため、通常の（non-concurrent）migration で作成する。
- 同一定義で重複している `idx_reservations_status_clinic` の削除も PR-03 で検討する。

## UI Components

Prefer small local components under `src/app/(app)/patients/page.tsx` unless the file becomes too large. If extracting:

- `src/components/patients/manager-patient-analysis-filter.tsx`
- `src/components/patients/manager-patient-analysis-charts.tsx`
- `src/components/patients/manager-clinic-comparison-table.tsx`

Chart library:

- recharts を使う（既存依存 `recharts@^2.14.1`。`src/components/dashboard/revenue-chart.tsx` で使用実績あり）。
- 新規チャート依存は追加しない。

Calendar:

- native `<input type="date">` を使う（日報入力等で使用実績あり）。
- 新規カレンダー依存は追加しない。

## Empty / Loading / Error States

Loading:

```txt
患者分析を読み込んでいます。
```

No assigned clinics:

```txt
担当院がまだ設定されていません。
管理者に担当店舗の設定を依頼してください。
```

No data in selected period:

```txt
選択した期間の患者分析データはまだありません。
期間を変更するか、来院データの登録状況を確認してください。
```

Invalid custom period:

```txt
開始日は終了日以前の日付を指定してください。
```

Custom period too long:

```txt
期間は最大3年（1095日）以内で指定してください。
```

API error:

```txt
患者分析の取得に失敗しました。時間をおいて再度お試しください。
```

## Performance Requirements

- API must fetch all assigned clinic data in one request where reasonable.
- Do not request one API call per clinic for initial load.
- reservations の生行を PostgREST 経由で取得しない（`max_rows = 1000` による暗黙の切り捨てで集計が不正確になるため）。集計は RPC で行う。
- Patient-name lists must be returned only for selected clinic detail.
- Aggregate and chart responses must not include patient names.
- Limit selected clinic patient lists to the existing top list limits.
- Request cancellation / stale response protection in `useManagerPatientAnalysis` must be preserved.

## Security Requirements

- Manager scope must be DB-only from active `manager_clinic_assignments`.
- API must validate `clinic_id` before querying patient or reservation facts.
- Query must include only assigned clinic IDs.
- 期間集計 RPC は service_role のみ execute 可能とし、public / anon / authenticated には開放しない。
- API は RPC に渡す clinic_ids を必ず active assignments から構築する（client 入力をそのまま渡さない）。
- Do not expose patient-level rows for non-selected clinics.
- Do not expose patient detail links for manager.
- Do not show write actions such as contact, edit, reservation creation, or follow-up creation.
- Do not weaken existing RLS assumptions.

## TDD / Test Plan

Add failing tests first.

### Unit Tests

- `parseManagerPatientAnalysisQuery`
  - accepts `period=all`
  - accepts preset periods（month / previous_month / last_3_months / year）
  - accepts valid custom start/end
  - rejects `period=week`（v0.1 からの削除を固定）
  - rejects invalid date format
  - rejects start date after end date
  - rejects custom range longer than 1095 days
  - rejects invalid clinic_id
  - rejects `target=clinic` without clinic_id

- period resolver
  - resolves current month
  - resolves previous month
  - resolves last 3 months
  - resolves year
  - resolves all period as null start/end
  - chooses daily/weekly/monthly bucket based on period length
  - weekly buckets start on Monday and are clipped at period edges

- manager patient aggregation
  - counts patients by selected period
  - counts new patients by first qualifying reservation over full history
  - 期間前に来院歴のある患者が期間内に1回来院した場合、再来にカウントし新患にカウントしない
  - JST 境界: JST で 1/31 23:30（UTC 14:30）の予約が1月のバケットに含まれる
  - counts repeat patients by second-or-later qualifying reservation
  - sums revenue using `actual_price` before `price`
  - excludes `cancelled`, `no_show`, deleted reservations
  - computes clinic comparison series
  - does not include patient lists for non-selected clinics
  - charts / 比較系列に患者名が含まれない

### API Tests

- manager with active assignments receives period-applied response.
- manager with no assignments receives empty data（`clinic_id` 指定があっても 200 empty data）.
- manager cannot request unassigned `clinic_id`（403）.
- manager does not fallback to `permissions.clinic_id`.
- `target` と `clinic_id` の組み合わせ表どおりに動作する（`target=clinic` + clinic_id なし → 400）。
- invalid custom date returns `400`.
- non-manager roles are denied.

### Migration Verification

- 期間集計 RPC が anon / authenticated から execute できないこと（service_role のみ）。

### UI Tests

- manager sees period controls.
- default period is `今月`.
- manager can switch from all clinics to a selected clinic.
- manager can choose custom start/end dates.
- manager sees charts after data load.
- manager sees no-data message for empty period.
- 離脱リスクカードに現在時点基準である表記が出る。
- manager does not see patient list tab as an available workflow.
- manager does not see patient detail links or contact buttons.

## Verification Commands

Use npm.

```powershell
npm run test -- manager-patient-analysis patients
npm run type-check
npm run lint
git diff --check
```

If a Supabase migration is added:

```powershell
supabase db push --local --dry-run
npm run supabase:types
```

Do not run `supabase db push` or `supabase db reset` without explicit approval.

## Rollback Plan

DB migration を含むため:

1. rollback SQL を `supabase/rollbacks/` に既存の命名規則で追加する。
2. rollback では新規の期間集計 RPC（と index を追加した場合は index）のみを drop する。
3. `manager_clinic_assignments` は変更・削除しない。
4. `app_private.can_access_clinic(uuid)` を弱めない。
5. アプリ側は manager 患者分析 API・`useManagerPatientAnalysis`・`/patients` manager UI・関連テストの順に revert する。

## Acceptance Criteria

- Manager can select all period, preset periods, and custom date ranges (max 1095 days).
- Manager can view assigned clinic total and individual clinic analysis.
- Charts are generated from period-applied data.
- 期間集計は DB 側 RPC で行われ、PostgREST の行上限（max_rows = 1000）による切り捨てが発生しない。
- Revenue and visit metrics are based on qualifying reservations in the selected period.
- 新患は全履歴での初回 qualifying reservation 日に基づく（期間内最初ではない）。
- Repeat metrics use second-or-later qualifying reservation logic（期間前の履歴を考慮する）.
- 離脱リスクは現在時点基準で表示され、期間フィルタの影響を受けないことが UI 上で明示される。
- period type `week` は受け付けない。
- Manager cannot access unassigned clinics by query manipulation.
- 期間集計 RPC は anon / authenticated から実行できない。
- Manager patient analysis does not use `permissions.clinic_id`, `profiles.clinic_id`, or JWT clinic scope as access grants.
- No patient write action is exposed to manager.
- Non-manager patient analysis behavior is preserved.

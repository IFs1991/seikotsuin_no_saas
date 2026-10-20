# OS-F2 日報集計の正本（aggregate authority）v0.1

- Issue: [#146](https://github.com/IFs1991/seikotsuin_no_saas/issues/146)（親: #134 / 関連: #136）
- Risk: **High**（売上整合性・患者明細・DB・テナント境界）
- 調査基準 main: `8e7ab4c139d749eadf883eecb6f475bed00dc147`
- Migration: `supabase/migrations/20261020170757_os_daily_report_aggregate_authority.sql`
- Rollback / forward-fix: `supabase/rollbacks/20261020170757_os_daily_report_aggregate_authority_rollback.sql`（自動rollback禁止。本書「Rollback / forward-fix」を参照）
- SQL test: `supabase/tests/os_daily_report_aggregate_authority_test.sql`
- 競合検証: `scripts/daily-reports/verify-aggregate-authority-races.mjs`
- catalog 前後: `docs/stabilization/evidence/os-daily-report-aggregate-authority/`（隔離ローカルDB。Supabase image ではない）

## 1. 問題

`daily_report_items` の AFTER trigger（`sync_daily_report_item_totals` → `recalculate_daily_report_totals`）は親 `daily_reports.total_*` を明細から再計算する。一方、共通write-model（`src/lib/daily-reports/write-model.ts` の `upsertDailyReport`）はリクエストの `total_*` をそのまま `(clinic_id, report_date)` でupsertしていた。別タブで明細を追加/訂正/削除した後に古い画面が保存すると、親日報だけが古いブラウザ合計へ戻る。`new_patients <= total_patients` もクライアント値に対してだけ検証していた（`src/lib/daily-reports/schema.ts`）。

既存の親/明細不整合の実データ調査と修復は対象外（別承認）。

## 2. 保存経路の一覧（変更前）

| 経路                                           | 呼出元                                                             | 親への書込                      | 送る `total_*`               |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- | ---------------------------- |
| PC 日報入力 `/daily-reports/input`             | `handleSubmit` → `POST /api/daily-reports`                         | write-model `upsertDailyReport` | 画面上の明細から計算した値   |
| PC 日報編集 `/daily-reports/edit/[id]`         | `handleSubmit` → `POST /api/daily-reports`                         | 同上                            | 入力欄の値（編集可能）       |
| `useDailyReports` hook（ページからの参照なし） | `createReport` / `updateReport`                                    | 同上                            | hook state の値              |
| mobile `daily-reports.dc.html`                 | bridge `submitDailyReport` → `POST /api/mobile-uiux/daily-reports` | write-model `upsertDailyReport` | フォーム内の行から計算した値 |
| 明細API `POST /api/daily-reports/items`        | `ensureDailyReport`                                                | 親が無ければ0合計でINSERT       | なし                         |
| 来院済み予約 trigger                           | `sync_arrived_reservation_daily_report_item`                       | 親が無ければ0合計でINSERT       | なし                         |
| 明細の追加/訂正/削除                           | `sync_daily_report_item_totals`                                    | 再計算UPDATE                    | DB集計                       |
| PostgREST直接書込                              | authenticated の table grant + RLS                                 | INSERT/UPDATE                   | 任意                         |

変更後、PC・mobile・hook はすべて共通write-modelの `saveDailyReport` → DB関数 `public.save_daily_report` だけを通る。旧 `upsertDailyReport` / `validateDailyReportWriteScope` は削除し、旧上書き経路を残さない。PostgREST直接書込と service role の書込はDB triggerが同じ規則を強制する。

## 3. 型境界（明示的・永続）

`daily_reports.aggregate_source text not null default 'manual'`、`check (aggregate_source in ('manual','items'))`。

| 値       | 意味                                         | `total_*` の正本                                        |
| -------- | -------------------------------------------- | ------------------------------------------------------- |
| `manual` | 明細を持ったことがない手入力型（legacy含む） | 人が入力した値（従来どおり）                            |
| `items`  | 明細型                                       | `daily_report_items` のDB集計。リクエスト値は保存しない |

- **判定は列の値だけで行う。**「現在の明細件数=0」を手入力型の判定に使わない。
- 遷移は `manual → items` の一方向のみ。明細行がその日報へ付いた時（INSERT、または `daily_report_id` の付替え）に、明細triggerが親を `items` にする。変更前もこの時点で手入力合計は明細集計で置き換わっていたため、合計値の業務結果は変えない。
- `aggregate_source` はクライアントから書けない。INSERT は `manual` 以外を拒否し、明細0件の `manual → items` も拒否する（`DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS`, 23514）。手入力合計を明細なしで0へ消す書込は存在しない。
- `items → manual` はDB triggerが拒否する（`DAILY_REPORT_AGGREGATE_SOURCE_IMMUTABLE`, 23514）。最後の明細を削除しても `items` のままで、derived totals は 0 になる。古いクライアントの `total_*` で復活しない。
- 新しい日報はどの経路でも `manual` で作られる（明細API の `ensureDailyReport`、来院済み予約trigger、`save_daily_report`）。明細APIと予約triggerでは、最初の明細INSERTが成功した transaction 内で `items` になる。明細INSERTが失敗した場合は明細0件の `manual` 行が残り、変更前と同じく手入力合計を受け付ける。

### 3.1 既存行の分類（migration時の一回限り）

- 明細を1件以上持つ日報 → `items`。
- 明細0件の日報 → `manual`。変更前の実行時挙動（クライアント合計を受け付け、最初の明細で明細集計へ置換）と同一で、挙動が未定義になる行はない。
- 分類時に `total_*` と `updated_at` は変更しない（一括データ補正をしない）。分類UPDATEはguard trigger作成前に行う。
- 既に親だけ古い合計へ戻っていた `items` 行は、migration後にその日報へ次の書込（明細の追加/訂正/削除、または本文保存）が行われた時点で、その1件だけ明細集計へ戻る。これは変更前から明細書込時に起きていた再計算と同じ規則で、一括補正ではない。
- 既知の曖昧行: migration前に最後の明細を削除済みだった明細型日報は、明細0件のため `manual` に分類される。
  - `自動作成: 来院済み予約` は予約triggerが明細INSERTと同じ transaction でだけ書くため、この文言のまま明細0件の行は過去に明細を持っていたことが確定している。予約が来院済みから他の status（`completed` を含む）へ移ると pending 明細が削除されるため（`20260525000100` の `sync_arrived_reservation_daily_report_item`）、件数が多い可能性がある。
  - 入力画面の保存は明細1件以上のときだけ可能で、`report_text` を `担当: …、入力件数: N` で上書きする。この文言のまま明細0件の行も過去に明細を持っていた可能性が高い。
  - `明細行から自動作成` の行は、明細API の明細INSERT失敗でも残るため確定できない。
  - いずれも文言から自動分類しない。本番適用前に §9 の **必須ゲート** で件数を確認し、0件でなければ適用を止めて owner が扱いを決める（`supabase/AGENTS.md`「backfill不明rowが1件でもあれば停止する」）。

## 4. 編集責任

| 列                                                                           | `manual`              | `items`                            | 備考                                                                                                       |
| ---------------------------------------------------------------------------- | --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `total_patients` / `total_revenue` / `insurance_revenue` / `private_revenue` | 人（リクエスト値）    | DB（明細集計）。リクエスト値は無視 | API互換のためリクエストの必須項目は維持                                                                    |
| `new_patients`                                                               | 人                    | 人。DB集計の `total_patients` 以下 | §5                                                                                                         |
| `report_text`                                                                | 人                    | 人                                 | 変更なし（入力画面は従来どおり「担当/入力件数」文言を送る）                                                |
| `staff_id`                                                                   | 人。同じ院のstaffのみ | 同左                               | 省略時は null（変更前の upsert と同じ挙動。担当の保持は本Issue対象外）                                     |
| `report_date` / `clinic_id`                                                  | 一意キー              | 一意キー                           | 日付変更は「別日付の日報への保存」。元の日報は変わらない（変更前と同じ）。編集画面の日付欄は変更前から無効 |
| `aggregate_source`                                                           | DB                    | DB                                 | クライアントは書けない（INSERTは `manual` のみ、明細付与時だけ `items` へ）                                |

## 5. 検証規則（原子的書込境界）

`public.save_daily_report(...)`（SECURITY INVOKER、`search_path = ''`）が1 transaction内で次を行う。

1. `p_staff_id` が `p_clinic_id` のstaffでなければ `DAILY_REPORT_STAFF_NOT_ACCESSIBLE`（42501）。
2. `p_report_id` 指定時は `(id, clinic_id, report_date)` が一致する行を `FOR UPDATE` で取得。無ければ `DAILY_REPORT_NOT_ACCESSIBLE`（42501）。RLSで見えない別院の行も同じ扱い。
3. 未指定時は `(clinic_id, report_date)` の行を `FOR UPDATE` で取得。無ければ `manual` として `INSERT ... ON CONFLICT DO NOTHING`。競合で作られていれば再取得してロックする（最大3回、超過は40001）。
4. ロック下の `aggregate_source` で分岐する。
   - `manual`: 従来どおり `new_patients <= total_patients`（`DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL`）と `insurance + private <= total_revenue`（`DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL`）を検証し、リクエスト値を保存する。
   - `items`: リクエストの `total_*` を書かずに UPDATE する。guard trigger がロック下で明細から合計を導出し、関数は更新後の行で `new_patients <= total_patients` を検証する（`DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL`、DETAILに導出総数。違反時は transaction ごと取り消す）。
5. 保存後の行（DB集計を含む）を返す。

guard trigger `daily_reports_aggregate_authority`（BEFORE INSERT OR UPDATE、`app_private.enforce_daily_report_aggregate_authority()`、SECURITY DEFINER・`search_path=''`・EXECUTE付与なし）は全書込経路で次を強制する。BEFORE ROW trigger は RLS WITH CHECK より前に動くため、呼出元がまだ認められていない行は一切読まない。

- INSERT: 他行を読まない。`aggregate_source` が `manual` 以外なら拒否する（新しい行は明細を持ち得ないため）。
- UPDATE: `id` の変更を拒否する（`DAILY_REPORT_ID_IMMUTABLE`）。集計は OLD（UPDATE の USING policy を通過済み）の明細だけから導出する。
- `items` 行の `total_*` を明細から導出して上書きする（行ロック取得後に新しいsnapshotで集計）。
- `items → manual`、および明細0件の `manual → items` を拒否する。
- `items` 行で `new_patients` を変更する書込が導出総数を超えれば拒否する（23514）。

staff の院一致は AFTER ROW trigger `daily_reports_staff_clinic_check`（`app_private.enforce_daily_report_staff_clinic()`、SECURITY DEFINER・`search_path=''`・EXECUTE付与なし）で検査する。RLS WITH CHECK が行を認めた後にだけ動くため、他院 staff の所属を判別する手段にならない。`staff_id` / `clinic_id` の新規設定・変更時だけ検査する。

`recalculate_daily_report_totals` は、明細を持つ親を `items` にして UPDATE するだけになり、集計は guard trigger へ一本化する。

### 5.1 明細削除後に新患数が総数を超える場合

明細削除（予約が来院済みから外れた時の自動削除を含む）は拒否しない。拒否すると予約status変更が失敗するため。`new_patients` は**丸めずにそのまま残す**。次回の本文保存は、送られた `new_patients` が導出総数を超えていれば 400（`fieldErrors.new_patients`）で拒否し、利用者に再入力を求める。

業務上の帰結（owner 確認事項）: 手入力運用の日でも、予約を一度「来院済み」にすると日報は `items` になる。その後 `completed` 等へ移して pending 明細が消えると合計は 0 のまま固定され、手入力合計は受け付けない（変更前は再入力できた）。Issue の受入条件（最後の明細削除後も手入力型へ戻さない）に従った結果であり、手入力へ戻す運用手段は本PRでは提供しない（§9 の別Issue案）。

### 5.2 API互換

- リクエスト形は変更しない。`total_*` は引き続き必須だが、`items` 行では保存しない（互換期間は本版で終了日を定めない。削除は別Issue）。
- `new_patients <= total_patients` と収入内訳の相関検証は、型が確定するDB境界へ移す。Zodは単項目の型/範囲のみ検証する。
- エラー: 403（report/staff の院不一致）、400（新患数/収入内訳、`fieldErrors` 形式は従来と同じキー）、その他はこれまでどおり 500/503。
- レスポンス `data` は保存後のDB行（DB集計を含む）。mobile は従来どおり保存後の read model を返す。
- 認証済み利用者は `/rest/v1/rpc/save_daily_report` を API を経由せず直接呼べる。この場合 API の role 一覧・billing gate・mobile entitlement は通らないが、RLS と本関数の検査は適用される。変更前から同じ利用者が table を直接 INSERT/UPDATE できた範囲を超えない。
- RLS による拒否（例: 権限のない院）はこれまでどおり 500 になり、`reportApiFailure` で監視へ送られる（挙動不変）。

## 6. 競合（実DBで検証）

| 競合                                      | 直列化点                                                                     | 期待結果                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 型判定後に最初の明細INSERT                | 親行 `FOR UPDATE` と明細FKの `FOR KEY SHARE` が衝突し、どちらかが待つ        | 先に保存: `manual` 保存後、明細で `items` 化し明細集計。先に明細: 保存は `items` を見てリクエスト合計を無視。どちらも最終合計=明細集計 |
| 最後の明細DELETEと保存                    | 明細triggerの親UPDATEが保存の行ロックを待つ／保存が明細triggerのロックを待つ | 最終合計=0、`items` 維持、`new_patients` は丸めない                                                                                    |
| 同日の初回作成（保存×保存、保存×明細API） | `(clinic_id, report_date)` 一意制約 + `ON CONFLICT DO NOTHING` + 再ロック    | 1行のみ。後続は既存行をロックして型に従う。明細APIの親は `manual` で作られ、明細INSERTで `items` になる                                |
| 明細INSERT×明細INSERT                     | guard trigger が親行ロック取得後に新snapshotで集計                           | 最終合計=全明細（変更前の lost update も解消）                                                                                         |

`scripts/daily-reports/verify-aggregate-authority-races.mjs`（`npm run daily-reports:verify:races:local`、CI Database Contract に追加）が2接続で順序を固定し、`pg_blocking_pids()` で後続側が先行側に待たされていることを確認してから先行側をcommitし、最終状態をDBで検証する。loopback 以外のホストと、query 文字列付きの接続URL（libpq の `host`/`hostaddr`/`service` 上書き）は拒否する。

## 7. 権限・テナント境界

- RLS policy・table GRANT・FKは変更しない。通常利用者の権限は拡大しない。
- `save_daily_report` は SECURITY INVOKER（RLSが適用される）。EXECUTE は authenticated のみ（PUBLIC/anon から revoke）。
- guard trigger 関数2件は SECURITY DEFINER（呼出元のRLS可視性に依存せず全明細・staffを参照するため）、`search_path=''`、EXECUTE は PUBLIC/anon/authenticated/service_role から revoke。参照は RLS が認めた行（INSERT時は読まない、UPDATE時は OLD の明細、staff は AFTER）に限る。エラーは他院データに依存しない。
- `recalculate_daily_report_totals` の EXECUTE（service_role のみ）は変更しない。明細を持たない日報を `items` にすることはできない。
- APIは従来どおり `ensureClinicAccess` / `processClinicScopedBody`（role・clinic scope）と billing gate を通過した後にだけ関数を呼ぶ。

## 8. UI（Design.md EXTEND）

- 編集画面: `aggregateSource === 'items'` の日報は合計4欄を既存 `Input` の `disabled` で表示し、「明細から自動集計」の注記を出す。手入力型は従来どおり編集可能。スタイル・トークンの追加はしない。
- 入力画面: 保存後の要約は保存レスポンスのDB集計を表示する。
- mobile: 画面資産は変更しない。保存後に返る read model（DB値）を表示する既存動作のまま。明細型の日では mobile フォームの行から計算した合計は保存されない（保存成功の表示後、一覧はDB値になる）。mobile 側での事前警告は本PRの対象外。

## 9. 適用手順・Rollback / forward-fix

### 9.1 適用前の必須ゲート（read-only、本番では別承認で実行）

```sql
-- G1: 分類の曖昧行（下限）。0件でなければ適用を止め、owner が扱いを決めて記録する。
select
  case
    when r.report_text = '自動作成: 来院済み予約' then 'arrived_auto'
    when r.report_text like '担当: %、入力件数: %' then 'input_page_save'
    else 'items_api_shell'
  end as kind,
  count(*)
from public.daily_reports r
where (
    r.report_text in ('明細行から自動作成', '自動作成: 来院済み予約')
    or r.report_text like '担当: %、入力件数: %'
  )
  and not exists (select 1 from public.daily_report_items i where i.daily_report_id = r.id)
group by 1;
-- G2: 規模の把握（lock 時間の見積り）
select count(*) as reports,
       count(*) filter (where exists (select 1 from public.daily_report_items i where i.daily_report_id = r.id)) as itemized
from public.daily_reports r;
```

- G1 は下限である。`arrived_auto`（予約triggerが明細と同時にだけ書く文言）と `input_page_save`（入力画面は明細1件以上のときだけ保存でき、毎回この文言で上書きする）は過去に明細を持っていたことがほぼ確定している。`items_api_shell` は明細INSERT失敗でも残るため不確定。文言を手で書き換えた明細0件の行はどの方法でも識別できない。
- G1 が0件: 進める。0件以外: 停止。選択肢は (a) そのまま `manual`（変更前の挙動を維持、stale 合計の再上書きは起こり得る）、(b) `arrived_auto` / `input_page_save` 行を `items` に分類する（その行に後から手入力した合計は次の書込で0になる）。どちらを選んだかと種類別件数を承認記録に残す。
- (b) の実行方法: guard は明細0件の `manual → items` を全 role で拒否するため、通常の UPDATE では実行できない。
  - 本 migration をまだどの永続環境にも適用していない場合: 本 migration の手順2（分類UPDATE。guard 作成前に動く）の条件へ owner が選んだ種類を追加し、再review・CI を通してから適用する。
  - 適用済みの場合: 別の reviewed forward migration で、1 transaction 内に対象 id と変更前の合計を証跡へ記録し、`alter table public.daily_reports disable trigger daily_reports_aggregate_authority` → `aggregate_source` だけを更新 → `enable trigger` を行う（`ALTER TABLE` の lock を伴うため低負荷時間帯に実施）。trigger を無効のまま残す・削除する手順は禁止。
- migration は `lock_timeout = 5s`、`statement_timeout = 60s` で動き、`daily_reports` に ACCESS EXCLUSIVE を取る（列追加・CHECK検証・分類UPDATE）。予約triggerからの書込も待つため、低負荷時間帯に適用する。
- 適用前後の catalog snapshot を取り、`evidence/os-daily-report-aggregate-authority/` の差分（列+CHECK、trigger 2件、関数3件。RLS・policy・table grant は不変）と一致することを確認する。

### 9.2 順序

migration → 検証（pgTAP・競合スクリプト・catalog確認）→ アプリ展開。アプリを先に展開すると `save_daily_report` が無く、日報保存がすべて失敗する（merge による自動 deploy に注意）。migration 適用後・アプリ展開前の旧アプリは upsert で `total_*` を送り続けるが、guard が `items` 行では無視する。旧アプリの Zod は DB上は有効な一部の新患数を拒否し得る（安全側）。

### 9.3 Rollback / forward-fix

集計列を再び無条件に受け付けるrollbackは行わない（rollback SQLは実行するとエラーで停止する）。問題時は次の forward-fix に限る。

1. アプリ: 表示の問題は UI だけを戻す（read model の `aggregateSource` を無視しても安全）。API 互換は維持しているため旧クライアントはそのまま動く。
2. 関数不具合: 新しい migration で `save_daily_report` / guard 関数を `create or replace` する。guard trigger の削除はしない。
3. `items` の日報を手入力へ戻す手段は提供しない（`items → manual` は guard が拒否）。必要になった場合は、明細0件の日報だけを対象に、変更前の値を記録したうえで service_role 専用・監査ログ付きの保守関数を追加する別Issue（High）として扱う。

確認用SQL（read-only）: `select aggregate_source, count(*) from public.daily_reports group by 1;`

## 10. 非対象

日報/明細テーブルの一体化、収益見積りエンジン、予約status再定義（来院済みから外れた時の pending 明細削除を含む）、UI全面刷新、本番データ修復、`items` から手入力へ戻す運用手段、mobile の事前警告、`staff_id` 省略時の null 化や入力画面の `new_patients: 0` 固定など集計以外の既存仕様の変更。

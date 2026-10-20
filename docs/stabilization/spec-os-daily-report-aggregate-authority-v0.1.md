# OS-F2 日報集計の正本（aggregate authority）v0.1

- Issue: [#146](https://github.com/IFs1991/seikotsuin_no_saas/issues/146)（親: #134 / 関連: #136）
- Risk: **High**（売上整合性・患者明細・DB・テナント境界）
- 調査基準 main: `8e7ab4c139d749eadf883eecb6f475bed00dc147`
- Migration: `supabase/migrations/20261020170757_os_daily_report_aggregate_authority.sql`
- Rollback / forward-fix: `supabase/rollbacks/20261020170757_os_daily_report_aggregate_authority_rollback.sql`（自動rollback禁止。本書「Rollback / forward-fix」を参照）
- SQL test: `supabase/tests/os_daily_report_aggregate_authority_test.sql`
- 競合検証: `scripts/daily-reports/verify-aggregate-authority-races.mjs`

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
- `items → manual` はDB triggerが拒否する（`DAILY_REPORT_AGGREGATE_SOURCE_IMMUTABLE`, SQLSTATE 23514）。最後の明細を削除しても `items` のままで、derived totals は 0 になる。古いクライアントの `total_*` で復活しない。
- 明細APIが作る親（`ensureDailyReport`）は最初から `items` で作る。来院済み予約triggerが作る親は既定値 `manual` で作られ、同じtransaction内の明細INSERTで直ちに `items` になる。
- `save_daily_report` が新規作成する日報は `manual`（明細はまだ存在し得ない）。

### 3.1 既存行の分類（migration時の一回限り）

- 明細を1件以上持つ日報 → `items`。
- 明細0件の日報 → `manual`。変更前の実行時挙動（クライアント合計を受け付け、最初の明細で明細集計へ置換）と同一で、挙動が未定義になる行はない。
- 分類時に `total_*` と `updated_at` は変更しない（一括データ補正をしない）。分類UPDATEはguard trigger作成前に行う。
- 既に親だけ古い合計へ戻っていた `items` 行は、migration後にその日報へ次の書込（明細の追加/訂正/削除、または本文保存）が行われた時点で、その1件だけ明細集計へ戻る。これは変更前から明細書込時に起きていた再計算と同じ規則で、一括補正ではない。
- 既知の限界: migration前に最後の明細を削除済みだった明細型日報は区別できず `manual` になる。`report_text` が自動作成文言（`明細行から自動作成` / `自動作成: 来院済み予約`）のまま明細0件の行が候補だが、文言での推定分類は行わない。必要なら §9 の読取SQLで件数を確認し、別承認で扱う。

## 4. 編集責任

| 列                                                                           | `manual`              | `items`                            | 備考                                                                                                       |
| ---------------------------------------------------------------------------- | --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `total_patients` / `total_revenue` / `insurance_revenue` / `private_revenue` | 人（リクエスト値）    | DB（明細集計）。リクエスト値は無視 | API互換のためリクエストの必須項目は維持                                                                    |
| `new_patients`                                                               | 人                    | 人。DB集計の `total_patients` 以下 | §5                                                                                                         |
| `report_text`                                                                | 人                    | 人                                 | 変更なし（入力画面は従来どおり「担当/入力件数」文言を送る）                                                |
| `staff_id`                                                                   | 人。同じ院のstaffのみ | 同左                               | 省略時は null（変更前の upsert と同じ挙動。担当の保持は本Issue対象外）                                     |
| `report_date` / `clinic_id`                                                  | 一意キー              | 一意キー                           | 日付変更は「別日付の日報への保存」。元の日報は変わらない（変更前と同じ）。編集画面の日付欄は変更前から無効 |
| `aggregate_source`                                                           | DB                    | DB                                 | API/画面からは書かない                                                                                     |

## 5. 検証規則（原子的書込境界）

`public.save_daily_report(...)`（SECURITY INVOKER、`search_path = ''`）が1 transaction内で次を行う。

1. `p_staff_id` が `p_clinic_id` のstaffでなければ `DAILY_REPORT_STAFF_NOT_ACCESSIBLE`（42501）。
2. `p_report_id` 指定時は `(id, clinic_id, report_date)` が一致する行を `FOR UPDATE` で取得。無ければ `DAILY_REPORT_NOT_ACCESSIBLE`（42501）。RLSで見えない別院の行も同じ扱い。
3. 未指定時は `(clinic_id, report_date)` の行を `FOR UPDATE` で取得。無ければ `manual` として `INSERT ... ON CONFLICT DO NOTHING`。競合で作られていれば再取得してロックする（最大3回、超過は40001）。
4. ロック下の `aggregate_source` で分岐する。
   - `manual`: 従来どおり `new_patients <= total_patients`（`DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL`）と `insurance + private <= total_revenue`（`DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL`）を検証し、リクエスト値を保存する。
   - `items`: リクエストの `total_*` を書かずに UPDATE する。guard trigger がロック下で明細から合計を導出し、関数は更新後の行で `new_patients <= total_patients` を検証する（`DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL`、DETAILに導出総数。違反時は transaction ごと取り消す）。
5. 保存後の行（DB集計を含む）を返す。

guard trigger `daily_reports_aggregate_authority`（BEFORE INSERT OR UPDATE、`app_private.enforce_daily_report_aggregate_authority()`、SECURITY DEFINER・`search_path=''`・EXECUTE付与なし）は全書込経路で次を強制する。

- `items` 行の `total_*` を `daily_report_items` から導出して上書きする（行ロック取得後に新しいsnapshotで集計）。
- `items → manual` を拒否する。
- `staff_id` の新規設定/変更時、同じ院のstaffでなければ拒否（23514）。
- `items` 行の INSERT または `new_patients` 変更時、導出総数を超えれば拒否（23514）。

`recalculate_daily_report_totals` は親を `items` にしてUPDATEするだけになり、集計はguard triggerへ一本化する。

### 5.1 明細削除後に新患数が総数を超える場合

明細削除（予約が来院済みから外れた時の自動削除を含む）は拒否しない。拒否すると予約status変更が失敗するため。`new_patients` は**丸めずにそのまま残す**。次回の本文保存は、送られた `new_patients` が導出総数を超えていれば 400（`fieldErrors.new_patients`）で拒否し、利用者に再入力を求める。

### 5.2 API互換

- リクエスト形は変更しない。`total_*` は引き続き必須だが、`items` 行では保存しない（互換期間は本版で終了日を定めない。削除は別Issue）。
- `new_patients <= total_patients` と収入内訳の相関検証は、型が確定するDB境界へ移す。Zodは単項目の型/範囲のみ検証する。
- エラー: 403（report/staff の院不一致）、400（新患数/収入内訳、`fieldErrors` 形式は従来と同じキー）、その他はこれまでどおり 500/503。
- レスポンス `data` は保存後のDB行（DB集計を含む）。mobile は従来どおり保存後の read model を返す。

## 6. 競合（実DBで検証）

| 競合                                      | 直列化点                                                                     | 期待結果                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 型判定後に最初の明細INSERT                | 親行 `FOR UPDATE` と明細FKの `FOR KEY SHARE` が衝突し、どちらかが待つ        | 先に保存: `manual` 保存後、明細で `items` 化し明細集計。先に明細: 保存は `items` を見てリクエスト合計を無視。どちらも最終合計=明細集計 |
| 最後の明細DELETEと保存                    | 明細triggerの親UPDATEが保存の行ロックを待つ／保存が明細triggerのロックを待つ | 最終合計=0、`items` 維持、`new_patients` は丸めない                                                                                    |
| 同日の初回作成（保存×保存、保存×明細API） | `(clinic_id, report_date)` 一意制約 + `ON CONFLICT DO NOTHING` + 再ロック    | 1行のみ。後続は既存行をロックして型に従う                                                                                              |
| 明細INSERT×明細INSERT                     | guard trigger が親行ロック取得後に新snapshotで集計                           | 最終合計=全明細（変更前の lost update も解消）                                                                                         |

`scripts/daily-reports/verify-aggregate-authority-races.mjs`（`npm run daily-reports:verify:races:local`、CI Database Contract に追加）が2接続で順序を固定し、`pg_blocking_pids()` で後続側が先行側に待たされていることを確認してから先行側をcommitし、最終状態をDBで検証する。loopback以外の接続先は拒否する。

## 7. 権限・テナント境界

- RLS policy・table GRANT・FKは変更しない。通常利用者の権限は拡大しない。
- `save_daily_report` は SECURITY INVOKER（RLSが適用される）。EXECUTE は authenticated のみ（PUBLIC/anon から revoke）。
- guard trigger 関数は SECURITY DEFINER（呼出元のRLS可視性に依存せず全明細を集計するため）、`search_path=''`、EXECUTE は PUBLIC/anon/authenticated/service_role から revoke。
- APIは従来どおり `ensureClinicAccess` / `processClinicScopedBody`（role・clinic scope）と billing gate を通過した後にだけ関数を呼ぶ。

## 8. UI（Design.md EXTEND）

- 編集画面: `aggregateSource === 'items'` の日報は合計4欄を既存 `Input` の `disabled` で表示し、「明細から自動集計」の注記を出す。手入力型は従来どおり編集可能。スタイル・トークンの追加はしない。
- 入力画面: 保存後の要約は保存レスポンスのDB集計を表示する。
- mobile: 画面資産は変更しない。保存後に返る read model（DB値）を表示する既存動作のまま。

## 9. Rollback / forward-fix

集計列を再び無条件に受け付けるrollbackは行わない（rollback SQLは実行するとエラーで停止する）。問題時は次の順で forward-fix する。

1. アプリ: 表示の問題は UI だけを戻す（read model の `aggregateSource` を無視しても安全）。API 互換は維持しているため旧クライアントはそのまま動く。
2. DB: 誤分類の個別修正は承認済みチケットで `update public.daily_reports set aggregate_source = 'items' where id = ...` のみ（`items → manual` は trigger が拒否する）。
3. 関数不具合は新しい migration で `save_daily_report` / guard 関数を `create or replace` する。guard trigger の削除はしない。

読取のみの確認SQL（本番では別承認で実行）:

```sql
select aggregate_source, count(*) from public.daily_reports group by 1;
select count(*) from public.daily_reports r
where r.aggregate_source = 'manual'
  and r.report_text in ('明細行から自動作成', '自動作成: 来院済み予約')
  and not exists (select 1 from public.daily_report_items i where i.daily_report_id = r.id);
```

適用順は migration → 検証（pgTAP・競合スクリプト・catalog確認）→ アプリ展開。migration 適用後・アプリ展開前の旧アプリは upsert で `total_*` を送り続けるが、guard trigger が `items` 行では無視する。相関検証のZod移設前の旧アプリは、DB上は有効な一部の新患数を従来どおり拒否し得る（安全側）。

## 10. 非対象

日報/明細テーブルの一体化、収益見積りエンジン、予約status再定義、UI全面刷新、本番データ修復、`staff_id` 省略時の null 化や入力画面の `new_patients: 0` 固定など集計以外の既存仕様の変更。

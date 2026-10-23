# OS-F1 顧客の完了予約統計cacheの正本（customer stat authority）v0.1

- Issue: [#147](https://github.com/IFs1991/seikotsuin_no_saas/issues/147)（親: #134 / 関連: #136）
- Risk: **High**（患者データ・DB trigger・tenant boundary）
- 基準 main: `91d18779ed94c5688c1daa15363e4a5b99da1ecf`（Issue の調査基準は `8e7ab4c`。指摘は最新 main でも残存を確認）
- Migration: `supabase/migrations/20261023064851_os_customer_stat_authority.sql`（`supabase migration new` で採番）
- Rollback / forward-fix: `supabase/rollbacks/20261023064851_os_customer_stat_authority_rollback.sql`（自動rollback禁止。§9.4）
- SQL test: `supabase/tests/os_customer_stat_authority_test.sql`（pgTAP 83件）
- 競合検証: `scripts/customers/verify-customer-stat-races.mjs`（`npm run customers:verify:races:local`、CI Database Contract に追加。接続先の固定は `scripts/daily-reports/local-psql.mjs` を共用）
- catalog 前後・適用検証: `docs/stabilization/evidence/os-customer-stat-authority/`
- 改訂: 2026-10-23 独立review 対応（REPEATABLE READ / SERIALIZABLE の書込を拒否、型名の修飾、preflight の強化、negative test の追加、runbook の訂正。§5.3・§6・§7・§9）

## 1. 問題（main `91d1877` の隔離DBで再現）

`public.update_customer_stats()`（baseline、`update_customer_stats_trigger` AFTER INSERT OR UPDATE FOR EACH ROW）は、予約が `completed` へ入ったとき（INSERT時、または OLD が `completed` 以外の UPDATE）だけ `total_visits + 1`、`total_revenue + coalesce(actual_price, price, 0)`、`last_visit_date = NEW.end_time` を書く。減算・再計算・他列の変更への追従が無い。予約API（`src/app/api/reservations/schema.ts` の `reservationUpdateSchema`）は `completed` / `cancelled` を両方受け付け、status だけの再送や過去予約の status 変更を禁止していない。

| 反例                                                      | main `91d1877` の cache                  | 正しい値          |
| --------------------------------------------------------- | ---------------------------------------- | ----------------- |
| completed → cancelled → completed                         | `2 / 2000.00`                            | `1 / 1000.00`     |
| 新しい予約の後に過去予約を完了                            | 最終来院日が過去予約の `end_time` へ後退 | `max(end_time)`   |
| 完了後の `actual_price` 訂正・オプション再計算（`price`） | 旧金額のまま                             | 訂正後の金額      |
| 完了予約の論理削除・`is_deleted` NULL                     | 件数・売上が残る                         | 除外              |
| 完了予約が0件になる（取消・来院なし）                     | 値が残る                                 | `0 / 0.00 / NULL` |
| 完了予約の患者付替え（同院）                              | 旧患者に残り新患者に入らない             | 両方を再計算      |
| 並行更新: 新しい予約と過去予約を同時に完了                | 後から commit した側の `end_time`        | `max(end_time)`   |
| 並行更新: 取消と別予約の完了                              | 取消が反映されない                       | 取消後の集合      |

（pgTAP 83件中29件・競合検証8件中6件が main で正しい理由により失敗。内訳は §7）

個別患者の実データの不整合は調査していない（本番の読出し・書換えは本Issueの対象外）。過去データは §8・§9 の read-only ゲートで評価する。

## 2. 統計の正本（契約）

### 2.1 対象集合

顧客 `c` の対象集合 `S(c)` は、次をすべて満たす `public.reservations` の行とする。

- `customer_id = c.id` かつ `clinic_id = c.clinic_id`（複合FK `reservations_customer_id_fkey (customer_id, clinic_id) → customers (id, clinic_id)` により常に成立する。他院の予約を集計しないことを防御的に明記する）
- `status = 'completed'`
- `is_deleted = false`（NULL は対象外。`patient_visit_summary`・`reservations_no_overlap` と同じ判定）

### 2.2 値

| 列                          | 型（変更なし）             | 値                                      | `S(c)` が空 |
| --------------------------- | -------------------------- | --------------------------------------- | ----------- |
| `customers.total_visits`    | `integer`、default 0       | `count(S(c))`                           | `0`         |
| `customers.total_revenue`   | `numeric(10,2)`、default 0 | `sum(coalesce(actual_price, price, 0))` | `0.00`      |
| `customers.last_visit_date` | `timestamptz`              | `max(end_time)`                         | `NULL`      |

- 精度: 予約の `price` / `actual_price` は `numeric(10,2)`。合計は `numeric(10,2)` に格納する（上限 99,999,999.99。超過時は変更前と同じく書込がエラーになり、予約の変更ごと取り消される）。
- cache は `S(c)` だけから再構築できる（差分加算に依存しない）。値が既に一致する場合は customers 行を書き換えない（`updated_at` も変わらない）。値が変わる場合は既存の `update_customers_updated_at` trigger が `updated_at` を更新する（変更前と同じ）。

### 2.3 変更しない契約

- `public.patient_visit_summary`: 非削除の `arrived` + `completed`、`start_time` の JST 日付で集計する既存の別指標。定義・`security_invoker` は変更しない（pgTAP B7/B8 で定義の md5 を固定）。
- `customers.lifetime_value`: 別列。DB・アプリに書込元は無く（既定値 0）、本変更でも書かない。`total_revenue` と同一視しない（pgTAP A7/G3）。
- 休眠掘起し（`src/lib/outreach.ts` の `fetchDormantCandidates` / `createOutreachDraft`）: 参照列（`last_visit_date` / `total_visits` / `lifetime_value`）、consent、LINE credential generation、clinic scope、配信対象判定は変更しない（Jest で参照元と列を固定）。
- 予約API（`schema.ts` / `route.ts`）の契約、RLS policy、table GRANT、FK は変更しない。物理削除はAPIへ追加しない（`DELETE /api/reservations` は 405 のまま）。

### 2.4 二つの指標の違い

|            | 顧客統計cache（本仕様）                           | `patient_visit_summary`                        |
| ---------- | ------------------------------------------------- | ---------------------------------------------- |
| 対象status | `completed` のみ                                  | `arrived` + `completed`                        |
| 最終来院   | `max(end_time)`（timestamptz）                    | `max(start_time)` の JST 日付（date）          |
| 売上       | `completed` の `coalesce(actual_price, price, 0)` | `arrived` + `completed` の同式                 |
| 用途       | 休眠掘起しの抽出（`outreach.ts`）                 | 患者分析（`patient-analysis-service.ts` ほか） |

両者が常に一致することは要件にしない。意味の統一は別Issueとする（Issue #147 の停止条件どおり、本PRでは統一しない）。

### 2.5 `completed` 契約を採用した根拠と業務上の注意

採用の根拠（停止条件に当たる事実は見つからなかった）:

- 予約API・型（`schema.ts`、`src/app/(app)/reservations/api.ts`）は `completed` を受け付け、既存 trigger のコメントと Issue の契約はいずれも「完了予約」を cache の対象としている。
- `completed` を来院完了以外の意味で使う経路は無い。mobile は `completed` を「来院済み」と表示し（`src/lib/mobile-uiux/dc-script-patch.ts`）、集計系は `completed` と `arrived` を来院として扱う（例: `src/lib/services/staff-availability-service.ts` の `VISITED_STATUSES`）。
- `completed` 契約は変更前の cache の対象と同じで、本変更はその定義どおりの値に揃えるだけである。対象statusの変更はしない。

業務上の注意（owner 判断事項。§11.2）:

- PC の予約詳細の操作は「来院済み（`arrived`）/ 来院なし / キャンセル」（`AppointmentDetail.tsx` の `VISIT_STATUS_ACTIONS`）、mobile の操作も `arrived` を送る。画面操作で来院を記録しただけの予約は `completed` にならず、cache に入らない。これは変更前からの挙動で、本変更で範囲は狭くも広くもならない。結果として、cache を使う休眠掘起しは `arrived` だけの患者を抽出しない。
- `arrived` から他の status（`completed` を含む）へ変えると、未確定の日報明細が削除される（`sync_arrived_reservation_daily_report_item`、#146 spec §11.2）。`completed` を運用に組み込む場合はこの副作用も判断に含める。

## 3. 予約の書込経路（すべて DB trigger を通る）

| 経路                           | 呼出元                                                                                                          | cache への影響                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 予約 PATCH                     | `src/app/api/reservations/route.ts`（clinic scope 検証後の service_role client、`updated_at` による楽観ロック） | status・時間・担当・オプション再計算（`price`）の変更を trigger が反映 |
| mobile 予約 PATCH/POST         | `src/app/api/mobile-uiux/reservations/route.ts`                                                                 | 同上                                                                   |
| 公開予約・LINE 予約作成        | `src/lib/services/public-reservation-service.ts`（`unconfirmed` で作成）                                        | 対象外の行。反映不要                                                   |
| LINE マイページ取消            | `src/lib/services/public-my-page-service.ts`（`completed` は取消不可）                                          | 取消を反映                                                             |
| 日報明細の次回予約             | `src/app/api/daily-reports/items/route.ts`（`unconfirmed` へ戻す・取消）                                        | 完了予約だった場合も再計算                                             |
| PostgREST 直接書込             | authenticated の INSERT/UPDATE grant + RLS                                                                      | trigger は RLS が認めた行の後で動く                                    |
| service_role / postgres の SQL | 運用・検証                                                                                                      | 同じ trigger が動く                                                    |

- 物理 DELETE は変更前から失敗する（`reservation_deleted_log` が履歴の参照検証 `validate_reservation_history_clinic_refs` で 23503 になる。pgTAP A28）。将来到達した場合に備え DELETE も同じ規則で反映する（A30）。
- `TRUNCATE public.reservations` は対象外（アプリ経路なし。`reservation_history` 等の FK により CASCADE なしでは実行できない）。実行した場合は §9.3 の再構築が必要。
- `session_replication_role = replica` や trigger 無効化で書いた行は反映されない（運用者のみ可能。§9.4）。

## 4. 実装（DB）

### 4.1 再構築関数 `app_private.refresh_customer_visit_stats(uuid[])`

SECURITY DEFINER・`search_path = ''`・所有者 `postgres`・EXECUTE は所有者以外に付与しない（PUBLIC / anon / authenticated / service_role から revoke）。

1. 引数が NULL・空なら何もしない（分離レベルも見ない）。
2. 分離レベルが READ COMMITTED（PostgreSQL では同じ動作の READ UNCOMMITTED を含む）以外なら、何もロック・書込せずに `CUSTOMER_VISIT_STATS_REQUIRES_READ_COMMITTED`（SQLSTATE `0A000`）で拒否する（§5.3）。
3. 対象顧客の行を **id 順に** `FOR NO KEY UPDATE` でロックする（顧客単位で書込を直列化する。`FOR KEY SHARE` を取る予約の FK 検査とは衝突しない）。
4. **次の文で** `S(c)` を集計し、値が異なる顧客だけを UPDATE する。READ COMMITTED では文ごとに新しい snapshot を取るため、ロック取得前に commit した書込をすべて含む。

### 4.2 文単位 trigger

`public.reservations` に AFTER INSERT / AFTER UPDATE / AFTER DELETE の FOR EACH STATEMENT trigger を3本置き、遷移表（`new_rows` / `old_rows`）を `app_private.sync_customer_visit_stats()`（SECURITY DEFINER・`search_path = ''`・EXECUTE 付与なし）へ渡す。遷移表は1 trigger 1 event・列リスト無しでしか宣言できないため3本に分けた。旧 `update_customer_stats_trigger` と `public.update_customer_stats()` は同じ transaction で削除する。

### 4.3 再計算の対象

文で変わった行のうち、変更前または変更後が集計対象（`completed` かつ `is_deleted = false`）の行の顧客を、変更前・変更後の両方について再計算する。UPDATE では id で変更前後を対応付け、契約に関わる列（`status` / `is_deleted` / `customer_id` / `clinic_id` / `price` / `actual_price` / `end_time`）のどれかが変わった行だけを対象にする（`notes`・`payment_status`・リマインド送信済み等の更新では customers 行をロックも更新もしない）。

### 4.4 書込の最小化

- 値が一致する顧客の行は書き換えない。契約外の列の変更では再構築しないこと（pgTAP A6）、再構築しても値が同じなら書き換えないこと（A33）を `ctid` で確認し、値が変わる場合は書き換えること（A34）も確認した。
- migration は既存の cache 値を書き換えない（§8）。

## 5. 競合制御

### 5.1 READ COMMITTED（アプリ・API・RPC・trigger の分離レベル）

- 同じ顧客の cache を再計算する書込は、顧客行の `FOR NO KEY UPDATE` で直列化される。後続の書込は先行の commit を待ってから新しい snapshot で集計するため、先行の変更を含む。最後に commit した書込の集計が、それまでに commit されたすべての変更を含む（取りこぼし・二重加算なし）。
- 同じ文の中で同時に集計 SELECT とロックを行うと、待機前の snapshot で集計した値が後から書かれて lost update になる。ロックと集計を別の文に分けているのはこのため（変異版で R1〜R5 が失敗することを確認。§7.2）。

### 5.2 ロック順序とデッドロック

- 1文が複数の顧客に関わる場合（複数行 UPDATE、患者付替え）、顧客は id 順にロックする。1文ずつの transaction（API・PostgREST の書込）同士では顧客ロックでデッドロックしない（R4・R5）。
- 予約の FK 検査（`FOR KEY SHARE`）と顧客ロック（`FOR NO KEY UPDATE`）は衝突しない。
- 残る可能性: 1 transaction 内で複数の文を発行し、別々の顧客を逆順に変える2つの transaction は、顧客ロックで互いを待ちデッドロックし得る。PostgreSQL が検出して片方を 40P01 で取り消す（データは壊れない）。アプリ・RPC にこの経路は無い。変更前の行単位 trigger（完了時の UPDATE customers）も同じ性質を持っていた。

### 5.3 REPEATABLE READ / SERIALIZABLE

- snapshot が transaction の開始時に固定されるため、ロック後に集計しても、その後に commit された変更を含まない。他の transaction が customers 行を書き換えていればロックで 40001 になるが、値が既に一致していて書き換えなかった commit は検出できない。旧 trigger が残した古い cache が新しい値と偶然一致する場合も同じで（R8）、snapshot の値で cache を上書きしてしまう。
- そのため再構築関数は、READ COMMITTED 以外の transaction で再構築が必要になった時点で `0A000`（`CUSTOMER_VISIT_STATS_REQUIRES_READ_COMMITTED`）を返し、何もロック・書込しない。その transaction の予約の変更ごと取り消される。再構築が不要な書込（契約外の列だけの更新、変更前後とも集計対象外の行）は影響を受けない。
- アプリ・API・RPC にこの分離レベルで予約を書く経路は無い（repo 内に `isolation level` 指定なし）。R6（READ COMMITTED は成功し正しい値）、R7・R8（REPEATABLE READ は `0A000`、値は変わらない）で確認した。旧版（`2723f03`。集計対象行を `FOR SHARE` でロックする方式）は R8 で REPEATABLE READ の書込を受け付け、その transaction の snapshot に先行の完了が無いまま集計した値（`1 / 900.00`。commit 後の予約集合では `2 / 1900.00`）を cache に書くことを独立review が示したため、拒否方式に変えた。

### 5.4 検証（実DB・2接続）

`scripts/customers/verify-customer-stat-races.mjs` は2つの psql セッションで順序を固定する。blocking 型は先行側が transaction を開いたまま `pg_blocking_pids()` で後続側の待機を確認してから commit し、snapshot 型は後続側が snapshot を取った後に advisory lock で先行側の commit を待つ。最終状態は文字列の期待値で検証する。接続先は loopback だけを許可し、`PGHOST` / `PGHOSTADDR` / `PGSERVICE` 等の接続先を変える変数を psql に渡さない（`scripts/daily-reports/local-psql.mjs`）。

| ID  | 競合                                                                                         | 期待結果                                                   |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1  | 同じ顧客の別予約を2接続で完了（後続は RLS 経由の authenticated）                             | `2 / 3000.00`、後続は顧客ロックで待機                      |
| R2  | 新しい予約の完了と過去予約の完了                                                             | 最終来院日は新しい予約の `end_time`                        |
| R3  | 完了予約の取消と別予約の完了                                                                 | 取消後の集合（`1 / 2000.00`）                              |
| R4  | 完了予約の付替え（X→Y）と Y の別予約の完了                                                   | X `0 / 0.00 / NULL`、Y `2 / 3000.00`                       |
| R5  | 同じ2顧客にまたがる複数行 UPDATE 同士（行の順序は逆）                                        | デッドロックせず両顧客とも正しい                           |
| R6  | 総計を変えない変更（最新でない完了予約の日時変更）の後の READ COMMITTED の取消               | 新しい snapshot で `1 / 2000.00 / 変更後の end_time`       |
| R7  | R6 と同じ順序を REPEATABLE READ で                                                           | 後続は `0A000` で拒否、値は変わらない                      |
| R8  | 古い cache と一致する値になる完了（customers 行を書かない）の後の REPEATABLE READ の価格訂正 | 後続は `0A000` で拒否、cache は正しい `2 / 2000.00` のまま |

## 6. 権限・テナント境界

- SECURITY DEFINER が必要な理由: authenticated は `customers` に SELECT しか持たず、cache を書けない（変更前と同じく trigger が所有者権限で書く）。所有者 `postgres` は RLS の対象外（FORCE RLS なし）。
- 両関数は `search_path = ''` で、表・関数に加えて型名も修飾する（`pg_catalog.uuid[]`）。`search_path = ''` でも、表と型の名前は `pg_temp` が先に検索されるため（関数・演算子は検索されない）、未修飾の型名は呼出元が作った temp の domain に置き換えられ得る（独立review で再現。任意の SQL と TEMP 権限が必要で PostgREST からは不可）。`integer` / `numeric` は文法上 `pg_catalog` に固定される。遷移表 `new_rows` / `old_rows` は同名の temp table より優先される。EXECUTE は所有者のみ（旧 `update_customer_stats()` にあった service_role の EXECUTE も無くなる）。PostgREST から呼べない（`app_private` は公開スキーマではなく、EXECUTE も無い）。
- AFTER STATEMENT trigger は、RLS の USING / WITH CHECK、BEFORE trigger（`validate_reservations_clinic_refs`）、FK 検査を通った行だけを遷移表として受け取る。読むのはその行の顧客の、同じ院の予約だけで、呼出元へ値を返さない。エラー内容は他院のデータに依存しない。
- clinic A の staff（RLS 経由）が clinic B に関わる書込を試みた場合、どれも cache の trigger より前に拒否され、両院の cache・行は変わらない（pgTAP T32〜T34）。他院の患者・メニュー・担当は RLS で見えないため、参照の検証（`validate_reservations_clinic_refs`、呼出元の権限で動く）が 23503 を返す（T8・T25・T26）。他院の予約 id への upsert は UPDATE の USING で 42501（T27）、DELETE は権限が無く 42501（T28）、clinic B の顧客は cache 列を含めて読めない（T29）。同じ INSERT は service_role では成功する（T30、取消済み）ため、拒否は RLS による。予約の院の変更は、予約履歴の FK（`(reservation_id, clinic_id)`）によりどの role でもできない（T31）。T9（患者を変えずに院だけ変更）の 23514 は参照の検証による拒否で、RLS には依存しない。T22・T23 は所有者権限での参照整合性の確認で、tenant の negative とは数えない。
- RLS policy・RLS 有効化・table GRANT は不変（pgTAP B9〜B11 で定義の md5 と GRANT 一覧を固定）。

## 7. テスト

### 7.1 pgTAP（`supabase/tests/os_customer_stat_authority_test.sql`、83件）

期待値は文字列リテラル（G1 のみ相関サブクエリによる独立した集計）で、実装の関数を期待値の計算に使わない。

- Part A（反例・34件）: 取消→再完了、同じ status の再送、`notes`・`payment_status` だけの更新、`ctid` 不変、`lifetime_value` 不変、過去予約の後日完了、日時変更、来院なしへの変更、`actual_price` 訂正・クリア、オプション再計算（API と同じ列を service_role で更新）とその再送、価格なしの完了、論理削除・復元・NULL、全取消で `0/0/NULL`、型、`arrived` だけ（cache 対象外、`patient_visit_summary` は計上）、付替え、2顧客にまたがる複数行 UPDATE、物理削除の拒否と（履歴 trigger を検証中だけ止めた場合の）DELETE 反映、古い cache 値からの再構築、総計を変えない対象の変更（書き換えない）と総計を変える変更（書き換える）。
- Part B（catalog・12件）: 旧 trigger・関数の削除、新 trigger 3本の定義と有効化、関数の SECURITY DEFINER・`search_path`・所有者・EXECUTE、`patient_visit_summary` の定義・`security_invoker`、RLS policy・RLS 有効化・table GRANT・列の型と既定値。
- Part T（テナント・権限・34件）: clinic A の staff が RLS 経由で完了・取消できること（positive）、clinic B の予約を更新できない、他院の患者への付替え・他院への移動の拒否、customers への直接書込（42501）、再構築関数の EXECUTE 拒否（authenticated / anon / service_role、42501）、inactive プロフィール、DB では clinic B へ移動済みで JWT が clinic A のままの stale 権限、anon の UPDATE 拒否、clinic B の参照一式での INSERT・移動の拒否、他院の予約 id への upsert の拒否、DELETE の拒否、clinic B の顧客の読取不可、service_role との対比（T30・T31、取消済みの subtransaction）、所有者権限での参照整合性（T22・T23）、拒否後に両院の cache・行が変わらないこと。§6 も参照。
- Part G（3件）: 全 fixture 顧客の cache が独立集計と一致、fixture 外の顧客を書き換えていない、`lifetime_value` 不変。

RED（main `91d1877`、2026-10-23）: 83件中29件が失敗。

- 独立した値の反例（18件）: A2・A3（取消・再完了）、A8・A32・T4（過去の予約の後日完了・後からの INSERT で最終来院日が後退）、A9・A10（日時・来院なしの変更）、A11・A13（価格訂正・オプション再計算）、A16・A18（論理削除・NULL）、A19（0件で `0/0/NULL` に戻らない）、A24・A25（付替え）、A30（DELETE）、A31（古い値からの加算）、A34（価格訂正で customers 行が書き換わらない）、T6（RLS 経由の取消）。
- 前の検査の状態を引き継ぐ連鎖（2件）: A14（A13 の再計算結果の再送）、A20（A19 の後の型の確認）。
- 全体の照合（1件）: G1。
- 契約の不在（8件）: B1〜B5（旧 trigger・関数の残存、新 trigger・関数の不在）、T11・T15・T16（再構築関数が無く 42883）。
- 残り54件は変更しない契約・テナント境界の回帰ガードで、main でも成立する（初版で連鎖して失敗していた A4・A5・A15・T17 は、独立した顧客・直前の値との比較に直した）。

### 7.2 競合検証（§5.4）

- RED（main `91d1877`）: R2・R3・R4・R6・R7・R8 が失敗（R2/R6 は cache 値の誤り、R3/R4 は旧 trigger が顧客を直列化せず後続が待たない、R7/R8 は安全側の拒否なし）。R1・R5（加算だけの同時完了）は旧 trigger でも成立する。
- 変異: ロック先行の文を除いた関数では R1〜R5 が lost update で失敗（例: R1 `1 / 2000.00`）。分離レベルの拒否を除いた関数、および旧版（`2723f03` の `FOR SHARE` 方式）では R7・R8 が失敗する（旧版の R8 は REPEATABLE READ の書込を受け付ける）。値の一致判定を除いた関数では pgTAP A33 が失敗する。

### 7.3 Jest（実装に依存しない回帰ガード）

- `src/__tests__/api/reservations-schema.test.ts`: PATCH は `completed` / `cancelled` と再送を受け付け、`customer_id` / `is_deleted` / `price` / `actual_price` / cache 列の直接書込を拒否し（strict）、`price` は再計算の snapshot と一緒にだけ書く。
- `src/__tests__/lib/outreach.test.ts`: 休眠候補は `customers` の cache（`last_visit_date` / `total_visits` / `lifetime_value`）から抽出し、`patient_visit_summary` や `total_revenue` を使わない。

## 8. 既存データへの影響

- migration は customers・reservations のデータを変更しない（本番相当の履歴構成で、適用前後の全行 fingerprint が一致することを確認）。
- 適用後、ある顧客の集計対象の予約に契約上の変更（§4.3）が入った時点で、その顧客の cache だけが `S(c)` から再構築される。過去の不整合はその時点で解消される（`notes` だけの更新等では再構築しない）。触れられない顧客の値は残る（一括補正ではない）。
- 休眠掘起しへの影響: 再構築された顧客は、取消済み・削除済みの完了予約による最終来院日が外れ、過去予約の後日完了で後退していた最終来院日が戻る。抽出対象への出入りが起こり得る（正しい値への変化）。
- 予約と無関係に cache へ書かれた値（例: 手作業の取込）があれば、その顧客の次の書込で失われる。適用前に §9.1 の G2 で「旧 trigger で説明できない不整合」を数え、0件でなければ §11.1 の owner 判断が記録されるまで適用しない。
- 休眠掘起しの対象は、そもそも最近の予約変更が少ない患者である。§9.3 の一括再構築を行わない限り、その層の不整合の大半は残り続ける。一括再構築の要否は owner が判断する（§11.1）。

## 9. 適用手順・runbook

### 9.1 適用前の必須ゲート（read-only、件数のみ。本番では別承認で実行）

READ ONLY transaction で実行し、患者・予約の内容は出力しない。

```sql
-- OS-F1 §9.1 pre-apply gate (read-only, counts only)
begin transaction read only;
set local statement_timeout = '120s';

-- G0: pre-state the migration preflight requires. Before apply:
--     old_trigger_enabled = O, old_function_body_md5 =
--     f23956bd4e689a6f1003c7ddab8a8e11, new_triggers = 0 (after: NULL, NULL, 3).
select
  (select trigger_row.tgenabled from pg_trigger trigger_row
   where trigger_row.tgrelid = 'public.reservations'::regclass
     and trigger_row.tgname = 'update_customer_stats_trigger') as old_trigger_enabled,
  (select md5(proc.prosrc) from pg_proc proc
   where proc.oid = to_regprocedure('public.update_customer_stats()')) as old_function_body_md5,
  (select count(*) from pg_trigger trigger_row
   where trigger_row.tgrelid = 'public.reservations'::regclass
     and trigger_row.tgname like 'reservations_customer_visit_stats_%') as new_triggers;

-- G1: cache vs the completed set (the contract of §2)
with cache as (
  select
    customer.id,
    customer.clinic_id,
    customer.total_visits,
    customer.total_revenue,
    customer.last_visit_date,
    count(reservation.id)::integer as visits,
    coalesce(sum(coalesce(reservation.actual_price, reservation.price, 0)), 0)::numeric(10,2) as revenue,
    max(reservation.end_time) as last_visit
  from public.customers customer
  left join public.reservations reservation
    on reservation.customer_id = customer.id
   and reservation.clinic_id = customer.clinic_id
   and reservation.status = 'completed'
   and reservation.is_deleted = false
  group by customer.id
)
select
  count(*) as customers,
  count(*) filter (where (total_visits, total_revenue, last_visit_date)
    is distinct from (visits, revenue, last_visit)) as mismatched,
  count(distinct clinic_id) filter (where (total_visits, total_revenue, last_visit_date)
    is distinct from (visits, revenue, last_visit)) as mismatched_clinics,
  count(*) filter (where total_visits is null or total_revenue is null) as null_cache,
  count(*) filter (where total_visits > visits) as visits_over,
  count(*) filter (where total_visits < visits) as visits_under,
  count(*) filter (where total_revenue is distinct from revenue) as revenue_differs,
  count(*) filter (where last_visit_date is distinct from last_visit) as last_visit_differs
from cache;

-- G2: are the mismatches exactly what the removed increment trigger wrote?
--     Replays its rule (+1 / += coalesce(actual_price, price, 0) / last := end_time
--     on every insert as completed and every update into completed) from
--     public.reservation_history, which logs every reservation insert/update.
with completion_event as (
  select
    history.id,
    history.created_at,
    (history.new_value ->> 'customer_id')::uuid as customer_id,
    coalesce((history.new_value ->> 'actual_price')::numeric,
             (history.new_value ->> 'price')::numeric, 0) as amount,
    (history.new_value ->> 'end_time')::timestamptz as end_time
  from public.reservation_history history
  where history.new_value ->> 'status' = 'completed'
    and (history.old_value is null
         or history.old_value ->> 'status' is distinct from 'completed')
),
replayed as (
  select
    event.customer_id,
    count(*)::integer as visits,
    sum(event.amount) as revenue,
    max(event.created_at) as last_event_at
  from completion_event event
  group by event.customer_id
),
replayed_last as (
  select event.customer_id, array_agg(event.end_time) as last_end_times
  from completion_event event
  join replayed on replayed.customer_id = event.customer_id
               and replayed.last_event_at = event.created_at
  group by event.customer_id
),
history_gap as (
  select distinct reservation.customer_id
  from public.reservations reservation
  where not exists (
    select 1 from public.reservation_history history
    where history.reservation_id = reservation.id and history.action = 'created'
  )
),
cache as (
  select
    customer.id,
    customer.total_visits,
    customer.total_revenue,
    customer.last_visit_date,
    count(reservation.id)::integer as visits,
    coalesce(sum(coalesce(reservation.actual_price, reservation.price, 0)), 0)::numeric(10,2) as revenue,
    max(reservation.end_time) as last_visit
  from public.customers customer
  left join public.reservations reservation
    on reservation.customer_id = customer.id
   and reservation.clinic_id = customer.clinic_id
   and reservation.status = 'completed'
   and reservation.is_deleted = false
  group by customer.id
),
classified as (
  select
    cache.id,
    exists (select 1 from history_gap where history_gap.customer_id = cache.id) as has_history_gap,
    cache.total_visits = coalesce(replayed.visits, 0)
      and cache.total_revenue = coalesce(replayed.revenue, 0)
      and ((replayed.customer_id is null and cache.last_visit_date is null)
           or cache.last_visit_date = any (replayed_last.last_end_times)) as matches_replay
  from cache
  left join replayed on replayed.customer_id = cache.id
  left join replayed_last on replayed_last.customer_id = cache.id
  where (cache.total_visits, cache.total_revenue, cache.last_visit_date)
    is distinct from (cache.visits, cache.revenue, cache.last_visit)
)
select
  count(*) as mismatched,
  count(*) filter (where matches_replay and not has_history_gap) as explained_by_old_trigger,
  count(*) filter (where not coalesce(matches_replay, false) or has_history_gap) as unexplained,
  count(*) filter (where has_history_gap) as with_history_gap
from classified;

-- G3: history coverage and scale (lock time / batch planning)
select
  (select count(*) from public.customers) as customers,
  (select count(*) from public.reservations) as reservations,
  (select count(*) from public.reservations
    where status = 'completed' and is_deleted = false) as counted_reservations,
  (select count(*) from public.reservations reservation
    where not exists (select 1 from public.reservation_history history
                      where history.reservation_id = reservation.id
                        and history.action = 'created')) as reservations_without_created_history,
  (select max(per_clinic.customers) from (
     select count(*) as customers from public.customers group by clinic_id) per_clinic) as max_customers_per_clinic;

rollback;
```

- G0: migration の preflight が要求する適用前の状態。`old_trigger_enabled = O`、`old_function_body_md5 = f23956bd4e689a6f1003c7ddab8a8e11`（baseline の関数本体）、`new_triggers = 0` でなければ適用しない（preflight も同じ条件で中断する）。G2 の再生は、旧 trigger がこの規則で動いていたことを前提にする。
- G1 `mismatched`: cache が §2 の値と異なる顧客数。適用後、この顧客は次の書込で再構築される（§8）。
- G2: 不整合を、削除する加算 trigger の規則を `public.reservation_history`（全予約の INSERT/UPDATE を OLD/NEW 付きで記録する baseline の trigger）から再生した値と比べる。
  - `explained_by_old_trigger`: cache が再生値と一致する（不整合は旧 trigger の既知の欠陥だけで説明できる）。最終来院日は、最後の完了イベントと同じ `created_at`（transaction 開始時刻）を持つイベントのどれかの `end_time` と一致すればよい。
  - `unexplained`: 再生値と一致しない、cache が NULL、またはその顧客の予約に `created` 履歴が欠けている。手作業の取込・履歴の削除・trigger 無効化での書込・同じ顧客の同時完了の commit 順序などが原因になり得る（後者は安全側の誤検出）。
- G3: 規模と履歴の欠損（`reservations_without_created_history`）。ロック時間とバッチの見積りに使う。
- 判定:
  - `unexplained = 0`: 適用可（owner 承認後）。不整合は次の書込で解消される。全件を一度に揃える場合は §9.3（別承認・別PR）。
  - `unexplained > 0`: **停止**（`supabase/AGENTS.md`「backfill不明rowが1件でもあれば停止する」）。適用すると該当顧客の値は次の書込で予約集合の値に置き換わるため、owner が扱いを決めてから進める（選択肢は §11.1）。
- 合成データでの確認（本番相当の履歴構成、旧 trigger で生成）: 13顧客中 G1 `mismatched = 10`、G2 `explained = 7`（取消後の再完了・過去予約の後日完了・価格訂正・論理削除・付替えの両側・他院の取消）、`unexplained = 3`（cache の直接書換え2件・NULL 1件）、履歴を削除した顧客は値が一致するため不整合に数えない。適用前後で結果は同じ。

### 9.2 適用順序と方法

- 本番は `20261020170757` 適用済み・`20260906003219`（#145、通知）未適用で、履歴に差がある。`supabase db push` は未適用の古い version を含めるため（`--include-all` が必要）**使わない**。`0906` は本変更と独立で、便乗して適用しない。
- 適用は `20261020170757` と同じ方式で行う（PR #163 のリリース記録 v3）。CLI 2.109.0 の `supabase db push` はファイルの `begin` … `commit` を送った後、履歴の INSERT を別の transaction で送る（履歴だけが失敗し得る）。Supabase MCP の `apply_migration` は履歴の version を自前で採番する。どちらも使わない。
- 代わりに、本 migration の最後の `commit;` を除いた本文（preflight・postflight を含む）、`supabase_migrations.schema_migrations` への履歴の INSERT（version `20261023064851`、name `os_customer_stat_authority`、statements は CLI と同じ形）、適用結果の自己検査（下の catalog 差分と一致すること）、`commit;` を連結した適用テキストを作り、1回だけ送る。これで migration と履歴が同じ transaction で commit される。適用テキストと sha256 は本番適用の承認記録で確定し、隔離DBで成功・改ざん・lock 待ちの各ケースを確かめてから使う（本PRでは作らない）。
- 公式の Supabase Postgres image（17.6.1.140。`postgres` は superuser ではなく BYPASSRLS を持つ）でも、本 migration が所有者権限だけで適用できることを確認した。
- 隔離DB（PostgreSQL 17.6 + shim と、公式 image + GoTrue migration の両方）で、本番相当の履歴（全 migration から `0906` と本 migration を除いて再生）に本 migration だけを適用し、次を確認した: 適用成功、customers・reservations・reservation_history・daily_reports の全行 fingerprint 不変、`0906` の関数・trigger が存在しないまま、履歴は `…20260815104957, 20261020170757, 20261023064851`、pgTAP（`0906` 用 suite を除く）、競合検証 8/8、日報競合検証 8/8。`commercial_function_execution_test.sql` #6（`0906` が作る関数を EXECUTE matrix に期待する）は本 migration の有無にかかわらず失敗する本番相当構成の既知差で、本変更の失敗ではない。
- 順序: DB のみの変更で、アプリの変更は無い。稼働中のアプリは列・API を変えずに動く（旧アプリも trigger を意識しない）。
- ロック: `reservations` に trigger の削除・作成のロック（ACCESS EXCLUSIVE を短時間）を取る。`lock_timeout = 5s` で取れなければ失敗して何も変わらないため、低負荷時間帯に再試行する。
- 前後の catalog snapshot を取り、`docs/stabilization/evidence/os-customer-stat-authority/` の差分（列コメント3件、trigger 3本の追加と旧 trigger の削除、関数2件の追加と旧関数の削除、履歴1行）と一致することを確認する。RLS・policy・table GRANT・`patient_visit_summary` は不変。

### 9.3 既存cacheの一括再構築（任意。別承認・別PRの forward migration）

本PRでは実行しない。§9.1 で `unexplained = 0`（または owner が §11.1 で扱いを決めた後）に、owner が承認した場合だけ、次のテンプレートを日付付きの forward migration として追加する（`supabase migration new` で採番、backup 表名に承認日を入れる）。事前に Supabase の backup / PITR が有効であることを確認する。

```sql
-- OS-F1 §9.3 cache rebuild: template for a separately approved forward
-- migration (rename the backup table with the approval date). Not part of
-- 20261023064851; never run against production without the owner's record.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '300s';

create table app_private.customer_visit_stats_backup_yyyymmdd (
  customer_id uuid primary key,
  clinic_id uuid not null,
  total_visits integer,
  total_revenue numeric(10,2),
  last_visit_date timestamptz,
  updated_at timestamptz not null,
  backed_up_at timestamptz not null default now()
);
alter table app_private.customer_visit_stats_backup_yyyymmdd enable row level security;
revoke all on table app_private.customer_visit_stats_backup_yyyymmdd
  from public, anon, authenticated, service_role;

-- Lock every customer in id order (same order as the triggers), then keep
-- the pre-rebuild value of each cache that differs from its completed set.
select count(*) from (
  select customer.id from public.customers customer order by customer.id for no key update
) locked;

insert into app_private.customer_visit_stats_backup_yyyymmdd (
  customer_id, clinic_id, total_visits, total_revenue, last_visit_date, updated_at
)
select
  customer.id, customer.clinic_id, customer.total_visits, customer.total_revenue,
  customer.last_visit_date, customer.updated_at
from public.customers customer
cross join lateral (
  select
    count(reservation.id)::integer as total_visits,
    coalesce(sum(coalesce(reservation.actual_price, reservation.price, 0)), 0)::numeric(10,2) as total_revenue,
    max(reservation.end_time) as last_visit_date
  from public.reservations reservation
  where reservation.customer_id = customer.id
    and reservation.clinic_id = customer.clinic_id
    and reservation.status = 'completed'
    and reservation.is_deleted = false
) visit
where (customer.total_visits, customer.total_revenue, customer.last_visit_date)
  is distinct from (visit.total_visits, visit.total_revenue, visit.last_visit_date);

select app_private.refresh_customer_visit_stats(
  array(select backup.customer_id from app_private.customer_visit_stats_backup_yyyymmdd backup
        order by backup.customer_id)
);

do $postflight$
begin
  if exists (
    select 1
    from public.customers customer
    cross join lateral (
      select
        count(reservation.id)::integer as total_visits,
        coalesce(sum(coalesce(reservation.actual_price, reservation.price, 0)), 0)::numeric(10,2) as total_revenue,
        max(reservation.end_time) as last_visit_date
      from public.reservations reservation
      where reservation.customer_id = customer.id
        and reservation.clinic_id = customer.clinic_id
        and reservation.status = 'completed'
        and reservation.is_deleted = false
    ) visit
    where (customer.total_visits, customer.total_revenue, customer.last_visit_date)
      is distinct from (visit.total_visits, visit.total_revenue, visit.last_visit_date)
  ) then
    raise exception 'OS-F1 rebuild postflight failed: a cache still differs from its completed set';
  end if;
end
$postflight$;

commit;
```

- backup 表は `app_private`（非公開スキーマ）に置き、RLS 有効・anon / authenticated / service_role の権限なし。値が変わる顧客の変更前の値と `updated_at` だけを持つ。保持期間後に別の migration で削除する。
- 全顧客を id 順にロックしてから backup と再構築を行うため、実行中の予約書込は待つ。G3 の規模が大きい場合は院単位の migration に分ける。
- 隔離DBで確認: 9顧客を backup（変更前の値と一致）、再構築後の G1 `mismatched = 0`、backup 表は RLS 有効・所有者のみの ACL。

### 9.4 Rollback / forward-fix

旧 `update_customer_stats`（加算のみ）を戻す rollback は行わない（rollback SQL は実行するとエラーで停止する）。問題時は次に限る。

1. 関数の不具合: 新しい migration で `app_private.refresh_customer_visit_stats` / `app_private.sync_customer_visit_stats` を `create or replace` する（trigger は残す）。直した後、影響した顧客だけを同じ forward migration で再構築する（3. の SQL と同じ形）。
2. ロック待ち・性能の問題: 対象の判定（§4.3）や索引を forward migration で調整する。trigger を削除しない。
3. 緊急停止（owner 承認時のみ・時間を区切る）: `alter table public.reservations disable trigger reservations_customer_visit_stats_insert`（`_update` / `_delete` も同様）。停止中の cache は古い値のまま残る（壊れはしないが休眠抽出が古くなる）。無効のまま放置する手順は禁止。再開時は `enable trigger` の後、停止中に予約が変わった顧客だけを再構築する（§9.3 の一括再構築は §11.1 の別承認が要るため使わない）。`reservation_history.created_at` は transaction の開始時刻なので、停止時刻から最長の transaction の分（`:margin`）だけ早めた時刻から数え、履歴の変更前・変更後の両方の `customer_id` を対象にする。早めた範囲に migration 適用前の変更が入る場合（適用直後の停止）、その顧客も予約集合の値に揃う。

```sql
-- :disabled_at は trigger を止めた時刻、:margin は停止時に実行中だった最長の
-- transaction の長さ（例 '1 hour'）。§4.3 と同じ条件（変更前または変更後が
-- 集計対象で、契約の列が変わった履歴）の顧客だけを、postgres（所有者）が
-- READ COMMITTED で再構築する。
select app_private.refresh_customer_visit_stats(array(
  select distinct touched.customer_id
  from public.reservation_history history
  cross join lateral (values
    ((history.old_value ->> 'customer_id')::uuid, history.old_value),
    ((history.new_value ->> 'customer_id')::uuid, history.new_value)
  ) touched(customer_id, row_value)
  where history.created_at >= :'disabled_at'::timestamptz - :'margin'::interval
    and touched.customer_id is not null
    and touched.row_value ->> 'status' = 'completed'
    and touched.row_value ->> 'is_deleted' = 'false'
    and (
      history.old_value is null
      or history.new_value is null
      or exists (
        select 1
        from unnest(array['status', 'is_deleted', 'customer_id', 'clinic_id',
                          'price', 'actual_price', 'end_time']) as contract(col)
        where history.old_value -> contract.col is distinct from history.new_value -> contract.col
      )
    )
  order by 1
));
```

4. 一括再構築（§9.3）を取り消す必要がある場合（再構築自体の誤り）: commit 済みの再構築を戻すため、別の reviewed forward migration で backup から戻す。`updated_at` は戻らず、戻した時刻になる（`update_customers_updated_at`）。戻した値は次の書込で再び再構築されるため、先に 1. で原因を直す。

```sql
update public.customers customer
set total_visits = backup.total_visits,
    total_revenue = backup.total_revenue,
    last_visit_date = backup.last_visit_date
from app_private.customer_visit_stats_backup_yyyymmdd backup
where customer.id = backup.customer_id
  and customer.clinic_id = backup.clinic_id;
```

（隔離DBで backup 9件が元の値に戻ることを確認し、rollback した。3. の SQL は、prod-like DB で trigger 停止中に 5件の予約を変えて確かめた（価格訂正・取消・別顧客への付け替え・メモのみ・`arrived` の価格変更）。`:margin = '0 seconds'` で選ばれたのは集計対象が変わった 4顧客（付け替えの前後を含む）だけで、再構築後はその4顧客が予約集合の値と一致した。メモのみの顧客と停止前から不整合だった顧客は古い値のまま残った。`:margin = '1 hour'` では fixture 作成時の変更も範囲に入り、その顧客も選ばれた）

### 9.5 確認用SQL（read-only）

```sql
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.reservations'::regclass and tgname like 'reservations_customer_visit_stats_%'
order by tgname;
```

## 10. 非対象

`patient_visit_summary` の意味や来院の定義（`arrived` を cache に含める等）の統一、休眠日数・consent・LINE provider 世代・配信対象判定の変更、`lifetime_value` の定義や書込元、新しい CRM 機能・LTV 予測、患者テーブルの統合・名寄せ、予約APIへの物理削除の追加、本番データの読出し・一括補正（§9.3 は別承認）、`0906` の適用、本番 migration・デプロイ。

## 11. 本番適用の条件（不具合修正とは別に判定する）

本PRの修正・検証の完了は、本番適用の承認ではない。次がすべて揃うまで本番適用しない（2026-10-23 時点で未実施・未決）。

### 11.1 既存データの分類（owner 判断）

- 本番で §9.1 の G1〜G3 を read-only で取得する（件数のみ。別承認）。
- `unexplained > 0` の場合の選択肢: (a) 予約集合を正本として受け入れ、適用する（該当値は次の書込で置き換わる）、(b) 原因（取込値など）を調べ、保持が必要なら別Issueで扱い、本 migration の適用を保留する。どちらを選んだかと件数を承認記録に残す。
- `unexplained = 0` の場合: 次の書込での解消に任せるか、§9.3 の一括再構築を別PRで行うかを決める。

### 11.2 来院の記録方法（owner 判断）

- 事実: 画面操作は `arrived` を記録し、cache は `completed` だけを数える（§2.5）。`arrived` だけの患者は休眠掘起しで抽出されない（変更前からの挙動）。
- 選択肢: (A) 現状のまま（来院完了を `completed` で記録する運用を必要に応じて周知）。(B) 来院の定義（`arrived` を含めるか、`arrived → completed` の運用と日報明細の扱い）を別Issueで決める。本PRはどちらも変更しない。

### 11.3 休眠掘起しの既存不具合（別Issue候補。本PRでは変更しない）

- `customers.last_visit_date` は `timestamptz` で、PostgREST は `2026-05-10T03:00:00+00:00` の形式で返す。一方 `src/lib/outreach.ts` の `mapCandidateRow` は `differenceInJSTCalendarDays(row.last_visit_date, today)` に渡し、`src/lib/jst.ts` の `parseJSTDateStart` は `YYYY-MM-DD` 以外で例外を投げる。最終来院日が期間内の候補が1件でもあると `GET /api/outreach/dormant-candidates` は失敗する（既存の単体テストは日付だけの値を使うため検出しない）。期間の比較（`.gte/.lte('last_visit_date', 'YYYY-MM-DD')`）も JST の日付を timestamptz の UTC 0時として比べる。
- 配信対象判定は本Issueの変更対象外のため、修正は別Issueとする。本PRの cache の修正はこの不具合を増やしも直しもしない（変更前も完了予約があれば同じ値の形式だった）。

### 11.4 適用方法

- §9.2 のとおり、本 migration だけを適用し `0906` を含めない。前後の catalog snapshot と §9.5 の確認を記録する。

### 11.5 承認

- 本番 migration・本番デプロイ・既存データの扱い（§11.1）・一括再構築（§9.3）は、本PRとは別に人間の承認を得て行う。本PRの merge は本番適用の承認ではない。`main` への merge は Vercel の本番自動デプロイを起動するが、本変更にアプリの差分は無い。

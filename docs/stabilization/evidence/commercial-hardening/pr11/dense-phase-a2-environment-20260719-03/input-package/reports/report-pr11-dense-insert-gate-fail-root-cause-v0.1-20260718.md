# PR-11 dense insert 固定gate超過 — 原因特定レポート（read-only調査）

- 版: v0.1
- 調査日: 2026-07-18
- 対象PR: https://github.com/IFs1991/seikotsuin_no_saas/pull/100
- 対象commit: `a46e5bdaa28fa3e3d8f16cf2cef9ce8155ade297`（branch `codex/commercial-hardening-pr11`）
- 対象FAIL: `performance.dense_insert_10000` — median 549.305 ms > 固定上限 521.55125 ms（+27.754 ms / +5.3%）
- 調査方式: **read-only**。DB接続・スキーマ変更・閾値/サンプル/fixture/canonical probeの変更は一切なし。
  branch内raw証跡を `git archive` でscratchpadへ展開して解析。作業ツリー・リモートは無変更。
- 本レポートはFAILをPASSへ再分類する根拠として使用しない。dense固定gateのFAIL判定は維持する。

主要証跡（すべて commit `a46e5bda` 配下）:

- `docs/stabilization/evidence/commercial-hardening/pr11/README.md`
- `docs/stabilization/evidence/commercial-hardening/pr11/write-amplification.md`
- `docs/stabilization/evidence/commercial-hardening/pr11/forward-fix-postapply-official-20260718-02/`
  （`experiment-summary.json` / `manifest.json` / `blocks-pair{1,2,3}-{before,after}.parsed.json` /
  `blocks-pair*-normalize.stdout.raw` ほか 446 files）
- `scripts/commercial-hardening/sql/pr11-performance-probe.sql`
- `scripts/commercial-hardening/sql/pr11-postapply-blocks-before-ddl.sql`
- `scripts/commercial-hardening/run-pr11-forward-fix-postapply-paired.mjs`
- `supabase/migrations/20260716160342_commercial_performance_safe_fk_indexes.sql`
- `supabase/migrations/20260718011731_commercial_pr11_fixed_performance_forward_fix.sql`

---

## 1. 最有力原因と確信度

### 根本原因（確信度: 高） — 構造的ミスマッチ

dense超過は測定誤差ではなく**構造的**である。

- 固定上限 521.55125 ms は「index追加**前**schema」でのdense BEFORE中央値 417.241 ms × 1.25 として凍結された
  （`write-amplification.md` Thresholds節）。その時点の dense−sparse 差は WAL +0.6%、実行時間 +38.3 ms（比 1.10）に過ぎない。
- PR-11本体 migration `20260716160342` が partial index **`blocks_created_by_idx`（`WHERE created_by IS NOT NULL`）** を追加した。
  probe仕様上、sparse/denseの差は **created_by が NULL か否かのみ**（`pr11-performance-probe.sql:188-238`。
  resource_id は両probeとも同一の非NULL値、deleted_by は両方NULL）。
- その結果、denseだけが毎行 **(a) `blocks_created_by_idx` へのindex tuple挿入**（+10,129 WALレコード ≈ 1/行、
  +914KB WAL、+25,294 buffer参照）と **(b) `auth.users` へのRI check SPI実行**
  （sparseはNULL keyのためRI triggerは発火するがSPIをskip）を払う。
- このdense固有余剰は index導入後の**独立4 run すべてで +97〜+228 ms** 再現しており、
  凍結上限が構造上denseに許す余裕（521.55125 − 435.7373 = **85.8 ms**）を常に超える。
- forward-fix（`20260718011731`、trigger fast path化）はsparse/dense**共通**コストのみを削減し
  （pair毎差分の中央値で両probeとも約−50 ms/10k行）、dense固有余剰には一切触れない。
  そのためsparseのみPASSへ転じ、denseはFAILのまま残った。

### 副次要因（確信度: 高） — ホストwall-clockノイズ

測定ホストは i7-1255U（2P+8E hybrid laptop CPU・12論理コア）、電源プラン「バランス」
（GUID `381b4222-f694-41f0-9685-ff5bb260df2e`）、開始時空きRAM 4.48GB/16.86GB、Docker Desktop VM 7.76GB
（`manifest.json` environment節）。同一物理作業のサンプルが**20秒以内に35〜69%振れる**乗算的ノイズがあり、
549/639/474 msの分散はこれで説明される。ノイズは「何ms超えるか」を決めるが、
「期待値が上限を超えること」自体は上記の構造要因が決めている。

---

## 2. 根拠となるrawファイル・サンプル・数値

### (a) 固定上限の由来（`write-amplification.md`）

| 項目 | BEFOREサンプル (ms) | BEFORE中央値 | 式 | 固定上限 |
|---|---|---:|---|---:|
| sparse実行 | 768.369 / 331.675 / 378.902 | 378.902 | ×1.15 | 435.7373 |
| dense実行 | 537.626 / 417.241 / 356.460 | 417.241 | ×1.25 | 521.55125 |
| sparse WAL | — | 8,849,684 | ×1.05 | 9,292,168.2 |
| dense WAL | — | 8,906,932 | ×1.25 | 11,133,665 |

- BEFOREサンプル自体の振れ幅: sparse 132%、dense 51%。基準中央値は「速い側」に寄っている。
- **BEFORE時代の dense−sparse 差: WAL +57,248 bytes（+0.6%）、実行 +38.3 ms（比1.10）** —
  上限構造はこの「index追加前の差分」を前提に凍結された。

### (b) 公式run（20260718-02）の物理統計

出典: `blocks-pair{1,2,3}-after.parsed.json`（EXPLAIN (ANALYZE, BUFFERS, WAL, TIMING OFF, FORMAT JSON)）。

| 指標（AFTER 3サンプル） | sparse | dense | 差分 |
|---|---:|---:|---:|
| Shared Hit Blocks | 194,061–194,069 | 219,355–219,363 | **+25,294（+13.0%）** |
| WAL Records | 100,690–100,694 | 110,819–110,823 | **+10,129（+10.1%）≈1/行** |
| WAL Bytes | 8,579,540–8,594,140 | 9,493,780–9,508,404 | **+914KB（+10.7%）** |
| Shared Read / Temp / WAL FPI | 全サンプル **0** | 全サンプル **0** | — |
| Shared Dirtied Blocks | 438–442 | 446–450 | +7 |
| 実行時間 (ms) | 363.528 / 429.129 / 490.821 | 473.948 / 549.305 / 638.926 | +110.4 / +120.2 / +148.1 |

物理作業はバイト単位でほぼ決定的（読み込みミス0・FPI 0・temp 0）。実行時間だけが同一run内で大きく振れる
→ 変動はDB状態ではなくホスト由来。

### (c) probe構造（`pr11-performance-probe.sql`）

- sparse: `created_by = NULL, deleted_by = NULL`、resource_id = 固定の非NULL UUID。
- dense: 同一resource_id・同一clinic_id、`created_by` のみ非NULL
  （**2値のみ**: 100行 user A / 9,900行 user B — btree重複キー挿入(dedup path)の最悪形）。
- 5 trigger（clinic_id / created_by / deleted_by / 複合resource FK の各RI + `blocks_clinic_ref_check`）は
  **両probeとも10,000回ずつ発火**（parsed.json Triggers節で確認）。差はNULL keyでSPIがskipされるか否か。
- probeは `TIMING OFF` のため per-trigger `Time` とper-node実時間は**証跡に存在しない**（→ §6）。

### (d) 実行時系列（`blocks-pair*-normalize.stdout.raw` のclock_timestamp）

| 時刻 (02:5x) | サンプル | dense (ms) | sparse (ms) |
|---|---|---:|---:|
| 57:49 | pair1-BEFORE | 596.158 | 614.970 |
| 57:53 | pair1-AFTER | 549.305 | 429.129 |
| 57:56 | pair2-AFTER | 638.926 | 490.821 |
| 57:59 | pair2-BEFORE | 565.500 | 508.593 |
| 58:03 | pair3-BEFORE | 554.563 | 413.669 |
| 58:06 | pair3-AFTER | 473.948 | 363.528 |

- 全6サンプルが**約20秒以内**に実行。sparseは615.0→363.5へ下降ドリフト（warm-up + ホスト状態）。
- 同一pair内のdense/sparseは順位が完全相関（pair2-AFTERが両方最遅、pair3-AFTERが両方最速）
  → pair単位のホスト状態が支配。
- 各サンプル直前のnormalizeで blocks は heap 0 / total 90,112 bytes（空テーブル基準値）へ毎回正規化済み。

### (e) 環境（`manifest.json` environment節）

- CPU: 12th Gen Intel Core i7-1255U（2P+8E、12論理コア）/ RAM 16.86GB（開始時空き4.48GB）
- 電源プラン: バランス（`381b4222-f694-41f0-9685-ff5bb260df2e`）
- DB: Docker Desktop VM 7.757GiB、`public.ecr.aws/supabase/postgres:17.6.1.104`、container起動から約1h47m
- 開始時container CPU 0.04% / Mem 157.6MiB（quiescent）

---

## 3. sparse / dense 差分表

| 項目 | sparse | dense |
|---|---|---|
| created_by | NULL | 非NULL（2値、100/9,900分布） |
| `RI_ConstraintTrigger_c_18939`（created_by→auth.users） | 10,000回発火・**SPI skip**（NULL key） | 10,000回発火・**SPI実行**（毎行 FOR KEY SHARE lookup） |
| `blocks_created_by_idx`（PR-11新設partial） | 挿入 0件 | **挿入 10,000件**（+10.1k WALレコード、~129件のsplit/dedupレコード含む） |
| clinic_id RI / 複合FK `c_21913` / deleted_by RI / `blocks_clinic_ref_check` | 10,000回ずつ（同一） | 10,000回ずつ（同一） |
| 実行中央値 / 固定上限 | 429.129 / 435.7373（**余裕1.5%**） | 549.305 / 521.55125（**超過5.3%**） |
| 上限構造がdenseに許す追加余裕 | — | **85.8 ms**（実測余剰は110–148 ms） |

---

## 4. 時間帰属（trigger / FK / index / WAL / host noise）

| 帰属先 | 評価 |
|---|---|
| `blocks_clinic_ref_check`（fast path） | 両probe同一コスト。公式runのpair毎BEFORE/AFTER差分（旧→新trigger本体のみの差、`pr11-postapply-blocks-before-ddl.sql` で確認）は中央値で両probeとも約−50 ms/10k行（=5µs/行）。per-pair差は−186〜+73 msとノイズに埋没。**dense固有原因からは除外** |
| 複合FK `(resource_id, clinic_id)` RI | 両probeで10,000回・単一resource行への参照（cache-hot）。dense固有差の原因ではない |
| created_by RI + created_by index（dense固有） | 合計 **+110〜148 ms**（公式run実測）。TIMING OFFのため内訳の直接分離は不可。BEFORE-schema時代の余剰~38 ms（≈RI check相当）との差分から、**index維持 ≈ 70〜90 ms、RI check ≈ 30〜50 ms** と推定 |
| WAL | dense +914KB。WAL量自体は上限内。gateへの寄与は書き込みCPU/待ち時間経由のみ |
| host noise | 同一物理作業で日をまたぐと sparse 363→900 ms、dense 474→960 ms。乗算的で、余剰絶対値もホストが遅い日ほど増える |
| checkpoint / bgwriter / autovacuum | 各サンプル前に正規化済み・FPI=0・read=0 → DB状態汚染は否定。ただしper-sampleのbgwriter/checkpointer統計は未取得で完全棄却は不能（§6） |

### 全run横断の dense−sparse 余剰（すべて中央値, ms）

| Run | trigger | 新index | sparse | dense | 余剰 | 比 |
|---|---|---|---:|---:|---:|---:|
| before evidence | 旧 | 無 | 378.9 | 417.2 | **+38.3** | 1.10 |
| initial canonical after | 旧 | 有 | 843.4 | 940.9 | +97.5 | 1.12 |
| paired-local-rerun 2026-07-17 | 旧 | 有 | 661.3 | 805.0 | +143.7 | 1.22 |
| forward-fix rehearsal 2026-07-18-01 | 新 | 有 | 675.9 | 904.1 | +228.2 | 1.34 |
| **official 2026-07-18-02** | 新 | 有 | **429.1** | **549.3** | **+120.2** | 1.28 |

index導入後、余剰は一度も +97.5 ms を下回らない（許容85.8 ms）。これが構造性の証明である。

---

## 5. 反証した仮説と根拠

1. **cache locality / buffer hit差** — 反証。全36 blocksサンプルで Shared Read = 0、Temp = 0。
   全データがshared_buffers内で完結し、denseのhit増（+13.0%）は決定的な追加作業そのもの。
2. **index bloat持ち越し・fixture汚染** — 反証。各サンプル直前のnormalizeで blocks total 90,112 bytes を毎回確認。
   clean-state snapshot SHA-256一致も記録済み。
3. **checkpoint FPIによる膨張** — 公式runについては反証（全サンプル WAL FPI = 0）。
   ※BEFORE時代の証跡はWALが8.61〜9.28MBと振れており、**凍結基準側**にFPI混入の疑いが残る。
4. **複合FKのRIがdenseだけ重い** — 反証。`c_21913` は両probeで10,000回、同一の単一resource行参照。
5. **plan差・planner回帰** — 反証。root nodeは全てModifyTable、plan構造同一、Planning Time 0.03–0.07 ms。
6. **測定誤差だけで超過を説明できる（観点10）** — 反証。個々のサンプル値はノイズ支配
   （dense最良473.9 msは単独では上限内）だが、余剰+97〜+228 msは4 run連続で再現し、期待値が上限を上回る。
   逆に**sparseのPASS（余裕6.6 ms / 1.5%）も同じコインの裏**であり、再測定でFAILし得る。

---

## 6. 確定できない点と不足証拠

- **RI checkとindex挿入の内訳分離**: probeが `TIMING OFF` のため per-trigger `Time` が証跡に無い
  （`write-amplification.md` も同制約を明記）。→ §7の実験で解消可能。
- **checkpoint / bgwriter / WAL flushの寄与**: per-sampleの `pg_stat_bgwriter` / `pg_stat_checkpointer` /
  `pg_stat_io` capture、および `wal_buffers` 等のGUC dumpが証跡に存在しない。
- **ホストCPU周波数 / P・Eコア割当**: per-sampleの記録が無く、「バランス電源プラン + hybrid CPU」説は
  状況証拠（時系列ドリフト・乗算的振れ・環境記録）による。

---

## 7. 次に行う最小・rollback-only比較実験（提案のみ・未実行）

ローカル限定・単一transaction・必ずROLLBACK・canonical probeは無変更。
実験前後で既存の logical / normalized-physical / catalog / ACL / RLS snapshot hashの一致を必須とする
（既存runnerのpreflight/postflightを流用）。

1. **D1（trigger時間の直接帰属）**: canonical fixtureを複製し、dense/sparseを
   `EXPLAIN (ANALYZE, BUFFERS, WAL, TIMING ON, FORMAT JSON)` で各3回実行。
   per-trigger Timeを初取得し、RI created_by / 複合FK / custom triggerを直接分離。
   TIMING ONは診断専用であり、canonical probeの計測条件は変更しない。
2. **D2（index維持コストの単離）**: 同一transaction内で `SAVEPOINT` →
   `DROP INDEX blocks_created_by_idx`（tx内・rollback保証）→ dense文をTIMING OFF（canonicalと同条件）で実行 →
   `ROLLBACK TO SAVEPOINT`。
3. **D3（併行capture・read-only）**: 各サンプル前後に `pg_stat_bgwriter` / `pg_stat_io` /
   `SHOW wal_buffers, max_wal_size, synchronous_commit`。ホスト側は `docker stats`、
   `powercfg /getactivescheme`、`typeperf "\Processor Information(_Total)\% Processor Performance"` を記録。
4. **判定基準**: T_RI(created_by) + T_index(created_by) ≈ 実測余剰（110–148 ms）が±30%で成立すれば帰属確定。

---

## 8–9. 恒久修正候補（最大3案）と評価

| 案 | 内容 | 期待効果 | security互換 | migrationリスク |
|---|---|---|---|---|
| **A（推奨）: PR-12 staging再基準化** | READMEが既に定める境界どおり、代表的なhosted環境でBEFORE/AFTER pairedプロトコルを再実行し、**index追加後schemaを基準に**dense上限を再凍結。ローカルFAIL記録は不変のまま維持 | 「index前基準×1.25 vs index後実測」という構造矛盾の正当な解消。server級CPU/固定周波数では余剰絶対値も縮小見込み | 変更なし | **なし**（DDL不要。ローカルでの閾値再導出は禁止のままだが、staging新基準の策定はPR-12の既定スコープ） |
| **B: 冗長trigger統合（spec変更要）** | `blocks_clinic_ref_check` は複合FK `blocks_resource_id_fkey` と施行が重複しており、存在理由はSQLSTATE/message契約（23503/23514の区別）のみ。triggerを廃止しFK違反のconstraint名→message変換をAPI層へ移す | 両probeから10k SPI/文を除去。trigger本体差分のみで−50 ms実測だったため **−80〜120 ms** 見込み → dense推定430–470 ms < 521.55 | 施行はFKが担保（trigger無効化リスクが消え、むしろ強化） | **中**: 15組のSQLSTATE/message契約・negative guard・RED契約の再仕様化が必要。owner承認必須 |
| **C: `blocks_created_by_idx` のstorage parameter調整** | 2値9,900重複というdedup最悪パターンへの対処として `deduplicate_items=off` / fillfactor調整を§7-D2実験で計測してから判断 | 不確実（±10〜40 ms）。実験結果次第 | 変更なし（index定義のhash-bound契約は更新要） | 低〜中（同一キー定義での再作成だが、恒久index変更は現行禁止事項のため承認要） |

案Aのみ契約の再交渉なしに成立する。案B/Cは本調査の禁止事項（trigger/index恒久変更）の外側であり、
実施にはPR-12以降での明示的なスコープ決定が前提。

---

## 10. pilot継続可否と一般リリース条件

- **pilot継続: 可**。本調査で新たなsecurity/整合性リスクは発見されず、FAILは
  「単文10,000行bulk insertのwall clock」に限定される。waiverは元々bulk import経路を除外しており、
  WAL・plan・SQLSTATE・RLS・復元契約は全て非waiverでPASSを維持している。
- **dense固定gateはFAILのまま維持**（本レポートは再分類の根拠にしない）。
  加えて、**sparseのPASS余裕1.5%は頑健でない**ことをリスク台帳へ追記すべきである。
- **一般リリースを阻む条件**:
  1. PR-12 stagingでの代表環境再計測（table size / null fraction / write rate / plan / lock窓の更新）が完了し、
     そこで凍結した限界をdenseが3-sample medianで満たすこと
  2. waiver失効条件（4店舗目、bulk有効化、関連DDL/policy変更、関連incident、2026-08-18期限）に抵触しないこと
  3. 案B/Cを採る場合はその契約再仕様化とRED/GREENの完全再証明

---

## 付記（調査手順の再現性）

- 証跡は `git archive a46e5bda docs/stabilization/evidence/commercial-hardening/pr11 scripts/commercial-hardening supabase/migrations/20260718011731_...` をscratchpadへ展開して解析（作業ツリー・DB・リモート無変更）。
- 数値はすべて `experiment-summary.json` / `blocks-pair*.parsed.json` / `blocks-pair*-normalize.stdout.raw` /
  `manifest.json` / `write-amplification.md` から機械的に再抽出可能。
- 抽出は使い捨てのPython/シェルワンライナーで実施し、証跡ファイルは無改変。

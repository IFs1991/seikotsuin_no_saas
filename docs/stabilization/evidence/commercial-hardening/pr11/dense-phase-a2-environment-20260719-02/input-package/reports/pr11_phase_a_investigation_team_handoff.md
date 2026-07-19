# PR11 Phase A 調査チーム引き継ぎ

## 目的

`idx_blocks_resource_id` 退役候補のPhase A結果を独立監査し、次の調査で「index不存在の定常効果」と「未commit DDL・lock・ホスト環境による交絡」を分離する。

## 現在の意思決定

- 恒久migration、commit、push、Draft PR、staging／production適用には進まない。
- `idx_blocks_resource_id` は開始時状態のまま維持する。
- 今回の候補は、**現行ROLLBACK-onlyプロトコル下ではREJECTED**。
- 恒久DROP後の定常性能悪化は **NOT PROVEN**。
- 次の作業は別index候補探索ではなく、測定妥当性と因果の切り分け。

## 調査チームへの依頼成果物

1. current / lock-only / savepoint rollback / drop-uncommitted の4-arm比較結果
2. 100 / 1,000 / 10,000行の傾き比較
3. negative controlを含む環境validity判定
4. trigger・RI・nested SQLの時間内訳
5. isolated committed A/Bの最終比較
6. cascade 10,000子行削除の独立WAL計測
7. `PASS / FAIL / ENVIRONMENT_INVALID / NOT_PROVEN`を混同しない最終YAML

## 非交渉条件

- 固定閾値、fixture、actor、JWT、GUC、sample採否を変更しない。
- 失敗sampleを除外しない。
- planner forcing、rebaseline、threshold緩和をしない。
- 既存ローカルDBのreset・volume削除、staging／production接続をしない。
- 未計測事項をPASSにしない。
- 元のFAIL証跡を上書き・削除しない。

---

## 判定

- **運用判定:** `FAIL / STOP` は正しい。恒久migration・commit・push・staging/productionへ進めない。
- **因果判定:** `idx_blocks_resource_id`の定常的な不存在が実行時間を悪化させることは**未証明**。現証跡は `INCONCLUSIVE_CAUSAL`。
- **最有力:** 未commit `DROP INDEX`を含むtransaction状態、またはWindows/Docker/CPU power・thermal・memory schedulingによるsample全体のwall-clock交絡。
- **反証されたもの:** 「候補がこのPhase Aプロトコルの固定gateを解消する」という主張。

## 証跡完全性

- ZIP内ファイル数: **406**
- manifest参照hash再計算: **395/395 一致**
- hash不一致: **0**
- `experiment-summary.json` hash: **一致**
- `frozen-gates.json` hash: **一致**
- 最終logical hash: `c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78`
- 最終physical hash: `94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86`
- 15/15 sample restoration: **True**

ただしZIPにはrunner・candidate SQL・spec本体が含まれず、`inputBundleSha256`と個別input hashを内容から再計算できない。結果ファイルの完全性は確認できるが、実験実装そのものの独立監査にはsource bundleが必要。

## Finding 1 — current controlも固定executionを1/7しか通らない

候補だけでなく、無変更currentも固定limitを **1/7** しか再現していない。candidateも **1/7**。

| probe                                  |   limit_ms |   current_median_ms | current_pass   |   candidate_median_ms | candidate_pass   | candidate_vs_current_pct   |
|:---------------------------------------|-----------:|--------------------:|:---------------|----------------------:|:-----------------|:---------------------------|
| created_by_read_100_of_20000           |      2.851 |               0.144 | True           |                 0.136 | True             | -5.6%                      |
| sparse_insert_10000                    |    435.737 |             613.124 | False          |              1107.73  | False            | +80.7%                     |
| dense_insert_10000                     |    521.551 |            1021.31  | False          |              1739.84  | False            | +70.4%                     |
| shift_full_only_insert_2000            |    198.387 |             216.708 | False          |               398.144 | False            | +83.7%                     |
| shift_full_plus_partial_insert_2000    |    219.224 |             254.466 | False          |               892.587 | False            | +250.8%                    |
| recipient_sparse_composite_insert_1000 |     46.665 |              66.036 | False          |               183.457 | False            | +177.8%                    |
| recipient_dense_composite_insert_1000  |     81.761 |             116.321 | False          |               195.614 | False            | +68.2%                     |

したがって絶対wall-clock gateのFAILは候補固有ではない。固定gateを解消できなかったため停止する判断は正しいが、原因をindex退役へ帰属できない。

## Finding 2 — 無関係なnegative controlsがcandidate sampleで大幅劣化

`idx_blocks_resource_id`の有無と論理的に無関係な4 probeで、candidate中央値が **+68%〜+251%**。一方、WAL records、shared hits、dirtied/written blocksはほぼ完全一致し、structural plan hashも全6 sampleで同一。

| probe                                  |   current_median |   candidate_median | delta_pct   |
|:---------------------------------------|-----------------:|-------------------:|:------------|
| shift_full_only_insert_2000            |          216.708 |            398.144 | +83.7%      |
| shift_full_plus_partial_insert_2000    |          254.466 |            892.587 | +250.8%     |
| recipient_sparse_composite_insert_1000 |           66.036 |            183.457 | +177.8%     |
| recipient_dense_composite_insert_1000  |          116.321 |            195.614 | +68.2%      |

これはDBが行った仕事量ではなく、sample/session/host側のwall-clock倍率が変化した証拠。

## Finding 3 — blocksではcandidateの実作業量は明確に減少

| probe   | execution current→candidate     | WAL bytes                     | shared hits               | WAL records               |
|:--------|:--------------------------------|:------------------------------|:--------------------------|:--------------------------|
| sparse  | 613.124 → 1107.727 ms (+80.7%)  | 8,590,604 → 7,862,340 (-8.5%) | 194,067 → 175,346 (-9.6%) | 100,693 → 90,587 (-10.0%) |
| dense   | 1021.307 → 1739.842 ms (+70.4%) | 9,505,732 → 8,775,924 (-7.7%) | 219,362 → 199,353 (-9.1%) | 110,823 → 100,713 (-9.1%) |

candidateはWAL recordsを約9〜10%、WAL bytesを約8%、shared-buffer hitsを約9〜10%削減している。それでもwall-clockだけ70〜81%悪化したため、「index maintenance増加」や「read plan退化」では説明できない。

## Finding 4 — plan・I/O・DB background activityに差がない

- 全10 probeのvolatile fields除外後structural plan SHA-256は、current/candidate/全pairで各probe **1種類のみ**。
- 全performance sampleでshared read blocksは0。
- before snapshotでactive/blocked other clients、vacuum progress、create-index progressは0。
- checkpointer countersは6 sample間で不変。
- logical/normalized physical stateは各sampleで同一。

残る未観測要因は、host CPU frequency/thermal、Windows scheduler、Docker/WSL scheduling、OS memory pressure、または未commit DDL transactionに伴うsession-wide overhead。

## Finding 5 — host timing環境は固定性能gate向きではない

- CPU: `12th Gen Intel(R) Core(TM) i7-1255U`
- Windows power plan: Balanced GUID
- RAM free at start: `1.50 GiB / 15.70 GiB`（**9.6%**）
- per-sample host CPU frequency、temperature、process CPU time、page faults、Docker CPUは未取得。
- 3 sampleのmax/minは多くのprobeで2〜3倍。local wall-clock median n=3では原因帰属に弱い。

## Finding 6 — ROLLBACK-only candidateはsteady stateではない

candidateはraw stderr上、canonical probeの`BEGIN`が既存transaction内で実行され、`there is already a transaction in progress`警告を出している。測定状態は以下を同時に含む。

1. index不存在
2. 未commit catalog変更
3. `blocks`へのDDL lock保持
4. relcache/plan invalidation後の同一session
5. canonical probe全体がそのtransaction内

これはcommit後・再接続後の定常状態と同一ではない。したがってPhase Aは「このrollback-only実験候補がFAIL」を証明するが、「恒久DROP後もFAIL」を証明しない。

## Finding 7 — cascade WALはNOT PROVEN、summaryのtrueは利用禁止

`experiment-summary.json`には`cascade.walPass=true`が残るが、root `resources` ModifyTableの84 bytesしか捕捉しておらず、RI triggerが削除した10,000 `blocks`のWALを含む証拠ではない。addendumの`NOT_PROVEN`が正しい。

なおaddendumの「trigger instrumentation exposes Time and Calls」という説明と異なり、このraw JSONではtriggerに`Calls`はあるが`Time`はない。結論は変わらないが文言修正が必要。

## Finding 8 — paired causal gateもnegative-control交絡を受けている

事前gate上のraw pair判定はsparse 0/3、dense 1/3でFAIL。これは変更しない。

診断目的で、無関係な4 probeのcandidate/current倍率の幾何平均をsample速度係数として補正すると以下になる。

|   pair | probe               |   raw_candidate_current_ratio |   negative_control_geomean_ratio |   posthoc_adjusted_ratio |
|-------:|:--------------------|------------------------------:|---------------------------------:|-------------------------:|
|      1 | sparse_insert_10000 |                         1.792 |                            0.783 |                    2.288 |
|      1 | dense_insert_10000  |                         0.877 |                            0.783 |                    1.12  |
|      2 | sparse_insert_10000 |                         1.894 |                            3.025 |                    0.626 |
|      2 | dense_insert_10000  |                         1.78  |                            3.025 |                    0.588 |
|      3 | sparse_insert_10000 |                         1.104 |                            2.353 |                    0.469 |
|      3 | dense_insert_10000  |                         1.091 |                            2.353 |                    0.464 |

この補正はpost-hocでrelease evidenceには使えない。ただしpair2・3ではcandidate sample全体が約2.35〜3.03倍遅く、blocksだけを見たraw causal判定がhost/session状態を拾っている可能性を強く示す。

## 推奨する次の実験

### D0 — evidence packageを自己完結化

runner、全SQL、spec、Jest contractをZIPへ同梱し、original manifest・addenda・全sourceをhashする`package-manifest.json`を追加。元summaryは変更しない。

### D1 — validity gateを先に置く

候補評価前に以下を満たさなければ`CANDIDATE_FAIL`ではなく`ENVIRONMENT_INVALID`で停止。

- current controlが固定limitを再現、または事前固定した再現許容幅内
- negative controlsのstate間倍率が事前許容幅内
- host/Docker quiescenceが連続数秒成立
- AC電源、performance power plan、CPU frequency、available memoryを記録

### D2 — 4-arm diagnostic

1. `CURRENT`
2. `LOCK_ONLY` — indexあり + `ACCESS EXCLUSIVE`
3. `DROP_ROLLBACK_TO_SAVEPOINT` — DDL/invalidation後にindexとlockを戻す
4. `DROP_UNCOMMITTED` —現行candidate

これでlock、DDL invalidation、index不存在を分離。100/1,000/10,000行で傾きを取る。

### D3 — isolated committed A/Bで最終決着

別port・別volumeの2つのisolated local Supabaseをclean replay。

- A: current
- B: one-off local-only DROPをcommitし、接続を張り直す

同一fixture・ランダム化順序・7〜9 sampleで比較。既存local DB、staging、productionには触れない。

### D4 — attribution telemetry

- small-N diagnosticのみ`TIMING ON`
- `auto_explain` nested statements / triggers
- host process CPU time、CPU frequency、temperature、available memory、page faults
- Docker CPU/memory/block I/Oをsample前後で取得
- probeごとの開始/終了timestamp

### D5 — cascade WAL

isolated環境で`pg_current_wal_insert_lsn()`または`pg_stat_wal`差分を前後取得し、同時writeなしを機械検査。root planの84 bytesをcascade WALとして扱わない。

## 最終判断

`idx_blocks_resource_id`は現状維持。Phase Bへ進まない。

ただし候補の技術的分類は次のように修正するのが正確。

```text
RELEASE_DECISION: FAIL_STOP
CANDIDATE_UNDER_CURRENT_PROTOCOL: REJECTED
STEADY_STATE_CAUSAL_EFFECT: NOT_PROVEN
EXPERIMENT_VALIDITY_FOR_WALL_CLOCK_CAUSALITY: INCONCLUSIVE
NEXT_ACTION: CONTROLLED_ATTRIBUTION_THEN_COMMITTED_A_B
```

---

## 提供証跡

- `resource-index-drop-rollback-phase-a-20260719-03.zip`
- `pr11_phase_a_independent_audit.json`
- `pr11_phase_a_independent_metrics.csv`
- `pr11_phase_a_gate_recalculation.csv`

この文書の数値は上記Phase A ZIPを展開して再計算したもの。source bundleがZIPに未収録のため、runner・SQL・spec・Jest contractを含む自己完結packageを次回証跡へ追加すること。

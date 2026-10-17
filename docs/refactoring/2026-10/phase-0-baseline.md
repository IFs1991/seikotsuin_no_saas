# Phase 0 — 現行HEAD棚卸し・baseline（read-only）

- Tracker: [#135](https://github.com/IFs1991/seikotsuin_no_saas/issues/135)
- Status: **NOT_STARTED / NOT_RUN**。この文書は計画であって棚卸しの実施結果ではない。
- Entry: main SHAを最新で確定。初期候補は`8e7ab4c`。
- Exit: 下記の成果物がrepoファイルと行・実行コマンド/日付でトレースできる。

## 分担チケット
- [T01 #141](https://github.com/IFs1991/seikotsuin_no_saas/issues/141): service/route/legacyの入口→依存関係と候補整理
- [T02 #142](https://github.com/IFs1991/seikotsuin_no_saas/issues/142): 予約UI/本部集計のベースライン計測仕様
- [T03 #143](https://github.com/IFs1991/seikotsuin_no_saas/issues/143): 既存監査とPR #59の最新HEAD差分

## インベントリー（調査結果を上書きしない。候補である）
| 候補 | 現在わかること | 調査で証明すること |
| --- | --- | --- |
| `src/lib/services/reservation-service.ts` | 約739行、静的検索で主にテストからの参照を確認 | dynamic imports、scripts、実行時参照、利用者がゼロか |
| `src/lib/services/block-service.ts` | 約307行、同上 | REST/APIとの関係、外部entrypoints |
| `src/app/api/resources/route.ts` | legacy staff・permissions fallback取得 | 本番データの依存、後方互換維持要否 |
| `src/app/(app)/reservations/page.tsx` | シフト情報をstaff ID Setに集約 | 時刻単位の勤務判定・休憩・未登録/他院ヘルプの表示影響 |
| `src/lib/services/public-availability-service.ts` | 予約・blocksを照合 | 内部予約/shift/scopeとの差分 |
| `src/app/api/manager/rosters/route.ts` | staff_shiftsをclinicごと取得 | 多店舗データの一括取得/本人同一性 |
| [PR #59](https://github.com/IFs1991/seikotsuin_no_saas/pull/59) | SQL/legacy/docs整理計画がOPEN | 古い記述と現行mainに不一致がないか |

## 成果物
1. **source graph**: UI→hook→route→service→tables/columns→RLS→tests。各辺の証拠（import/URL/function）と利用頻度を記録。
2. **candidate register**: `ID / kind / source path / caller count / runtime reachability / risk / recommended action / evidence / verdict`。Verdict: `KEEP` / `REMOVE_CANDIDATE` / `REFACTOR_CANDIDATE` / `VERIFY_FIRST`。
3. **audit reconciliation**: 2026-04完了8PRと2026-09 Audit v2のF01-F24、PR #59の粒度を重複排除。過去版PASSを最新の証拠に変換しない。
4. **measurement protocol**: シナリオ（閲覧/切替/他院/管理集計）、データ件数、cold/warm cache、環境、samples、DBクエリ、ネットワーク往復、p50/p95と誤表示率。数値がないなら`NOT_RUN`。

## 完了判定
- [ ] 現行mainのSHA・対象コードpath・検証日時が揃う
- [ ] static only / runtime proven / unknown の3分類で未使用判定
- [ ] P1の守るべき契約、P2〜P4の候補と優先順位を根拠付きで提示
- [ ] deletion / auth変更 / migration / external callsは実施していない
- [ ] すべての未実施項目を`NOT_RUN`として記録

## 中止
調査中に患者情報、tenant越境、予約重複等の重大バグを再現した場合、修正をP1の独立high-risk issueに切り出し、P2以降の削除判断を保留する。

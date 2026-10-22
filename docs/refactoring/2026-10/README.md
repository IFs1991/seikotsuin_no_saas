# Tiramisu OS — Refactoring Program v1.1

- 改訂日: 2026-10-17 JST。v1.0を同じ8ファイルで置換する計画改訂。
- 初期ソース基準: `8e7ab4c139d749eadf883eecb6f475bed00dc147`。改訂前の計画head: `d866930288f04df66a2899d745922f3ca7eaa514`。
- 計画レビュー: [PR #144](https://github.com/IFs1991/seikotsuin_no_saas/pull/144)。進捗: [Epic #134](https://github.com/IFs1991/seikotsuin_no_saas/issues/134)。計画の承認・mergeは実装開始や本番操作の承認ではない。

## 1. 成功の定義と範囲

Worksを優先し、OSの次の変更を小さく・安全にできる状態にする。期限を急がないことと、無期限に調査することは別。全面リライト、汎用Availability Engine、全テーブル刷新、全API統合を前提にしない。

初回Waveは**予約タイムライン・予約API・resources・staff_shifts・blocksとその直接依存**。本部集計は計測候補1経路に限定する。他領域の問題は発見記録に留め、勝手に修正範囲を広げない。削除行数・ファイル分割数・チケット完了数だけでは成功としない。

## 2. 正本を分け、進捗を重複管理しない

| 情報 | 正本 | 更新する時 |
| --- | --- | --- |
| 不変条件・品質基準 | [AGENTS.md](../../../AGENTS.md)、[Change DoD](../../quality/change-dod-v1.0.md)、Design.md | 別の規約変更として扱う |
| 目的・依存関係・完了条件 | 本READMEとフェーズ文書 | 計画を変更するPRだけ |
| 担当・作業状態・依存Issue | GitHub Issue #134〜#143 | 着手・停止・レビュー・終了時 |
| 実行結果・差分・承認 | 各PRの証跡とreview | 対象commit・環境ごと |
| 出荷可否 | 既存のrelease gate | 本Programとは別判定 |

文書に実装進捗のコピーを増やさない。Phase Issueは追跡用であり実装PRではない。未担当を自動でREADYにしない。Issue間の依存は本文の`Depends on`を正本とし、native dependency設定済みとは扱わない。

既存の4月計画、9月監査、[9月のmain統合結果](../../stabilization/audit-v2-integration-status.md)、[旧PR #59](https://github.com/IFs1991/seikotsuin_no_saas/pull/59)を突合する。古いOPENを新しい未修正バグと読み替えない。統合済み修正の再実装も、履歴PASSの現headへの転用もしない。

## 3. フェーズは実行分類。巨大な直列プロジェクトにしない

| Phase / tracker | 目的・文書 | 当該作業の着手条件 | 終了の証拠 |
| --- | --- | --- | --- |
| P0 / #135 | [対象限定の棚卸し](phase-0-baseline.md) | source SHA・変更禁止範囲を固定 | 3成果物と次の1作業、未知を明記 |
| P1 / #136 | [変更対象の契約固定](phase-1-contracts.md) | 当該候補のP0証拠 | 既存挙動と必要な負のテスト、変更分類 |
| P2 / #137 | [証明済み資産の整理](phase-2-cleanup.md) | 当該候補の参照確認＋P1契約 | 利用者非退行・削除根拠・revert |
| P3 / #138 | [予約判定の限定共通化](phase-3-availability-domain.md) | consumer別契約とID対応が判明 | 採用consumerで同値、方針差を保持 |
| P4 / #139 | [測定済み経路の最適化](phase-4-performance.md) | 実測baseline＋当該P1契約 | 同条件の比較と安全性非退行 |
| P5 / #140 | [UI整理と別機能の判断](phase-5-ui-and-feature-gate.md) | UI契約。新機能には別仕様承認 | UI非退行／新機能GO・DEFER判断 |

初動順: **#143（旧計画突合）→ #141（依存調査）→ #142（計測仕様）**。予備の読取調査は並行可能だが、共有ファイルの同時編集は禁止。

P0/P1をリポジトリ全体で終えるまで低リスク変更を止めない。対象ごとの証拠が揃った作業だけ先行できる。ただし当該変更の必須テスト・安全性ゲートは省略不可。無関係な実Redis・全院容量・出荷試験の未完了は、docs整理や独立した純粋関数整理の一律ブロッカーにしない。

P2→P3→P4の全件順次実行は不要。依存が独立していても、**OSのruntime実装は同時1 PRまで**。docs/read-only作業も別に1件まで。各Phaseは初回Waveに採用したチケットを閉じ、非採用候補のKEEP/DEFER理由を記録すれば区切れる。全候補の実装を義務にしない。

## 4. 着手・中断・採否

各実装チケットは[テンプレート](ticket-template.md)で、担当、reviewer、source SHA、変更許可パス、依存、実装・レビュー・検証の工数見込み、停止上限、rollbackを埋めてREADYにする。最初に具体化するのは次の1〜3作業まで。

提案する初回調査予算は人間の確認・判断で合計4時間。これは予測納期でも承認済み予算でもない。着手時にownerが採否を記録し、上限到達時はUNKNOWNを残して次の判断を返す。延長を黙って繰り返さない。

優先順位は、①実害・重大リスク、②頻繁な変更での手戻り、③計測済み遅延・コスト、④見た目だけの整理。概算回収式は`実装＋レビュー＋検証時間 / 1変更あたり削減時間`。削減見込みが不明なら保守性の仮説として扱い、ROI実証とは書かない。

Worksの営業・納品と衝突したらOSは停止。再開用にIssueへ`作業branch/head、変更ファイル、実行済み検証、未解決1点、次の1コマンドまたは作業`だけ記録する。長期branchへ全フェーズを積まない。

## 5. 安全境界と終了

REFACTORは契約維持、FIXは不具合修正、FEATUREは新規仕様、PERFORMANCEは意味を変えない測定改善。混在が必要なら依存PRへ分割する。DB/RLS/auth/billing/患者データに触れる変更は既存High-risk基準を適用する。

既存migrationの編集・削除・squash、認可緩和、テスト削除によるgreen化、本番DB/Auth変更、実通知・課金、無断merge/deployは禁止。DB変更はappend-onlyの別チケットで仕様・rollback SQLと必要な承認を用意する。

比較対象はsource SHA、実装head、検証SHA、統合後SHAを区別する。PASS/FAIL/NOT_RUN等はChange DoDをそのまま使う。未実行・環境待ち・flaky・skipは成功に足さない。必須証拠または独立reviewがなければ完了にしない。

本改訂は計画整備だけ。実装、DB検証、性能改善、出荷判定を完了させたものではない。

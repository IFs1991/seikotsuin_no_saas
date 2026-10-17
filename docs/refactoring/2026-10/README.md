# Tiramisu OS — Refactoring Program v1.0

- 作成日: 2026-10-17 JST
- 初期監査基準: `8e7ab4c139d749eadf883eecb6f475bed00dc147` (main)
- Status: **PROPOSED / DOCS-ONLY** (コード修正・DB適用・実機/CI測定なし)
- 管理: [Epic #134](https://github.com/IFs1991/seikotsuin_no_saas/issues/134)
- 所有者/期限: 未割当 / 固定納期なし。**Tiramisu Worksの営業・導入が常に優先**。

## ゴールと非ゴール
ゴールは、重複処理・未使用資産・変更箇所数・無駄なクエリを、既存の振る舞いとテナント境界を維持して減らすこと。綺麗な抽象化やLOC削減は単独では成功ではない。

対象: 既存Tiramisu OS。非対象: 全面リライト、`Tiramisu2`への強制移行、テナントモデルの全面再設計、ルールのないSQL/認証の削除、新機能の便乗実装、期限に合わせた大規模一括PR。

## 参照の正本 / 重複させない
1. 現行ルール: [AGENTS.md](../../../AGENTS.md)、[Change DoD v1.0](../../quality/change-dod-v1.0.md)、[Design.md](../../../Design.md)
2. 既存完了履歴: [Closed MVP Refactoring Plan](../../stabilization/plan-closed-mvp-refactoring-priority-v0.1.md) (2026-04、PR-01〜08完了記録)。再起票しない。
3. 旧監査: [2026-09 Audit v2](../../stabilization/audit-v2-originals/tiramisu_os_technical_audit_2026-09-06_v2.md)、[Remediation backlog](../../stabilization/audit-v2-originals/remediation_backlog.md)、[Integration status](../../stabilization/audit-v2-integration-status.md)。**基準SHAが異なるため現mainとの差分照合が必須**。
4. 未マージの旧整理計画: [PR #59](https://github.com/IFs1991/seikotsuin_no_saas/pull/59) (2026-07)。重複する削除計画を起こさず、最新mainの参照確認後に採否を決める。
5. 運用・出荷判定は[Release governance](../../releases/README.md)。本ProgramのDoD達成を商用リリースのPASSに読み替えない。

## フェーズと依存関係

| Gate | Issue | 文書 | 作業 | 着手条件 |
| --- | --- | --- | --- | --- |
| P0 | [#135](https://github.com/IFs1991/seikotsuin_no_saas/issues/135) | [phase-0-baseline.md](phase-0-baseline.md) | 棚卸し・baseline | 即時にread-onlyで実施可能 |
| P1 | [#136](https://github.com/IFs1991/seikotsuin_no_saas/issues/136) | [phase-1-contracts.md](phase-1-contracts.md) | 認可/業務契約ガード | P0の差分・リスク分類 |
| P2 | [#137](https://github.com/IFs1991/seikotsuin_no_saas/issues/137) | [phase-2-cleanup.md](phase-2-cleanup.md) | 旧資産・重複撤去 | P0証明+P1回帰契約 |
| P3 | [#138](https://github.com/IFs1991/seikotsuin_no_saas/issues/138) | [phase-3-availability-domain.md](phase-3-availability-domain.md) | 予約/勤務/空き判定の整理 | P1。P2完了は必須にしない |
| P4 | [#139](https://github.com/IFs1991/seikotsuin_no_saas/issues/139) | [phase-4-performance.md](phase-4-performance.md) | 実測パフォーマンス改善 | P0 baselineとP1安全ゲート |
| P5 | [#140](https://github.com/IFs1991/seikotsuin_no_saas/issues/140) | [phase-5-ui-and-feature-gate.md](phase-5-ui-and-feature-gate.md) | UI簡素化・他院照会の独立判断 | 対象UIはP1完了。照会はP3 read modelの成立後 |

P0→P1が順序必須。P2/P3/P4は検証済みの独立PRとして部分並走できる。P5の新機能は別のfeat Issue/PRで実施。各Phase Issueは**追跡用Epic**であり、実装にはならない。

## チケット運用
- **1つの実装Issue = 1つの焦点を持ったPR**。Phase Issue/Epicは進捗集約のみ。
- 1つのPRにセキュリティの仕様変更、削除、最適化、UI、新機能を混在させない。
- Phase 0で課題を検証するまで、Phase 1以降の細目Issueを大量起票しない。
- OS runtime変更は**同時進行1 PRまで**、docs/read-onlyは別に1件まで。Worksの顧客・納品作業があればOSの着手を見送る。
- Issueには[チケット雛形](ticket-template.md)に従い、`current SHA / problem proof / scope / risk / tests / rollback / before-after`を記録。
- 状態: `BACKLOG` → `READY` (検証済み・着手可能) → `IN_PROGRESS` → `REVIEW` → `DONE`。不確実なものは`VERIFY_FIRST`、blockedは`BLOCKED`。
- 完了証拠は当該コミットと環境にひも付ける。未測定`NOT_RUN`を`PASS`としない。

## リスク順 / 停止条件
1. **法務・患者情報/tenant漏洩、予約二重作成、課金/通知誤処理**: 安全性・業務正確性。異常があれば他のリファクタリングを止めて優先。
2. **技術**: staff identityの不一致、予約/シフト/blocksの境界、DB/RLS緩和、データ欠損。
3. **運用**: 既存施設のUI/手順への影響、rollback不能。
4. **市場/資金・機会費用**: Worksの販売/PoCが遅れる場合、OS作業は止める。

本Programは「機能を増やすプロジェクト」ではなく、将来の変更費用を下げる投資。数値的な便益とリスクの証拠が乏しければ中断・保留を選択する。

## 判定指標（未測定の数値はゼロにしない）
- 自院と他院のscope越境0件（negative test / 実DB）
- 予約競合/キャンセル/ブロック/勤務時間の契約回帰0件
- 対象変更の編集ファイル数・依存箇所数（before→after）
- API/DB round tripsと`p50/p95`の同条件実測（必要ならサンプルサイズ付記）
- cleanup候補の参照証拠と、削除後に残るデータ/仕様の所在
- PRごとのリスクと承認者/rollback記録

初回のP0チケット: [T01 #141](https://github.com/IFs1991/seikotsuin_no_saas/issues/141) / [T02 #142](https://github.com/IFs1991/seikotsuin_no_saas/issues/142) / [T03 #143](https://github.com/IFs1991/seikotsuin_no_saas/issues/143)。**現時点ですべて未完了**。

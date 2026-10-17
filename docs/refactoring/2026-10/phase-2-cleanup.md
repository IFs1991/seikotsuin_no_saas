# Phase 2 — 旧資産・未使用コード・互換レイヤーの証拠付き削減

- Tracker: [#137](https://github.com/IFs1991/seikotsuin_no_saas/issues/137)
- Status: **PLANNED**
- Entry: P0の`REMOVE_CANDIDATE`とP1の回帰契約が揃う。

## 既存PRを再利用
2026-07の[PR #59](https://github.com/IFs1991/seikotsuin_no_saas/pull/59)はSQL三重管理、ドキュメント重複、`src/legacy/Reservation/`、重複script/依存関係の調査計画を含む。**当時のファイル構成を現行だと仮定しない**。差分対照表を先に作り、重複Issueを閉じるか統合する。PR #59を無条件でmergeしない。

## サブタスク候補（P0で証明後に個別起票）
1. 責務のない`ReservationService` / `BlockService`等の利用者検証と安全な削除（参照があれば保留）。
2. `resources` routeの旧staff/permissions fallbackの発動条件・本番依存確認。必要なら段階的除去、互換保証。
3. 重複SQL・legacy assetsの正本マップ作成。**実DBスキーマ変更と混同しない**。
4. docs/old specの整理。参照リンク・ADR/監査証跡・唯一情報源を保護する。
5. npm依存や重複scriptのうち影響がないものだけ除去。lockfileの不必要な再生成禁止。

## 各チケットの削除証明
- import/require/dynamic import/codegen/scripts/npm/CI/Next routing/DB function caller の依存を確認
- `git grep`/検索ゼロだけで「本番未使用」と断定しない。CLI/外部利用、データ有無も調査する
- before/afterでAPI契約、build、typecheck、focused tests、運用runbookを比較
- rollback（revert）が実際に可能な単位まで分け、明確な不可逆migrationは別承認
- 行数減少は参考指標。利用者事故や監査欠落がある削除は不採用

## Gate
- [ ] PR #59と最新mainの差分が列挙され重複タスクを作っていない
- [ ] 削除候補ごとに参照不在または明示的な利用者移行が証明済み
- [ ] DB/migration・RLS/GRANT、docリンク・CI/型/回帰に退行がない
- [ ] 意味のない互換コードを減らし、復旧手順が記録されている

禁止: bulk `git rm -r`、実DBリセット、migration変更・適用、手当たり次第のテスト削除。

# OS-RF チケット・実装者引継ぎテンプレート

v1.1。Phase trackerはEpic、実作業は原則1 Issue＝1 PR。共通事項は[README](README.md)、品質は[Change DoD](../../quality/change-dod-v1.0.md)を参照し、全文を各Issueへ複製しない。

## READYに必要な項目

```text
Parent / Phase:
Kind: INVESTIGATION | DOCS_ONLY | REFACTOR | FIX | PERFORMANCE | FEATURE
Work status: BACKLOG | READY | IN_PROGRESS | REVIEW | BLOCKED | DEFERRED | DONE
Owner / independent reviewer:
Source main SHA / work branch / implementation HEAD:
Depends on: #番号と必要な成果物（なければnone）
Problem: 現在の不具合または変更コスト。出典path/symbol、関連監査ID。
Proof level: 候補 | 静的確認 | 再現確認 | 環境検証
Scope: 変更許可ファイル/入口/consumer
Non-goals: 触らないAPI/DB/UI/外部環境
Risk: Low | Medium | High（根拠・影響境界）
Contract: 維持する挙動／明示承認済みの変更
Output: 実ファイルの予定パス、またはコードの変更単位
Acceptance: positive / negative / regression、変更前後の観測
Effort: 実装・レビュー・検証の見込み（仮定）
Stop budget: 上限と超過時の判断先
Rollback: revert対象と、DB/外部作用が残る場合の回復方法
Authorization: 許可された実行・環境、未承認操作
Works priority check: 優先業務との競合なし／延期
```

担当・レビュー手段・対象・成果物・受入・停止上限が不明な実装IssueはREADYにしない。INVESTIGATIONでは「不明点を特定して次判断を出す」を受入にできる。副作用のある調査はread-onlyと称さない。

## PRの証跡

記録する列は`検証項目 / command・手順 / expected / actual / PASS・FAIL・NOT_RUN・NOT_APPLICABLE / tested SHA / 環境 / 時刻 / 証拠`。Change DoDのPASS_WITH_RISKは許される非blocking残件にだけ使用し、owner・期限・mitigationを付ける。

REFACTORは現契約の変更前green→変更後green、FIXやDB/RLS/auth/billing変更は必要なRED→GREENを示す。reviewer名と実際のreview結果を記録する。実装者の自己レビューを独立レビューへ水増ししない。

docs-onlyには対象リンク/構文/差分の検証、runtimeには該当テスト/build/既存CIを記録する。GitHub Actions未実行をローカルPASSで隠さない。必須gateが未実行ならmerge完了としない。検証headからコードが変われば影響範囲を再検証する。

IssueのDONEは成果物の統合と当該Change DoDの完了後。重複・KEEP・採用しない結論は理由と証拠を残して終了できるが、未実施の実装をDONEにしない。文書更新だけでP0調査や実環境検証を完了扱いしない。

## AI実装者へ渡す短い指示

対象Issueを1件だけ読み、AGENTS.md、CLAUDE.md、Change DoD、該当フェーズ文書、依存成果物を確認する。mainと作業HEAD、未commit変更、実行許可範囲を記録する。sourceが変わっていれば関連差分を再評価し、旧SHAへresetしない。

まず対象契約と現テストを確認し、必要な不足テストだけ追加する。変更許可パス外、新依存、業務ルール変更、DB操作、実通知/課金、本番設定、mergeが必要ならその操作を止め、理由と最小の別作業を報告する。未依頼の全体整理を始めない。

1責務を最小変更し、対象テストと回帰、差分、rollbackを検証する。テストを消す、認可を緩める、fixtureを実装に迎合させることでgreenにしない。未知・FAIL・NOT_RUNをそのまま記録する。

終了時は変更点・証拠・未確認・次の1作業をIssue/PRへ返す。引継ぎはbranch/head・変更ファイル・検証済み範囲・未解決1点・次の1作業に絞る。Worksを理由に長期放置branchを作らず、小さく中断可能にする。

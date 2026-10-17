# Phase 0 — 対象を限定した棚卸しと計測仕様

v1.1 / tracker #135。共通運用は[README](README.md)。初期指摘は調査候補であり、未使用・遅延・不具合の確定証拠ではない。

## 作業と成果物を固定する

| 順序 / Issue | 作業 | この作業だけが作成する成果物 | 非対象 |
| --- | --- | --- | --- |
| 1 / #143 | 既存監査・統合PR・旧PR #59の対応整理 | `evidence/audit-map.md` | 全24項目の再実装・全面再監査 |
| 2 / #141 | 予約周辺の到達経路と未使用候補調査 | `evidence/candidates.md` | 削除・型/依存更新・実DB調査 |
| 3 / #142 | 代表操作の測定手順と合否条件案 | `evidence/measurement-protocol.md` | 負荷試験実行・計測コード追加 |

上記のパスは本ディレクトリ配下の将来成果物。空の結果ファイルを先に量産しない。1調査Issue＝1つのdocs-only PR。証拠の追記先を分け、同じ台帳を同時編集しない。計画本体は参照リンクが必要な場合のみ変更する。

## #143: 古い指摘を現在の問題と混同しない

4月の完了記録、9月の監査原本とintegration-status、PR #59を順に読む。各旧IDは`旧状態 / 修正PR・SHA / 現sourceとの関係 / 今回の対象か / 次の作業`へ対応させる。原本にOPENとあっても後続統合記録を優先して確認する。

全IDの所在は整理するが、深い再検証は初回Waveに関係するコードに限定する。対象外はDEFER、証拠不足はVERIFY_FIRST。CODE_FIXEDという過去記録、現sourceの静的確認、現環境での検証済みを別列にする。

## #141: 削除前の到達性

起点は`reservation-service.ts`、`block-service.ts`、`api/reservations`、`api/resources`、`api/blocks`、`(app)/reservations/page.tsx`。直接依存の公開予約・mobile-uiux予約・ロスターも追跡する。別領域へ広がったら理由を記録して保留する。

import/require、barrel export、dynamic import、Nextのファイルルーティング、npm scripts、CI、codegen、テスト、SQL/RPC・外部入口を調べる。importが0でもrouteやscriptは入口になり得る。旧テストしか利用していないことはランタイム非使用の候補証拠にすぎない。

各候補は`ID / source SHA / path・symbol / callers・入口 / 関係table・policy / 動的利用の不明点 / 現行テスト / 変更影響 / KEEP・REMOVE_CANDIDATE・REFACTOR_CANDIDATE・VERIFY_FIRST / 理由`を記録する。依存図は表または短いテキストで十分。専用分析ツール導入を前提にしない。

## #142: 計測仕様と実測を分離する

代表操作は予約初期表示、日付/院切替、公開空き照会、本部集計の各1経路。変更対象に不要な操作は理由付きで対象外にする。操作→API→DBアクセスを対応させ、ブラウザHTTP数、サーバーからDB/APIへの往復、SQL実行数、認証検証回数を区別する。

source SHA、fixture規模、権限、cold/warm、環境・リージョン、サンプル数、並列度、計測点、error rate、p50/p95、実行承認を決める。未取得の値はNOT_RUN。ベースライン未測定でも**仕様書作成のIssueは完了可能**だが、P4の最適化着手条件は満たさない。

## 調査完了と停止

成果物の所在、出典、未確認事項、次の1作業とその根拠が揃えば、この調査を閉じる。「全部わかった」を条件にしない。source変更時は関連差分だけ再調査し、過去の結果を上書きしない。

重大な患者情報漏洩・予約競合等を発見したら、対象・根拠・影響を報告し、別FIX Issueへ振り分ける。調査権限を実装修正・本番確認の許可と読み替えない。

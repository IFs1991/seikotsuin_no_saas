# OS-F1 (#147) 本番リリース記録 v1（適用前・owner 承認待ち）

PR #165 / migration `20261023064851_os_customer_stat_authority`。記録は件数・hash・catalog メタデータだけで、患者情報・秘密情報は含まない。状態は PASS / FAIL / NOT_RUN / UNKNOWN / owner確認 / owner判断 で示す。

## 1. 対象

| 項目                                                                                                                                    | 値                                                                                                                                                                                                                                                                       | 状態                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| PR head                                                                                                                                 | `2b48568`（コード）＋ このディレクトリだけを追加する文書 commit。`15d4c71` 以降の変更は文書・証跡だけ                                                                                                                                                                    | 適用直前とマージ直前に再確認       |
| base `main`                                                                                                                             | `91d18779ed94c5688c1daa15363e4a5b99da1ecf`                                                                                                                                                                                                                               | マージ直前に再確認                 |
| CI                                                                                                                                      | `15d4c71`: run 530 で全8 job success。`2b48568`: run 533 で、Database Contract の生成型 step だけが ECR の取得制限（`toomanyrequests: Data limit exceeded`）で失敗し、App E2E は skipped。この session からの再実行は 403。この文書 commit の push で新しい run が始まる | 最終 head の全8 job success が必要 |
| Supabase project                                                                                                                        | `qnanuoqveidwvacvbhqp`（seikotsuin-management / ap-northeast-1 / PG 17.6.1.104 / ACTIVE_HEALTHY）                                                                                                                                                                        | PASS                               |
| 本番の migration 履歴                                                                                                                   | 68件、最大は `20261020170757`。`20260906003219` と `20261023064851` は無い                                                                                                                                                                                               | PASS                               |
| Vercel Production deployment（ID・配信 SHA・Production Branch・alias とドメイン・自動割当・Instant Rollback 後の停止・接続先 Supabase） | Vercel API は 403（team access が未承認）。本番ドメインへの取得は、この環境のネットワークポリシーで拒否される                                                                                                                                                            | UNKNOWN → owner確認（P8）          |
| LP 公開ゲート（PR #164）                                                                                                                | `public-site:release-check` は RELEASE_BLOCKED（公開に必要な未承認項目 14件）。#164 の内容が既に Production で配信されているかは UNKNOWN（Vercel 待ち）                                                                                                                  | UNKNOWN → owner確認（P9）          |
| 適用テキスト                                                                                                                            | v1 `apply-20261023064851.sql`（sha256 `2629d4a9…`）。CRLF で貼り付けると自己検査で止まるため、改行に依存しない v2 `apply-20261023064851-v2.sql`（sha256 `51ca77c74027afc145264c017dfb3a84e81f2d587960dfe77d191d0762d39540`）を使う（`SHA256SUMS`）                       | §5・§8                             |

## 2. 適用前ゲート（本番・read-only、2026-10-23 17:48Z ごろ）

`production-gate-2026-10-23.txt` に記録。G0〜G3 は spec §9.1 の SQL を `set transaction read only` で1つずつ実行した。

| ゲート         | 結果                                                                                                                                                                                                 | 状態 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| G0             | 旧 trigger `O`、旧関数の本体 md5 `f23956bd…`（SECURITY DEFINER）、新 trigger 0、`default_isolation = read committed`、`non_rc_isolation_settings = 0`、cache 列の型は想定どおり、`0906` の関数は無い | PASS |
| G1             | 顧客 17、不一致 0（院 0、NULL 0、件数・売上・最終来院日の差 0）                                                                                                                                      | PASS |
| G2             | 不一致 0、explained 0、unexplained 0、history gap 0。予約履歴に完了の記録は 0件                                                                                                                      | PASS |
| G3             | 顧客 17、予約 21、集計対象（completed かつ非削除）0、作成履歴の無い予約 0、1院あたりの最大顧客数 12                                                                                                  | PASS |
| ロックの見積り | `reservations` への ACCESS EXCLUSIVE は trigger の削除・作成の間だけ。予約は 21件で、隔離DBでは全体が1秒未満。`lock_timeout 5s` で取れなければ何も変えずに失敗する                                   | —    |

## 3. owner 判断（推奨）

- A 既存 cache の一括再構築: **A（再構築しない）を推奨**。G1 の不一致が 0 のため、補正の対象が無い。
- B `arrived` と `completed`: **A（現在の契約を維持）を推奨**。
  - 画面は `arrived` を記録するため、本番の集計対象は 0件のまま。
  - `arrived` を `completed` に変換しない。`patient_visit_summary` も変えない。
  - 既存の副作用: `arrived` から他の status へ変えると、未確定の日報明細が削除される（#146 spec §11.2）。本リリースではこれを変えない。
- C 休眠掘起しの日時変換の不具合: Issue #166 を作成した。PR #165 には含めない。
  - 本番の現状: `last_visit_date` を持つ顧客 0、outreach campaign 0。今は発生しない。
  - 本リリース後に発生し得る条件: `completed` の予約を持つ、LINE に同意した顧客が出ること。
  - リリースを止める要因ではない。修正は #166 で行う。

## 4. バックアップと復旧

- DB: migration はデータを書き換えない（全ケースで行の fingerprint が不変）。rollback SQL は設計上ブロックされている。問題時は spec §9.4 の forward-fix だけで対応する。
  - 緊急停止 SQL は通常の手順では実行しない。障害時に別承認で使う。
- バックアップ（PITR・日次）の有無と復旧手段: owner確認。
- アプリ: 本PRにアプリコードの差分は無い。マージ後に問題が出た場合は、P8 で記録した deployment への Vercel Instant Rollback で戻す（owner が実施）。

## 5. 適用テキストと隔離DBでの検証（`apply-verify.txt`）

- 構成: migration 本文（最後の `commit;` を除く）、履歴の INSERT、自己検査、`commit;`、read-only の結果 SELECT。spec §9.2 と PR #163 v3 と同じ。
- 履歴の INSERT:
  - `statements` は CLI 2.109.0 の分割器（`github.com/supabase/cli/pkg/parser`）で作った 20 要素で、md5 は `4a72d5d6c036c075d1a820b0b056b1cc`。
  - 同じ分割器で本番の `20261020170757`（24 要素、`53e45835…`）を再現できることを確認した。
- 自己検査（`target-check.sql`）: 関数・trigger・列・旧 trigger と旧関数の不在・履歴行の md5 が `c71e8adc43377cc6ea02640fd31c2e2b` でなければ、`P0001` で全体を取り消す。
- 検証結果:
  - 成功のケースを、隔離 PG 17.6 と公式 `supabase/postgres:17.6.1.140`（superuser ではない `postgres`）の両方で確認した。
  - 次の失敗ケースでは、どれも全体が取り消された: 改ざん、lock 待ち（5秒）、履歴の重複、preflight の前提の崩れ。

## 6. 実行計画（承認対象）

1. 適用直前の再確認（read-only）: PR head と main、migration 一覧、G0〜G3、lock と長い transaction、エラー件数の基準値、customers・reservations の行 fingerprint（T_pre）。
2. 本番DB適用: 適用テキストを Supabase MCP `execute_sql` で1回だけ送る。`apply_migration`・`db push` は使わない。自動の再送もしない。
3. 適用後の検証（read-only）:
   - target md5 `c71e8adc…`
   - 履歴 69件・最大 `20261023064851`・`0906` 無し
   - trigger 3本が `O`、旧 trigger と旧関数が無い
   - 関数 ACL が `{postgres=X/postgres}`、`search_path=""`
   - `patient_visit_summary` と policy の md5 が不変
   - 行 fingerprint が T_pre と一致
   - Postgres のエラーログに新しいエラーが無い
4. PR #165 のマージ（P8・P9 と CI を満たすときだけ）: Ready に変更し、expected head SHA を照合してマージする。
5. Vercel: Git 連携の自動デプロイだけを使う。配信 SHA とドメインの割当を確認する（API または owner の Dashboard）。
6. スモーク: 書込を伴わない表示の確認とログの確認。書込を伴う確認は、owner が承認したテスト専用院がある場合だけ行う（無ければ NOT_RUN）。

## 7. 停止条件

- 適用前（どれか一つでも当てはまれば止める）:
  - head・main・CI が上と違う
  - G0 の値が上と違う
  - G2 の `unexplained` が 0 より大きい
  - lock、または 60 秒を超える transaction がある
  - owner の承認が無い
- 適用中:
  - SQLSTATE 付きのエラーが返った場合: 止めて、read-only で全体が取り消されたことを確認する。再送はしない。
  - 結果が分からない場合（timeout・接続断・空の応答）: 再送しない。read-only で、全部が適用されたか何も適用されていないかを確定する。
- 適用後の不一致: マージしない。DB の rollback はしない。forward-fix は別の承認を得て行う。

## 8. 適用の試行記録と適用テキスト v2

本番の状態は、各試行の後に read-only で確認した（履歴 68件・新 trigger 0・旧 trigger `O`・行 fingerprint が適用前と一致）。どの試行でも本番は変わっていない。

| 日時（UTC）               | 方法                                   | 結果                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10-24 00:0x〜02:5x（4回） | Supabase MCP `execute_sql`（v1）       | MCP サーバーの送信前の確認に 60 秒以内の回答が届かず、タイムアウト。SQL は実行されていない                                                                                                           |
| 10-25 13:59               | Dashboard SQL Editor（URL を貼り付け） | `42601` 構文エラー。何も実行されていない                                                                                                                                                             |
| 10-25 14:01               | Dashboard SQL Editor（v1）             | `P0001 RELEASE_SELF_CHECK_TARGETS 7b75fc5d` で全体が取り消された。原因は貼り付け時の改行の CRLF 化（関数本体と履歴に `\r` が入る）。隔離DBで v1 を CRLF にすると同じ `7b75fc5d` になることで確認した |

v2（`apply-20261023064851-v2.sql`）:

- 内容は v1 と同じ（migration 本文・CLI と同じ履歴 20 要素・同じ自己検査 `c71e8adc…`・`commit`・結果の SELECT）。
- 違いは2点だけ。
  - migration 本文（`begin;` と `commit;` の間）を、`\r` をすべて除いた文字列として DO ブロックの `EXECUTE` 1回で実行する。
  - 履歴の各要素からも `\r` を除いてから INSERT する。
- そのため、LF でも CRLF でも同じ定義と履歴になる。1文字でも変われば、これまでと同じく自己検査で全体が取り消される。
- 検証（`apply-v2-verify.txt`）:
  - 隔離 PG 17.6: LF・CRLF とも成功し、target md5 は `c71e8adc…`、関数本体と履歴に `\r` は 0、データは不変。
  - 失敗ケース（いずれも CRLF）: 改ざん・lock 待ち（5秒）・履歴の重複・preflight の前提崩れの4ケースで、全体が取り消された。
  - 公式 `supabase/postgres:17.6.1.140`（superuser ではない `postgres`）: CRLF で成功し、データは不変。
- マージ前:
  - P8: Production の deployment ID・SHA・branch・自動割当を確認できない場合は止める。
  - P9: マージによって未承認の LP（PR #164）が新たに公開される場合は止める。#164 が既に Production で配信中なら、本PRのマージで公開範囲は変わらない。

---

_Generated by [Claude Code](https://claude.ai/code)_

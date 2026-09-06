# PR-D 通知耐久性の検証記録

対象: `codex/post-core100-notification-durability`。基点: `c028573d089cb6085ab3e29121fa9fe4d2f923c0`。2026-09-06、Windows / PowerShell / npmで実行。DOD-02/04/08/09/10/11/12への対応仕様は `docs/stabilization/spec-post-core100-notification-durability-v0.1.md`。

## RED → 修正 → 回帰

| 証跡 | 実行結果 | 検出した不具合 |
| --- | --- | --- |
| `red-notification-durability.log` | 3 suites、6失敗 / 13成功 | 応答前handoff未完了、期限切れclaim未回収、旧worker所有権未検証、HTTP idempotency option欠落 |
| `red-atomic-enqueue.log` | 3 suites、6失敗 / 11成功 | claim/outbox分離、失敗claim再試行不可、resources参照不整合、migration契約欠落 |
| `red-mobile-notification-scope.log` | 1 suite、3失敗 / 16成功 | mobile通知がauthenticated clientを渡し、通知専用scope確認がない |
| `focused-notifications-final.log` | **12 suites、100 tests PASS** | 通常/mobile予約、email/LINE prepared intent、reminder、内部worker、provider、lease、連続更新、scope拒否を回帰 |
| `type-check.log` | **PASS** | `npm run type-check` |
| `lint.log` | **PASS** | `npm run lint`（重複import検出後に修正して再実行） |

追加の実行済みチェック: `npm run commercial:verify:migrations` PASS（50 frozen / 18 appended）、`npm run commercial:inventory:routes` PASS、`npm run commercial:inventory:routes:check` PASS、`npm run security:verify-mutating-routes` PASS（132 mutation / 9 side-effecting GET）、`npm run scan:secrets` PASS、`git diff --check` PASS。保存ログは行末空白と末尾空行のみ除去した。

最終focused commandは `focused-notifications-final.log` 冒頭に記録した。PowerShellで `npm run test -- --ci --config .next/jest-pd.config.cjs --runTestsByPath ...` を実行。Windowsの `.w` 配下では既存JestのrootDir付きtestMatchが0件になるため、ローカルのignored `.next/jest-pd.config.cjs` だけでproject.rootDirをprocess.cwd()、server testMatchを `**/src/__tests__/**/*.test.ts` / `**/src/__tests__/**/*.test.js`、client testMatchを `**/src/__tests__/**/*.test.tsx` にした。既存Jest configの他項目は維持し、repoのtest設定・依存は変更していない。

既存tooling Jestの2 suitesも含む14 suites版は、通常/mobile routes PASS後にchild-processベースの検証が約10分進捗しなかったため中断した。この実行はPASSと数えない。上記12 suitesを分離再実行し100 tests PASSを確認した。route inventory/securityのstandalone scriptsは別途PASS。CIでは通常configのfull Jestを必須とする。

Galileo / Socratesによる実装者以外の独立read-onlyコード監査は両者PASS。mobile scope、DB intentのtenant整合・PHI除去、lease CAS、Resend key、既存LINE generation triggerとの接続を対象とした。コード監査を実DB検証の代わりにはしない。

## BLOCKED / 未実施

- **DB replay / pgTAP / catalog前後 / 生成型diff**: 既存local DB変更は未承認。新規SQL testを用意し、PR CIの固定Supabase CLI 2.109.0で実行する。scaffoldのみ既存CLI 2.116.0の `migration new --help` 確認後に `migration new` で作成。migrationは未適用。公開DB型の手編集なし。
- **full Jest / production build**: 親の指示によりPR CIへ引継ぎ。ローカルPASSとは報告しない。
- **実provider配送 / worker停止再開 / 監視到達**: 実資格情報・環境承認なし。providerはmockのみ。SQL fixtureも合成データのみ。本番・既存DB・有料設定は操作していない。
- 予約commitからhandoff開始までのprocess停止は残る。このPRは要求された最小のawait handoffを実装し、予約transactionそのものにoutboxを組み込む保証はしない。
- Resendの24時間を超えた曖昧配送は自動再送しない。23時間超または受理痕跡ありのlease回収は手動配送照合へ送る。旧revisionなしLINE outboxも手動確認対象。

## PR-Cとの統合回帰（2026-09-06）

PR-D初回commit `8602f6e9` の [CI 34003707831](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34003707831) はsource-reference-inventoryの更新漏れでQuality Checks FAIL、後続7 jobsはSKIPPEDだった。DB・full Jest・buildの合格とは数えない。

親の指示でPR-C `609c761827ebc47f65e90c67846330322ad8ac50` を通常mergeし、PR-DをPR-Cへ依存させた。mobile routeの競合は旧view helperを削除し、保存成功→通知専用scoped client→await handoff→`readCommittedReservation`の順序へ解消した。通常routeの自動mergeも同順序を確認した。PATCHのid / clinic / raw updated_at CASと、競合409時に通知しない契約を維持した。

- `merge-c-focused.log`: **17 suites / 229 tests PASS**。CとDの既存回帰に、通常/mobile × POST/PATCHの4件を追加。通知pending中はprojectionもresponseも実行せず、通知失敗後も保存成功とdegraded表示を維持する。
- `merge-c-type-check.log` / `merge-c-lint.log`: **PASS**。`npm run type-check` / `npm run lint`。
- route manifestとsource reference inventoryを統合後のコードから再生成し、両方のcheck PASS。`security:verify-mutating-routes`（132 mutations / 9 GET例外）とmobile production assetsもcheck PASS。DB関連SQL、full Jest、production buildは更新commitのCIを引き続き必須とする。

PR-Cの修正をPR-Dの独立成果へ読み替えない。stacked PRのbaseは親がPR-Cへ変更し、mainと他ブランチはこの作業では変更していない。予約commit→handoff開始の残るcrash windowや、配備先DB・providerの未検証は上記のまま。

## CIの既存DB検証fixture・head契約の追従

[CI 34004238530](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34004238530)ではmigration replay、新規通知SQL、予約CAS SQLがPASS。既存の完全EXECUTE行列は新private trigger関数のservice_role一組が期待値にないためFAILした。`916a4637`で期待値一行だけを追記し、実権限や双方向の差分比較は変更していない。

次の [CI 34004618455](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34004618455)では新規通知SQLと完全権限行列はPASSしたが、後段のdeferred PR-11検証が最新headを固定のrecovery番号と比較してFAILした。これは新しいappend-only migrationが正常適用された場合にも発生する既存検証の前提違いである。後段の生成型・E2Eの成功とは読み替えない。

- `deferred-history-red.log`: 旧固定head判定をhelperへそのまま抽出して本scriptへ接続した状態で、offline **3 failed / 4 passed**。後続migrationの正常適用拒否、中間履歴欠落・重複の未検知を再現。module未存在や環境エラーはREDとして数えない。
- 修正は適用対象repo SQLから最新headと全version一覧を取得し、実DBの全versionとの完全一致を検証する。baseline / repaired / recoveryの固定番号、旧repairとrecovery各1件、artifact-free状態、CLI pin、loopback、reset承認、rollback guard、finallyの復元処理は維持する。欠落・重複・余計な履歴を許容する変更ではない。
- `deferred-history-green.log`: `npm run test:release-tooling` **46 tests PASS**（既存39＋新規7）。既存glob内のoffline試験であり、DBには接続しない。
- `deferred-history-contract.log`: 既存 `commercial-pr11-deferred-production-forward-fix.test.ts` **5 tests PASS**。`commercial:verify:migrations`もPASS（50 frozen / 18 appended）。

実DBへの復旧シーケンス再実行と後段gateは、新しいcommitのCIで確認する。ローカル既存DBへのreset / applyは引き続き未実施。

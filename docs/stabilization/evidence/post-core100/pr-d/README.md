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

PR-Cのprojection/CAS変更と統合するときは、保存成功後・projection取得前の通知位置を維持した上で、PR-Dのawaitとmobile scoped notification clientを組み合わせる。CAS競合では通知を呼ばない。

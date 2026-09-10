# Audit v2 main統合記録

更新日: 2026-09-10 (JST)。対象: `IFs1991/seikotsuin_no_saas`。

## 基点と承認

- 実装開始HEAD: `2f1434e0ffa410e97672ea8956e65231843ff250`。元作業ツリーは最終実装・記録commit `f0587f37c6754ba518f25d09ff18f77e04753f42` と元branchを維持する。
- ユーザーは今回セッションでpush、続いてPR作成とmergeを明示承認した。通常のPR/mergeに伴うCIを確認し、mainへの直接push・force push・設定変更は行わない。
- 統合開始時にfetchで確認したmain: `4f7794402400790afffb0c41db5538c9f97884a3`。別worktreeでPR単位ごとに既存修正を保持して統合する。開始HEADへの巻戻しや元作業の破棄はしない。
- 本番/共有DB・Auth・Redis変更、実通知・Stripe操作、容量/復元試験、本番deployは承認範囲に含めない。既存GitHub連携はPR #123でVercel Previewを自動作成した。手動deploy・連携設定変更は実施していない。
- 原本と着手時の全35 ID対応は `audit-v2-originals/` と `audit-v2-execution-status.md` に保持。原本時点のCODE_FIXEDを今回の新規修正として数えない。

## PR-U01 / AUDIT-V2:F03,F04

- PR: <https://github.com/IFs1991/seikotsuin_no_saas/pull/123>。base: 上記main。コード検証対象: `c9914b41e5fd040fe80c36dfe9a97d9943f144a8`。
- RedisのSDK object / 旧JSON文字列を形状検証して復元する。不正状態、存在するJSON null、backend障害をproductionでは503として区別し、escalation値を安全整数範囲に保持する。
- 許可時はヘッダーだけを次のlimiterとmiddlewareへ引き継ぎ、拒否時にのみ応答を返す。
- mainの実入口 `src/middleware.ts`、CSP request headerとnonce伝播、認証guard、認証Cookie更新、`/line-chat`保護を保持した。composition回帰は実入口をimportし、応答とrequestのCSP/nonce一致も確認する。
- 独立した読取専用レビュー2件をbase→コード対象SHAで実施。要求適合・失敗条件のレビューにコードの追加指摘なし。履歴台帳が現状に見えるとの指摘は冒頭注記と本記録で対応した。
- CI: <https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34427175906>。Quality Checks（型/lint/ポリシー等）、Build（production CSP Playwright含む）、Supabase Types Contract、Fixture Preflightは成功確認。残るjobは記録時点で実行中。最終headのchecksをPR上で確認してからmergeする。
- 関連ローカル回帰: `npm run test -- --ci --runTestsByPath src/__tests__/lib/rate-limiting/audit-v2-state.test.ts src/__tests__/lib/rate-limiting/audit-v2-composition.test.ts src/__tests__/lib/rate-limiting/middleware.test.ts src/__tests__/auth/middleware-auth.test.ts src/__tests__/middleware.test.ts src/__tests__/public-app-boundary/middleware-boundary.test.ts`。6 suites / 114 tests PASS（0 skipped）、27.742秒。初回はWindowsの`.w`パスにより0件検出でexit 1。今回専用worktreeを`auditv2pr/`へ移し、設定・除外条件を変更せず同じコマンドで成功した。
- 実Redis/proxy・認証済みブラウザ全導線は未検証。mockのCookie回帰とproduction login CSP試験をENV-01/02全体の合格としない。
- DB/migration/依存変更なし。rollbackは当該PRの通常revert。DoD: DOD-10/11、DOD-06/07のproduction CSP検証、DOD-08/09の既存認可維持。

## 残件と次の最小作業

### PR-U02 / AUDIT-V2:F06 (R1)

- 依存base: PR-U01最終head `535ff20ee9ba41e6354310d50e7b33b9d976ce9c`。コード検証対象: `f13fddc1b2c23fa8306c77e463c0fd5cd82d52f1`。
- `src/app/api/revenue/route.ts` のrole/code別集約を期間内で合算し、1区分1行にする。main既存の全ページ取得、後続ページ障害時の拒否、未算出値、前年実額を保持した。
- `audit-v2-revenue-period.test.ts` / 共有fixtureは実際のorder/range呼出しに対応。100+200=300/件数2をAPIと実UIで確認し、1001日の2ページ、context/breakdown第2ページ障害、0/調整/空集合/院・期間条件/認可エラーも検証した。
- `npm run test -- --ci --runTestsByPath src/__tests__/api/audit-v2-revenue-period.test.ts src/__tests__/api/revenue-api.test.ts src/__tests__/pages/revenue.test.tsx src/__tests__/hooks/useRevenue.test.tsx`: 4 suites / 55 tests PASS、0 skipped、46.669秒。これはQuery境界の回帰であり実DB/RLS/負荷試験ではない。
- 元のRED実装証跡は元branchの `94abc031` に先立つ実行記録を参照。統合時は修正済み実装を戻してREDを作らず、mainのページ取得に適合する回帰を追加した。
- 独立レビューは同じbase→コードSHAで要求適合・失敗条件を確認する。最終CI・merge結果は該当PRの固定head/checksで閉じる。
- DB/migration/依存/デザイン変更なし。API readの認可を維持。rollbackは当該PRの通常revert。DoD: DOD-10/11、既存のF05/F08契約と実UI回帰。ENV-04容量受入は未実施。

U01の最終checks確認後にmerge。続いてU02の期間収益集約を統合し、main既存の全ページ取得、未算出表示、前年実額を保持する。後続U03〜U06・VERIFYの独立修正を単位別に統合する。

環境待ち（ENV-01〜05）、通知の永続的な欠落復旧保証、古い編集画面のexpected version契約、LINEチャット提供範囲、課金イベント順序/停止復旧、価格snapshot等の仕様判断はコード統合やCI成功と分離して記録する。全監査完了・本番受入済み・100院容量合格とは判定しない。

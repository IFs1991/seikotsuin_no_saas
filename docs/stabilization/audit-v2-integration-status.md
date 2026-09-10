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

### PR-U03 / AUDIT-V2:F09 (R2)

- 依存base: U02最終head `7e8a8693ceb79cd0cacc3d4ea8285cfd04a8117f`。コード検証対象: `6a33d69800ef84a37af16cf1a5c3c00349c64f00`。
- 実hook `src/hooks/useRevenue.ts` の要求identityで成功/失敗/finallyのdata・error・loading・inFlight更新を保護する。disable/unmountでも失効し、古いfinallyが新要求の重複抑止を消さない。mainの前年実額・未算出処理を保持した。
- 実hookのdeferred PromiseでA→B、A→B→A、同一院background、古い成功/失敗、B待機中、disable/logout、unmount、StrictMode、同期throwを16件追加。
- 最終コードで `npm run test -- --ci --runTestsByPath src/__tests__/hooks/audit-v2-revenue-requests.test.tsx src/__tests__/api/audit-v2-revenue-period.test.ts src/__tests__/api/revenue-api.test.ts src/__tests__/pages/revenue.test.tsx src/__tests__/hooks/useRevenue.test.tsx`: 5 suites / 71 tests PASS、0 skipped、56.735秒。
- 独立レビューでmainの必須field `lastYearRevenue` がfixtureから欠ける指摘を修正。tsconfigのアプリ対象にaudit-v2新規test/fixture 5ファイルを明示追加したTypeScript programで診断0。通常tsconfigのtest除外を成功証拠に使わない。
- API/DB/依存/デザイン変更なし。DOD-10/11、要求順序とUI契約の回帰。rollbackは当該PRの通常revert。実環境の認証後全導線はENV-02に残る。

### リモート結果

### PR-U04 / AUDIT-V2:F10

- 依存base: U03 `7a22693c71b857c6fc6583c5a9a8a53d835ab483`。コード対象: `d6d21eb73fa1fea7b627b69565ad32818b4a7bb4`。
- `sanitizeInput`は危険キー除去を維持し、原文を保存する。HTML/属性は9メールrendererの出力側でencode、安全URLはhttp/httpsのみ、SecurityDashboardのCSVは既存`createCsv`を使う。
- main N01の顧客PATCH省略保持/明示削除、auth/origin/clinic/billing、メールworkerの既存保証を保持。原文→保存→取得→再保存、React、HTML、CSVを別々に確認した。
- `npm run test -- --ci --runTestsByPath` に `api/audit-v2-text-roundtrip.test.ts`、`api/audit-v2-email-output.test.ts`、`components/audit-v2-text-output.test.tsx`、`components/audit-v2-security-csv.test.tsx`、`pages/security-dashboard-page.test.tsx`、`api/email-templates.test.ts`、`lib/csv-export.test.ts`、`api/customers-route.test.ts`、`api/customers-schema.test.ts`、`lib/api-helpers-security.test.ts`、`lib/api-helpers-auth.test.ts`（全て`src/__tests__/`基準）を指定: 11 suites / 113 tests PASS、0 skipped、26.747秒。
- アプリ対象とaudit-v2新規test/fixture 9ファイルを同じTypeScript programで検査し診断0。独立read-onlyレビュー2件は要求適合/反例とも追加指摘なし。旧文書には開始時の履歴とmain統合後のN01維持を区別する注記を追加した。
- DBの過去データdecode・通知実送信・設定変更なし。UIモードEXTEND、デザイン/導線変更なし。DoD: DOD-10/11、入力/出力と既存認可回帰。rollbackは当該PRの通常revert。過去保存データ補正と実通知受入は別途。

- U01 [PR #123](https://github.com/IFs1991/seikotsuin_no_saas/pull/123): 最終head `535ff20ee9ba41e6354310d50e7b33b9d976ce9c` の [CI 34427863933](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34427863933) 8ゲートSUCCESS、独立レビュー2件確認後にmerge。merge commit `d39cd0b4c02f1135e8d68e4868375ebf1506eea3`、2026-09-10T02:15:58Z。
- U02 [PR #124](https://github.com/IFs1991/seikotsuin_no_saas/pull/124): head `7e8a8693ceb79cd0cacc3d4ea8285cfd04a8117f`。レビューで指摘されたmanifestのPOST revenue行位置を既存generatorで更新、`commercial:inventory:routes` / `commercial:inventory:routes:check` exit 0。CI実行中。
- 次の最小作業はU02の最終CI確認とmerge、続いてU03以降を単位別にPR/検証/mergeすること。上の着手時の次作業は履歴として保持する。

### PR-U05 / AUDIT-V2:F11,F20

- 依存base: U04 `44e2dc54b2b147acebe1e15d8ca2f3833007a80e`。コード対象: `69902a1405ecf9fbb6a2ab559b641bb7111af7f3`。
- `PublicReservationService.findOrCreateCustomer`で匿名contactから既存患者を再利用せず、新規患者とする。main既存のLINE本人確認・同clinic/active/credential世代の検索およびPATCH条件を維持した。氏名一致を本人確認として追加しない。
- 旧実装時のglobal LINE unique前提はmainでは変更済み。`20260813012718_line_integration_security_foundation.sql`のclinic+LINE unique（削除済み/旧世代を含む）にfixtureを合わせ、他院で同じLINE IDは新規作成、同院の削除済み/旧世代/未確認legacyは再利用不可、空世代は照会前拒否を検証した。
- `npm run test -- --ci --runTestsByPath src/__tests__/lib/audit-v2-public-customer.test.ts src/__tests__/lib/public-reservation-service.test.ts src/__tests__/api/public-reservations-route.test.ts src/__tests__/api/public-my-reservations-route.test.ts src/__tests__/lib/line-id-token.test.ts`: 5 suites / 78 tests PASS、0 skipped、24.106秒。既存LINE連絡先攻撃の回帰を維持。SDKのquery serializationを実行し、外部fetchはfixtureへ閉じている。
- source inventoryを既存generatorで再生成・check成功。DB/schema/RLS/本人確認フロー/既存補償処理は変更なし。mainのLINE DB制約はCIの`20260813012718_line_integration_security_foundation_test.sql`等の対象。
- F20の実DB並行参照と補償の通し試験は未実施。mockでDBの参照保護やRLS完了とは判定しない。実環境受入・専用対象はENV-01に分離。DoD: DOD-10/11、患者・public/clinic境界の回帰。rollbackは当該PRの通常revert。

### U02 CI修正の記録

head `7e8a8693` の [CI 34428819592](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34428819592) はQuality Checksの `commercial:inventory:source:check` でFAIL。収益routeの6箇所の参照行位置だけを既存generatorで更新し、write/check成功、head `c6084ff7dcd42cb5ab4b9270c54e016a26727b92`へpushした。修正後 [CI 34429309219](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34429309219) は記録時点でQuality/Build/Types/DB/Fixture/Full Jest/Security成功、App E2E待ち。ゲートの削除や除外追加はしていない。この生成物修正をU03/U04以降にも通常mergeした。

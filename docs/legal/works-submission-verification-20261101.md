# Works法務境界の検証記録

作業開始2026-11-01 JST、最終検証2026-11-02 JST。ファイル名は作業開始日に対応する。改定日・施行日・事業者承認日ではない。

## 対象と状態

- OS base `b9e3907f160482ee3ed0dab2a4d0c845f9c73379`。PR準備時の再fetchでもmainは同一。
- Works read-only base `f02d5cdcba8d7a2dfeb58131b7c7bf9dee3a5437`。Worksコード・DB・OAuth・Providerは未変更。
- ブランチ `codex/works-legal-submission-nov03`。mainへpush/mergeしない。
- 公開承認レコードは全件draft、実承認日・改定日・施行日はnull。Works/OSとも正式配信hold。
- リスク: High（公開境界）。独立したPRレビューと事業者の法務公開承認を実装者自身の検証で代用しない。

| 状態軸 | 判定 | 意味 |
| --- | --- | --- |
| CODE | LOCAL_CHECKS_PASS / REVIEW_PENDING | 実装・型・Jest・build・ブラウザ検証は成功。独立PRレビューと全成果物scanは別 |
| CI | NOT_RUN | GitHub CIはローカル検証と別。PR作成後のcommit/jobで確認 |
| PUBLIC_URL | BLOCKED | 紹介・Privacy・Termsの専用URLは実応答404。supportページは200だが運用未確認 |
| OWNER_APPROVAL | PENDING | 名前/業務メール・窓口運用、データ/申請範囲、原稿/hash/実日付の承認待ち |
| SUBMISSION | NOT_SUBMITTED | manifestのURL/公開者情報未完成。ZIP upload、申請、受理なし |

## ローカル検証

最終確認には既設Node `24.18.0`とnpmを使用。新依存なし・lockfile変更なし。初期のNode22での確認とは区別した。

| コマンド | 結果 |
| --- | --- |
| `npm run type-check` | PASS |
| `npm run lint:ci` | PASS（既存warning 127件、error 0） |
| `npm run legal:manifest:check` | PASS。6文書のsourceとsnapshotが一致することは公開承認ではない |
| `npm run commercial:inventory:source:check` | PASS。正規generatorで`scannedSourceFiles`だけ682→689更新、DB参照内容不変 |
| `npm run scan:secrets` | PASS（既知のsource秘密パターン検査） |
| `npm run works:legal:test` | PASS 3件。URLの実GET・最終遷移・内容検査のoffline fixture |
| `npm test -- --runInBand --runTestsByPath ...` | 確定ソースをNode24で実行し11 suites / 179 tests PASS |
| `npm run build` | PASS、確定ソースのローカルbuild exit 0 |
| `npm run test:e2e:pw -- --config playwright.legal-production.config.ts` | 2/2 PASS。最終の問い合わせリンク追加後に再確認済み |
| `npm run test:e2e:pw -- --config playwright.public-site.config.ts` | 35/35 PASS、全公開ページ/CSP/320・375px等/Works原稿の390px screenshotを確認 |
| `npm run works:legal:check` | 期待どおりexit 1 / WORKS_RELEASE_BLOCKED。未承認3文書・5項目を拒否 |
| `npm run public-site:release-check` | 期待どおりRELEASE_BLOCKED。OSを含む既存14項目・3文書は保留 |
| `npm run works:legal:check -- --scan-build .next` | 実行中。local standaloneのnode_modulesが親checkoutへのsymlinkであり、全.next検査にはその辿り先も含まれる。非公開値原本による照合は未実施 |

実行対象Jest:

- `src/__tests__/lib/works-legal-publication.test.ts`
- `src/__tests__/lib/works-legal-build.test.ts`
- `src/__tests__/lib/legal-publication.test.ts`
- `src/__tests__/lib/legal-production-delivery.test.ts`
- `src/__tests__/lib/legal-manifest.test.ts`
- `src/__tests__/lib/public-release-readiness.test.ts`
- `src/__tests__/lib/public-build-scan.test.ts`
- `src/__tests__/lib/public-operator-profile-ssr.test.ts`
- `src/__tests__/lib/public-release-check-env.test.ts`
- `src/__tests__/pages/legal-pages.test.tsx`
- `src/__tests__/pages/contact-page.test.tsx`

## 受入項目との対応

1. Worksの承認とOS保留の独立性: `works-legal-publication.test.ts`のpositive/negative fixture。
2. 未承認WorksをProductionで非公開: 同suite、`legal-production-hold.spec.ts`の実HTML/RSC。
3. 未承認OSも非公開: 既存`legal-publication`/`legal-production-delivery`と同E2Eで維持。
4. 正しい承認だけ配信: `validateLegalApproval`、版/hash/証跡/日付と明示Production modeの検証。
5. 原稿変更で失効: `legal-manifest.test.ts`のsource mutationとWorksのstale hash拒否。
6. 事業者情報/email/origin欠落は拒否: Works/既存readinessの欠落・不正値fixture。verified domainの観測だけでapprovedにしない。
7. 相互リンク: `contact-page.test.tsx`、専用法務footer、mobile E2E。queryは製品選択の表示/リンクだけで配信判定を変えない。
8. スマートフォン、HTML/RSC、metadata/noindex、CSP: local Production/Preview E2E。global CSS/CSP認可処理は変更なし。
9. 実公開URL検査: `works:submission:urls -- --origin https://www.tiramisu-app.com`でGET。3件404、supportページ200。200だけで申請完了にしない。
10. 秘密情報: source pattern scan、build検査、実値を持たないfixture。非公開氏名・住所・電話・私用連絡先の原本を取得していないため、それらの原本との完全一致照合を完了したとは主張しない。問い合わせ・Provider送信も未実行。

## 制約・観測

- Windows sandboxで最初のローカルbuildが`mkdir EPERM`。隔離checkout内の同じbuildを権限境界の外で、合成環境値のみを用いて再実行した。本番デプロイではない。
- 独立checkoutもnpmであり、親checkoutと同種のlockfileが存在するというNext警告あり。異種package managerの競合ではない。依存/lockfileを変更して回避していない。
- 既存のUpstash Edge API警告、`next start`とstandaloneの警告等は記録し、今回の法務公開ゲートを解除する理由にしていない。
- 最初の成果物scanはbuild更新と重なって完全検査エラーになった。PASSにせず、確定buildの静止後に再検査する。
- 通則編全文の取得はtimeout。公式検索と個人情報保護委員会FAQで必要論点を確認した。未取得部分の全面的法務検証を主張しない。
- Production設定・環境値・domain alias・OAuth・DB・Provider・フォーム受信は変更・実行していない。

## PRと残作業

PRリンクとGitHub CIの状態は作成後の最終報告に添える。レビューの範囲・最小Gate・OWNER_ACTION_REQUIREDは[判断台帳](works-submission-readiness-20261101.md)のDを参照。Works manifestのURL/identity反映は実公開・承認成立後の別Works PRであり、今回のOS変更から承認済み扱いにしない。

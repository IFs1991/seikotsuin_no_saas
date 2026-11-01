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
| CODE | LOCAL_CHECKS_PASS / REVIEW_PENDING | 実装・型・Jest・build・ブラウザ検証は成功。独立PRレビューと公開/事業者承認は別 |
| CI | 初版PASS / 更新版は別確認 | a2cd2ee5のCI（run 41321064102）は全ジョブ成功。本人回答・追加修正後のheadへは継承しない |
| PUBLIC_URL | BLOCKED | 紹介・Privacy・Termsの専用URLは実応答404。supportページは200。窓口運用は本人が完了・証跡ありと回答、実装者による証跡照合は別 |
| OWNER_APPROVAL | PARTIAL | 指定された公開用値は掲載承認に基づき反映済み。窓口運用完了・現manifest維持・有料申込受付を記録。データ/条件/証跡の照合と原稿/hash/実日付は未了 |
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
| `npm test -- --runInBand --runTestsByPath ...` | 確定ソースをNode24で実行し11 suites / 183 tests PASS |
| `npm run build` | PASS、確定ソースのローカルbuild exit 0 |
| `npm run test:e2e:pw -- --config playwright.legal-production.config.ts` | 2/2 PASS。最終の問い合わせリンク追加後に再確認済み |
| `npm run test:e2e:pw -- --config playwright.public-site.config.ts` | 35/35 PASS、全公開ページ/CSP/320・375px等/Works原稿の390px screenshotを確認 |
| `npm run works:legal:check` | 期待どおりexit 1 / WORKS_RELEASE_BLOCKED。未承認3文書・6項目の承認境界を維持 |
| `npm run public-site:release-check` | 期待どおりRELEASE_BLOCKED。OSを含む本人の掲載承認を反映後も既存10項目・3文書は保留 |
| `npm run works:legal:check -- --scan-build .next` | contained local artifactでBLOCK 0、provenance一致のVALIDATION_DATA 8。最終ファイル数は8,734。非公開値原本による照合は未実施 |

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
- 最初の成果物scanはbuild更新と重なって完全検査エラーになった。次にmap欠落とnested standaloneの分類を検出し、正式法務buildだけserver mapを生成、workspace配下のstandaloneも同じAST/source map provenanceを検証するよう修正した。public/staticと出所不明データ・非公開語は引き続きBLOCK。
- 独立checkoutのnode_modulesは親checkoutへのjunctionを再利用したため、Next standaloneにもhost絶対リンクが生成された。スキャン時はその生成リンクだけをoutputへ退避し、Nextが既にコピーしたartifact内の依存へ接続。元node_modulesとartifactファイル内容は変更していない。これはcontained local artifactの検証であり、未加工hostリンク付きartifactや実Vercel artifactをPASSにしたものではない。
- 通則編全文の取得はtimeout。公式検索と個人情報保護委員会FAQで必要論点を確認した。未取得部分の全面的法務検証を主張しない。
- Production設定・環境値・domain alias・OAuth・DB・Provider・フォーム受信は変更・実行していない。

## PRと残作業

PR: https://github.com/IFs1991/seikotsuin_no_saas/pull/172 （draft）。初版CI: https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/41321064102 （a2cd2ee5、全ジョブ成功）。追加修正後のCIは別commitとして最終報告に添える。レビューの範囲・最小Gate・OWNER_ACTION_REQUIREDは[判断台帳](works-submission-readiness-20261101.md)のDを参照。Works manifestのURL/identity反映は実公開・承認成立後の別Works PRであり、今回のOS変更から承認済み扱いにしない。

最終の公開用値を含むcontained local artifactの検査: 8,734ファイル、BLOCK 0、VALIDATION_DATA 8（server bundle/mapおよびstandaloneコピーの正本拒否定数）。問い合わせメール/有料申込の目的追記後の最終buildでも同じ結果を再確認した。最後の本文変更後はmanifest/Works承認2 suites 31 tests PASS、Production E2E 2/2とWorks Preview mobile 1/1も再確認。

公開用値は本人の掲載承認に基づくものだけを保持し、/contactでは承認済み業務メールを代替窓口に表示する。未承認メールは非nullでも表示しない回帰を追加済み。事業者情報そのものの掲載承認と、Privacy/Terms原稿の公開承認を混同しない。

## 現在のレビュー対象（全件draft）

| 文書 | source SHA-256 | 未解決marker数 |
| --- | --- | --- |
| works/privacy | `2d0f9307bfa27be20d718110c4f722d878cf74662974dc9ea3caee1de8690ada` | 4 |
| works/terms | `88ab67e124fc1009b2222736aef6ca3e9c44fd030b76a1840fda10ab49301b4a` | 1 |
| works/plugin | `c54de5412cb1a912639d180b986d86ed7ef6f59f2c903e00b07de40c3eaf2061` | 1 |

contentVersionはworks-submission-v1。実承認日・改定日・施行日はnull。未解決事項を実事実で解消したら再生成・再レビューが必要であり、このhashだけで公開可能とはならない。

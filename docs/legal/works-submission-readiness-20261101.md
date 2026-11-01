# 11月3日 Works申請の法務・公開境界

コード整備と公開承認は別。全Works文書はdraft、実日付・承認証跡はnull。OSの正式公開保留も維持する。データの分類別根拠は[監査別表](works-submission-data-evidence-20261101.md)。本書の確認日は2026-11-01〜02 JSTであり施行日ではない。事業者の追加回答は[本人確認記録](works-submission-owner-confirmations-20261102.md)に反映した。

## A 今回のWorks専用申請に一律必須としないGate

| Gate | 判断と限定根拠 |
| --- | --- |
| OSの医療情報・予約・顧客データの商用準備 | WorksはOS患者情報の自動共有・カルテ保管を申請範囲としない。OSのB08/B09や正式公開承認は解除せず、Works専用ページの前提から分離。Worksで実際に扱う本文・画像等の個人情報確認は残る |
| 全面的な有料商用契約、最低期間・返金・責任上限・合意管轄の独断確定 | 有料契約の申込みを別途提示した条件で受けるとの事業者回答あり。参考価格と個別契約を区別するTerms案を用意する。既存の標準条件・広告表示・申込経路の整合確認は必須であり、未確定条件を新設することや全文レビューを一律要求することとは区別する |
| 弁護士による全文レビューを全Works公開の一律条件とすること | 指定されたOpenAI一次要件は適法性と十分な通知・実態整合を要求するが、弁護士全文レビュー自体を一律要求していない。具体的に未解決の外国提供・保有個人データ・通信販売判断は必要に応じ専門家へ。単にレビュー未了という理由だけで独立した全商用Gateを追加しない |
| 全OS/Works LPの全料金・機能claim承認 | 価格・購入導線を含まない申請用`/works/plugin`を追加。既存`/works`の公開主張・料金の承認は引き続き未完了として保持し、そのLPを申請websiteURLの合格証拠にしない。既存LPからの外部契約について別評価が必要 |

特商法は「B2Bだから対象外」「オンライン決済がないから対象外」と断定しない。通信手段で契約申込みを受ける意思・実際の受付方法、契約目的・取引習熟等の事情で判断する。事業者が別途条件を提示して有料契約の申込みを受けていることを確認したため、通信販売広告の必要表示・省略条件を含め、実際の標準条件と申込方法を照合する。既存の暫定税別価格・個別契約前の条件提示とTerms案を整合させ、価格・税を新たに確定していない。

## B 必要最小限のGate

1. 公開者・運営主体、ブランド、業務メール、保有個人データの事業者情報への適法な到達方法。氏名・住所・電話・私用メールを再収集しない。非公開値はrepo/PRへ入れない。
2. 問い合わせのsupport/privacy/operator-disclosureの実受付・通知・返信・本人確認/開示運用。フォームURLの存在だけでは成立しない。
3. 実際に提供可能な対象機能、データカテゴリ・目的・受信者・保持/削除条件・利用者管理手段、委託/国外処理。本人の選択に従いcontentを含む現manifestを維持する。UNKNOWN経路の保持・削除・送信・審査環境の確認を解消してから申請する。
4. 正式originの所有・割当・HTTPS・実ページ応答と公開用値の承認。
5. 各文書のversion・source SHA-256・未解決条項・承認証跡・実承認日/改定日/施行日の照合。コード変更でapprovedにしない。正しい原稿でもProduction配信設定がなければhold。
6. OpenAIの4URL・verified developer identity、完成した機能、tool/skill/metadataの整合。Privacyの公開は未承認原稿のPreviewでは代用できない。認証済み既存アカウントへのアクセスと、新規デジタルサービス販売/アップセルを区別する。

OpenAIはtrial/demoだけのpluginを認めていない。限定PoC用に使えるTermsを作ることと、未完成PoCを公開申請できることは別。PHI、PCI対象、政府識別番号、認証秘密を会話/tool/contentに集める用途を申請に含めない。Vaultを安全な正規接続で用いることは「秘密を一切扱わない」という主張ではなく、MCPへの秘密収集と区別して要件適合を確認する。

## C 実装・承認境界

- `/works/privacy`、`/works/terms`、`/works/plugin`を既存`LegalPage`で作成。Privacyに運営者情報を置き、既存`/contact`へ製品・目的別に誘導する。新フォームAPIなし。
- `works-release-readiness.ts`の`getWorksLegalPublication`はWorks固有6項目（有料契約の条件照合を含む）、公開承認された実事業者情報・email・origin、原稿の承認記録を照合。OSのB01〜B09を常時true化したり消したりしない。
- hash・版・未解決marker・証跡・日付の検証を`validateLegalApproval`として既存OSと共有。`legal-manifest.mjs`の依存走査・正規化・build前照合を6文書へ拡張し、Works承認レコードもhash循環から除外。
- scannerのartifact分類はworkspace配下のstandalone server/mapにも対応。public/staticやJSONをserver扱いせず、正本・AST・source mapの一致がない値と非公開語は従来どおりBLOCK。
- `WORKS_LEGAL_PUBLICATION_MODE`と既存`LEGAL_PUBLICATION_MODE`はサーバー環境のみ。query/client stateでは変更不可。明示Production + 製品のapproved配信設定 + 正しい公開承認が必要。OS holdのままWorksだけ公開できるが、今回の実記録は全件保留。
- `next.config.js`は明示ProductionかつOSまたはWorksの正式法務modeのときだけserver source mapを生成し、既存scannerが拒否定数の出所を検証できるようにする。browser source mapや型検査の無効化は有効にしない。通常のhold/Preview設定は維持。
- `build-for-vercel.mjs`はWorks正式配信時もsource/buildチェックを必須化。通常CI/buildは承認待ちで停止しない。`works:legal:check`と`works:submission:urls`を追加。後者は実GET、最終URL、本文、published marker、noindex、旧OS本文/保留/未確定値を検査し、問い合わせ運用の確認は別Gateとする。
- `vercel.json`の`git.deploymentEnabled`に**今回のブランチ名だけfalse**を追加し、PR pushからの自動デプロイを防ぐ。mainや他ブランチの設定・Productionの環境/aliasは変更しない。事前読取でGit自動deploy enabledを確認したための局所的な措置。マージ・公開は別途人間作業。

新依存・lockfile変更・DB/RLS/auth/billing変更なし。商用migration programの実装ではなく、DOD-07/10/11に紐づく公開サイトの安定化タスク。関連領域の型・認可・RLSを弱めていない。

## D 事業者の残作業（3組に集約）

| 担当確認 | 必要な内容 | 現状態 |
| --- | --- | --- |
| 公開者・窓口 | 掲載承認・窓口運用は本人から完了・証跡ありとの回答。本人が指定した掲載承認済みの公開者名・ブランド・業務メールを反映済み。/contactには承認済みメールの代替窓口を追加し、未承認値は表示しない。公開可能な運用証跡の参照先と開示手順を照合する。再入力・運用再実施を一律には求めない。今回フォーム送信はしていない | OWNER_REPORTED_COMPLETE / EVIDENCE_REFERENCE_PENDING |
| 範囲・データ運用 | 実際の完成済み申請機能とflag、受信者別本番送信項目、国/region・委託/外国提供、TTLとWorker/Storage削除・ログ/バックアップ・問い合わせ記録の実基準を確認。contentを含む現manifestを維持することが本人決定。本文・画像・動画経路の証拠が必要。分離案は採用しない。有料申込みを受ける既存標準条件・広告・申込方法を照合 | OWNER_ACTION_REQUIRED |
| 原稿・URLの公開承認 | 未解決markerを実事実で解消し、更新後のhash/version、証跡参照、実承認日/改定日/施行日、正式originを一括承認。その後の本番設定/デプロイは別の人間承認。公開後に4URLを再検査し、Works manifestへ実値を反映する別PR | OWNER_APPROVAL_PENDING |

公開用メールは本人の指定値を反映し、架空値で埋めていない。公開者の私用連絡先をVercelのアカウント情報から転記しない。所在地・電話の非公開原本は取得していない。

## E 実応答とPlugin metadata

2026-11-01に認証なしGETのみで観測し、2026-11-02に4URLの同じ結果を再確認。候補origin `https://www.tiramisu-app.com`についてVercelのdomain verified、対象projectへの割当verified、HTTPS実応答を確認。origin値の公開承認は別なので`publicSiteOrigin`をapprovedに変更していない。

| 提出項目 | 候補URL | 観測 | 判定 |
| --- | --- | --- | --- |
| websiteURL | https://www.tiramisu-app.com/works/plugin | 404 | FAIL |
| supportURL | https://www.tiramisu-app.com/contact?product=works&intent=support | 200、Works・サポートと既存フォームリンクあり | PAGE_PASS / OWNER_REPORTED_COMPLETE・証跡照合待ち |
| privacyPolicyURL | https://www.tiramisu-app.com/works/privacy | 404 | FAIL |
| termsOfServiceURL | https://www.tiramisu-app.com/works/terms | 404 | FAIL |

既存`/privacy`、`/terms`は200かつnoindex/nofollow。Web検索ツールは古い7月本文を返す場合があったため、実GETの現行応答を優先した。`/works`は200だが暫定料金を含む別LPで、申請専用ページの代用合格にはしていない。

Vercel現行Deployment `dpl_2vu1dQpbj1wYks7osDujxQG4wzDk`は`b9e3907…`、production READY、候補domain aliasあり。これは**既存main**の状態で本PRのREADYではない。project読取ではGit自動deploy enabled、production branch main、dashboard buildCommand `npm run build`。repoの`vercel.json`はwrapperを指定しており、将来の正式配信artifactでwrapper前後の実行を確認する必要がある。

Works `plugin/plugin.json` v0.3.0の`extensions.com.openai.interface`には4URLとdeveloperNameがない。公開用identityは本人から指定され反映したが、実公開ページ・OpenAI verified developerとの照合は未成立のため、manifestへ実値を追加していない。`plugin/mcp.json`は既存remote MCPを宣言。plugin配下に`.app.json`やprivate App bindingを追加せず、非公開原本・審査credentialをZIPに混ぜない。今回ZIPは作成・アップロード・申請していない。Worksコード変更なしのためWorks側PRもなし。申請範囲は本人の指定どおり現manifestを維持する。公開後のURL/identity追記はOSとは別のWorksブランチ/PRで行う。

## F 検証の独立判定

最終コマンド結果・CI/PRリンクは[検証記録](works-submission-verification-20261101.md)に記載する。CODE、CI、PUBLIC_URL、OWNER_APPROVAL、SUBMISSIONを別々に報告し、ローカルgreenを公開承認に転用しない。

## Design Rationale

Mode: EXTEND。既存`privacy`/`terms`/`legal`の3画面、LegalPage・OperatorProfileValue・LegalReviewRequired・LegalFooterLinksを参照。Tailwind、`lp-styles.css`、既存余白・文字・色を再利用。新トークン・global CSS・テーマ・既存共有defaultのリスタイルなし。footerの既存defaultは維持し、Worksの明示propだけ製品別リンクを追加。

利用者の問題はOSとWorksの適用範囲、データ保存/送信/削除、公開承認状況の混同。価格アンカーやCVR誘導を追加せず、事実と問い合わせの経路を明示する。Ethics Gate: 情報の透明性・事実性・取消/問い合わせ可能性を維持。隠れ費用、偽の希少性、強制同意、患者向け誘導なし。成功基準は適切な製品の4URLと公開状態の検証、guardrailは未承認本文漏えい0・OS保留維持。法務閲覧の追跡を増やさないため新telemetryなし。rollbackは人間レビューした本PRのrevertで、未承認本文を公開する過去artifactへの無断切替は行わない。

## 一次資料

確認日2026-11-01〜02。過去の調査文書より現行一次資料と固定main実装を優先。

- [OpenAI Plugin Guidelines](https://developers.openai.com/plugins/plugin-guidelines)：Privacyのカテゴリ・目的・受信者・保持・管理手段、restricted data、完成した機能、デジタル販売/アップセル制限。
- [OpenAI Plugin Submission](https://developers.openai.com/plugins/deploy/submission)：4URLと実publisher情報、reviewと公開の区別。
- [OpenAI App Developer Terms](https://openai.com/policies/developer-apps-terms/) §1.3、§2、§7：App responseの利用、必要範囲の処理・事前通知、安全管理、正確な申請。
- [個人情報保護委員会・通則編](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/) §3-8-1：保有個人データの事業者情報・利用目的・開示等手続。全文取得はタイムアウトしたため必要部分は公式検索と[同委員会FAQ Q9-1](https://www.ppc.go.jp/all_faq_index/faq1-q9-1/)で確認。住所の無条件非公開を認める根拠にはせず、本人の請求に遅滞なく回答できる実体制を確認する。
- [消費者庁・通信販売](https://www.no-trouble.caa.go.jp/what/mailorder/)、[広告Q&A Q1/Q3](https://www.no-trouble.caa.go.jp/qa/advertising.html)、[適用除外Q&A](https://www.no-trouble.caa.go.jp/qa/exclusion.html)：有償役務・申込導線・実際の契約目的を評価。個人情報保護法の公表等と特商法広告表示は別論点。
- [Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration)：branch名を限定した`git.deploymentEnabled=false`。

- server source mapの根拠: [Next.js公式](https://nextjs.org/docs/app/guides/memory-usage)のsource map設定と、導入済みNext 15.5.24のconfig schema・webpack実装を照合した。監視有効環境での実artifactは公開前に別途確認する。

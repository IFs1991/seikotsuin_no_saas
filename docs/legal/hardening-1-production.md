# PR-1: Production配信と法務承認の分離

基準main: `fc23881f4947a1bcc673de59b4fe0bda1bebb211`。2026-11-01 JST、Vercelは読み取りのみ。

## 観測した設定

対象project: `seikotsuin-no-saas` / `prj_Wk65uuekfXzulPhmkFuk5ZShPC3c`、root `.`、Next.js。GitHub `IFs1991/seikotsuin_no_saas`接続、Production branch `main`、`gitProviderOptions.createDeployments=enabled`、`autoAssignCustomDomains=true`。CLI/API上のbuildCommandは`npm run build`。対象Deployment `dpl_3kGsd7jRW5wDxDJRcXoVNhn9wmKc`はcommit `fc23881f`、target production、READY、本番`www.tiramisu-app.com`等のalias割当済み。

`GET /v1/deployments/{id}/checks`は`checks: []`。新しいGitHub Deployment Checksの必須設定はコネクタ/APIの返却項目に含まれず**管理画面で未確認**。本タスクの法務チェックに結び付く外部ゲートは**未設定・未実証**であり、CI成功を配信停止の証明にしない。過去の手動release-checkには自動alias割当を止める効力がなかった。

## 選択と比較

| 方法 | 特徴 | 判断 |
| --- | --- | --- |
| 全Productionにpublic-site:release-checkをDeployment Checkとして要求 | Vercelが必須チェック成功までcustom domain割当を保持。ただし共有OSアプリの緊急修正も法務残件で止まる | 現共有projectには一律適用しない。プロジェクト分割時に再検討 |
| Productionの自動alias割当OFF、全件を明示昇格 | 正確なProduction artifactを検証後に昇格できる。業務アプリを含む全リリースに運用変更が必要 | 正式法務原稿の初回公開時の管理者によるstaged releaseに採用。恒久的な法務理由の全アプリ停止はしない |
| アプリ内の法務配信を既定hold、正式配信buildだけ公開チェック必須 | アプリコード/セキュリティ修正は配信可、未承認原稿はProductionのHTML/RSCに含めない | 今回のコード側必須制御。上記staged releaseと組み合わせる |

公式根拠: [Deployment Checks](https://vercel.com/docs/deployment-checks)、[Promoting Deployments / Auto-assign](https://vercel.com/docs/deployments/promoting-a-deployment)。必要な外部設定をこのPRで変更・完了したとは扱わない。

## 実装

`legal-delivery.ts`はサーバー環境のみを見る。query/cookie/headerで変更しない。

- `VERCEL_ENV=preview`またはローカルdevelopment/test: 従来どおり原稿を確認。未承認警告は保持。
- Production/未知/未設定: 既定hold。本文を返さず、同じsection id/目次と問い合わせintentを持つ保留表示。metadataも保留説明・noindex。
- 正式表示: `VERCEL_ENV=production`、`LEGAL_PUBLICATION_MODE=approved`、文書の正当な公開承認のすべてが必要。設定フラグだけでは正式公開不可。
- `vercel.json`のbuildCommandを`public-site:build:vercel`へ変更。Nextと同じ本番env優先順位（プロセス→.env.production.local→.env.local→.env.production→.env）で判定し、正式配信選択時だけrelease-checkをbuild前後に実行。post-checkはbuild scan付き。未知環境のapprovedは拒否。通常`npm run build`/CI/Previewを法務残件で失敗させない。
- CIにローカルProduction相当のHTML/RSC・請求導線・アプリ継続テストを追加。これはVercelの外部ゲート実証ではない。

## 人間が行う設定・公開手順（今回は実行禁止）

1. 管理者が現Production/Preview設定、branch tracking、buildCommandのrepo設定優先、Deployment Checks設定を画面で確認。公開用設定や実値をチャット/repoへ貼らない。
2. 通常アプリのProductionは`LEGAL_PUBLICATION_MODE`を未設定/holdとして維持。Previewには正式公開用フラグを継承させない。未知値はhold。
3. 法務/事業/技術のP0を解消し、後続PR-2/3を含めレビューされたcommitを確定。`public-site:release-check -- --scan-build .next`成功を公開の必要条件にする。B10申請は別。
4. 法務初回公開では管理者がProductionのAuto-assign Custom Production DomainsをOFFにして、承認済みcommit・Production環境・approvedモードで**staged production build**を用意。wrapperの前後チェックが両方成功したbuildだけを対象にする。Previewをそのまま昇格するとProduction環境で再buildされるため同一artifactの証明にはしない。
5. 管理者がdeployment ID / project / team / commit / target / mode、保護されたURLでのHTML/RSC・窓口・法務本文、checkログを照合。事業者が別途明示した公開許可を得てそのProduction artifactを手動昇格。Force Promoteで失敗を迂回しない。
6. 公開後のalias・本文・改定日/施行日・アプリを確認。自動割当を再開する場合もhold/approved環境と以降の全buildのチェック必須性を監査する。Deployment Checksを使う場合は対象の正確なcommitのチェックを必須登録し、未設定/失敗時に割当されないことを非本番で実証する。

## ロールバック手順（今回は実行禁止）

管理者は最後に法務配信が承認・検証されたProduction artifact、または本PR以後のhold artifactを記録する。問題発生時はその既存artifactへのドメイン再割当/rollbackを明示承認のうえ行い、法務HTML/RSCと業務アプリを再確認する。PR-1以前のartifactへ戻すと原稿本文が再び配信されるため安全なholdへのrollbackとはみなさない。環境変数変更だけでは既存artifactの再build・除去を証明できない。Vercel rollback後のauto-assignment状態も再確認する。

## 検証・独立監査

type-check / lintはexit 0。関連Jest 6 suites 110 tests PASS、envファイル優先順位の追加fixtureも11/11 PASS。`npm run build`はexit 0（既存UI warningあり）。初回wrapperのローカルbuildはsandboxのmkdir EPERMで失敗し、ローカル権限境界を調整して再実行した。公開チェックは未承認14項目+3文書により期待どおりexit 1 / RELEASE_BLOCKED。

`npm run test:e2e:pw -- --config playwright.legal-production.config.ts`: 1/1 PASS（Production相当、HTMLとtext/x-componentのRSC、noindex、queryで解除不可、請求導線、OS表示とdashboard認証）。`playwright.public-site.config.ts`: Preview相当34/34 PASS。同じローカル本番buildを別server環境で検証。実本番/外部フォーム送信/DB書込みなし。

read-only監査2件でenvファイル読込の時点不一致を検出し、`planLegalBuild`の判定前に`@next/env`を使用するよう修正。隔離fixtureのファイル由来approved/プロセスhold優先テストを追加。両監査者の再確認で必須修正残件なし。DOD-07/10/11に対応。UIはEXTEND、認可/RLS/DBを変更しない。

本番環境は未変更であり、現在稼働中の旧artifactがこのコードのhold制御を持つとは主張しない。外部設定とProductionでの実証は人間の残作業。

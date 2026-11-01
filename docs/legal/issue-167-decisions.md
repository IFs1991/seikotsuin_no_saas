# Issue #167 法務掲載・公開判断台帳

追加ハードニングPR-1のProduction配信方針とVercel読取結果は[Production制御](hardening-1-production.md)を参照。コード制御はレビュー対象であり、現在のProduction artifactや外部ゲートへの適用・実証は未実施。以下の法務・運用上のP0/P1を承認済みには変更しない。

対象: [Issue #167](https://github.com/IFs1991/seikotsuin_no_saas/issues/167)。確認日: 2026-11-01 JST。

OS基準main: `cc1803744e12da7c8ef161956515f860c0091fd2`。
Works参照main: `de74853be6f4f9171df776f28f2c64893233c35d`。WorksはGitHubの固定SHAを読み取り参照のみ。稼働環境・顧客データ・秘密情報は取得していない。

実装は正式原稿を掲載する器の整備であり、法律判断、事業者承認、本番公開、プラグイン申請ではない。現状は **RELEASE_BLOCKED / 正式公開不可**。3文書ともdraft、承認日・改定日・施行日はnullのまま。

## 未解決事項

| 優先度 / 台帳 | 論点 | 確認した事実 / 未確認 | 解消方法 / 判断担当 |
| --- | --- | --- | --- |
| P0 B01 | 正式氏名・ブランド | 氏名は既存非公開原本で確認済み。掲載未承認。再収集しない | 事業者が公開用原稿を承認し、承認済み実値のみoperatorProfileへ反映。所在地・電話の実値はrepoへ入れない |
| P0 B02/B03 | プライバシー・事業者開示窓口 | intentは別、Googleフォーム遷移は既存。受信・通知・担当・本人確認・返信・代替メールは未確認 | 事業者/運用担当が、別途許可した限定試験で受付から返信まで確認。特商法上の開示省略要件を専門家と確認 |
| P0 B04 | 正式origin | null、仮造りしない。canonicalは既存相対URLを維持 | 事業者/リリース担当が本番originを照合・承認 |
| P0 B05/B10 | Works主張・公開/申請 | 現在のコードにInstagram投稿保存・復帰等があり、旧20f38e2参照のLP主張は最新本番の証拠ではない | claimごとに固定SHA・flag・権限・本番E2Eを事業者確認。B10は別途プラグイン申請ゲート。今回は申請しない |
| P0 B06/B07 | 価格・税・プラン範囲・契約 | worksPlansは暫定税別、OS planItemsは現行掲載値。OS LPは税抜ラベルと「税込/税抜は条件で変わる」注記が混在 | 事業者が税、月額/初期費用、課金単位、接続/利用者/実行/支援上限、追加店舗、外部費用、支払、成立、提供開始、期間、更新、解約、返金を決定しLP/規約/販売条件/申込導線を同時照合。今回税区分を推定しない |
| P0 B08 | データ・委託・国外提供・保持 | [エビデンス別表](issue-167-data-evidence.md)参照。コードは本番設定・削除実績の証明ではない | 運用担当が全送信先・再委託・所在国・リージョン・契約・法28条の根拠・保持/バックアップ/返却/削除を分類別に確認。専門家と事業者が本文/公開別表を承認 |
| P0 B08/B09 | OS患者情報・医療責任 | 院スコープ/RLS、Gemini送信経路あり。共通文書はDPAの代替ではない | 利用院と事業者がDPA、取得/利用/安全管理/監査/患者請求/返却/削除を合意。専門家が第7.0版適用・AI学習方針を確認。未確認の学習禁止方針を承認済みとはしない |
| P0 B09 | 法務最終承認 | 損害上限、故意重過失、変更・停止、準拠法/管轄等は未確定 | 事業者と専門家が契約責任を決定。12か月上限、6か月縛り、7日前解約、日割りなし等を勝手に採用しない |
| P0 B09 | 文書承認と日付 | 各文書のunresolvedDecisionsと条項マーカーは残存。[PR-3の原稿hash・日付照合](hardening-3-integrity.md)も必須。statusだけで正式表示不可 | 下記手順で原稿更新・版更新・再レビュー・承認証跡・実日付を揃える |
| P1 B08 | Meta/外部サービス削除 | Meta状態照会はpending/completed。全データ・全バックアップ消去の証明ではない | 個別削除の対象、失効、Vault、外部削除、例外保存、バックアップの実績と連絡手順を確認 |
| P1 B09 | UX・受付制御 | 本文に禁止入力を明記。Worksでの全経路の検出・受付防止は未検証 | Works担当がPHI等の受付制限を別Issueで検証。本文だけでサーバーの防止機能を保証しない |
| P1 B04/公開前スキャン | origin検証用の禁止リストの誤検出 | [PR-2分類スキャン](hardening-2-scan.md)で5,651ファイルを検査し、既知serverの定数位置だけをAST/provenanceで確認。実配信/出所不明の禁止URLと非公開語はBLOCKを維持 | コード上の誤検出は解消、PRレビュー・反映前。リリース担当が正確なrelease artifactと非公開原本で再検証する。法務未承認・外部設定未実証は別のブロッカーとして継続 |

## 承認手順（実装者による承認代行は禁止）

1. 未解決事項を事業者・専門家・運用担当が解消し、3文書の保留表現を確定原稿へ置換。データ取扱い別表の公開内容を整える。
2. 原稿変更ごとに`legalDocumentApprovals[document].contentVersion`を更新。`npm run legal:manifest`で原稿/料金/運営者情報/内部依存のhashを生成。レビューした版とhashを`reviewedVersion`/`reviewedContentHash`へ記録し、過去承認を新原稿へ引き継がない。
3. B01〜B09を既存releaseCheckItemsで承認し、必須の値も検証する。値欠損・項目省略・重複は文書判定で拒否する。B10はプラグイン申請用の別項目であり、法務文書の承認やサイトのデプロイ許可を意味しない。
4. 文書ごとに、公開可能な承認証跡参照、実際の承認日・改定日・施行日、reviewedRevisedOn/reviewedEffectiveOn、未解決事項ゼロと構造的な必須条項マーカー/販売placeholderゼロを確認し、事業者が同じhashを公開承認してapprovedContentHashを記録する。未承認の証跡や日付はHTML/metadataへ出さない。
5. 文書判定は必要条件のみ。`npm run public-site:release-check -- --scan-build .next`を実行し、B01〜B10・フォーム・ビルドスキャンを既存ルールで確認する。非公開原本照合はリリース担当がrepo外の`--private-terms-file`を指定。実値をログへ出さない。
6. READY判定でも本番デプロイ・申請・マージは自動で許可されない。事業者が別途判断する。

## 公式資料の確認（2026-11-01に取得、適用判断は未承認）

- [個人情報保護委員会: 外国にある第三者への提供編](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/)、[国外委託Q&A](https://www.ppc.go.jp/all_faq_index/faq1-q12-1/): 委託か否かだけで国外提供の条件を満たすとは扱わない。所在国、契約、相当措置、同意等を実フローに照合する。
- [消費者庁: 通信販売広告Q&A](https://www.no-trouble.caa.go.jp/qa/advertising.html): 住所・電話の請求時開示は表示/販売方法と実運用の確認が必要。B2Bのみで適用除外としない。
- [厚生労働省: 医療情報システムの安全管理ガイドライン第7.0版](https://www.mhlw.go.jp/stf/shingi/0000516275_00006.html): 役割分担と運用証跡の確認が必要。準拠済みとは表記しない。
- [OpenAI: App Developer Terms](https://openai.com/policies/developer-apps-terms/)、[Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines): 取得時点ではPHI、PCI対象、政府識別番号、認証秘密の収集・処理を禁止する規定があり、その他機微情報にも条件がある。デジタルサービスの購入・新規サブスク・アップセルには制限がある。公開Webの契約とプラグインの導線を区別し、購入導線を新設しない。将来申請時は再照合する。

## UX・影響範囲

EXTEND。Tailwindと既存`lp-styles.css`、LegalPage / LegalArticle / LegalPendingValue / OperatorProfileList、MarketingHeader / MarketingFooterを再利用。既存3画面を参照し、テーマ・トークン・共有UIデフォルト・ヘッダー/フッターは変更しない。LegalPageの利用先はこの3文書のみ。目次、アンカー、prefetch=false、レスポンシブ余白を維持。行動誘導/価格アンカー等の新規パターンは追加せず、誤認防止の情報開示だけを行う。テレメトリー追加は法務閲覧の追跡を増やさないため省略。

## 安定化DoD対応

`docs/stabilization/DoD-v0.1.md` DOD-07（Windows E2E）、DOD-10（build）、DOD-11（Jest回帰）に対応。DOD-08/09の認可境界は変更しない。歴史的DoDのPASSを現在の商用公開許可とはしない。今回DB・Auth・RLS・課金処理は変更しない。

# 共通3文書の確認用原稿（2026-11-06 JST）

> 以下は初回の確認用原稿を作成した時点の履歴です。同日の追加回答で、事業者は標準見積書等を後日作成し、暫定原稿をLPへ早急に適用するよう承認しました。以後の採用・掲載方針は [暫定版掲載承認](interim-publication-approval-20261106.md) を参照してください。

Refs #173。今回の成果物は、実際の3ページの本文修正と、申請先URLに一致する検査の修正です。法務本文の採用、正式公開、OpenAIへの提出を完了したという記録ではありません。

## 確認した本番の状態

Vercelの本番aliasは `9730f513bcee0466a3d345ab538af8640a22bef3`（PR #178）を配信していました。デプロイ漏れではありません。

| URL        | 匿名GET | 内容                                               |
| ---------- | ------- | -------------------------------------------------- |
| `/legal`   | 200     | `hold`、noindex/nofollow、本文非公開               |
| `/terms`   | 200     | `hold`、noindex/nofollow、本文非公開               |
| `/privacy` | 200     | `hold`、noindex/nofollow、本文非公開               |
| `/contact` | 200     | Googleフォームと掲載承認済み業務メールへの導線あり |

本番URLの存在・HTTP 200・CI成功・Vercel READYは、法務本文の公開完了ではありません。

## 原稿で具体化した内容

- `/terms`: 既に本人確認済みの「別途条件提示→Works有料契約の申込み」に沿う条文。費用・期間・更新・解約・返金等は、申込前の個別契約で明示する構成です。サイト閲覧だけで契約を成立させず、架空の最低期間・返金不可・損害上限・管轄裁判所を追加していません。
- `/legal`: 支払、開始、期間・更新、解約・返金、動作環境について、申込前に提示する事項を本文にしました。料金は既存LPの参考料金へリンクし、正式な金額・税・範囲は個別見積と区別します。価格SSOT自体は変更していません。
- `/privacy`: OSとWorksの情報区分・目的・主な処理先・利用者の操作を説明。Worksの未保存の事前確認、投稿案保存、承認、送信を区別しました。24時間・7日の有効期限を全データの完全削除期限とは扱っていません。

通常の本文から内部監査の経過説明を整理しました。プライバシーの実際の未確定事項は末尾の確認用ノートに残しています。`LegalReviewRequired`、承認のdraft/null、配信のholdを維持し、原稿版だけを `issue-173-draft-20261106` に更新しました。

## 確認済みなので再収集しない事項

- 氏名・ブランド・業務メール・所在地と電話の請求時開示文は `operatorProfile` の掲載承認済み値を使います。
- support/privacy/operator-disclosureの受信・通知・返信は本人から完了申告済みです。再入力や一律の再試験を依頼しません。
- 本人指定の申請URLは `/works`、`/contact`、`/privacy`、`/terms`。専用 `/works/privacy` 等へ差し替えません。
- 個人事業主の区分と正式originは既知です。完成原稿の最終採用と一緒に扱い、別々の質問を増やしません。

根拠: `works-submission-owner-confirmations-20261102.md` と `src/components/public/release-readiness.ts`。

## 本文を確定するために残る内容

| 確認対象         | 今回の具体案・既知の事実                                                                                             | 残る確認                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 契約条件         | 共通規約は個別契約方式。最低期間、返金不可、賠償上限の一律条件を追加しない                                           | 既存の標準見積書・申込書・契約書がある場合は、その条件との照合。ない場合は、各条件を申込前に個別提示する運用の採用                                     |
| 保存・削除       | 一時情報の有効期限と物理削除を区別。連携解除で外部履歴やバックアップまで即時消去する約束をしない                     | アカウント、実行・承認・監査、問い合わせ、OS預かり情報の期間、終了後の返却削除、保存例外を事業者が決定。削除タスク稼働・バックアップは技術側が実態確認 |
| 処理先とOSの役割 | Supabase、Vercel、WorksのRailway/Trigger.dev、OpenAIと接続先を用途別に記載。OSの入力に健康情報が含まれ得ることを明記 | 実際に有効な送信先・項目・国・契約条件、OSのAI有効化、利用院とのデータ処理分担                                                                         |
| 掲載             | 3ページの確認用原稿と版を用意                                                                                        | 上記の実条件を反映した最終本文の採用と掲載。その時点で版/hash・実日付を記録する。承認記録の入力作業を利用者に求めない                                  |

取得できたコード・資料には、採用済みの具体的な標準契約条件や全分類の保存期限はありませんでした。30日・90日・365日等を推測で本文に入れていません。本人への質問と、技術担当が調査すべき事実を混ぜないでください。

## URL検査の修正

`npm run works:submission:urls -- --origin https://www.tiramisu-app.com` は、本人指定の4URLをGETするよう修正しました。旧専用URLの成功を流用しません。

- 製品ページは実際の説明と問い合わせ・共通法務へのリンクを検査。
- 共通法務は、正しい文書のpublished属性に加え、必要な各節の本文とリンクを検査。
- hold/preview、承認待ち・未確定文言、見出しだけ、script/RSC内だけ、hidden属性内だけの本文、認証リダイレクト、非HTML、HTTPエラーを合格にしません。
- 最終判定は、検査した共通文書の `getLegalPublication` と正式originの承認に結び付けています。実際の表示を含む手動確認と、法務内容の判断を静的DOM検査だけで代用しません。

修正後の実GETは、website/supportがPASS、privacy/termsがFAIL、総合BLOCKEDでした。これは本番の本文非公開を正しく検出した結果です。

## 根拠と公開条件

- Worksコード: `8bd85a5c265da77a0a38d030538496610a0019d8`。`packages/application/src/line-content-preview.ts`、`apps/runtime-worker/src/tasks.ts`、`apps/runtime-worker/src/content-media.ts`、`docs/SQUARE_BOOKINGS_MVP.md`を読み取り確認。
- `docs/legal/works-submission-data-evidence-20261101.md` と `issue-167-data-evidence.md` を既存のデータ根拠として使用。Square 7日経路はWorksの会話予約の検証用連携の根拠であり、OSへ移し替えません。
- [OpenAI Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines): 公開されたプライバシーポリシーにデータ分類・目的・受領者・保持期間・利用者の管理手段が必要。
- [OpenAI Plugin submission](https://developers.openai.com/plugins/deploy/submission): remote MCP審査には製品サイト・サポート・プライバシー・規約の4URLが必要。
- [消費者庁 通信販売](https://www.no-trouble.caa.go.jp/what/mailorder/): 販売条件表示と一部省略の条件は実際の販売方法・開示運用に基づいて判断。個別契約方式を記載しただけで適合済みとは判断しない。

外部弁護士の署名を必須とする新しいゲートは追加しません。必要な内容確認と事業者による採用は引き続き必要です。#173は実際の3URLで正式本文を確認するまでクローズしません。

## 今回の検証

- `legal:manifest` による正規再生成と `legal:manifest:check`: PASS。共通3文書のみhash更新、専用3文書のhashは不変。
- `type-check` と変更した本番TSX/承認版ファイルのESLint: PASS。
- 法務ページ・manifest・共通公開判定・本番配信・Works専用公開判定の5 Jest suite: 最終的に130 tests PASS。初回は販売欄に空欄が残ることを期待する既存テスト1件がFAILし、実原稿では未解決reviewマーカーを確認、合成原稿では空欄検出を確認するテストへ更新後に該当17 testsを再実行してPASS。検出規則自体は変更していません。
- 申請4URLのNode tests: 6 tests PASS。公開属性だけの空ページ・非表示の本文等の負ケースを含みます。
- `scan:secrets` と `git diff --check`: PASS。
- 独立した読み取りレビュー: 規約/販売条件、プライバシー、URL検査を分担。結果不明時の自動再送禁止、追加費用の申込前提示、Squareの限定範囲を反映しました。
- `npm run build`: コンパイル・型/lint・183ページの生成まで進み、最終出力の削除処理で `ENOTEMPTY: .next/export/_next`。ビルド全体はFAILとして扱い、成功とは報告しません。
- Playwright: Chromium取得がgatewayエラー/不完全なarchiveで失敗。ブラウザーでの表示確認は未実行。dev serverへの別プロセスからのローカルGETもECONNREFUSEDで未確認。JestのDOM表示確認と区別します。
- 本番の変更・正式本文公開・実際のフォーム送信・DB変更・OpenAI申請は未実施。

UIはEXTEND。既存LegalPage、LegalArticle、TermsList、LPのTailwind/CSSを使用し、共有スタイル・テーマ・認証/課金画面の変更はありません。DoD-v0.1のDOD-10（build）に対応する最終確認はCIで解消が必要です。これを一般商用出荷の判定に流用しません。

# LINE公式アカウント連携 運用Runbook v0.4

## 1. 対象

店舗別LINE連携のセットアップ、Webhook受信、テキストチャット送信、保持期間cleanupの確認手順を定める。秘密情報やメッセージ本文をログ・チケット・チャットへ貼り付けない。

## 2. リリース前確認

1. PR1、PR2、PR3を依存順にmergeする。
2. productionへ適用予定のmigration一覧をdry-runで確認する。
3. `LINE_CREDENTIALS_ENCRYPTION_KEY`、`CRON_SECRET`、公開アプリURLがproduction環境に設定済みであることを値を表示せず確認する。
4. DB migration、アプリdeploy、LINE Developers Console変更はそれぞれ人間の承認単位として実施する。
5. migration適用後、service-role以外にLINEテーブル権限・runtime関数EXECUTEがないことを検査する。

## 3. 店舗セットアップ

1. SaaSの「設定 > 患者コミュニケーション > LINE連携」で対象店舗を選ぶ。
2. 「接続準備」を実行し、表示された公開JWK、Webhook URL、リダイレクトURLをLINE Developers Consoleへ登録する。
3. Messaging API channelとLINE MINI AppまたはLIFFが同一Providerにあることを確認する。
4. KID、Messaging Channel ID、Login Channel ID、Channel secret、実行用LIFF IDを入力する。
5. テスト対象のLINE ID tokenと送信先を使い、Provider同一性確認を実行する。
6. 「Messaging API確認済み」「Provider同一性確認済み」を確認して接続を完了する。
7. LINE Developers ConsoleからWebhook検証を送り、SaaSに「Webhook確認済み」が表示されることを確認する。
8. LINEチャットをONにし、保持日数と固定自動返信を保存する。予約・通知は必要な機能だけを明示的にONにする。

LINE Developers Console側の登録はSaaSから自動化されない。未完了の検証sessionは画面から破棄し、新しいretry keyでやり直せる。

## 4. Smoke test

1. 店舗の公式アカウントへテキストを1通送る。
2. `/line-chat` の会話一覧に対象会話が表示され、本文が一致することを確認する。
3. 固定自動返信が1通だけ届くことを確認する。同じ利用者から24時間以内に再送しても自動返信は増えない。
4. 店舗管理者またはmanagerが担当者を割り当てる。
5. 担当スタッフでログインし、担当会話だけが表示されることを確認する。
6. 返信を送信待ちにし、LINEへ1通届き、画面の状態が「送信済み」になることを確認する。
7. LINE側で送信取消を行い、SaaS本文が消え「送信取消済み」と表示されることを確認する。
8. 本部adminで本文APIへアクセスできないことを確認する。

## 5. 定期処理

- 既存の `/api/internal/process-line-outbox` が2分ごとに通知outbox、チャットoutbox、期限切れsetup sessionを処理する。
- `/api/internal/process-line-chat-outbox` と `/api/internal/cleanup-line-chat` は `Authorization: Bearer <CRON_SECRET>` を要求するPOST専用の手動再実行経路である。
- チャット送信は最大3回。5分を超えたprocessing claimは安全に回収する。
- 送信は1店舗1件ずつclaimし、token取得前と外部push直前にclaim・機能ON・現行Provider世代・宛先を再検証する。
- cleanupはheartbeatにより24時間に1回だけ実行し、店舗設定がない場合は90日を使用する。
- cleanupはpending/processing outboxの本文を削除せず、チャット送信の完了後に実行する。
- unsendのSHA-256 digest tombstoneは本文と生のmessage IDを持たず、通常の1〜365日cleanup対象外として保持する。
- heartbeatは状態・時刻・error codeだけを持ち、LINE ID・本文・secretを保存しない。

## 6. 障害切り分け

| 症状                             | 確認項目                                | 安全な対応                                                 |
| -------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Webhookが401                     | Channel secret、LINE署名、対象店舗URL   | secretを再表示せず、同一Providerの値を再入力して再検証     |
| Webhookが403                     | destination Bot ID、現行Provider世代    | 接続sessionを破棄し、同一Provider構成で再準備              |
| チャットをONにできない           | `webhook_verified_at`                   | LINE ConsoleからWebhook検証を送ってから再保存              |
| 返信が送信待ちのまま             | heartbeat、outbox status、token検証時刻 | cron認証と環境変数を確認し、内部POSTを1回再実行            |
| `http_429`                       | LINE API rate limit                     | 自動retryを待つ。手動連打しない                            |
| `request_timeout`                | LINE API疎通                            | outbox UUID retry keyを維持したまま自動retryを待つ         |
| `credential_generation_replaced` | Provider切替履歴                        | 旧会話から再送せず、利用者を明示的に現行Providerへ再リンク |
| cleanup失敗                      | DB lint、heartbeat、保持日数            | 1〜365日の設定とDB接続を確認し、修正後に内部POSTを再実行   |

ログにはclinic ID、outbox ID、status、error codeまでを使用し、LINE user ID・本文・access token・Channel secret・private JWK・raw webhook body・reply tokenを含めない。

## 7. 停止・復旧

1. 誤送信リスクがある場合は対象店舗のLINEチャット・通知・予約をOFFにする。
2. Provider切替時は既存資格情報APIを直接変更せず、検証済みsetup sessionから再接続する。
3. feature OFFは未送信outboxをfail-closedで終端する。旧outboxを新Providerへ付け替えない。
4. LINEチャットをOFFにしてもunsendとfollow/unfollowは処理し、順序が逆転して再配信された場合は新しい状態を優先する。unfollow済み宛先のpending送信は終端する。
5. unsendが元メッセージより先、または通常保持cleanup後に届いた場合もdigest tombstoneを保持し、後着本文を保存しない。
6. manager権限は対象店舗のactive割当、clinic_admin権限はcanonical clinic hierarchyをDBで再確認する。割当取消後の本文参照・返信・担当変更は拒否される。
7. DB rollbackは対応するforward-fix SQLを使用し、テーブルや本文履歴を削除しない。
8. 再開前にWebhook検証、Provider同一性、1通の送受信smoke testを再実施する。

## 8. Production変更境界

GitHub mergeだけではproduction DBやLINE Consoleは変更されない。リモートSupabase migration、production環境変数、LINE Developers Console設定、Vercel deployはそれぞれ明示承認後に実施する。

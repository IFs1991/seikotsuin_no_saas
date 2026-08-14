# LINE公式アカウント 店舗別セルフセットアップ・チャット統合 v0.4

## 1. 目的

各店舗（子テナント）が自店のLINE公式アカウントをTiramisuへ安全に接続し、LINE予約・通知・テキストチャットを店舗単位で運用できるようにする。

本仕様は `spec-line-self-serve-integration-v0.3.1.md` を拡張する。LINE Developers Consoleでしか実施できない操作は自動化したように見せず、SaaSが安全に準備・検証できる箇所だけを半自動化する。

## 2. 固定された製品判断

- セットアップ方式: 安全な半自動方式
- LINE資格情報: 店舗ごとに独立保存
- アプリ種別: 新規はLINE MINI Appを推奨し、既存LIFFを互換維持
- 利用機能: 予約、通知、テキストチャット
- チャット本文: テキストのみ。画像・音声・動画・ファイルは保存しない
- 自動返信: 店舗ごとの固定受付文のみ、同一患者へ24時間に最大1回
- 閲覧権限: `clinic_admin` / `manager` は自店舗、`therapist` / `staff` は担当会話のみ
- 本部 `admin`: 稼働件数・エラー・heartbeatのみ。メッセージ本文へアクセス不可
- 保持期間: 店舗ごとに1〜365日、初期値90日
- 店舗管理者: 自店舗の設定・検証・有効化を自身で実行可能
- 担当スタッフ: 自分に割り当てられた会話へ直接返信可能

## 3. 自動化境界

### 3.1 SaaSが自動化する

- RSA鍵ペア生成
- 秘密JWKの暗号化と24時間の短期保管
- 公開JWK、Webhook URL、リダイレクトURLのコピー表示
- 入力されたチャネル情報の検証
- Messaging API token・bot metadataの確認
- LINE予約を使う場合のLINE Login ID token subjectとpush送信先の同一性確認
- setup session単位の安定retry keyによるテスト送信重複防止
- ID token照合後・push直前にテスト送信の宛先と固定文をSHA-256 digestでsessionへ固定し、push前の設定修正を許しつつ、同一pushへのLINE既受付応答だけを安全に再開
- Webhook受信の段階テスト
- 検証済み資格情報の店舗別保存
- LINE予約・通知・チャットの店舗別有効化

### 3.2 LINE Developers Consoleで手動実施する

- Provider / Messaging API channel / LINE LoginまたはLINE MINI Appの作成
- Messaging API channelとLINE MINI App/LIFFを同一Providerへ配置
- 公開鍵JWKの登録とKID取得
- Webhook URL、エンドポイントURL、リダイレクトURLの登録
- Webhook利用設定とLINE公式アカウント側応答設定

LINE user IDの同一性はProvider境界に依存するため、異なるProviderを混在させないようウィザード内で明示する。

## 4. PR分割

### PR1: DB・認可・秘密情報基盤

- `customers.line_user_id` をグローバル一意から `(clinic_id, line_user_id)` の部分一意制約へ変更
- 検証済みProvider世代をcredentialと連絡先へ固定し、Provider変更時は明示的な再リンクを要求
- 秘密情報を含まないProvider世代履歴を保持し、既存連絡先を壊さず原子的に現行世代を切り替える
- Provider切替は検証済みsetup sessionの秘密鍵・fingerprint・入力資格情報・世代を1トランザクションで更新し、旧世代の会話と未送信メッセージを送信不能にする
- 検証済みsetup sessionは登録済み公開鍵KIDと検証日時を必須とし、切替時はsessionに結び付いた秘密鍵・KIDだけを採用する
- Provider切替時は旧世代のcached access token・expiry・token KIDを破棄し、新しい秘密鍵から再発行する
- Provider切替時は旧LIFF ID・公式アカウントBasic ID・bot metadata・検証日時も破棄し、新Providerで再検証する
- 既存の予約・CRM・空き枠通知outboxにもProvider世代と短期claim tokenを保存し、切替中の送信と旧世代通知を拒否する
- 既存通知outboxは患者ID・店舗・Provider世代・LINE IDを固定し、再リンク前の旧LINE IDを新Providerへ送らない
- 初回導入時は既存資格情報のProvider継続性を推測しない。既存患者LINE IDは世代未検証として保持し、既存pending通知はterminal failureへ移し、明示的な再リンク後だけLINE送信を再開する
- 公開予約・マイページ・指名設定の患者検索は、検証済みtokenのProvider世代と患者世代の一致を必須とする。世代未検証患者はnot foundとし、プロフィール更新や同値LINE ID更新で自動昇格しない
- 既存terminal通知履歴は、患者を名寄せできない行も削除せず保持する。payload・予約通知・空き枠通知・患者LINE IDの順で患者IDを回収し、未解決のNULLは履歴用途に限定する
- `clinic_line_credentials` にアプリ種別、endpoint、bot metadata、KID、fingerprint、検証日時を追加
- `clinic_feature_flags` に通知・チャットの店舗別フラグを追加
- 24時間で失効する `clinic_line_setup_sessions` を追加
- チャット設定、連絡先、会話、メッセージ、Webhook重複排除、送信outbox、heartbeatを追加
- すべての新規テーブルでRLSを有効化し、`anon` / `authenticated` のテーブル権限を剥奪
- 保持期間削除とsetup期限切れRPCをservice-role限定で追加

### PR2: 店舗向けセットアップウィザード

- `GET/POST /api/admin/line-setup`
- `PATCH /api/admin/line-setup`（予約・通知の店舗別ON/OFF）
- `DELETE /api/admin/line-setup`（未完了の接続確認を破棄し、新しいretry keyで再準備）
- `POST /api/admin/line-setup/verify`
- `POST /api/admin/line-setup/complete`
- `GET/PATCH /api/admin/line-chat/settings`
- 設定 > 患者コミュニケーション > LINE連携へ既存UIをEXTEND
- Provider確認、LINE Console手順、検証、有効化の4段階表示
- 再接続時は機能選択をOFFへ戻し、新Providerの検証結果を明示選択してから再有効化
- 24時間を超えたsetup秘密は既存LINE定期ジョブから全店舗対象で自動消去

### PR3: Webhook・テキストチャット

- `POST /api/webhooks/line/[clinicId]`
- `GET /api/admin/line-chat/conversations`
- `GET/POST /api/admin/line-chat/conversations/[id]/messages`
- `PATCH /api/admin/line-chat/conversations/[id]/assignment`
- `POST /api/internal/process-line-chat-outbox`
- `POST /api/internal/cleanup-line-chat`
- 店舗内会話一覧・本文・返信UI

## 5. セキュリティ契約

- LINE secret、秘密JWK、access token、Webhook raw body、reply tokenをログやAPIレスポンスへ出さない
- Webhook署名はJSON parse前のraw bodyで検証する
- `webhookEventId` を `(clinic_id, webhook_event_id)` で一意化し、再送を冪等処理する
- `unsend` 受信時は対象本文を消去し、`status = 'unsent'` とする
- 公開WebhookはURLのclinic IDだけを信用せず、その店舗資格情報のsecretで署名を検証する
- APIはユーザー入力のclinic IDだけで認可せず、DBのactive profile、role、clinic scope、会話担当を毎回検証する
- 新規テーブルはservice-roleのみ。ブラウザからの直接Data APIアクセスを許可しない
- 特権RPCは `PUBLIC` / `anon` / `authenticated` のEXECUTEを明示revokeする
- setup接続確認はDB claimで直列化し、外部通信前にclaimを取得する。最大4回の30秒外部通信を含むため5分を超えたclaimだけ回収し、テストpushはsession固定retry keyを再利用する
- テストpush直前にProvider/チャネル識別子・Bot ID・宛先・固定本文のdigestをsessionへ固定し、LINEに受理済みの同一要求だけを409応答から安全に回復する。bind後に設定を変更する場合は管理画面からsessionを破棄し、新しいretry keyで再準備する
- LINE MINI Appでも公開予約画面を `liff.init` する実行用LIFF IDを必須保存し、予約有効化後に公開メタデータへ返す
- 外部LINE API呼び出しは30秒でtimeoutし、検証失敗時はclaimを解放する
- `line_booking_enabled` はLINE Login ID tokenの`aud`とChannel ID、`sub`とMessaging APIテスト送信先が一致した資格情報だけONにできる。Messaging API確認だけでは予約をONにしない
- 公開LINE予約gateはfeature flagと現行credential世代・Provider検証・実行用LIFF/Login metadataを単一SQL snapshotで取得し、Provider切替中の新旧状態混在を許さない
- Channel secretはWebhook署名を初めて受信するまで検証済みと扱わず、`line_chat_enabled` は引き続きOFFに固定する
- 本部admin用の本文なし運用情報は、チャット本文テーブルと分離された集計APIのみで返す
- 患者・連絡先はclinicとLINE IDの複合参照、Webhook・会話・メッセージはcontactの複合参照で同一人物性を固定する
- 送信outboxは宛先や本文を複製せず、conversation→contactとmessageから送信時に導出する
- Provider切替とoutbox claimは店舗単位の同一ロックで直列化し、5分を超えた処理中claimは最大3回の契約に従って安全に回収する
- legacy通知はtoken取得後・外部送信直前にclaimと現行世代を再検証し、outbox UUIDを初回から `X-Line-Retry-Key` に使用する
- legacy通知workerが最終試行中に停止した場合、期限切れclaimをterminal failureへ移し、予約・空き枠・CRMの追跡状態も同一トランザクションで失敗へ同期する
- `line_notification_enabled` がOFF、または患者のProvider再リンク前なら予約通知はLINEへ入れず既存email経路へ降格する
- Provider再リンクは旧連絡先と同じ患者、または未紐付けの旧連絡先だけを許可し、別患者の紐付け解除を拒否する
- `line_chat_enabled` はenqueueと送信claimの双方で再検証し、OFF時のpendingと失効済みprocessingをmessage/outboxともfail-closedで終端する
- 送信claim直前にmessageがoutbound・text・queued・本文ありであることを再検証し、状態不整合は送信せず終端する
- 患者のLINE ID・Provider世代はtriggerで保護し、service-roleを含む汎用UPDATEから変更できないようにする。固定search_pathのservice-role限定definer RPCだけが、旧contactと患者の整合を検証して再リンクする
- 空き枠通知・休眠患者キャンペーンは現在のactive Provider世代へ再リンク済みの患者だけを抽出する。未再リンク患者は送信対象からfail-closedで除外し、正常な対象者の通知処理を妨げない
- 休眠患者キャンペーン送信はcampaign claim・対象者のsent/skipped更新・LINE outbox作成をservice-role限定RPCの1トランザクションで行い、途中失敗と再実行による二重送信を防ぐ
- 患者LINE identity作成と通知outbox作成はProvider rotationと同じ店舗単位advisory lockを取得し、アカウント切替との競合を直列化する
- 新規患者へLINE IDを保存する時もDBで店舗の現行active Provider世代を再検証し、token検証後のProvider切替競合は部分行を残さず拒否する
- migrationの旧通知患者ID回収はidentity immutability trigger作成前に完了させ、回収可能なNULL患者IDを含む本番履歴でも原子的に導入できるようにする

## 6. データ保持

`clinic_line_chat_settings.retention_days` を1〜365日に制限し、初期値90日とする。設定行が欠落していてもcleanupは90日をfail-closed defaultとして適用する。cleanupは店舗別保持日数より古い `line_messages` と、参照がなくなった `line_webhook_events` を削除する。連絡先と会話の監査可能な外形情報は削除対象に含めない。

## 7. UI/UX Design Rationale

### Mode

- [x] EXTEND
- [ ] CREATE
- [ ] REDESIGN

### User problem

店舗管理者がLINE ConsoleとSaaSを往復する際、何をどこへ登録し、どこまで完了したか判断しづらい。

### Bottleneck diagnosis

- [x] Choice overload
- [x] Unclear default
- [x] Low completion momentum
- [x] Purchase / adoption anxiety

### Selected pattern

- P01 Choice Reduction: 1画面1主要操作とする
- P03 Transparent Defaults: MINI App推奨、保持90日、機能OFF開始を明示する
- P05 Progress Visibility: 準備・LINE Console設定・接続確認・有効化を表示する
- P11 Peak-End Completion: 完了時に有効機能と運用上の次の確認を示す

### UI change

既存の設定ページ、Card、Button、Input、Badge、Alert、Switch、Dialogを再利用する。グローバルCSS・theme・共有defaultは変更しない。

### Copy change

「自動設定完了」ではなく、手動操作と自動検証を区別する。「LINE Consoleでの登録が必要」「Messaging API確認済み」「Provider同一性確認済み」「Webhook確認済み」「有効化済み」を別状態として表示する。

### Ethics Gate

- User benefit: 必要な設定と残作業を正確に理解できる
- Reversible / easy to undo: 各機能を店舗単位でOFFにできる
- Factually accurate: LINE Consoleの手動操作を自動化と表現しない
- Reject / cancel path remains clear: ウィザードを中断しても機能はOFFのまま
- No hidden cost: 追加費用・契約をSaaS側で確定しない
- No artificial urgency / scarcity: なし
- Long-term trust risk: secretを再表示せず、検証状態を分離することで低減

### Visual conformance

- Tokens reused: 既存Tailwind token、Card、Badge、Alert、Button、Input、Switch、Dialog
- New tokens introduced: なし
- Global styles touched: none
- Screens outside the task scope visually affected: none

### Metrics

- Primary metric: setup verification完了率、setup所要時間
- Guardrail metrics: credential検証失敗率、Webhook署名失敗率、重複送信数、他店舗アクセス拒否数
- Events: setup_started / key_prepared / verification_passed / setup_completed / webhook_failed / chat_outbox_failed

### Rollback plan

新規テーブルのデータを破壊せず、feature flagをOFFにできる。DB rollbackはRLS・権限・店舗内一意性を再固定するforward-fix方式とする。

## 8. テスト契約

- Jest: migration/spec/rollbackの静的契約、API認証・role・clinic scope、UI状態遷移
- pgTAP: RLS、テーブル権限、function EXECUTE、複合clinic FK、店舗内LINE ID一意性、setup 24時間制約、期限切れ秘密消去、検証claim/lease、安定retry key、Provider同一性なしの予約拒否、保持期間
- Webhook: raw body signature、重複イベント、redelivery、unsend、非text、他店舗secret拒否
- Chat: clinic_admin/manager全件、担当者のみ、未担当者拒否、本部admin本文拒否、空文/5000超過拒否
- Outbox: 全成功または状態整合、最大3回、lease回収、最終試行中断のterminal化、送信前claim再検証、安定retry key、患者/credential/clinic不一致拒否、Provider切替との相互排他、既存未検証pendingの送信拒否とterminal履歴保持
- Provider rotation: 検証済みsetup sessionのみ、資格情報・世代・秘密鍵消去の原子性、旧会話・message・outboxの同時失効、患者再リンク境界
- Setup verification concurrency: 2接続から同一sessionをclaimし、成功1件・拒否1件・外部push最大1回となること

## 9. DoD v0.1 対応

- セキュリティ: RLS・権限剥奪・service-role境界をmigrationとpgTAPで検証
- テナント分離: 全関連にclinic IDを持たせ、複合FKとAPI認可を検証
- 移行安全性: append-only migration、forward-fix rollback、migration history検査
- 品質: type-check、commercial type-check、lint、関連Jest、build、route inventoryを各PRで実施
- 運用: heartbeat、保持期間、失敗reason code、Runbookを提供

## 10. リリース境界

GitHubへの各PR pushまでは実装工程に含む。リモートSupabaseへのmigration適用、production環境変数変更、LINE公式アカウント本番設定は人間の明示承認後の別工程とする。

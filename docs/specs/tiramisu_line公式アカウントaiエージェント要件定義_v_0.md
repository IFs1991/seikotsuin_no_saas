# Tiramisu LINE公式アカウントAIエージェント要件定義 v0.2

## 1. 文書の目的

本書は、Tiramisu における整骨院向けの **CS省力化** と **初期オンボーディング支援** を実現するため、LINE公式アカウントを入口とした AI エージェント機能の要件を定義する。

本書では、単なるアイデア整理ではなく、以下を満たす **実装可能なMVP仕様** を示す。

- 低ITリテラシーの院長、受付、スタッフでも迷わず前進できる
- ソロプレナー運用でも回るだけの運用負荷に抑えられる
- LINEの技術、料金、運用制約に適合する
- Gemini + AWS Strands を前提に将来拡張できる
- 医療助言、患者個人情報、請求、返金、事故対応などの高リスク領域をAIから切り離せる

---

## 2. プロダクト定義

### 2.1 対象ユーザー

- 整骨院、鍼灸院の院長
- 受付スタッフ
- 現場スタッフ

### 2.2 解決したい課題

- 初期設定の途中で止まる
- 設定画面のどこを触ればよいか分からない
- 問い合わせはしたいが、メールや管理画面のフォームは重い
- サポート担当が同じ説明を何度も繰り返す

### 2.3 この機能の位置づけ

- LINEは **相談開始** と **再開導線** の入口
- オンボーディング本体は **Tiramisu アプリ内** のチェックリストと設定画面
- AIは **製品サポート** と **初期設定支援** のみに限定する
- AIは万能チャットではなく、**1テーマずつ前に進める導線エンジン** として扱う

---

## 3. 成功の定義

### 3.1 North Star

Tiramisu 導入院が **初回予約成功** まで到達すること。

ログイン完了や初回メッセージ送信ではなく、以下を主要成功指標とする。

- 初回予約成功
- 7日以内オンボ完了
- 1院あたりサポート工数削減

### 3.2 顧客体験の定義

理想的な体験は次の通りとする。

1. ユーザーは LINE で「今やるべきこと」を短く聞ける
2. AI は 1 回の返答で 1 テーマだけ案内する
3. AI は 3〜7手順以内で短く返す
4. 必要なら Tiramisu の該当画面へ遷移させる
5. 解決しなければ、人へ引き継ぐ

---

## 4. 設計原則

### 4.1 基本原則

- **LINE単独完結はしない**
- **LINEは入口、アプリ内が本体**
- **AIは説明ではなく前進を担う**
- **1エージェント + 1テーマ集中から始める**
- **高リスク領域は即時に人へ返す**
- **未解決ログを必ず改善ループに回す**

### 4.2 運用原則

- 1回の返答で 1 テーマだけ扱う
- 長文マニュアルをLINE内で完結させない
- 可能ならKBかアプリ画面に送る
- unresolved を放置せず、KB不足、UI不足、バグ疑いに分類する

---

## 5. スコープ

### 5.1 リリースMVPのスコープ

リリースMVPは、以下に限定する。

#### LINE側

- LINE公式アカウント開設
- Messaging API チャネル作成
- Webhook受信
- Follow / Message / Postback event 対応
- 固定リッチメニュー4導線
- 返信メッセージの送信

#### AI側

- Gemini を推論モデルとして利用
- AWS Strands を実行基盤として利用
- 1体のサポートAIエージェントを実装
- テーマは **「予約ページ公開までのオンボーディング支援」1つ** に限定
- KB検索
- handoff summary 生成
- JSON構造化出力

#### Tiramisu側

- 7ステップのオンボーディングチェックリスト
- 固定 deep link の返却
- 問い合わせ起票
- 監査ログと会話ログの最小保存

### 5.2 Phase 2 のスコープ

Phase 2 で以下を追加する。

- LINE account linking
- LINEユーザーと Tiramisu ユーザーの安全な紐付け
- 院ごとの設定状態を踏まえた回答最適化
- 動的 deep link
- 停滞検知
- LINE Push
- 追加テーマ
  - 予約が動かない
  - LINE連携
- per-user rich menu

### 5.3 MVP対象外

以下はMVP対象外とする。

- 医療相談
- 患者個別の症状相談
- 返金、請求、契約変更の自動判断
- 完全自律の多段エージェント
- 音声ボット
- 決済代行
- 患者個人情報が含まれる画像解析

---

## 6. 利用シナリオ

### 6.1 リリースMVPの想定フロー

1. ユーザーが Tiramisu の LINE 公式アカウントを友だち追加する
2. リッチメニューから「10分セットアップ」を押す
3. AI が 1 回だけ確認質問を返す
4. AI が短い手順を返す
5. 必要に応じて Tiramisu の該当画面へ遷移させる
6. 解決しなければ、人に引き継ぐための要約を生成する
7. サポートチケットを起票する

### 6.2 初期リッチメニュー

初期MVPでは、以下4ボタンを固定配置する。

- 10分セットアップ
- 予約が動かない
- LINE連携
- 人に聞く

ただし、**AIが本格対応するのは「10分セットアップ」のみ** とする。その他の導線は、初期段階では固定KBリンクまたは有人起票を返してよい。

### 6.3 オンボーディング7ステップ

1. 院情報設定
2. 営業時間、休診日設定
3. 施術メニュー設定
4. スタッフ、権限設定
5. LINE連携
6. テスト予約
7. 予約ページ公開

---

## 7. 推奨アーキテクチャ

### 7.1 全体構成

- LINE公式アカウント
- Messaging API
- Webhook受信サーバー
- Tiramisu Backend API
- AWS Strands Agent Runtime
- Gemini API
- KB、FAQ、手順書データ
- サポートチケット、handoff ログ
- オンボーディング状態データ

### 7.2 責務分離

#### LINE層

- 友だち追加
- メッセージ受信
- リッチメニュー表示
- Postback送信
- Reply、Push メッセージ送信

#### Tiramisu Backend層

- Webhook署名検証
- イベント永続化
- idempotency 制御
- PII、高リスク判定の前段フィルタ
- KB検索API
- deep link 生成
- サポートチケット起票
- 監査ログ保存

#### Agent層

- 意図分類
- KB検索結果の利用
- 手順生成
- リスク判定
- handoff summary 生成

#### Frontend層

- オンボーディングチェックリスト
- 設定画面
- 困ったとき導線
- deep link 着地先

### 7.3 リクエストフロー

1. LINE から event を受信する
2. Webhook署名を検証する
3. event を保存し、重複判定を行う
4. PIIまたは高リスクトピックかを前段で判定する
5. 許可対象のみ Agent に渡す
6. Agent は KB検索と構造化応答を行う
7. 必要に応じて deep link か handoff summary を返す
8. 応答と監査情報を保存して LINE に返信する

---

## 8. バックエンド要件

### 8.1 リリースMVPで必須のAPI

最低限、以下の責務を持つAPIまたは内部関数を用意する。

- `verify_line_webhook_signature`
- `save_line_webhook_event`
- `is_duplicate_line_event`
- `search_kb_articles`
- `build_deep_link`
- `create_support_ticket`
- `save_ai_audit_log`

### 8.2 Phase 2 で追加するAPI

以下は account linking と状態連動を始めるタイミングで追加する。

- `get_clinic_setup_status`
- `get_onboarding_progress`
- `get_booking_page_status`
- `get_line_link_status`
- `get_user_role`
- `get_recent_errors`

### 8.3 deep link 方針

deep link は URL をハードコードするのではなく、論理キーで管理する。

最低限、以下の `deep_link_type` を持つ。

- `onboarding_home`
- `clinic_info`
- `business_hours`
- `menus`
- `staff_permissions`
- `line_settings`
- `test_reservation`
- `booking_publish`
- `contact_support`

リリースMVPでは固定マッピングでよい。Phase 2 でユーザー状態に応じた出し分けを許可する。

---

## 9. LINE技術要件

### 9.1 必須要件

- Messaging API を利用する
- Webhook URL は HTTPS で公開する
- Webhook署名を検証する
- Webhook処理は非同期前提にする
- 再配信と重複送信に備えて idempotency を持つ
- Follow / Message / Postback event に対応する
- Reply message を利用する
- リッチメニューを利用する

### 9.2 account linking の扱い

account linking は有効だが、**リリースMVP必須ではない**。Phase 2 で導入する。

導入時は以下を必須とする。

- LINE account linking を使う
- `linkToken` はサーバー側で発行する
- ワンタイム、短時間有効にする
- `nonce` を保存して照合する
- `line_user_id` と `tiramisu_user_id` を紐付ける

### 9.3 メッセージ方針

- 短文で返す
- 1返答1テーマ
- 手順は最大7ステップ
- 長文はKBまたはアプリに送る
- Push は停滞検知または手動フォローに限定する

---

## 10. Gemini + AWS Strands 要件

### 10.1 採用方針

- 推論モデルは Gemini を採用する
- エージェント実行基盤は AWS Strands を採用する
- リリースMVPは **1エージェント構成** とする
- マルチエージェント化は Phase 4 以降の検討事項とする

### 10.2 Strands に期待する責務

- ツール選択
- 構造化出力
- セッション管理
- handoff summary 生成
- 将来の拡張余地

### 10.3 ツール一覧

#### リリースMVP

- `search_kb_articles`
- `build_deep_link`
- `create_support_ticket`
- `summarize_handoff`

#### Phase 2

- `get_clinic_setup_status`
- `get_onboarding_progress`
- `get_booking_page_status`
- `get_line_link_status`
- `get_user_role`

---

## 11. AIエージェント要件

### 11.1 AIの責務

AIは以下のみ担当する。

- 製品の使い方説明
- 初期設定支援
- トラブルシューティングの一次切り分け
- エスカレーション要否の判断
- handoff summary の作成

### 11.2 AIの禁止事項

- 医療判断
- 施術提案
- 患者個別の症状対応
- 請求、返金、契約変更の最終判断
- セキュリティ事故の自己完結
- 患者個人情報を含むLINE会話の処理

### 11.3 応答形式

AI返答は以下のJSONを基本とする。

```json
{
  "intent": "onboarding_booking_publish",
  "risk_level": "low",
  "goal": "予約ページを公開したい",
  "steps": [
    "予約設定画面を開く",
    "公開状態を確認する",
    "テスト予約を1件実施する"
  ],
  "pitfalls": [
    "営業時間が未設定だと公開後に空き枠が出ません"
  ],
  "cta": {
    "type": "booking_publish",
    "label": "予約ページ公開設定を開く"
  },
  "escalate": false,
  "handoff_summary": null
}
```

### 11.4 意図分類

少なくとも以下を扱う。

- `onboarding_booking_publish`
- `onboarding_test_reservation`
- `onboarding_menus`
- `onboarding_staff_permissions`
- `line_linking`
- `booking_trouble`
- `human_support_request`
- `unsupported_high_risk`

---

## 12. セキュリティ、法務、安全

### 12.1 前段遮断ルール

以下は **AIに渡す前に** 遮断する。

- 患者名
- 生年月日
- 電話番号
- 症状相談
- 施術画像
- 返金、請求、契約変更
- アカウント事故
- 強い怒り、クレーム、事故報告

### 12.2 遮断時の動作

- 固定文で回答する
- 必要に応じて有人導線を返す
- 監査ログにはマスクした内容のみ保存する
- 元メッセージの保存は最小限とする

### 12.3 監査要件

- Webhook受信ログを保持する
- AI応答ログを保持する
- サポート起票ログを保持する
- 高リスク遮断ログを保持する

---

## 13. KB、ナレッジ要件

### 13.1 KB構成

- はじめに
- 予約を動かす
- 予約ページ公開
- LINE連携
- 日々の運用
- 困ったとき
- FAQ

### 13.2 記事ルール

- 1記事 = 1タスク
- 画面上の文言と一致させる
- 冒頭に1行ゴールを書く
- 最大7手順
- よくあるミスを書く
- 最終更新日を持つ

### 13.3 初期整備量

リリースMVPでは 30〜50記事を目安とする。

### 13.4 学習ループ

- 未解決チケットを週次集計する
- 上位未解決10件を確認する
- KB不足、UI不足、バグ疑いに分類する

---

## 14. データ要件

### 14.1 リリースMVPで必要なテーブル

- `line_users`
- `line_webhook_events`
- `line_conversations`
- `support_tickets`
- `support_handoffs`
- `kb_articles`
- `kb_article_versions`
- `ai_audit_logs`

### 14.2 Phase 2 で追加するテーブル

- `line_account_links`
- `onboarding_progress`

### 14.3 support_tickets の最低分類

チケットには少なくとも以下を持たせる。

- 問い合わせ種別
- 重要度
- AI解決可否
- エスカレーション理由
- 原因仮説
  - KB不足
  - UI不足
  - バグ疑い
  - 権限不足
  - 設定未完了

---

## 15. KPI

### 15.1 MVPで追う指標

- AI自動解決率
- エスカレーション率
- エスカレーション理由別件数
- 7日以内オンボ完了率
- 初回予約までの時間
- 1院あたりサポート工数
- 停滞院数
- LINE送信通数

### 15.2 初期仮説目標

初期目標は以下を暫定値とする。

- 7日以内オンボ完了率: 40%以上
- 初回予約到達中央値: 3日以内
- AI自己解決率: 30%以上
- 1院あたりサポート工数: 30%削減

---

## 16. 導入フェーズ

### Phase 1: リリースMVP

- KB整備
- LINE公式アカウント開設
- Webhook受信
- リッチメニュー4導線
- 1エージェント
- 1テーマ
  - 予約ページ公開までのオンボーディング支援
- 固定 deep link
- handoff summary
- 人への問い合わせ起票

### Phase 2: 状態連動化

- account linking
- 院ごとの設定状態取得
- 動的 deep link
- 7ステップ進捗連動
- 追加テーマ

### Phase 3: 停滞対策

- 停滞検知
- アプリ内バナー
- LINE Push
- per-user rich menu

### Phase 4: 高度化

- 評価基盤の強化
- 改善ループ半自動化
- マルチエージェント化検討

---

## 17. 実装判断

本要件における重要判断は以下とする。

- **LINEは予約チャネルではなく、CSとオンボーディングの入口として使う**
- **リリースMVPでは account linking を無理に入れない**
- **最初は 1エージェント + 1テーマに限定する**
- **高リスク領域はAIに処理させない**
- **deep link、起票、監査ログを先に整える**
- **未解決ログを改善ループにつなげる**

---

## 18. 最終結論

Tiramisu の LINE AI エージェントは、以下の形が最も現実的である。

- LINE公式アカウントを入口にする
- Tiramisu アプリ内オンボーディングを本体にする
- AIは「何でも答える」より「次にやることを前に進める」ことに集中する
- リリースMVPでは 1エージェント + 1テーマに絞る
- Phase 2 で account linking と状態連動を追加する
- 医療、請求、返金、契約、事故対応は人へ返す

この構成なら、低ITユーザーにも分かりやすく、ソロプレナー運用でも実装と運用の両方を現実的な範囲に抑えられる。

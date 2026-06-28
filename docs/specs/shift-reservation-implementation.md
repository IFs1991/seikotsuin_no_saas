# シフト表予約管理実装案

## 目的
- ホットペッパービューティーからの予約／キャンセル通知を自動で取り込み、クリニックのシフト表と連動した予約管理を実現する。
- 予約データを Supabase/PostgreSQL に蓄積し、UI でリアルタイムに可視化することで、スタッフ稼働と顧客対応を最適化する。

## 要求仕様（サマリ）
- **入力**: ホットペッパービューティーが送信する予約確定／キャンセルメール。
- **処理**: メール受信 → Webhook 経由で Next.js Route が受信 → Supabase に記録 → シフト／予約ビューへ反映。
- **出力**: 予約一覧、シフト表、キャンセル履歴、スタッフ別の埋まり状況などを UI に表示。必要に応じて通知やアラートも送出。

## システム構成（案）
1. **メール → Webhook 変換レイヤ**
   - SendGrid Inbound Parse / AWS SES / Mailgun Routes / Google Apps Script など、受信メールを HTTP POST に変換できるサービスを利用。
   - Webhook 宛先 URL と共有シークレット or 署名検証メカニズムを設定する。

2. **Supabase / PostgreSQL**
   - 予約・シフト・ログテーブルを整備し、Row Level Security (RLS) を既存ポリシーに合わせて適用。
   - Realtime／RPC／Trigger を活用し、UI およびバックエンド処理を効率化。

3. **Next.js (App Router)**
   - `/api/webhooks/hotpepper` Route でメールからの変換 HTTP を受け取り、バリデーションや署名検証を実施。
   - Supabase Service Role クライアントでデータを `insert` / `upsert`。
   - `/api/reservations` 等の Route Handler を追加し、UI から必要なデータを取得できるようにする。

4. **フロントエンド (React/Next.js)**
   - React Query と Supabase Realtime を組み合わせ、予約・シフト情報をリアルタイム更新。
   - シフト表 (カレンダー表示) と予約一覧 (リスト／タイムライン) でスタッフ稼働状況を可視化。

## データモデリング（ドラフト）
| テーブル | 役割 | 主なカラム例 |
| --- | --- | --- |
| `reservation_sources` | 予約の流入元管理 | `id`, `code` ("hotpepper" 等), `name`, `description` |
| `reservations` | 予約本体 | `id`, `clinic_id`, `staff_id`, `customer_name`, `customer_contact`, `slot_start`, `slot_end`, `status` (confirmed/cancelled 等), `source_id`, `source_reservation_id`, `menu`, `notes`, `created_at` |
| `reservation_events` | 受信イベント生ログ | `id`, `source_id`, `event_type`(confirm/cancel 等), `raw_payload`(JSONB), `received_at`, `processed_at`, `status` |
| `shifts` | スタッフのシフト枠 | `id`, `clinic_id`, `staff_id`, `shift_start`, `shift_end`, `role`, `status` |
| `staff_shift_assignments` (任意) | シフトとスタッフの紐付けを詳細管理する場合 | `id`, `shift_id`, `staff_id`, `position` |
| `reservation_audit` (任意) | 予約状態遷移履歴 | `id`, `reservation_id`, `action`, `metadata`, `created_at` |

- `reservations.source_reservation_id` にホットペッパー側の予約番号を格納し、`upsert` で重複登録を防止。
- 既存の `ensureClinicAccess` を利用できるよう `clinic_id` を必須化し、RLS を遵守。
- `reservation_events` は再処理や監査のため一定期間保持し、必要に応じてアーカイブ。

## 予約処理フロー
1. メール受信 → Webhook サービスが HTTP POST を `/api/webhooks/hotpepper` に送信。
2. Route Handler が以下を実施:
   - 署名／共有シークレット検証。
   - ペイロードを解析し、予約番号・日時・メニュー・顧客情報・担当者名などを抽出。
   - `reservation_events` に生ログを保存。
   - `reservations` に対して `upsert` (confirmed) または `update` (cancelled) を実行。
   - 必要なら `AuditLogger` に記録。
3. Supabase Trigger またはアプリケーションロジックで以下を実行:
   - シフト枠との整合チェック（該当スタッフのシフトが存在するか／枠が埋まっていないかなど）。
   - 並行する予約があれば衝突フラグを立てる、管理者通知を飛ばす等のハンドリング。
4. UI 側では React Query / Realtime を通じて自動更新。

## フロントエンド変更案
- **新規ページ／コンポーネント**
  - 予約一覧: 日付／スタッフ／ステータスでフィルタ可能なリストビュー。
  - シフト表: カレンダービュー上に予約をマッピングし、空き枠・重複を可視化。
  - 予約詳細ダイアログ: 顧客情報、メニュー、連絡先、キャンセル理由などを表示。
- **フック／API クライアント**
  - `useReservations` フック（`/api/reservations` などをコール）。
  - 予約作成／変更用の `useMutation`。手動登録や補正対応に備える。
- **状態更新**
  - Supabase Realtime チャンネルまたは Websocket を購読し、予約テーブルの変化を即時反映。

## セキュリティ・運用考慮事項
- Webhook 署名検証 or IP 制限で不正リクエストを防止。
- Rate Limiter による連続リクエスト制御。必要であれば `/api/webhooks/hotpepper` 用に緩和設定。
- `AuditLogger` のバグ修正（未定義変数 `attemptedResource` を除去）後、重要イベントをロギング。
- `reservation_events` の保管期間とメンテナンス方針を策定（一定期間後にアーカイブ or 削除）。
- パーサーの回帰テストを整備し、ホットペッパー側のメールフォーマット変更に備える。

## 未確定事項・要確認ポイント
1. ホットペッパービューティーのメールフォーマット（固定テンプレートか、差異があるか）。
2. 予約番号・担当者 ID 等の一意キー情報が取得可能か。
3. スタッフ情報の突合方法（メール内の氏名 → Supabase の `staff` レコード）。
4. 予約キャンセル時に必ず送信されるメールの存在保証。
5. 既存シフト表データとの整合ルール（例: シフトが未設定でも予約を許可するか）。
6. Webhook を受けるインフラ（Vercel / Supabase Edge Functions / Cloud Run 等）の確定。

## スケジュール感（目安）
1. フォーマット調査とテーブル設計: 1 週間。
2. Webhook Route 実装＆署名検証: 1〜2 週間。
3. Supabase Trigger / RPC 整備: 1 週間。
4. フロントエンド UI 実装: 2 週間。
5. 結合テスト／運用調整: 1 週間。

## 次ステップ（直近）
1. ホットペッパービューティーの通知メールサンプルを収集し、解析仕様を確定する。
2. 上記ドラフトテーブルをベースに ER 図と RLS 方針を固める。
3. Webhook 受信基盤（メール→HTTP）のサービス選定とセットアップ。
4. `reservation_events` → `reservations` 変換ロジックの詳細仕様書きを行い、テストケースを作成する。
5. UI/UX ワイヤーフレームを準備し、開発スコープを具体化する.

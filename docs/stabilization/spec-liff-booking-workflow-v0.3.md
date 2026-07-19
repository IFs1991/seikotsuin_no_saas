# LIFF予約ワークフロー v0.3

## Summary

公開予約フォーム（`/booking/[clinic_id]`）を、LINE LIFFアプリとして動作する
**ワークフロー型（ステップウィザード）予約体験**に刷新する。あわせて、

- 空き枠を院内の予約タイムライン（`reservations` / `blocks` / `clinic_hours`）と連動させる
- 入力必須項目のオン/オフと院独自の質問項目を院側で設定可能にする
- 患者への通知（予約受付・確定・リマインダー・キャンセル）を追加する

を実現する。LIFFに依存しない通常ブラウザ（Web導線）でも同一フォームが
そのまま動作することを必須要件とする（プログレッシブエンハンスメント方針）。

**v0.2 での変更**: v0.1 で保留/対象外としていた CAPTCHA（Turnstile）・
no-show対策の当日リマインダー・休眠患者再活性キャンペーンをスコープに追加
（Phase E/F）。v0.1 の未決事項4点（指名なし自動割当・Messaging APIトークン
方式・マイページの版数・リマインダー送信時刻）を決定事項として確定。

**v0.3 での変更**（main追随。mobile UIUX ロールアウト後の実装と整合）:

1. 競合判定は main で共通化された `src/lib/reservations/conflict.ts`
   （`hasReservationConflict()`）を再利用する方針に変更（A-5b）。
   排他制約が守る予約書き込み経路は `/api/reservations`・
   `/api/mobile-uiux/reservations`・`/api/public/reservations` の**3系統**
2. LIFF/LINE機能のロールアウト制御を、グローバル環境変数から main で
   導入された `clinic_feature_flags`（院別エンタイトルメントパターン、
   `20260702000100_mobile_uiux_clinic_feature_flags.sql`）準拠に変更（D-7）
3. 排他制約の述語が既存の部分インデックス `idx_reservations_staff_time`
   および DB の `reservations_status_check`（8値）と整合することを明記（A-5）

- 対象バージョン: `0.1.0-pilot`
- 関連: `Tiramisu2.md` §20-23（LINE再活性・LIFF構想）、
  `docs/stabilization/spec-rls-tenant-boundary-v0.1.md`（Customer Access Model）
- 既存実装: `src/app/(public)/booking/[clinic_id]/page.tsx`、
  `src/lib/services/public-reservation-service.ts`、
  `src/app/api/public/{menus,resources,reservations}/`、
  `src/lib/reservations/{conflict,status}.ts`（共通競合判定・status分類）、
  `supabase/migrations/20260702000100_mobile_uiux_clinic_feature_flags.sql`
  （院別エンタイトルメントの先行パターン）

## 背景 / 現状の問題

現行の公開予約フォームは1画面フォームで、以下の問題がある。

| # | 問題 | 影響 |
|---|------|------|
| 1 | 時間枠が 9:00–20:30 のハードコードで、営業時間・既存予約・ブロックを参照しない | 埋まった枠に送信 → 409 を患者が試行錯誤する |
| 2 | サーバー側に営業時間・過去日時・受付期間（`minAdvanceBookingHours` 等）の検証がない | 深夜3時や過去日時の予約が通る |
| 3 | 空き枠チェック→INSERT間に排他がない（TOCTOU） | 同時送信でダブルブッキング成立 |
| 4 | 予約成立時の通知が院側・患者側とも皆無 | `unconfirmed` のまま放置されるリスク |
| 5 | 顧客名寄せがemail一致のみ | 予約のたび `customers` 行が重複作成 |
| 6 | `channel=line` はクエリパラメータの自己申告 | LINE流入の計測が信頼できない |
| 7 | 入力項目が固定（氏名・電話・email・メモ） | 院ごとの問診・確認事項を予約時に取れない |

## Scope

- Phase A: ワークフロー型フォーム + 空き枠API + サーバー側検証 + DB排他制約
- Phase B: 予約フォーム設定（必須項目オン/オフ・カスタム質問）
- Phase C: 通知（院側メール / 患者メール → LINE push へ拡張。前日+当日リマインダー）
- Phase D: LIFF統合（IDトークン検証・プロフィール連携・`line_user_id` 名寄せ・マイページ）
- Phase E: スパム対策（Cloudflare Turnstile）
- Phase F: 休眠患者再活性キャンペーン（最小構成）

## Non-Goals（本仕様の対象外）

- LINEリッチメニューの自動設定、Bot自動応答
- offer token / 特典・クーポン・redemption（Tiramisu2 §15, §21。再活性の
  「特典付き導線」は将来Phase — v0.2の再活性はメッセージ配信+計測まで）
- AIによる文面生成・セグメント提案（Tiramisu2 Agent Plane）
- 複数メニュー同時予約、家族分まとめ予約
- 決済・事前決済
- `appointments`（レガシー）への書き込み（読み取り専用を維持）

---

## Phase A: ワークフロー型フォーム + 空き枠連動

### A-1. 予約ワークフロー（患者体験）

ステップウィザード形式。各ステップは1画面1関心事とし、モバイル（LINE内
ブラウザ/LIFF）を第一ターゲットにする。

```
Step 1  メニュー選択        （公開メニュー一覧。料金・所要時間表示）
Step 2  担当者選択          （「指名なし」を先頭に。院設定で非表示可）
Step 3  日時選択            （カレンダー + 空き枠グリッド。空き枠APIと連動）
Step 4  患者情報入力        （必須項目は院設定に従う。LIFF時はプリフィル）
Step 5  質問項目            （院設定のカスタム質問。未設定なら省略）
Step 6  確認                （全入力の確認 + 同意事項 + Turnstile検証）
Step 7  完了                （予約番号・注意事項・友だち追加導線・キャンセルポリシー表示）
```

- 状態はクライアント内保持（URLステップ同期は任意）。リロード時はStep 1へ。
- 各ステップで「戻る」可能。Step 3の枠は選択時点で再検証し、確認画面から
  送信した時点で最終検証（後述の排他制約が最後の砦）。
- 既存の1画面フォームはワークフロー実装完了後に置き換える（並行運用しない）。

### A-2. 空き枠API

```
GET /api/public/availability
  ?clinic_id=<uuid>
  &menu_id=<uuid>
  &resource_id=<uuid|"any">
  &date_from=<YYYY-MM-DD>   （JST）
  &date_to=<YYYY-MM-DD>     （JST。最大14日間）
```

レスポンス（統一エンベロープ）:

```json
{
  "success": true,
  "data": {
    "slot_minutes": 30,
    "days": [
      {
        "date": "2026-07-03",
        "is_closed": false,
        "slots": [
          { "start": "09:00", "available": true,  "resource_ids": ["..."] },
          { "start": "09:30", "available": false, "resource_ids": [] }
        ]
      }
    ]
  }
}
```

**空き枠の算出ロジック**（`PublicAvailabilityService` を新設）:

1. `clinic_settings.clinic_hours`（`hoursByDay` / `holidays` /
   `specialClosures`）から該当日の営業時間帯を得る。休診日は `is_closed: true`
2. `booking_calendar.slotMinutes` 刻みで候補枠を生成
3. `booking_calendar.minAdvanceBookingHours` / `maxAdvanceBookingDays` で
   受付可能ウィンドウを絞る（JST基準、`src/lib/jst.ts` を必ず使用）
4. 対象リソースの `reservations`（`status not in (cancelled, no_show)`）と
   `blocks` の重複区間を除外 — **院内予約タイムラインと同一テーブルを参照
   するため、スタッフ側タイムラインと常に整合する**
5. メニュー所要時間（`duration_minutes`）ぶん連続して空いている枠のみ
   `available: true`
6. `resource_id=any` の場合は bookable な staff リソース全員に対して評価し、
   1人でも空いていれば `available: true`（`resource_ids` に空きスタッフを列挙）

- キャッシュ: `Cache-Control: no-store`（枠は鮮度優先。menus/resources の
  既存キャッシュ方針は変更しない）
- レート制限: 既存 `/api/public/` 共通制限を適用（middleware変更不要）

### A-3. 指名なし（`resource_id = "any"`）の自動割当【v0.2で確定】

予約作成時にサーバーが以下のポリシーで担当を確定する。

1. 該当枠に空きがある bookable staff を列挙
2. **当日（JST）の割当予約数が最少**のスタッフを選択
   （`reservations` の `status not in (cancelled, no_show)` を
   `staff_id` × 当日でカウント）
3. 同数の場合は `resources.display_order`（なければ `created_at`）昇順で先頭

- 割当結果は排他制約の対象なので、同時POSTで同一スタッフに衝突した場合は
  23P01 → 次点スタッフで**1回だけ再試行**し、それも失敗なら409を返す
- 予約レコードに `is_staff_requested = false` を設定（既存カラム。指名予約
  と区別し、指名料計算・スタッフ分析の既存ロジックと整合させる）
- 将来の拡張（稼働率平準化・売上考慮）は本ポリシーの関数
  （`selectStaffForAutoAssign()`）差し替えで対応できる形にする

### A-4. 予約作成のサーバー側検証強化

`PublicReservationService` に以下を追加する。

- 営業時間内チェック（`clinic_hours` 参照。休診日・特別休業を含む）
- 過去日時の拒否
- `minAdvanceBookingHours` / `maxAdvanceBookingDays` の適用
- `slotMinutes` 境界チェック（現行の「30分固定」文字列チェックを廃止し、
  院設定値でJST基準の境界検証に置換）
- `start_time` はタイムゾーンオフセット付きISO 8601を必須化
  （Zodで `Z` または `+HH:MM` を強制。オフセットなしは400）

### A-5. ダブルブッキングDB排他制約（migration）

- `btree_gist` 拡張を有効化
- `reservations` に排他制約を追加:

```sql
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    clinic_id WITH =,
    staff_id  WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show') AND is_deleted = false);
```

- 適用前に既存データの重複を検出するチェックSQLを用意し、重複が存在する
  場合は適用を中断する（手動解消後に再適用）
- 制約違反（SQLSTATE `23P01`）は `SlotConflictError` に正規化して409を返す
- この制約は予約書き込みの**3系統すべて**（`/api/reservations`・
  `/api/mobile-uiux/reservations`・`/api/public/reservations`）の最後の砦
  として効く
- 述語の整合性: 除外条件 `('cancelled', 'no_show')` + `is_deleted = false` は
  既存の部分インデックス `idx_reservations_staff_time` の述語、および
  共通競合判定 `hasReservationConflict()` の条件と同一にする。
  status の正値は DB の `reservations_status_check`
  （`tentative / confirmed / arrived / completed / cancelled / no_show /
  unconfirmed / trial` の8値）に準拠し、新しい status 値は導入しない
- ロールバックSQL: `supabase/rollbacks/` に制約DROPを用意

### A-5b. 共通競合判定モジュールの再利用【v0.3で追加】

main の mobile UIUX 対応で競合判定が
`src/lib/reservations/conflict.ts`（`hasReservationConflict()`）に共通化され、
`/api/reservations` と `/api/mobile-uiux/reservations` の両方が
これを使用している。本仕様でもこれに合流する。

- `PublicReservationService.checkSlotAvailability()` の予約重複クエリを
  自前実装から `hasReservationConflict()` 呼び出しに置換する
  （`excludeDeleted: true` を指定。3系統で判定条件のズレをなくす）
- `blocks` の重複チェックは公開予約固有のため `PublicReservationService`
  に残す（将来スタッフ側でも必要になったら同モジュールへ昇格）
- `PublicAvailabilityService`（A-2）の除外条件も同モジュールの述語と
  同一にする（インライン実装でもよいが、条件定数は共有する）
- status の分類表示は main の `src/lib/reservations/status.ts`
  （`classifyReservationStatus()`）を再利用する

### A-6. 顧客名寄せの改善

`findOrCreateCustomer` の照合順序を変更:

1. `line_user_id` 一致（Phase D以降。最優先）
2. 電話番号一致（正規化: ハイフン・空白除去、先頭 `+81` → `0`）
3. email一致（現行ロジック。`.single()` → `.limit(1).maybeSingle()` に変更し
   複数行ヒットでも500にしない）
4. いずれも不一致なら新規作成

電話番号はフォーム必須（院設定でオフ可能だが、デフォルトは必須維持）。

---

## Phase B: 予約フォーム設定（院側カスタマイズ）

### B-1. 設定の保存場所

`clinic_settings` に新カテゴリ `booking_form` を追加する
（`VALID_CATEGORIES` / `DEFAULT_SETTINGS` / Zodスキーマ / normalize を拡張）。

```jsonc
{
  "fields": {
    "nameKana":  { "enabled": true,  "required": false },
    "phone":     { "enabled": true,  "required": true  },
    "email":     { "enabled": true,  "required": false },
    "birthDate": { "enabled": false, "required": false },
    "gender":    { "enabled": false, "required": false },
    "notes":     { "enabled": true,  "required": false }
  },
  "staffSelection": "optional",   // "required" | "optional" | "hidden"
  "questions": [
    {
      "id": "q_visit_reason",      // 院内一意。UUIDを自動採番
      "label": "来院のきっかけ",
      "type": "select",            // text | textarea | select | multiselect | boolean
      "options": ["紹介", "Web検索", "LINE", "通りがかり"],
      "required": true,
      "active": true,
      "sortOrder": 1
    }
  ],
  "consents": [
    { "id": "c_privacy", "label": "個人情報の取り扱いに同意する", "required": true, "linkUrl": "/privacy" }
  ],
  "completionMessage": ""          // 完了画面の院独自メッセージ（任意）
}
```

制約: `questions` は最大20件、`label` 100文字以内、`options` は各50文字・
最大20択。`name`（氏名）は常に必須で設定不可。

### B-2. 公開API

```
GET /api/public/booking-form?clinic_id=<uuid>
```

上記設定から患者に見せてよい部分のみ返す（sanitize済み）。フォームは
このレスポンスに従って Step 4 / Step 5 / 同意欄を動的レンダリングする。
設定未保存の院はデフォルト値（現行フォーム相当）で動作する。
Turnstile有効時は `turnstile_site_key`、LIFF設定済みの院は `liff_id` を含める。

### B-3. 回答の保存

- `reservations` に `intake_responses jsonb NULL` 列を追加（migration +
  ロールバックSQL）
- 保存形式: `[{ "id": "q_visit_reason", "label": "来院のきっかけ", "value": "紹介" }]`
  （`label` を回答時点のスナップショットとして保存し、質問設定を後から
  変更しても過去回答の意味が保たれるようにする）
- サーバー側で `booking_form` 設定と突合して検証:
  required未回答は400、未知の質問IDは無視、型不一致は400
- 表示: 予約詳細（`AppointmentDetail`）と未確定予約モーダルに回答を表示

### B-4. 設定UI

`(app)/admin/settings` の設定画面に「予約フォーム」タブを追加。

- 標準項目のオン/オフ・必須切替（トグル）
- カスタム質問のCRUD + 並べ替え
- プレビュー（既存 `BookingPreviewCard` の実フォーム埋め込みを再利用。
  ただし**プレビューモードでは送信を無効化する**修正を同時に行う）
- 権限: `admin` / `clinic_admin` のみ編集可（既存 admin-settings API の
  権限制御に従う）

---

## Phase C: 通知

### C-1. 院側通知（最優先・メール）

公開予約の作成成功時に `email_outbox` へエンキューする
（既存 `/api/reservations` のエンキュー実装・
`src/lib/notifications/email/templates/` パターンを流用）。

- 宛先: `clinic_basic.email`（未設定時はスキップしWARNログ）
- テンプレート: `public-reservation-received`（新規）
  — 患者名・メニュー・日時・担当・チャネル（web/line）・質問回答の要約
- 送信は既存 `/api/internal/process-email-outbox` に相乗り（変更不要）

### C-2. リマインダー設定【v0.2で確定】

`booking_calendar` 設定にリマインダー設定を追加する。

```jsonc
{
  "reminders": {
    "dayBefore": { "enabled": true,  "sendAtHour": 18 },  // 前日 JST 18:00（デフォルト）
    "sameDay":   { "enabled": false, "hoursBefore": 3 }   // 当日 予約3時間前（no-show対策）
  }
}
```

- `sendAtHour` は 8–21 の整数（JST）。`hoursBefore` は 1–12 の整数
- 当日リマインダーはデフォルトOFF（院がno-show課題に応じて有効化）
- 対象は `confirmed` 予約のみ。`customers.consent_reminder = false` は除外
- リマインダー文面にはマイページURL（D-6）を含め、患者がその場で
  キャンセルできる導線とセットにする

### C-3. リマインダー実行基盤

- `/api/internal/reservation-reminders`（新規cron、`CRON_SECRET` 認証）を
  **15分間隔**で起動する想定（Vercel Cron / 外部スケジューラ）
- 各起動で全アクティブ院の設定を読み、「送信時刻が現在ウィンドウ
  （前回起動〜今回）に入った予約」を抽出してエンキューする
- **冪等性（二重送信防止）**: `reservation_notifications` ログテーブルを
  新設し、`UNIQUE (reservation_id, notification_type)` で担保
  （`notification_type`: `reminder_day_before` / `reminder_same_day` /
  `received` / `confirmed` / `cancelled`）。エンキュー時に
  `INSERT ... ON CONFLICT DO NOTHING` で先取りし、衝突したらスキップ
- 送信チャネルの選択は C-4 の優先順位に従う

### C-4. 患者通知チャネルの優先順位

| 患者の状態 | チャネル |
|-----------|---------|
| `line_user_id` あり & 院の `lineEnabled` 真 & LINE credential 有効 | LINE push |
| 上記以外で `email` あり | メール |
| どちらもなし | 送信なし（ログのみ） |

通知イベント: 予約受付（患者向け確認）/ 確定 / キャンセル / 前日・当日
リマインダー。LINE送信失敗が3回に達した場合、email があればメールに
フォールバックする。

### C-5. LINE push 送信基盤（Phase D後）

- `line_message_outbox` テーブルを新設（outboxパターンをLINEにも適用）:
  `id / clinic_id / line_user_id / message_type / payload jsonb /
  status(pending|sent|failed) / attempts / last_error / created_at / sent_at`
- `/api/internal/process-line-outbox`（新規、`CRON_SECRET`）が
  Messaging API `POST /v2/bot/message/push` で送信。失敗はattempts+1で
  リトライ（最大3回）、`429` は `Retry-After` 尊重
- 文面はFlex Messageではなくテキスト+確認URLの最小構成から始める

---

## Phase D: LIFF統合

### D-1. テナント×LINEチャネルのモデル

**院ごとに自院のLINE公式アカウント（Messaging APIチャネル）+
LINE Loginチャネル（LIFFアプリ）を持つ**構成とする。

- 理由: 患者が友だち追加するのは各院のOAであり、push通知の送信元も
  各院のOAである必要があるため。SaaS共通OA方式は採用しない
- 院がLINE Developersで作成した credential を管理画面から登録する

### D-2. Messaging APIトークン方式【v0.2で確定】

**チャネルアクセストークン v2.1（JWT assertion、有効期間最大30日）を採用**し、
自動更新をシステム側で持つ。長期トークン（無期限）は採用しない。

- 理由: 長期トークンは漏洩時に失効操作を院に依頼する運用リスクがあり、
  医療系テナントの credential として不適。v2.1 は kid + 秘密鍵から
  短命トークンを自動発行でき、漏洩ウィンドウが最大30日で閉じる
- 実装:
  - `clinic_line_credentials` に `assertion_private_key_encrypted`（JWK、
    AES-256-GCM）と `assertion_kid` を保持
  - `src/lib/line/token-manager.ts`（新設）が
    `POST https://api.line.me/oauth2/v2.1/token` でアクセストークンを取得し、
    `access_token_encrypted` + `token_expires_at` にキャッシュ。
    残り有効期間が7日を切ったら `process-line-outbox` 実行時に自動再発行
  - トークン発行失敗時は outbox を `pending` のまま残し、次回リトライ
    （fail-closed。予約フロー本体には影響させない）
- 院側の登録手順（管理画面のガイドに記載）: LINE Developers でチャネル作成
  → Assertion Signing Key を発行 → 秘密鍵(JWK)とkidを管理画面に貼り付け

### D-3. credential保管（重要: `clinic_settings` に入れない）

`clinic_settings` は管理APIでクライアントに返るため、secretを置けない。
専用テーブルを新設する（migration + ロールバックSQL）。

```
clinic_line_credentials
  clinic_id                        uuid PK/FK
  liff_id                          text     -- 公開可
  login_channel_id                 text     -- IDトークンverifyのaud検証用。公開可
  messaging_channel_id             text
  channel_secret_encrypted         text     -- AES-256-GCM
  assertion_private_key_encrypted  text     -- v2.1トークン発行用JWK。AES-256-GCM
  assertion_kid                    text
  access_token_encrypted           text     -- 発行済みトークンのキャッシュ。AES-256-GCM
  token_expires_at                 timestamptz
  oa_basic_id                      text     -- 友だち追加URL用（@xxxx）。公開可
  is_active                        boolean
  created_at / updated_at
```

- RLS: 全ロールに対して**deny**（ポリシーなし＝アクセス不可）。
  読み書きは `createAdminClient()`（service role）経由のサーバー処理のみ
- 暗号化鍵: 環境変数 `LINE_CREDENTIALS_ENCRYPTION_KEY`（32byte、
  `src/lib/env.ts` に追加。必須にはせず、未設定時はLINE機能を無効化＝
  fail-closed）
- 管理API: `PUT /api/admin/line-credentials`（`verifyAdminAuth` +
  clinic scope）。GETはsecretをマスクして返す（`****` + 末尾4桁）

### D-4. LIFFフロント

- 依存追加: `@line/liff`（クライアントのみ。dynamic import）
- LIFFエンドポイントURL: `https://<app>/booking/{clinic_id}`（院ごとの
  LIFFアプリが自院のURLを指す。ルート追加は不要）
- 動作:
  1. `GET /api/public/booking-form` のレスポンスに `liff_id` を含める
     （設定済みの院のみ）
  2. `liff_id` があり `liff.isInClient()` 相当の環境なら `liff.init()`
  3. 初期化成功時: `liff.getIDToken()` を取得し予約POSTに同梱、
     `liff.getProfile()` の `displayName` を氏名の初期値に使用
  4. 初期化失敗・LIFF外ブラウザ: 通常Webフォームとして動作
     （**LIFFが使えなくても予約は必ず完了できる**こと）
- 完了画面（Step 7）: `oa_basic_id` 設定済みの院は友だち追加ボタン
  （`https://line.me/R/ti/p/{oa_basic_id}`）を表示。LIFF内で友だち未追加の
  場合を主ターゲットに、Web導線でも表示する
- CSP: `https://static.line-scdn.net`（SDK）と `https://api.line.me` を
  `csp-config.ts` に追加（`CSP_ROLLOUT_PHASE` の全フェーズで整合確認）

### D-5. IDトークン検証（サーバー）

予約POSTボディに `line_id_token`（任意項目）を追加。

1. `POST https://api.line.me/oauth2/v2.1/verify`
   （`id_token` + `client_id` = 当該院の `login_channel_id`）で検証
2. 成功時: `sub`（= `line_user_id`）と `name` を取得
   - `customers.line_user_id` / `line_display_name` に保存（名寄せ最優先キー）
   - `reservations.channel = 'line'` を**サーバーが**確定
     （クエリパラメータ由来の `channel` 申告は参考値に格下げ）
3. 失敗時: 予約自体は継続し `channel = 'web'` にフォールバック
   （検証失敗で予約を落とさない。WARNログのみ）
4. verify呼び出しはタイムアウト3秒・リトライなし

### D-6. LIFF内マイページ（キャンセル/変更）【v0.2で確定: v0.1リリースに含める】

**v0.1リリーススコープに含める**。判断理由: 当日リマインダー（no-show対策）
の効果は「気づいた患者がその場でキャンセルできる」導線とセットで初めて
成立するため。リマインダーのメッセージにマイページURLを必ず含める。

- ルート: `/booking/{clinic_id}/my`（LIFFエンドポイント配下。LIFF専用）
- `GET /api/public/my-reservations`: `line_id_token` 検証済みの
  `line_user_id` に紐づく将来予約の一覧（該当院スコープのみ）
- キャンセル: `booking_calendar.allowCancellation` と
  `cancellationDeadlineHours` に従い、`POST /api/public/reservations/{id}/cancel`
  （本人性は `line_user_id` 一致で担保。ID/電話などの推測可能な値では
  認可しない）。キャンセル時は院側通知（C-1）を送る
- 変更は「キャンセル→再予約」導線とする（枠移動APIは作らない）
- LIFF外（Web予約者）のキャンセルは対象外（院への電話運用のまま）。
  マイページURLはLIFF外で開かれた場合「LINEアプリから開いてください」を表示

### D-7. ロールアウト制御【v0.3で変更】

main で導入された `clinic_feature_flags`（院別エンタイトルメント、
書き込みは `admin` のみのRLS）に倣い、LIFF/LINE機能の有効化も
**院単位のDBフラグ**で制御する。

- `clinic_feature_flags` に `line_booking_enabled boolean not null default false`
  列を追加（migration。mobile UIUX 列群と同居させ、テーブルは増やさない）
- 判定条件: LIFF/LINE機能（booking-form APIの `liff_id` 返却・IDトークン
  検証・LINE push・マイページ）は
  `line_booking_enabled = true` **かつ** `clinic_line_credentials.is_active = true`
  の院のみ有効。どちらか欠けたら Web予約のみの従来動作（fail-closed）
- グローバル環境変数 `NEXT_PUBLIC_ENABLE_LIFF_BOOKING` は
  **プラットフォーム全体のkill switch** に役割を格下げ
  （デフォルトfalse。true でも院別フラグOFFなら無効）
- 更新API: 既存の mobile UIUX エンタイトルメント管理API
  （`/api/mobile-uiux/entitlement` 系）のパターンに倣い `admin` のみ

---

## Phase E: スパム対策（Cloudflare Turnstile）

- 対象: `POST /api/public/reservations`（予約作成のみ。読み取り系APIは対象外）
- クライアント: Step 6（確認画面）に Turnstile ウィジェット（invisible/
  managed モード）を設置し、トークンを予約POSTに同梱
- サーバー: `https://challenges.cloudflare.com/turnstile/v0/siteverify` で
  検証。失敗は 400（`ERROR_CODES` に新コード `CAPTCHA_FAILED` を追加）
- **LIFF IDトークン検証に成功したリクエストは Turnstile を免除**する
  （LINE本人性が既に担保されており、LIFF WebView内のウィジェット互換性
  リスクを避ける）
- 有効化条件: 環境変数 `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  が設定されている場合のみ有効（未設定なら従来どおり検証なし＝段階導入可能。
  プラットフォーム全体で1キー。院別設定はしない）
- siteverify はタイムアウト3秒。**Cloudflare側障害時はfail-open**
  （予約機会損失 > スパムリスク、と判断。WARNログ + Sentry通知）
- CSP: `https://challenges.cloudflare.com` を script-src / frame-src に追加

---

## Phase F: 休眠患者再活性キャンペーン（最小構成）

Tiramisu2 §20-23 のフル構想（Agent生成・特典token・承認ポリシー）は将来
フェーズとし、v0.2 では**手動運用の配信+計測の閉ループ最小版**を作る。

### F-1. データモデル（migration + ロールバックSQL）

テーブル名は Tiramisu2 §13.5 / §23 と揃える（将来拡張時にそのまま育てる）。

```
patient_outreach_campaigns
  id / clinic_id / name / status(draft|sent|cancelled)
  message_body                 -- テキスト。{{name}} 置換のみ対応
  segment_snapshot jsonb       -- 抽出条件のスナップショット
  created_by / sent_at / created_at / updated_at

patient_outreach_recipients
  id / campaign_id / clinic_id / customer_id / line_user_id
  delivery_status(pending|sent|failed|skipped)
  booked_reservation_id uuid NULL   -- 帰着した予約（計測用）
  sent_at / created_at
```

- RLS: `can_access_clinic(clinic_id)` で select/insert/update を
  `admin` / `clinic_admin` / `manager` に許可。delete は不可（監査性維持）
- `reservations` に `campaign_id uuid NULL`（FK →
  `patient_outreach_campaigns`）を追加

### F-2. 休眠セグメント抽出

- `GET /api/outreach/dormant-candidates?clinic_id&days_from&days_to`
  （認証必須・clinic scope）: `customers.last_visit_date` が指定範囲
  （例: 30–60日 / 60–120日 / 120日超）かつ
  `consent_marketing = true` かつ `line_user_id IS NOT NULL` の患者一覧
- `line_user_id` がない患者は v0.2 では対象外（メール配信キャンペーンは
  スコープ外。LINE友だち化が前提）

### F-3. キャンペーン作成・配信

- 画面: `(app)/patients` 配下に「再来促進」タブ（Pilot mode では
  `NEXT_PUBLIC_PILOT_MODE` フラグでの表示制御に従う）
- フロー: セグメント抽出 → 対象患者の確認（個別除外可）→ 文面入力
  （`{{name}}` 置換のみ）→ 確認 → 配信
- 配信は `line_message_outbox`（C-5）に `message_type = 'outreach'` で
  エンキューし、既存の送信cronが処理する（専用送信基盤は作らない）
- 文面末尾に予約導線URL `https://<app>/booking/{clinic_id}?c={campaign_id}`
  を自動付与
- ガードレール: 1キャンペーンの宛先上限 300件。同一患者への outreach は
  30日間に1通まで（`patient_outreach_recipients` の履歴でサーバー側検証）。
  配信実行は `admin` / `clinic_admin` のみ（`manager` は下書きまで）

### F-4. 帰着計測（attribution）

- 予約フォームは `?c={campaign_id}` を保持し、予約POSTに同梱
- サーバー検証: `campaign_id` が当該院のキャンペーンであり、かつ予約者の
  `customer_id`（名寄せ後）がそのキャンペーンの recipient に含まれる場合
  **のみ** `reservations.campaign_id` に記録し、`recipients.booked_reservation_id`
  を更新（単なるURL共有・転送での誤計上を防ぐ）
- 集計: キャンペーン一覧に 送信数 / 到達数 / 予約数 / 来院数
  （`booked_reservation_id` の予約statusで判定）を表示

### F-5. opt-out

- `customers.consent_marketing = false` で以後の抽出から除外
- マイページ（D-6）に「お知らせ配信を停止する」トグルを設置
  （`line_user_id` 本人のみ変更可能）
- Messaging API の配信失敗（ブロック等）は `delivery_status = failed` に
  記録し、3回連続failedの患者は抽出時に警告表示

---

## その他の推奨機能

| 機能 | 判断 |
|------|------|
| QRコード生成（URL発行画面に追加） | **含める**（Phase Aに小PRで。リッチメニュー登録・院内掲示に必須級） |
| URL発行画面の `window.location.origin` 依存を `NEXT_PUBLIC_APP_URL` に変更 | **含める**（Phase A） |
| `allowOnlineBooking` OFF時のURL発行画面警告 | **含める**（Phase A） |
| 友だち追加導線（完了画面にOA追加ボタン） | **含める**（Phase D。`oa_basic_id` 設定済み院のみ） |
| CAPTCHA（Turnstile） | **含める**（Phase E） |
| no-show対策の当日リマインダー | **含める**（Phase C。デフォルトOFFの院別設定） |
| 再活性キャンペーン | **含める**（Phase F。手動運用の最小構成） |
| 特典token・クーポン・AI文面生成 | 対象外（Tiramisu2 将来Phase） |

---

## セキュリティ不変条件

- テナント境界: 全ての新規API・サービスは `clinic_id` スコープを
  `createPublicClinicContext` / `ensureClinicAccess` で強制する
- `clinic_line_credentials` は RLS deny + service role限定。クライアントに
  secret平文を返すAPIを作らない
- IDトークン検証の `aud` は**当該院の** `login_channel_id` と一致必須
  （他院のトークンで名寄せされる横断攻撃を防ぐ）
- `campaign_id` 帰着は recipient 照合済みのみ記録（他院・他人のIDを
  付けたPOSTで計測を汚染できない）
- outreach 配信は `consent_marketing` 必須 + 頻度上限をサーバー側で強制
- 公開APIのエラーメッセージから内部情報（他予約の存在有無以上の詳細）を
  漏らさない
- fail-closed: LINE設定・暗号化鍵が無い場合、LINE機能は静かに無効化し
  Web予約は通常動作を維持（例外: Turnstileのみ外部障害時fail-open。Phase E参照）

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `LINE_CREDENTIALS_ENCRYPTION_KEY` | LINE機能利用時のみ | credential暗号化（AES-256-GCM, 32byte hex） |
| `NEXT_PUBLIC_ENABLE_LIFF_BOOKING` | 任意（デフォルトfalse） | プラットフォーム全体のkill switch（院別有効化は `clinic_feature_flags.line_booking_enabled`。D-7参照） |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile利用時のみ | ウィジェット表示 |
| `TURNSTILE_SECRET_KEY` | Turnstile利用時のみ | siteverify検証（サーバー専用） |

## マイグレーション一覧（すべてロールバックSQL同梱）

1. `btree_gist` 有効化 + `reservations_no_overlap` 排他制約（Phase A）
2. `reservations.intake_responses jsonb` 追加（Phase B）
3. `reservation_notifications` ログテーブル（Phase C）
4. `clinic_line_credentials` テーブル + RLS deny +
   `clinic_feature_flags.line_booking_enabled` 列追加（Phase D）
5. `line_message_outbox` テーブル + RLS deny（Phase C-5）
6. `patient_outreach_campaigns` / `patient_outreach_recipients` +
   `reservations.campaign_id`（Phase F）

## PR分割計画（1 task = 1 PR）

| PR | 内容 | Phase |
|----|------|-------|
| 1 | 排他制約migration + `SlotConflictError` 正規化 + 既存重複チェックSQL | A |
| 2 | 空き枠API（`PublicAvailabilityService`）+ サーバー側時間検証 + JST統一 + `hasReservationConflict()` への合流（A-5b） | A |
| 3 | ワークフロー型フォームUI（ウィザード化・空き枠グリッド・指名なし割当）+ QR/origin/警告の小修正 | A |
| 4 | `booking_form` 設定カテゴリ + 設定UI + `intake_responses` + 公開booking-form API | B |
| 5 | 院側/患者メール通知 + `reservation_notifications` + リマインダー設定/cron（前日・当日） | C |
| 6 | `clinic_line_credentials` + 管理API + 暗号化 + v2.1トークンマネージャ + `line_booking_enabled` フラグ（D-7） | D |
| 7 | LIFFフロント統合 + IDトークン検証 + 名寄せ + 友だち追加導線 + CSP | D |
| 8 | LINE push outbox + 送信cron + 通知のLINE優先/フォールバック | C-5 |
| 9 | LIFFマイページ（一覧・キャンセル・opt-outトグル） | D-6 |
| 10 | Turnstile（クライアント + siteverify + CSP + LIFF免除） | E |
| 11 | outreach テーブル + 休眠抽出API + キャンペーン画面 | F |
| 12 | outreach 配信（outbox連携）+ attribution + 集計表示 | F |

依存関係: 1→2→3 は直列。4は2以降、5は3以降、10は3以降ならいつでも。
6→7→8→9 は直列。11は6以降（credential前提）、12は8と11の後。

## テスト計画

- 単体（node）: `PublicAvailabilityService`（営業時間/休診/ブロック/重複/
  advance window/JST境界）、指名なし自動割当（最少カウント・タイブレーク・
  23P01再試行）、`booking_form` 検証、`intake_responses` 検証、
  IDトークン検証（verify APIモック: 成功/aud不一致/期限切れ/タイムアウト）、
  credential暗号化round-trip、v2.1トークン自動更新（期限7日切り）、
  リマインダー抽出ウィンドウ + `ON CONFLICT` 冪等性、Turnstile検証
  （成功/失敗/タイムアウトfail-open/LIFF免除）、outreach頻度上限・
  attribution recipient照合、名寄せ優先順位、
  LINE機能ゲート判定（`line_booking_enabled` × `credentials.is_active` の
  4象限でLIFF/push/マイページが正しく有効・無効になること）
- 単体（jsdom）: ウィザード遷移、必須項目の動的切替、空き枠グリッド、
  LIFF init失敗時のWebフォールバック、マイページ（一覧・キャンセル導線）
- API: availability・booking-form・reservations（検証強化後の400/409系）、
  排他制約違反→409、line-credentials管理API（権限・マスク）、
  my-reservations / cancel（本人性・deadline）、dormant-candidates・
  campaigns（clinic scope・権限）
- RLS: `clinic_line_credentials` / `line_message_outbox` が anon・
  authenticated から読めないこと、outreach 2テーブルの clinic scope
- E2E（Playwright）: Web導線でウィザード完走→未確定予約表示→確定、
  埋まった枠が選択不可であること
- セキュリティ回帰: `npm test -- --ci --testPathPattern="security|session-management"`
  と `test:pr05:focused` を維持

## Verification

- `npm run lint` / `npm run type-check` / `npm run scan:secrets`
- 対象Jestスイート + `npm run test:pr05:focused`
- migration適用は明示承認後に標準Supabaseワークフローで実施
  （`supabase db push --local --dry-run` でdriftゼロ確認）
- `npm run supabase:types` 再生成（先頭 `export type Json` をCI検証）

## 決定事項（v0.1の未決事項の確定）

| # | 論点 | 決定 | 根拠 |
|---|------|------|------|
| 1 | 指名なし時の自動割当 | 当日割当数最少 + `display_order` タイブレーク + 衝突時1回再試行（A-3） | 公平性と実装単純性の均衡。関数差し替えで将来拡張可 |
| 2 | Messaging APIトークン | チャネルアクセストークンv2.1 + 自動更新（D-2） | 長期トークンは漏洩時失効の運用リスクが医療系テナントに不適 |
| 3 | マイページの版数 | v0.1リリースに含める（D-6、PR 9） | 当日リマインダーのno-show抑止は即時キャンセル導線とセットで成立するため |
| 4 | リマインダー時刻 | 前日 JST 18:00 デフォルト + 当日「N時間前」。いずれも院別設定・当日はデフォルトOFF（C-2） | 夕方は翌日予定の確認行動と合致。固定値でなく設定化して院差に対応 |

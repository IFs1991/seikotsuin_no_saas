# LIFF予約ワークフロー v0.1

## Summary

公開予約フォーム（`/booking/[clinic_id]`）を、LINE LIFFアプリとして動作する
**ワークフロー型（ステップウィザード）予約体験**に刷新する。あわせて、

- 空き枠を院内の予約タイムライン（`reservations` / `blocks` / `clinic_hours`）と連動させる
- 入力必須項目のオン/オフと院独自の質問項目を院側で設定可能にする
- 患者への通知（予約受付・確定・リマインダー・キャンセル）を追加する

を実現する。LIFFに依存しない通常ブラウザ（Web導線）でも同一フォームが
そのまま動作することを必須要件とする（プログレッシブエンハンスメント方針）。

- 対象バージョン: `0.1.0-pilot`
- 関連: `Tiramisu2.md` §20-22（LINE再活性・LIFF構想）、
  `docs/stabilization/spec-rls-tenant-boundary-v0.1.md`（Customer Access Model）
- 既存実装: `src/app/(public)/booking/[clinic_id]/page.tsx`、
  `src/lib/services/public-reservation-service.ts`、
  `src/app/api/public/{menus,resources,reservations}/`

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
- Phase C: 通知（院側メール / 患者メール → LINE push へ拡張）
- Phase D: LIFF統合（IDトークン検証・プロフィール連携・`line_user_id` 名寄せ）

## Non-Goals（本仕様の対象外）

- LINEリッチメニューの自動設定、Bot自動応答
- 休眠患者再活性キャンペーン・offer token・deep link（Tiramisu2 §20-21。将来Phase）
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
Step 6  確認                （全入力の確認 + 同意事項）
Step 7  完了                （予約番号・注意事項・キャンセルポリシー表示）
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
   1人でも空いていれば `available: true`（`resource_ids` に空きスタッフを列挙。
   予約作成時にサーバーが先頭の空きスタッフへ割当）

- キャッシュ: `Cache-Control: no-store`（枠は鮮度優先。menus/resources の
  既存キャッシュ方針は変更しない）
- レート制限: 既存 `/api/public/` 共通制限を適用（middleware変更不要）

### A-3. 予約作成のサーバー側検証強化

`PublicReservationService` に以下を追加する。

- 営業時間内チェック（`clinic_hours` 参照。休診日・特別休業を含む）
- 過去日時の拒否
- `minAdvanceBookingHours` / `maxAdvanceBookingDays` の適用
- `slotMinutes` 境界チェック（現行の「30分固定」文字列チェックを廃止し、
  院設定値でJST基準の境界検証に置換）
- `start_time` はタイムゾーンオフセット付きISO 8601を必須化
  （Zodで `Z` または `+HH:MM` を強制。オフセットなしは400）

### A-4. ダブルブッキングDB排他制約（migration）

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
- 認証側 `/api/reservations`（スタッフ手動予約）にも同じ制約が効くため、
  スタッフ側のダブルブッキングも同時に防止される
- ロールバックSQL: `supabase/rollbacks/` に制約DROPを用意

### A-5. 顧客名寄せの改善

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

### C-2. 患者通知（メール）

- 予約受付時: `customer_email` がある場合のみ受付確認メールをエンキュー
- 予約確定時（院側が `unconfirmed` → `confirmed`）: 確定通知
- キャンセル時: キャンセル通知
- 前日リマインダー: `/api/internal/reservation-reminders`（新規cron、
  `CRON_SECRET` 認証）が翌日分の `confirmed` 予約を抽出しエンキュー。
  `customers.consent_reminder = false` の患者は除外

### C-3. 患者通知（LINE push、Phase D後）

- `line_message_outbox` テーブルを新設（outboxパターンをLINEにも適用）:
  `id / clinic_id / line_user_id / message_type / payload jsonb /
  status(pending|sent|failed) / attempts / last_error / created_at / sent_at`
- `/api/internal/process-line-outbox`（新規、`CRON_SECRET`）が
  Messaging API `POST /v2/bot/message/push` で送信。失敗はattempts+1で
  リトライ（最大3回）、`429` は `Retry-After` 尊重
- 送信対象: 予約受付/確定/リマインダー/キャンセル。
  `line_user_id` が紐づく患者はLINE優先・メールは補完
  （`communication.channels.lineEnabled` が真の院のみ）
- 文面はFlex Messageではなくテキスト+確認URLの最小構成から始める

---

## Phase D: LIFF統合

### D-1. テナント×LINEチャネルのモデル

**院ごとに自院のLINE公式アカウント（Messaging APIチャネル）+
LINE Loginチャネル（LIFFアプリ）を持つ**構成とする。

- 理由: 患者が友だち追加するのは各院のOAであり、push通知の送信元も
  各院のOAである必要があるため。SaaS共通OA方式は採用しない
- 院がLINE Developersで作成した credential を管理画面から登録する

### D-2. credential保管（重要: `clinic_settings` に入れない）

`clinic_settings` は管理APIでクライアントに返るため、secretを置けない。
専用テーブルを新設する（migration + ロールバックSQL）。

```
clinic_line_credentials
  clinic_id                uuid PK/FK
  liff_id                  text            -- 公開可
  login_channel_id         text            -- IDトークンverifyのaud検証用。公開可
  messaging_channel_id     text
  channel_secret_encrypted text            -- AES-256-GCM
  access_token_encrypted   text            -- Messaging API長期トークン。AES-256-GCM
  is_active                boolean
  created_at / updated_at
```

- RLS: 全ロールに対して**deny**（ポリシーなし＝アクセス不可）。
  読み書きは `createAdminClient()`（service role）経由のサーバー処理のみ
- 暗号化鍵: 環境変数 `LINE_CREDENTIALS_ENCRYPTION_KEY`（32byte、
  `src/lib/env.ts` に追加。必須にはせず、未設定時はLINE機能を無効化＝
  fail-closed）
- 管理API: `PUT /api/admin/line-credentials`（`verifyAdminAuth` +
  clinic scope）。GETはsecretをマスクして返す（`****` + 末尾4桁）

### D-3. LIFFフロント

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
- CSP: `https://static.line-scdn.net`（SDK）と `https://api.line.me` を
  `csp-config.ts` に追加（`CSP_ROLLOUT_PHASE` の全フェーズで整合確認）

### D-4. IDトークン検証（サーバー）

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

### D-5. LIFF内マイページ（キャンセル/変更・任意スコープ）

- `GET /api/public/my-reservations`: `line_id_token` 検証済みの
  `line_user_id` に紐づく将来予約の一覧
- キャンセル: `booking_calendar.allowCancellation` と
  `cancellationDeadlineHours` に従い、`POST /api/public/reservations/{id}/cancel`
  （本人性は `line_user_id` 一致で担保。ID/電話などの推測可能な値では
  認可しない）
- 変更は v0.1 では「キャンセル→再予約」導線とする（枠移動APIは作らない）
- LIFF外（Web予約者）のキャンセルはv0.1対象外（院への電話運用のまま）

---

## その他の推奨機能（本仕様に含める/含めない）

| 機能 | 判断 |
|------|------|
| QRコード生成（URL発行画面に追加） | **含める**（Phase Aに小PRで。リッチメニュー登録・院内掲示に必須級） |
| URL発行画面の `window.location.origin` 依存を `NEXT_PUBLIC_APP_URL` に変更 | **含める**（Phase A） |
| `allowOnlineBooking` OFF時のURL発行画面警告 | **含める**（Phase A） |
| 友だち追加導線（完了画面にOA追加ボタン） | 含める（Phase D。`liff_id` 設定済み院のみ） |
| no-show対策（当日朝リマインダー） | 前日リマインダーの設定拡張として将来対応 |
| 再来促進・休眠掘り起こし | 対象外（Tiramisu2 Phase） |
| CAPTCHA/Turnstile | 保留。レート制限で運用し、スパム実害が出たら導入 |

---

## セキュリティ不変条件

- テナント境界: 全ての新規API・サービスは `clinic_id` スコープを
  `createPublicClinicContext` / `ensureClinicAccess` で強制する
- `clinic_line_credentials` は RLS deny + service role限定。クライアントに
  secret平文を返すAPIを作らない
- IDトークン検証の `aud` は**当該院の** `login_channel_id` と一致必須
  （他院のトークンで名寄せされる横断攻撃を防ぐ）
- 公開APIのエラーメッセージから内部情報（他予約の存在有無以上の詳細）を
  漏らさない
- fail-closed: LINE設定・暗号化鍵が無い場合、LINE機能は静かに無効化し
  Web予約は通常動作を維持

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `LINE_CREDENTIALS_ENCRYPTION_KEY` | LINE機能利用時のみ | credential暗号化（AES-256-GCM, 32byte hex） |
| `NEXT_PUBLIC_ENABLE_LIFF_BOOKING` | 任意（デフォルトfalse） | LIFF統合のフィーチャーフラグ。Pilot mode連動 |

## マイグレーション一覧（すべてロールバックSQL同梱）

1. `btree_gist` 有効化 + `reservations_no_overlap` 排他制約（Phase A）
2. `reservations.intake_responses jsonb` 追加（Phase B）
3. `clinic_line_credentials` テーブル + RLS deny（Phase D）
4. `line_message_outbox` テーブル + RLS deny（Phase C-3）

## PR分割計画（1 task = 1 PR）

| PR | 内容 | Phase |
|----|------|-------|
| 1 | 排他制約migration + `SlotConflictError` 正規化 + 既存重複チェックSQL | A |
| 2 | 空き枠API（`PublicAvailabilityService`）+ サーバー側時間検証 + JST統一 | A |
| 3 | ワークフロー型フォームUI（ウィザード化・空き枠グリッド）+ QR/origin/警告の小修正 | A |
| 4 | `booking_form` 設定カテゴリ + 設定UI + `intake_responses` + 公開booking-form API | B |
| 5 | 院側/患者メール通知 + 前日リマインダーcron | C |
| 6 | `clinic_line_credentials` + 管理API + 暗号化ユーティリティ | D |
| 7 | LIFFフロント統合 + IDトークン検証 + 名寄せ + CSP | D |
| 8 | LINE push outbox + 送信cron + 通知のLINE優先化 | C-3 |
| 9 | LIFFマイページ（一覧・キャンセル） | D-5 |

依存関係: 1→2→3 は直列。4は2以降ならいつでも。5は3以降。6→7→8→9 は直列。

## テスト計画

- 単体（node）: `PublicAvailabilityService`（営業時間/休診/ブロック/重複/
  advance window/JST境界）、`booking_form` 検証、`intake_responses` 検証、
  IDトークン検証（verify APIモック: 成功/aud不一致/期限切れ/タイムアウト）、
  credential暗号化round-trip、名寄せ優先順位
- 単体（jsdom）: ウィザード遷移、必須項目の動的切替、空き枠グリッド、
  LIFF init失敗時のWebフォールバック
- API: availability・booking-form・reservations（検証強化後の400/409系）、
  排他制約違反→409、line-credentials管理API（権限・マスク）
- RLS: `clinic_line_credentials` / `line_message_outbox` が anon・
  authenticated から読めないこと
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

## 未決事項（実装前に要決定）

1. `resource_id=any`（指名なし）時の自動割当ポリシー
   （空きスタッフの先頭 / 予約数最少 / ランダム）— 暫定: 予約数最少
2. Messaging APIトークンは長期トークン（v0.1採用）か
   チャネルアクセストークンv2.1（JWT, 30日）か — 暫定: 長期トークン
3. LIFFマイページ（PR 9）をv0.1に含めるか v0.2に送るか
4. 前日リマインダーの送信時刻（暫定: JST 18:00）と院ごと設定化の要否

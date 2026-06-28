# Resend導入実装仕様書 v1.1

対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象機能: 認証メール、予約通知、将来の自動リマインド（F004）

---

## 1. 目的

本仕様書の目的は、`seikotsuin_no_saas` に **Resend** を安全かつ拡張可能な形で導入し、以下を満たすことです。

- Supabase Auth の本番メール送信を有効化する
- 予約作成・変更・キャンセルのトランザクションメールを送る
- 既存の `processApiRequest()` / `clinic_id` 強制 / tenant guard 方針を壊さない
- Outbox パターンで外部メール送信と業務更新を分離する
- 既存の Jest / TDD 運用に載せる
- 将来の F004 自動リマインドへ素直に拡張できるようにする

この repo は Next.js 15 / React 19 / TypeScript / Supabase / Jest / Playwright 構成で、予約 API は `processApiRequest()` と `clinic_id` スコープを前提に設計されています。`DELETE` ではなく `PATCH status='cancelled'` を採用しているため、通知もこの更新モデルに合わせる必要があります。fileciteturn10file0L1-L1 fileciteturn15file0L1-L1

---

## 2. 公式ドキュメント再確認で反映した重要事項

Resend の最新公式ドキュメントを踏まえ、本仕様では以下を前提とします。

1. Resend は Node.js / Next.js 向けの公式 SDK を提供しており、`npm install resend` で導入でき、`resend.emails.send()` で送信します。citeturn388439search0turn897611search5
2. 送信前提として **API キーの発行** と **送信ドメインの検証** が必要です。citeturn388439search0turn206839search0
3. Resend の SMTP は `smtp.resend.com` を使い、username は `resend`、password は API key です。Supabase Auth の Custom SMTP にそのまま差し込めます。citeturn897611search4turn388439search2
4. Resend は idempotency key をサポートしており、API の `POST /emails` と `POST /emails/batch` で重複送信抑止が可能です。SMTP でも `Resend-Idempotency-Key` ヘッダが使えます。citeturn388439search4turn897611search4
5. Webhook は HTTPS JSON で配信され、署名検証には **raw body** を使う必要があります。SDK の `resend.webhooks.verify()` か Svix による検証が推奨されています。citeturn897611search3turn897611search0
6. Resend は batch sending を提供しており、1回の API 呼び出しで最大 100 件まで送れます。ただし batch では attachments と `scheduled_at` が未対応です。citeturn206839search1turn206839search2
7. ドメイン検証では SPF と DKIM が必須で、DMARC は追加推奨です。Resend は送信評判分離のため **サブドメイン利用を推奨** しています。citeturn206839search0turn206839search8
8. Supabase Auth は本番で任意宛先へメール送信するには custom SMTP が必要で、Resend はその対応サービスの一つとして明示されています。citeturn388439search2

---

## 3. 採用方針

### 3.1 結論

Resend の導入は **2レーン構成** にする。

- **Auth レーン**: Supabase Auth → Resend SMTP
- **業務通知レーン**: App Route / server-side service → Resend Email API

### 3.2 この分割にする理由

Auth メールは Supabase 側の責務なので SMTP 接続だけ差し込むのが最短です。一方、予約通知は tenant guard、差分検知、dedupe、retry、webhook 保存が必要なので API ベースの方が制御しやすいです。Supabase の custom SMTP 要件と、既存の clinic guard 方針の両方に適合します。citeturn388439search2 fileciteturn14file0L1-L1

---

## 4. スコープ

### 4.1 In Scope

#### Auth メール
- パスワード再設定
- 招待メール
- メール確認系（Supabase Auth 側のメール）

#### 業務通知
- 予約作成通知
- 予約変更通知
- 予約キャンセル通知
- 将来の前日リマインド（F004）に拡張可能な基盤整備

### 4.2 Out of Scope

- マーケティング一斉配信
- 配信先セグメント機能（F105 の本体）
- 受信メール処理
- 添付ファイル送信
- scheduled send の本格導入

batch sending と scheduling は Resend に存在するが、現時点の通知基盤では不要です。まずは単発通知を確実に運用する方がペイします。citeturn206839search1turn206839search2

---

## 5. ドメイン・DNS 設計

### 5.1 送信ドメイン

送信専用サブドメインを使用する。

推奨例:
- `mail.tiramisu-app.com`
- `auth@mail.tiramisu-app.com` は使わず、From アドレスとして運用

推奨 From:
- `Tiramisu <no-reply@mail.tiramisu-app.com>`
- `Tiramisu通知 <notify@mail.tiramisu-app.com>`

### 5.2 DNS

Resend の推奨どおり、サブドメインで送信評判を分離する。SPF と DKIM は必須、DMARC は追加推奨。Cloudflare 環境では Domain Connect による自動設定も可能だが、再現性のため本番は手動値を記録する。citeturn206839search0turn206839search8

### 5.3 Domain Status

`verified` になるまで本番切替しない。`pending` / `temporary_failure` / `failed` のまま進めない。Resend は過去に検証済みのドメインでも定期検証して状態が変わるため、運用監視対象とする。citeturn206839search0

---

## 6. 全体アーキテクチャ

```text
[Supabase Auth]
   └─ Custom SMTP -> Resend SMTP

[App Router API]
   └─ POST/PATCH /api/reservations
        ├─ processApiRequest / clinic_id guard
        ├─ reservation write
        └─ enqueue email_outbox

[Vercel Cron]
   └─ /api/internal/process-email-outbox
        ├─ pending jobs取得
        ├─ dedupe/idempotency key生成
        ├─ Resend Email API 送信
        ├─ sent/failed 更新
        └─ email_logs 記録

[Resend Webhook]
   └─ /api/webhooks/resend
        ├─ raw body verify
        ├─ event保存
        └─ outbox/log status反映
```

この repo の tenant table access は `processApiRequest()` と `clinic_id` スコープを必須にしているため、メール基盤でも `clinic_id` を outbox に保持し、非APIコードの直接アクセスは server-only + clinic scope で閉じ込める。fileciteturn14file0L1-L1

---

## 7. パッケージ方針

追加依存:

```bash
npm install resend
```

任意追加:
- `@react-email/components`
- `@react-email/render`

ただし初期は React Email を必須にしない。repo は既に TS/Jest で回っているため、まずは **純関数テンプレート + HTML/Text 生成** で十分。後から React Email へ移行できるように abstraction を切る。Resend は Next.js と React ベースのテンプレート送信をサポートしている。citeturn897611search5turn897611search1

---

## 8. 環境変数

```env
# Resend API
RESEND_API_KEY=
RESEND_FROM_DEFAULT="Tiramisu <no-reply@mail.tiramisu-app.com>"
RESEND_FROM_NOTIFY="Tiramisu通知 <notify@mail.tiramisu-app.com>"
RESEND_REPLY_TO="support@tiramisu-app.com"

# Resend SMTP for Supabase Auth
RESEND_SMTP_HOST=smtp.resend.com
RESEND_SMTP_PORT=587
RESEND_SMTP_USERNAME=resend
RESEND_SMTP_PASSWORD=

# Webhook
RESEND_WEBHOOK_SECRET=

# Internal cron
CRON_SECRET=
```

`RESEND_SMTP_PASSWORD` は実質 API key と同一値になる。SMTP host/port/username は公式値に合わせる。citeturn897611search4

---

## 9. ディレクトリ構成

`PROJECT_OVERVIEW.md` の構造に合わせ、`src/lib/notifications` 配下へ置く。repo には既に `src/lib/notifications/` が想定構成として存在する。fileciteturn9file0L1-L1

```text
src/
  lib/
    notifications/
      email/
        types.ts
        provider.ts
        resend-provider.ts
        policy.ts
        dedupe.ts
        processor.ts
        templates/
          reservation-created.ts
          reservation-updated.ts
          reservation-cancelled.ts
          reminder-day-before.ts
  app/
    api/
      internal/
        process-email-outbox/
          route.ts
      webhooks/
        resend/
          route.ts
```

---

## 10. DB 設計

### 10.1 `email_outbox`

```sql
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  reservation_id uuid,
  customer_id uuid,
  template_type text not null,
  dedupe_key text not null,
  resend_idempotency_key text not null,
  to_email text not null,
  from_email text,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','cancelled')),
  attempts int not null default 0,
  provider text not null default 'resend',
  provider_message_id text,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_outbox_dedupe_key_uidx
  on public.email_outbox (dedupe_key);

create index email_outbox_pending_idx
  on public.email_outbox (status, next_attempt_at, created_at);

create index email_outbox_clinic_idx
  on public.email_outbox (clinic_id, created_at desc);
```

### 10.2 `email_logs`

```sql
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references public.email_outbox(id) on delete cascade,
  clinic_id uuid not null,
  event_type text not null,
  provider text not null default 'resend',
  provider_message_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index email_logs_outbox_idx on public.email_logs(outbox_id, created_at);
create index email_logs_clinic_idx on public.email_logs(clinic_id, created_at desc);
```

### 10.3 RLS / アクセス方針

- 一般クライアントから直接触らせない
- server-only service または guarded API からのみ操作
- tenant table guard 方針に合わせ、全操作で `clinic_id` を必須にする

既存 spec では non-API 直接アクセスは `server-only + clinic_id スコープ固定` のみ許容されています。本仕様もそれに合わせる。fileciteturn14file0L1-L1

---

## 11. 通知ポリシー

### 11.1 送信対象イベント

#### `reservation_created`
トリガー:
- `POST /api/reservations` 成功後

#### `reservation_updated`
トリガー:
- `PATCH /api/reservations` 成功後
- 変更対象が以下のいずれかを含む場合のみ
  - `start_time`
  - `end_time`
  - `staff_id`
  - `status`（ただし `cancelled` 以外）

#### `reservation_cancelled`
トリガー:
- `PATCH /api/reservations` 成功後
- `status` が `cancelled` へ遷移した場合

### 11.2 送らない変更

- `notes` のみ変更
- 内部管理用フラグ変更
- UI都合の再取得

`DELETE` を使わず `PATCH status='cancelled'` を使うのが既存 API の契約なので、キャンセル通知は必ず差分検知で発火する。fileciteturn15file0L1-L1

### 11.3 将来の F004

前日リマインドは `reservation.start_time` を基準に別ジョブで enqueue する。予約作成時に即送信しない。要件上、F004 は critical だが未実装であるため、今回の outbox 基盤で将来対応する。fileciteturn13file0L1-L1

---

## 12. Dedupe / Idempotency 方針

### 12.1 二重送信を防ぐ層

#### アプリ側
`dedupe_key` を DB unique index で制御する。

例:
- `reservation_created:{reservationId}:{updatedAtISO}`
- `reservation_updated:{reservationId}:{updatedAtISO}`
- `reservation_cancelled:{reservationId}:{updatedAtISO}`

#### Resend 側
`resend_idempotency_key` を送信リクエストに付与する。

Resend は同じ idempotency key で 24 時間以内の重複リクエストを抑止するため、retry 時に安全。citeturn388439search4

### 12.2 実装原則

- outbox insert 時に `dedupe_key` と `resend_idempotency_key` を同時生成
- retry 時は同じ `resend_idempotency_key` を再利用
- これにより「DB 重複防止 + provider 重複防止」の二重防御にする

---

## 13. Provider 抽象化

### 13.1 Interface

```ts
export type SendEmailInput = {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  idempotencyKey?: string;
};

export type SendEmailResult = {
  provider: 'resend';
  messageId: string;
};

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
```

### 13.2 Resend 実装

`src/lib/notifications/email/resend-provider.ts`

- `new Resend(process.env.RESEND_API_KEY)` を server-only で保持
- `resend.emails.send()` を使用
- API エラーは正規化して投げる

Resend の Node.js / Next.js 公式例に沿い、送信は `resend.emails.send({ from, to, subject, html })` ベースで実装する。citeturn388439search0turn388439search10turn897611search5

### 13.3 API 使用理由

業務通知で SMTP ではなく API を使う理由:
- idempotency key を直接扱いやすい
- response の message ID を取りやすい
- webhook / provider_message_id の紐付けが明確
- server-side error handling と TDD がしやすい

---

## 14. テンプレート方針

### 14.1 初期方針

純関数テンプレートで開始する。

```ts
export function renderReservationUpdatedEmail(input: Payload): {
  subject: string;
  html: string;
  text: string;
}
```

### 14.2 必須テンプレート

- `reservation-created`
- `reservation-updated`
- `reservation-cancelled`
- `reminder-day-before`（雛形のみ）

### 14.3 含める値

最低限:
- 顧客名
- 店舗名
- 予約日時
- 担当者名
- メニュー名
- 変更前 / 変更後（updated のみ）

### 14.4 React Email 採用判断

Resend は React テンプレート送信をサポートするが、初期導入では過剰。テンプレートが 5 種以下なら純関数で十分。複雑化したら React Email に移行する。citeturn897611search5turn897611search1

---

## 15. API 組み込み方針

### 15.1 `/api/reservations` への組み込み

既存 route は `GET/POST/PATCH/DELETE` を持ち、`POST` と `PATCH` は `processClinicScopedBody()` と `processApiRequest()` を通る。ここに同期送信は入れない。予約更新成功後に outbox へ積むだけにする。fileciteturn15file0L1-L1

### 15.2 POST

予約 insert 成功後:
1. 顧客メール取得
2. consent / 宛先存在確認
3. `email_outbox` へ `reservation_created` を insert

### 15.3 PATCH

更新前レコードを読んで差分比較後:
- `status -> cancelled` なら `reservation_cancelled`
- `start_time / end_time / staff_id / status(非cancel)` 変更なら `reservation_updated`
- `notes` のみなら enqueue しない

### 15.4 consent

既存要件では `Customer.consent_reminder` が存在する。通知可否判定でこれを使う。`consent_reminder=false` なら reminder 系を送らない。予約変更/キャンセル通知をどこまで許可制にするかは運用判断だが、少なくとも前日リマインドは opt-out 対応が必要。fileciteturn13file0L1-L1

---

## 16. Processor / Cron

### 16.1 エンドポイント

`GET /api/internal/process-email-outbox`

保護:
- `Authorization: Bearer ${CRON_SECRET}`

### 16.2 処理単位

1 回あたり 20 件まで処理する。

### 16.3 処理フロー

1. `pending` かつ `next_attempt_at <= now()` の job を取得
2. `processing` に更新
3. テンプレート描画
4. `EmailProvider.send()` 実行
5. 成功 → `sent`
6. 失敗 → `failed`, `attempts+1`, `next_attempt_at` 更新
7. `email_logs` に記録

### 16.4 retry

- 1回目失敗: +5分
- 2回目失敗: +15分
- 3回目失敗: +60分
- 4回目以降: 手動調査対象

Resend 側の idempotency key により、同一 job の再送は provider 側でも重複防止できる。citeturn388439search4

### 16.5 batch sending は採用しない

将来的には前日リマインドで batch 化余地があるが、現段階では採用しない。
理由:
- event 単位で個別ログを持ちたい
- attachments / scheduled_at 制限がある
- 単体送信の方がデバッグしやすい

Resend batch は最大100件まで送れるが、F004 本実装時に再評価する。citeturn206839search1turn206839search2

---

## 17. Webhook

### 17.1 エンドポイント

`POST /api/webhooks/resend`

### 17.2 検証

- raw body を `await req.text()` で取得
- `svix-id`, `svix-timestamp`, `svix-signature` を使って verify
- `RESEND_WEBHOOK_SECRET` を使用

Resend は raw body での検証を明示しており、JSON parse 後の再文字列化は不可。citeturn897611search0

### 17.3 受けるイベント

最低限:
- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.complained`
- `email.bounced`
- `email.opened`（任意）
- `email.clicked`（任意）

### 17.4 保存方針

- `provider_message_id` で `email_outbox` と紐付け
- event はすべて `email_logs` に append
- `bounced` / `complained` は suppression 候補として別途 flag 化余地を残す

### 17.5 失敗時の扱い

- verify 失敗 → 400
- 紐付け不可 → `email_logs` には保存、outbox 更新はしない
- 例外 → 500

---

## 18. Supabase Auth SMTP 設定

Supabase Auth の custom SMTP に以下を設定する。

- Host: `smtp.resend.com`
- Port: `587` 推奨（STARTTLS）
- Username: `resend`
- Password: `RESEND_API_KEY`
- Default sender: `no-reply@mail.tiramisu-app.com`

Supabase は production で任意宛先に Auth メールを送るには custom SMTP が必要で、Resend はその対応サービスとして明記されている。SMTP 接続値も Resend 公式値を使う。citeturn388439search2turn897611search4

---

## 19. TDD 方針

### 19.1 TDD を適用する範囲

#### 適用する
- 通知要否判定
- dedupe key / idempotency key 生成
- template rendering
- processor state transition
- webhook verification wrapper
- enqueue service

#### 薄くする
- Resend SDK の内部挙動
- Supabase SMTP 設定
- HTML の細かな見た目

repo には既に Jest による ReservationService テスト文化があり、TDD 前提で実装されています。メール基盤も同じ流儀に乗せる。fileciteturn16file0L1-L1

### 19.2 Red-Green-Refactor 順序

1. `policy.test.ts`
   - どの変更で通知するか
2. `dedupe.test.ts`
   - key が安定生成されるか
3. `templates/*.test.ts`
   - subject / text / html に必要項目が入るか
4. `enqueue-email.test.ts`
   - clinic_id / template_type / dedupe_key が正しいか
5. `processor.test.ts`
   - pending -> sent / failed 遷移
6. `webhook-resend.test.ts`
   - raw body verify と log 保存
7. route integration test
   - `POST/PATCH /api/reservations` で enqueue されるか

### 19.3 Definition of Done

- 予約作成 / 変更 / キャンセルの enqueue が route test で確認済み
- processor が成功/失敗/ retry を unit test で確認済み
- webhook verify が raw body 前提で test 済み
- staging 実送信で Gmail/Outlook などに到達確認済み
- Supabase Auth の reset / invite が本番相当宛先へ送信確認済み

---

## 20. 実装順

### Phase A: 基盤
1. `resend` package 追加
2. domain verify
3. Supabase Auth SMTP 切替

### Phase B: DB
4. `email_outbox` migration
5. `email_logs` migration
6. type generation 更新

### Phase C: App
7. provider abstraction
8. template / policy / dedupe 実装
9. enqueue service 実装
10. processor + cron route 実装
11. webhook route 実装

### Phase D: Route 統合
12. `POST /api/reservations` enqueue
13. `PATCH /api/reservations` diff-based enqueue

### Phase E: 検証
14. Jest / integration test
15. staging実送信
16. 本番段階投入

---

## 21. 将来拡張

### 21.1 F004 自動リマインド

要件上、自動リマインドは critical で No-show 削減の主施策です。今回の outbox を利用して、前日 19:00 などの時刻で enqueue する scheduler を追加すれば対応可能です。fileciteturn13file0L1-L1

### 21.2 F105 セグメント配信

現時点では out of scope。もしやるなら別 queue / unsubscribe / audience 管理が必要。transactional と混ぜない。

---

## 22. 結論

`seikotsuin_no_saas` に対する Resend 導入の最適解は以下です。

- **Auth**: Supabase Auth + Resend SMTP
- **業務通知**: Resend API + outbox + cron + webhook
- **重複防止**: DB dedupe + Resend idempotency key
- **セキュリティ**: `clinic_id` スコープ固定 + raw-body webhook verify
- **実装手法**: 部分TDD

この構成なら、公式ドキュメントに沿いながら、現在の repo の tenant guard・予約更新モデル・テスト文化を壊さずに導入できます。citeturn388439search0turn388439search4turn897611search0turn897611search4turn206839search0 fileciteturn14file0L1-L1 fileciteturn15file0L1-L1

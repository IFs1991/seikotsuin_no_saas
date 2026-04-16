# メール / LINE 送信責務整理

## 1. 目的

本書は、Tiramisu における送信チャネルの責務を整理するための内部ドキュメントである。

現在の実装では、同じ「Resend」という言葉でも以下の2系統が混在しやすい。

- アプリ独自の通知メール送信
- Supabase Auth が送る認証メールの配送基盤

さらに将来、LINE を CS / オンボーディング導線として追加する計画があるため、本書では以下3層に分けて整理する。

- Transactional App Email
- Auth Email
- LINE Support Channel

---

## 2. 結論

現在の実装を一言でまとめると、次の通りである。

- **予約通知などの業務メールは、Tiramisu が Resend API を直接利用して送る**
- **新規登録確認メールや招待メールは、Supabase Auth が送る**
- **パスワードリセットメールも Supabase Auth が送る**
- **Supabase Auth の SMTP プロバイダとして Resend を使う想定になっている**
- **LINE はまだ本実装前だが、将来はメールとは別責務のサポートチャネルとして扱うべき**

---

## 3. 全体像

```text
Tiramisu
├─ Transactional App Email
│  ├─ 予約作成 / 変更 / キャンセル / リマインド
│  ├─ Resend API を直接使用
│  └─ outbox / webhook / logs をアプリ側で管理
│
├─ Auth Email
│  ├─ 新規登録確認
│  ├─ 招待メール
│  ├─ 将来のパスワードリセット
│  └─ Supabase Auth が送信し、SMTP に Resend を使う想定
│
└─ LINE Support Channel
   ├─ CS 導線
   ├─ オンボーディング導線
   ├─ 停滞時の再開導線
   └─ Messaging API / Webhook の責務
```

---

## 4. Transactional App Email

### 4.1 役割

Transactional App Email は、Tiramisu の業務イベントに紐づく通知メールを送る責務を持つ。

現時点では以下を主対象とする。

- 予約作成通知
- 予約変更通知
- 予約キャンセル通知
- 前日リマインド

### 4.2 実装の単一ソース

現在の実装は、以下のファイル群が中核である。

- [Resend provider](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/notifications/email/resend-provider.ts)
- [Email processor](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/notifications/email/processor.ts)
- [Reservation enqueue](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/notifications/email/reservation-enqueue.ts)
- [Enqueue helper](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/notifications/email/enqueue-email.ts)
- [Cron route](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/internal/process-email-outbox/route.ts)
- [Webhook route](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/webhooks/resend/route.ts)
- [Webhook handler](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/notifications/email/webhook-handler.ts)

### 4.3 送信方式

この層では `Resend API` を直接利用する。

- 実装クラス: [ResendEmailProvider](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/notifications/email/resend-provider.ts)
- 利用環境変数:
  - `RESEND_API_KEY`
  - `RESEND_FROM_DEFAULT`
  - `RESEND_FROM_NOTIFY`
  - `RESEND_REPLY_TO`
  - `RESEND_WEBHOOK_SECRET`

### 4.4 運用責務

この層の送信状態は、Tiramisu 側が自前で管理する。

- `email_outbox`
- `email_logs`
- retry
- idempotency
- provider_message_id の保持
- webhook による delivered / failed 追記

つまり、**通知メールの送達状態と再送制御はアプリ責務** である。

---

## 5. Auth Email

### 5.1 役割

Auth Email は、認証フローに紐づくメールを送る責務を持つ。

現在のコードから確認できる主対象は以下である。

- 新規登録確認メール
- 確認メール再送
- スタッフ招待メール
- パスワードリセットメール

将来的には以下もこの層に属する。

- Magic Link 系

### 5.2 実装の単一ソース

現在の実装参照先は以下。

- [Owner register actions](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/register/actions.ts)
- [Clinic login actions](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/login/actions.ts)
- [Admin staff invites route](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/staff/invites/route.ts)
- [Onboarding invites route](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/onboarding/invites/route.ts)
- [Public admin actions](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/admin/actions.ts)
- [Invite actions](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/invite/actions.ts)

### 5.3 現在使われている Auth API

コード上、以下の Supabase Auth API が使われている。

- `supabase.auth.signUp(...)`
- `supabase.auth.resend({ type: 'signup' })`
- `adminClient.auth.admin.inviteUserByEmail(...)`
- `supabase.auth.resetPasswordForEmail(...)`

該当箇所:

- [register/actions.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/register/actions.ts): `signUp`, `resend`
- [admin/staff/invites/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/staff/invites/route.ts): `inviteUserByEmail`
- [onboarding/invites/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/onboarding/invites/route.ts): `inviteUserByEmail`
- [forgot-password/actions.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/forgot-password/actions.ts): `resetPasswordForEmail`

### 5.4 送信方式

この層では、Tiramisu が Resend API を直接叩いていない。

代わりに、**Supabase Auth がメール送信を担当し、その SMTP に Resend を使う想定** である。

根拠:

- [.env.local.example](/C:/Users/seekf/Desktop/seikotsuin_management_saas/.env.local.example)
- [.env.production.example](/C:/Users/seekf/Desktop/seikotsuin_management_saas/.env.production.example)

上記には以下が定義されている。

- `RESEND_SMTP_HOST=smtp.resend.com`
- `RESEND_SMTP_PORT=587`
- `RESEND_SMTP_USERNAME=resend`
- `RESEND_SMTP_PASSWORD=...`

コメントも `Resend SMTP (Supabase Auth用)` となっている。

### 5.5 運用責務

この層では、メール本文生成や送達状態の主要責務は Supabase Auth 側に寄る。

そのため、Transactional App Email とは責務が異なる。

- Tiramisu 側:
  - `signUp`
  - `resend`
  - `inviteUserByEmail`
  - redirect URL の指定
- Supabase Auth 側:
  - 認証メール本文生成
  - メール送信契約
  - SMTP 利用

### 5.6 パスワードリセットの実装位置

パスワードリセットは、現在のコードベースでも **Auth Email** 層として実装されている。

- [forgot-password/actions.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/forgot-password/actions.ts)
  - `supabase.auth.resetPasswordForEmail(...)`
  - `redirectTo = ${NEXT_PUBLIC_APP_URL}/admin/callback?next=/reset-password/{source}`
- [reset-password/actions.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/reset-password/actions.ts)
  - `supabase.auth.updateUser({ password })`

つまり、パスワードリセットは Resend API を Tiramisu 側から直接呼ぶのではなく、
**Supabase Auth SMTP = Resend** の責務に載せている。

---

## 6. LINE Support Channel

### 6.1 役割

LINE Support Channel は、将来の CS / オンボーディング入口となる責務を持つ。

この層は、通知メールや Auth メールの代替ではない。

主な役割は以下。

- CS 導線
- オンボーディング導線
- 停滞ユーザーの再開導線
- 有人引き継ぎ導線

### 6.2 想定構成

現在の要件整理では、以下の責務を想定する。

- LINE Messaging API
- Webhook 受信
- AI による一次案内
- deep link 返却
- support ticket 起票

関連要件書:

- [LINE AI agent requirements](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/tiramisu_line公式アカウントaiエージェント要件定義_v_0.md)

### 6.3 メール層との違い

LINE Support Channel は、送達ログよりも以下の価値に寄る。

- 今やるべきことの案内
- 設定画面への遷移
- unresolved の有人化
- 停滞解消

したがって、**メール送信責務とは分けて設計する必要がある**。

---

## 7. 3層の責務比較

| 層 | 主目的 | 現在の送信主体 | 主なコード | 状態管理主体 |
| --- | --- | --- | --- | --- |
| Transactional App Email | 予約通知、業務通知 | Tiramisu + Resend API | `src/lib/notifications/email/*`, `src/app/api/internal/process-email-outbox/route.ts`, `src/app/api/webhooks/resend/route.ts` | Tiramisu |
| Auth Email | 登録、招待、将来のリセット | Supabase Auth + Resend SMTP | `src/app/(public)/register/actions.ts`, `src/app/api/admin/staff/invites/route.ts`, `src/app/api/onboarding/invites/route.ts` | Supabase Auth 中心 |
| LINE Support Channel | CS、オンボ、再開導線 | LINE Messaging API + 将来のAI層 | 未本実装、要件は `docs/tiramisu_line公式アカウントaiエージェント要件定義_v_0.md` | Tiramisu + LINE |

---

## 8. 今後の設計ルール

今後の混乱を避けるため、設計と会話の中で以下の用語を固定することを推奨する。

### 8.1 推奨ラベル

- `Transactional App Email`
  - 予約通知などのアプリ独自メール
- `Auth Email`
  - 登録、招待、パスワードリセットなどの認証メール
- `LINE Support Channel`
  - CS / オンボーディング導線

### 8.2 追加実装時の判断ルール

- 予約、来院、業務イベントに紐づくものは **Transactional App Email**
- 認証、本人確認、招待に紐づくものは **Auth Email**
- 会話、案内、再開、エスカレーションに紐づくものは **LINE Support Channel**

### 8.3 調査時の切り分けルール

メール障害時は、まずどの層かを判定する。

- 予約通知が届かない
  - Transactional App Email を調べる
  - `email_outbox`, `email_logs`, Resend webhook を見る
- 招待メールが届かない
  - Auth Email を調べる
  - Supabase Auth 契約、SMTP 設定、`inviteUserByEmail` 呼び出しを確認する
- パスワードリセットメールが届かない
  - Auth Email を調べる
  - Supabase Auth 契約、SMTP 設定、`resetPasswordForEmail` 呼び出しを確認する
- LINE で案内されない
  - LINE Support Channel を調べる
  - webhook, event, AI 応答、deep link を確認する

---

## 9. 補足

現在の構成は設計として自然であり、無理に一本化しない方がよい。

理由:

- Transactional App Email はアプリ独自のテンプレート、ログ、再送制御が必要
- Auth Email は Supabase Auth 契約に従う方が自然
- LINE Support Channel はメールとは異なる導線価値を持つ

したがって、今後の整理方針としては **送信チャネルを分離し、責務ごとに運用する** のが最適である。

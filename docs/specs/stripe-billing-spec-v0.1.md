# Tiramisu Stripe Billing Specification v0.1

## 0. 文書情報

| 項目 | 内容 |
|---|---|
| 文書名 | Tiramisu Stripe Billing Specification v0.1 |
| 対象 | グループ整骨院向け親契約・小テナント課金 |
| 決済基盤 | Stripe Billing / Stripe Checkout / Stripe Customer Portal |
| 想定プロダクト | Tiramisu 整骨院管理SaaS |
| 作成日 | 2026-04-24 |
| ステータス | Draft |

---

## 1. 目的

Tiramisu に Stripe Billing を導入し、グループ整骨院向けに以下の課金モデルを実現する。

- HQ / 親テナントを契約主体として管理する
- 小テナント / 子院を追加課金対象として管理する
- Stripe Customer / Subscription / Subscription Item と Tiramisu の tenant 構造を対応させる
- 決済、請求、支払い失敗、解約、利用停止をアプリ状態と同期する
- 将来的なオプション課金、初期導入費、院数追加、プラン変更に耐える設計にする

本仕様では、初期MVPとして **Stripe Checkout による初回契約**、**Subscription Item quantity による小テナント数課金**、**Stripe Webhook による状態同期** を対象とする。

---

## 2. 基本方針

### 2.1 課金モデル

Tiramisu の課金単位はユーザーアカウントではなく、**契約組織 / HQ** とする。

| Tiramisu概念 | Stripe概念 | 課金上の意味 |
|---|---|---|
| billing_account | Customer | 契約会社 / 請求先 |
| subscription | Subscription | 月額契約 |
| HQ基本料金 | Subscription Item | 基本月額 |
| 小テナント追加料金 | Subscription Item quantity | 子院数に応じた追加課金 |
| 初期導入費 | one-time Price / Invoice Item | 単発請求 |
| billing_events | internal event log | アプリ内の課金履歴 |
| stripe_webhook_events | Stripe event log | Webhook冪等性管理 |

### 2.2 重要原則

- 親アカウント作成だけでは課金開始しない
- 小テナント作成だけでは課金開始しない
- 課金開始は `subscription.active` または `clinic_billing_unit.active` によって明示する
- 小テナントは `active + is_billable = true` の場合のみ課金数量に含める
- Stripe上の院数は、Tiramisu側の課金対象院数から再計算する
- Stripe Portalで院数変更はさせない
- 院数変更はTiramisu側 admin UI から行う
- Webhookは必ず冪等処理する
- Tiramisu DBを契約状態のアプリ内SSOTとし、Stripeは決済・請求のSSOTとする

---

## 3. スコープ

### 3.1 MVPで実装する範囲

- Stripe Customer 作成
- Stripe Checkout Session 作成
- Stripe Subscription 作成
- Stripe Subscription Item の保存
- 小テナント有効化時の quantity 更新
- Stripe Webhook 受信
- subscription status 同期
- invoice payment 状態同期
- admin画面での請求状態表示
- Stripe Customer Portal 起動
- Webhook冪等性テーブル
- billing account / subscription / billing unit のDB管理

### 3.2 MVPでは実装しない範囲

- usage-based billing
- seat課金
- オプション機能課金
- 顧客によるPortal上でのプラン変更
- 自動日割り請求の細かい制御
- 請求書PDFの独自生成
- Stripe Connect
- 複数通貨対応
- 年額契約
- クーポン / 割引コード
- 税計算の本格対応

---

## 4. Stripe商品設計

### 4.1 Product / Price

Stripe上には最低限、以下の Product / Price を作成する。

#### Product: Tiramisu Group Plan

| Stripe Price | 種別 | interval | 用途 |
|---|---|---|---|
| `TIRAMISU_GROUP_BASE_MONTHLY` | recurring | month | HQ基本料金 |
| `TIRAMISU_ADDITIONAL_CLINIC_MONTHLY` | recurring | month | 追加小テナント料金 |
| `TIRAMISU_INITIAL_SETUP` | one_time | - | 初期導入費 |

### 4.2 Stripe Price ID の管理

Stripe Price ID は環境変数またはDBの plans テーブルで管理する。

MVPでは環境変数でよい。

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_GROUP_BASE_MONTHLY=
STRIPE_PRICE_ADDITIONAL_CLINIC_MONTHLY=
STRIPE_PRICE_INITIAL_SETUP=
STRIPE_BILLING_PORTAL_RETURN_URL=
```

ただし将来的には `billing_plans` テーブル化する。

---

## 5. DB設計

### 5.1 billing_accounts

契約主体を管理する。

```sql
create table billing_accounts (
  id uuid primary key default gen_random_uuid(),
  root_clinic_id uuid not null references clinics(id),
  billing_owner_user_id uuid references auth.users(id),
  billing_email text,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  status text not null default 'draft',
  plan_code text not null default 'group_standard',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(root_clinic_id),
  unique(stripe_customer_id)
);
```

#### status

| status | 意味 | 利用可否 |
|---|---|---|
| `draft` | 未契約 | 管理者のみ |
| `checkout_pending` | Checkout作成済み、決済未完了 | 管理者のみ |
| `trialing` | トライアル中 | 可 |
| `active` | 契約中 | 可 |
| `past_due` | 支払い遅延 | 猶予つき可 |
| `suspended` | 停止 | 不可 |
| `canceled` | 解約済み | 不可 |

---

### 5.2 subscriptions

Stripe subscription とアプリ内契約を対応させる。

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references billing_accounts(id),
  stripe_subscription_id text,
  stripe_base_item_id text,
  stripe_additional_clinic_item_id text,
  stripe_latest_invoice_id text,
  status text not null default 'draft',
  plan_code text not null,
  currency text not null default 'JPY',
  base_price_snapshot integer not null default 0,
  included_clinic_count integer not null default 0,
  additional_clinic_unit_price_snapshot integer not null default 0,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stripe_subscription_id)
);
```

#### 方針

- 1 billing_account に active subscription は1つまで
- Stripe Subscription ID は Checkout完了またはWebhookで保存する
- Priceの金額は snapshot として保存する
- plan変更時は新しいsnapshotを残す

---

### 5.3 subscription_items

アプリ内で月額見込みを再計算・表示するための明細。

```sql
create table subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id),
  stripe_subscription_item_id text,
  item_type text not null,
  quantity integer not null default 1,
  unit_price_snapshot integer not null default 0,
  amount_snapshot integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stripe_subscription_item_id)
);
```

#### item_type

| item_type | 意味 |
|---|---|
| `base_hq` | HQ基本料金 |
| `additional_clinic` | 追加小テナント料金 |
| `initial_setup` | 初期導入費 |
| `module` | 将来のオプション |
| `seat` | 将来のseat課金 |

---

### 5.4 clinic_billing_units

小テナントごとの課金対象状態を管理する。

```sql
create table clinic_billing_units (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references billing_accounts(id),
  clinic_id uuid not null references clinics(id),
  is_billable boolean not null default false,
  billing_status text not null default 'pending',
  stripe_quantity_included boolean not null default false,
  activated_at timestamptz,
  suspended_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(clinic_id)
);
```

#### billing_status

| status | 意味 | Stripe quantity対象 |
|---|---|---|
| `pending` | 作成済み、未運用 | No |
| `active` | 運用中 | Yes |
| `suspended` | 停止中 | No |
| `cancel_scheduled` | 解約予定 | 原則Yes |
| `canceled` | 解約済み | No |

---

### 5.5 stripe_webhook_events

Webhook冪等性管理。

```sql
create table stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);
```

#### 方針

- 受信したStripe event idを必ず保存する
- 既に処理済みのevent idは再処理しない
- 処理失敗時は `processing_error` を残す
- 失敗したWebhookを再処理できるようにする

---

### 5.6 billing_events

アプリ内の監査用イベントログ。

```sql
create table billing_events (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid references billing_accounts(id),
  subscription_id uuid references subscriptions(id),
  clinic_id uuid references clinics(id),
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

---

## 6. API設計

### 6.1 POST /api/admin/billing/checkout

Stripe Checkout Sessionを作成する。

#### 権限

- `admin` のみ
- 対象 root clinic が `clinic_scope_ids` 内であること

#### Request

```json
{
  "billing_account_id": "uuid",
  "success_url": "https://app.example.com/admin/billing/success",
  "cancel_url": "https://app.example.com/admin/billing"
}
```

#### 処理

1. billing_account を取得
2. root_clinic が scope 内か検証
3. Stripe Customer がなければ作成
4. active billable clinic count を算出
5. included clinic count を差し引いて additional quantity を算出
6. Stripe Checkout Session を `mode=subscription` で作成
7. line_items に base price と additional clinic price を設定
8. `stripe_checkout_session_id` を保存
9. Checkout URL を返す

#### Response

```json
{
  "success": true,
  "data": {
    "checkout_url": "https://checkout.stripe.com/..."
  }
}
```

---

### 6.2 POST /api/admin/billing/portal

Stripe Customer Portal Session を作成する。

#### 用途

- 支払い方法更新
- 請求書確認
- 領収書確認
- 解約導線

#### 方針

Stripe Portal では小テナント数量変更を許可しない。院数変更は必ずTiramisu管理画面で行う。

#### Request

```json
{
  "billing_account_id": "uuid",
  "return_url": "https://app.example.com/admin/billing"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "portal_url": "https://billing.stripe.com/..."
  }
}
```

---

### 6.3 GET /api/admin/billing/account

請求アカウントと契約状態を取得する。

#### Response

```json
{
  "success": true,
  "data": {
    "billing_account": {
      "id": "uuid",
      "status": "active",
      "billing_email": "hq@example.com",
      "stripe_customer_id": "cus_xxx"
    },
    "subscription": {
      "id": "uuid",
      "status": "active",
      "stripe_subscription_id": "sub_xxx",
      "base_price_snapshot": 100000,
      "included_clinic_count": 10,
      "additional_clinic_unit_price_snapshot": 8000
    },
    "usage": {
      "active_billable_clinic_count": 13,
      "included_clinic_count": 10,
      "additional_billable_count": 3,
      "estimated_monthly_total": 124000
    }
  }
}
```

---

### 6.4 GET /api/admin/billing/units

小テナント課金状態一覧を取得する。

#### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "clinic_id": "uuid",
        "clinic_name": "渋谷院",
        "billing_status": "active",
        "is_billable": true,
        "activated_at": "2026-04-24T00:00:00Z"
      }
    ],
    "summary": {
      "active_billable_count": 13,
      "pending_count": 2,
      "suspended_count": 1
    }
  }
}
```

---

### 6.5 PATCH /api/admin/billing/units/[clinic_id]

小テナントの課金状態を変更する。

#### Request

```json
{
  "billing_status": "active",
  "is_billable": true,
  "proration_behavior": "none"
}
```

#### 処理

1. 対象 clinic が scope 内か検証
2. 対象 clinic が billing_account 配下か検証
3. clinic_billing_units を更新
4. active billable count を再計算
5. Stripe additional clinic subscription item の quantity を更新
6. subscription_items を再計算
7. billing_events と AuditLogger に記録

#### proration_behavior

MVPでは `none` をデフォルトとする。

理由:

- 顧客説明が簡単
- 請求書が読みやすい
- 月中追加の扱いで揉めにくい

---

### 6.6 POST /api/webhooks/stripe

Stripe Webhookを受信する。

#### 注意

- このAPIは通常のCSRF保護対象外にする
- 代わりに Stripe signature verification を必須にする
- raw body を使って署名検証する
- event id で冪等性を担保する

#### 受信対象イベント

| Stripe Event | 処理 |
|---|---|
| `checkout.session.completed` | customer/subscription ID 保存 |
| `customer.subscription.created` | subscription 作成/同期 |
| `customer.subscription.updated` | status / period 同期 |
| `customer.subscription.deleted` | canceled 同期 |
| `invoice.paid` | active維持、latest_invoice保存 |
| `invoice.payment_failed` | past_due化 |
| `invoice.finalization_failed` | billing issue記録 |
| `customer.subscription.trial_will_end` | 通知イベント記録 |

---

## 7. Stripe status と Tiramisu status の対応

| Stripe status | Tiramisu subscription status | Tiramisu billing account status | 利用可否 |
|---|---|---|---|
| `incomplete` | `pending_payment` | `checkout_pending` | 不可 |
| `incomplete_expired` | `expired` | `draft` | 不可 |
| `trialing` | `trialing` | `trialing` | 可 |
| `active` | `active` | `active` | 可 |
| `past_due` | `past_due` | `past_due` | 猶予つき可 |
| `unpaid` | `suspended` | `suspended` | 不可 |
| `canceled` | `canceled` | `canceled` | 不可 |
| `paused` | `paused` | `suspended` | 不可 |

---

## 8. quantity計算

### 8.1 基本式

```text
active_count = count(clinic_billing_units where billing_status = 'active' and is_billable = true)
additional_quantity = max(0, active_count - included_clinic_count)
estimated_total = base_price_snapshot + additional_quantity * additional_clinic_unit_price_snapshot
```

### 8.2 Stripe quantity

Stripe の additional clinic item quantity は `additional_quantity` に同期する。

例:

```text
included_clinic_count = 10
active_billable_clinic_count = 13
additional_quantity = 3
Stripe additional clinic item quantity = 3
```

---

## 9. tenant作成との連携

### 9.1 child clinic 作成時

既存の `/api/admin/tenants` で `parent_id != null` の clinic が作成された場合:

1. parent clinic の billing_account を検索
2. billing_account が存在する場合、`clinic_billing_units` を作成
3. 初期状態は以下

```json
{
  "billing_status": "pending",
  "is_billable": false
}
```

### 9.2 root clinic 作成時

`parent_id = null` の clinic 作成時:

- billing_account は自動作成しない
- onboarding または `/admin/billing` から明示的に作成する

---

## 10. Admin UI仕様

### 10.1 /admin/billing

請求概要画面。

#### 表示項目

- 契約状態
- プラン名
- Stripe Customer ID
- Stripe Subscription ID
- 基本料金
- 含まれる院数
- 有効な課金対象院数
- 追加課金対象数
- 月額見込み
- 現在の請求期間
- 支払い状態
- Checkout開始ボタン
- Customer Portalを開くボタン

### 10.2 /admin/billing/clinics

小テナント課金管理画面。

#### 表示項目

| 項目 | 内容 |
|---|---|
| 院名 | clinic name |
| 親テナント | root clinic |
| 課金状態 | pending / active / suspended |
| 課金対象 | true / false |
| 有効化日 | activated_at |
| 操作 | 有効化 / 停止 / 課金対象切替 |

### 10.3 UIルール

- `draft` / `pending` は黄色系表示
- `active` は緑系表示
- `past_due` は赤系表示
- `suspended` / `canceled` はグレー系表示
- 金額はJPYカンマ区切り
- 課金状態変更時は確認モーダル必須
- Stripe quantity更新失敗時はDB更新もrollbackする、または補正ジョブ対象にする

---

## 11. 権限設計

| 操作 | admin | clinic_admin | manager | staff |
|---|---:|---:|---:|---:|
| billing account 閲覧 | ○ | × | × | × |
| Checkout作成 | ○ | × | × | × |
| Portal作成 | ○ | × | × | × |
| 小テナント課金状態変更 | ○ | × | × | × |
| 月額見込み閲覧 | ○ | × | × | × |
| Webhook受信 | system | system | system | system |

MVPでは `admin` のみ。将来的に `billing_admin` ロールを追加可能にする。

---

## 12. セキュリティ方針

- `STRIPE_SECRET_KEY` はサーバー環境変数のみ
- `STRIPE_WEBHOOK_SECRET` はサーバー環境変数のみ
- Stripe webhook は署名検証必須
- billing API は `processApiRequest` を通す
- Webhook route は CSRF ではなくStripe署名で保護する
- billing系テーブルはclient direct access禁止
- RLSはfail-closed
- service role使用時は必ずscope検証を入れる

---

## 13. エラー設計

| ケース | HTTP | メッセージ |
|---|---:|---|
| billing accountなし | 404 | 請求アカウントが見つかりません |
| Stripe Customer作成失敗 | 502 | Stripe顧客情報の作成に失敗しました |
| Checkout作成失敗 | 502 | 決済画面の作成に失敗しました |
| subscriptionなし | 404 | 契約情報が見つかりません |
| quantity更新失敗 | 502 | Stripe契約数量の更新に失敗しました |
| webhook署名不正 | 400 | Invalid Stripe signature |
| event重複 | 200 | already_processed |
| 権限なし | 403 | 請求情報へのアクセス権限がありません |

---

## 14. 実装順序

### Phase 1: DB

- `billing_accounts`
- `subscriptions`
- `subscription_items`
- `clinic_billing_units`
- `stripe_webhook_events`
- `billing_events`

### Phase 2: Stripe Client

- `src/lib/stripe/server.ts`
- env validation
- test mode / live mode の切替

### Phase 3: Checkout

- `POST /api/admin/billing/checkout`
- Stripe Customer作成
- Checkout Session作成
- Checkout URL返却

### Phase 4: Webhook

- `POST /api/webhooks/stripe`
- `checkout.session.completed`
- `customer.subscription.updated`
- `invoice.paid`
- `invoice.payment_failed`

### Phase 5: Quantity更新

- `PATCH /api/admin/billing/units/[clinic_id]`
- Stripe subscription item quantity 更新
- subscription_items再計算

### Phase 6: Admin UI

- `/admin/billing`
- `/admin/billing/clinics`
- Checkout開始ボタン
- Portal導線

---

## 15. テスト要件

### Unit Test

- additional quantity計算
- estimated total計算
- status mapping
- webhook event冪等処理
- Stripe署名検証エラー

### API Test

- Checkout作成
- billing accountなしで404
- scope外root clinicで403
- quantity更新
- Stripe API失敗時のエラー
- Webhook重複受信

### Integration Test

- billing account作成
- Checkout完了Webhook受信
- subscription保存
- child clinic active化
- Stripe quantity更新

### E2E

- adminログイン
- billing画面表示
- Checkoutボタン確認
- child clinic課金対象化
- 月額見込み更新

---

## 16. MVP受入基準

- [ ] Stripe Customerを作成できる
- [ ] Stripe Checkout Sessionを作成できる
- [ ] Checkout完了Webhookでsubscription情報を保存できる
- [ ] subscription statusをDBへ同期できる
- [ ] child clinicをpendingで作成できる
- [ ] child clinicをactive化できる
- [ ] active clinic数からStripe quantityを更新できる
- [ ] 月額見込みをadmin画面に表示できる
- [ ] Stripe Portalを開ける
- [ ] invoice.payment_failedでpast_due化できる
- [ ] webhook重複処理が冪等である
- [ ] scope外tenantのbilling情報にアクセスできない

---

## 17. 非推奨設計

### 17.1 Stripe Portalで院数変更させる

避ける。Tiramisu側の小テナント状態とズレるため。

### 17.2 clinicsテーブルにStripe IDを直書きする

避ける。tenant責務とbilling責務が混ざるため。

### 17.3 child clinic作成と同時にStripe quantityを増やす

避ける。初期設定や仮作成で課金されると揉めるため。

### 17.4 最初からusage-based billingにする

避ける。院数は高頻度な従量ではなく、比較的安定した契約数量だから。

---

## 18. 結論

Stripe前提のTiramisu課金設計は以下で固定する。

```text
billing_account = Stripe Customer
subscription = Stripe Subscription
HQ基本料 = base subscription item
小テナント追加料金 = additional clinic subscription item quantity
初期導入費 = one-time price / invoice item
数量変更 = Tiramisu admin UIから行いStripe quantityへ同期
状態同期 = Stripe Webhook
請求書・支払い方法 = Stripe Customer Portal
```

最初に作るべきは、CheckoutとWebhookである。  
Portal、quantity更新、admin UIはその次。  
usage-based billing、seat課金、オプション課金はMVP後でよい。

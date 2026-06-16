# Stripe Billing Spec v0.2

- Status: draft
- Date: 2026-06-15
- File: `docs/stabilization/spec-stripe-billing-v0.2.md`
- Target repository: `IFs1991/seikotsuin_management_saas`
- Feature: マルチテナント SaaS の課金基盤（Stripe）
- Product: Tiramisu
- Pricing: **TBD**（金額は本仕様では確定しない。Stripe Price ID の差し替えで対応する）
- Supersedes: `spec-stripe-billing-v0.1.md`

## Related specs

- `spec-rls-tenant-boundary-v0.1.md`
- `spec-auth-role-alignment-v0.1.md`
- `spec-manager-admin-section-v0.1.md`

---

## 0. Executive Summary

Tiramisu の課金基盤は、Stripe Billing を正本として、アプリ側は契約状態・店舗数・アクセス制御に必要な最小情報を同期キャッシュとして保持する。

MVP では以下を実装する。

1. **Single Clinic Plan**  
   単独院向け。root clinic 自身を契約主体かつ運営店舗として扱う。

2. **Group Plan**  
   複数店舗グループ向け。本部 root clinic を契約主体とし、子店舗数を課金対象とする。

3. **Stripe Checkout**  
   初回契約・再契約・プラン開始に使う。

4. **Stripe Customer Portal**  
   支払い方法変更、請求履歴確認、解約導線に使う。

5. **テナント追加課金**  
   `/admin/tenants` から店舗追加を行い、Stripe subscription item の quantity 更新後に clinic を有効化する。

6. **webhook 同期**  
   Stripe subscription / invoice / checkout event を受け、`subscriptions` を同期する。

7. **解約・支払い失敗・再契約・PoC override**  
   商用運用で詰まる例外系を先に仕様化する。

本仕様の目的は、Tiramisu を「無料で便利に使われる社内ツール」ではなく、**店舗数に応じて MRR が増える Vertical SaaS** にすることである。

---

## 1. Background / Decisions

### 1.1 決定事項

- 契約主体は「顧客の本部 / 単独院」。
- `admin` は SaaS 運営者ではなく、顧客組織の本部管理者。
- 従業員アカウントは課金対象外。seat 課金しない。
- 課金単位は以下の2系統。
  - Single Clinic Plan: 単独院固定
  - Group Plan: 本部基本料金 + 店舗 add-on quantity
- Stripe Billing を正本とする。
- アプリ側は subscription status / quantity / trial / cancel 状態を同期キャッシュとして持つ。
- 解約、カード更新、請求履歴は Stripe Customer Portal に委譲する。
- 店舗追加は Customer Portal ではなく Tiramisu の `/admin/tenants` から行う。
- 1か月無料トライアルを付ける。カード登録必須。1組織につき1回。
- 金額は本仕様では確定しない。Stripe Price ID で外部化する。

### 1.2 現状モデルへの適合

現行の Tiramisu は独立した `organizations` / `tenants` テーブルではなく、`clinics` の自己参照階層を組織境界として扱う。

- `clinics.parent_id IS NULL`: root clinic
  - Single Plan: 単独院
  - Group Plan: 本部 / HQ
- `clinics.parent_id IS NOT NULL`: 子店舗
- 認可境界は `clinic_scope_ids` / hierarchical clinic scope によって root + children に閉じる。
- 課金境界もこの root clinic に合わせる。

---

## 2. Scope

### 2.1 In scope

1. Plan model
   - Single Clinic Plan
   - Group Plan
   - Single → Group upgrade
2. DB schema
   - `subscriptions`
   - `stripe_webhook_events`
   - `billing_audit_logs`
   - `billing_overrides`
   - `clinics` への billing activation 用カラム追加、または同等テーブル
3. Stripe Checkout
4. Stripe Customer Portal
5. Stripe webhook
6. テナント追加に伴う quantity 更新
7. 解約導線
8. 支払い失敗 / dunning / grace period
9. 解約後データ閲覧・エクスポート方針
10. 社内PoC / 特別契約 / 障害対応の billing override
11. SaaS運営者向け billing operator 操作
12. 課金 audit log
13. Test plan
14. Rollback

### 2.2 Out of scope

- 具体的な料金
- 年額割引
- ティア割引
- coupon / discount の自動運用
- Stripe Tax の完全対応
- インボイス制度の完全自動対応
- 口座振替 / コンビニ決済
- 使用量ベース課金
- 自前請求書 UI
- 自前解約理由分析
- 返金 UI

---

## 3. Domain Model

### 3.1 用語

| 用語 | 定義 |
|---|---|
| org | root clinic とその子店舗群 |
| root clinic | `clinics.parent_id IS NULL` の clinic |
| Single Clinic | root clinic 自身が契約主体かつ運営店舗 |
| HQ / 本部 | Group Plan における契約主体 |
| Store / 店舗 | Group Plan における課金対象の子 clinic |
| Subscription | Stripe subscription とアプリ側 `subscriptions` 行 |
| Billable Store | 課金対象店舗 |
| Pending Clinic | Stripe quantity 反映前でまだ有効化されていない clinic |

### 3.2 clinic分類

MVPでは以下の分類を導入する。

```ts
type ClinicBillingType =
  | 'standalone' // 単店舗。root clinic 自身が運営店舗
  | 'hq'         // グループ本部。契約主体だが原則として店舗課金対象外
  | 'store';     // グループ子店舗。店舗 add-on の課金対象
```

#### 推奨実装

`clinics` に以下のカラムを追加するか、`clinic_billing_profiles` テーブルで保持する。

| column | type | note |
|---|---|---|
| `clinic_billing_type` | text | `standalone` / `hq` / `store` |
| `is_billable` | boolean | 課金対象店舗か |
| `billing_activation_status` | text | `active` / `pending` / `failed` / `disabled` |
| `billing_activation_error` | text nullable | Stripe / webhook / activation 失敗理由 |
| `billing_activated_at` | timestamptz nullable | 有効化日時 |

#### 不変条件

- Single Plan:
  - root clinic = `standalone`
  - `is_billable=true`
  - billable quantity = 1
  - child clinic 作成不可
- Group Plan:
  - root clinic = `hq`
  - child clinic = `store`
  - 原則として child clinic の `is_billable=true`
  - billable quantity = active store count
  - root clinic が実店舗を兼ねるケースは `is_billable=true` を許容するが、MVPでは原則扱わない

---

## 4. Plan Model

### 4.1 Single Clinic Plan

対象:

- 単独院
- 本部 / 子店舗構造を持たない事業者
- 初期導入・小規模顧客

Stripe mapping:

| Domain | Stripe |
|---|---|
| root clinic | Customer |
| Single plan | Price: `STRIPE_PRICE_SINGLE_CLINIC_ID` |
| subscription item | single price × quantity 1 |

制約:

- 子テナント追加不可
- multi-store analytics 不可
- 本部向け横断管理機能は非表示
- 店舗追加を行う場合は Group Plan へ upgrade する

### 4.2 Group Plan

対象:

- 複数店舗を持つ整骨院グループ
- 本部管理・横断分析・店舗追加が必要な事業者

Stripe mapping:

| Domain | Stripe |
|---|---|
| root clinic / HQ | Customer |
| Group base | Price: `STRIPE_PRICE_GROUP_BASE_ID` × 1 |
| Store add-on | Price: `STRIPE_PRICE_STORE_ADDON_ID` × billable store quantity |

制約:

- 店舗追加は `/admin/tenants` から行う
- Customer Portal で quantity 変更は許可しない
- 有効店舗数は `subscriptions.quantity` を超えてはならない

### 4.3 Plan Upgrade: Single → Group

Single Plan から Group Plan へ upgrade 可能にする。

#### 方針

- `org_root_clinic_id` は変えない。
- `stripe_customer_id` は再利用する。
- 既存 subscription を更新するか、新規 subscription を作るかは実装時に選択する。
- MVPでは、シンプルさ優先で **新規 Checkout による Group subscription 作成** を推奨する。
- `trial_consumed=true` は引き継ぐ。2回目の trial は付与しない。

#### Upgrade後

1. root clinic を `standalone` から `hq` に変更する。
2. Group base item を付与する。
3. store add-on item を付与する。
4. 子店舗追加導線を有効化する。
5. multi-store 機能を有効化する。

---

## 5. Stripe Mapping

### 5.1 Price IDs

金額は本仕様では確定しない。環境変数で Price ID のみ管理する。

```env
STRIPE_PRICE_SINGLE_CLINIC_ID=price_xxx
STRIPE_PRICE_GROUP_BASE_ID=price_xxx
STRIPE_PRICE_STORE_ADDON_ID=price_xxx
```

### 5.2 Checkout

用途:

- 初回契約
- 再契約
- Single Plan 開始
- Group Plan 開始
- Single → Group upgrade

共通設定:

- `mode: 'subscription'`
- `payment_method_collection: 'always'`
- `subscription_data.trial_period_days: 30`（初回のみ）
- metadata:
  - `org_root_clinic_id`
  - `plan_code`
  - `trial_consumed_before_checkout`
- `client_reference_id`: `org_root_clinic_id`

### 5.3 Customer Portal

用途:

- 支払い方法変更
- 請求履歴確認
- 解約
- 解約予約の取り消し

禁止:

- 顧客による quantity 変更
- 顧客による任意の plan 変更
- coupon / discount 操作

Customer Portal は **支払い管理・解約のみ** に限定する。

### 5.4 Webhook

Webhook は Stripe 署名を正として認証する。

- Next.js App Router では raw body を `await request.text()` で読む。
- `processApiRequest` は通さない。
- CSRF / Origin ではなく Stripe signature で検証する。
- `/api/stripe/webhook` は middleware の保護対象から除外する。
- `stripe_webhook_events` に `event.id` を保存し、冪等性を担保する。

---

## 6. Data Model

### 6.1 `subscriptions`

Stripe subscription の同期キャッシュ兼アクセス制御用テーブル。

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `org_root_clinic_id` | uuid unique | root clinic FK |
| `plan_code` | text | `single_clinic` / `group` |
| `stripe_customer_id` | text unique | |
| `stripe_subscription_id` | text unique nullable | |
| `stripe_subscription_item_single_id` | text nullable | Single price item |
| `stripe_subscription_item_group_base_id` | text nullable | Group base item |
| `stripe_subscription_item_store_addon_id` | text nullable | Store add-on item |
| `status` | text | Stripe subscription status |
| `billing_state` | text | app-level computed state |
| `quantity` | int | billable store quantity。Single は 1 |
| `current_period_start` | timestamptz nullable | |
| `current_period_end` | timestamptz nullable | |
| `trial_start` | timestamptz nullable | |
| `trial_end` | timestamptz nullable | |
| `trial_consumed` | boolean default false | 1組織1回 |
| `cancel_at_period_end` | boolean default false | |
| `canceled_at` | timestamptz nullable | |
| `ended_at` | timestamptz nullable | |
| `past_due_since` | timestamptz nullable | |
| `grace_period_ends_at` | timestamptz nullable | |
| `latest_invoice_id` | text nullable | |
| `last_synced_at` | timestamptz nullable | |
| `metadata` | jsonb default '{}' | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### RLS

- Read:
  - 当該 org の `admin` のみ
  - operator role は別途定義
- Write:
  - user JWT 経由の insert / update / delete は禁止
  - webhook / operator system context のみ service role で write
- Cross-tenant read は禁止

### 6.2 `stripe_webhook_events`

Webhook 冪等性・再処理・障害調査用。

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `stripe_event_id` | text unique | Stripe event.id |
| `event_type` | text | |
| `stripe_created_at` | timestamptz nullable | |
| `livemode` | boolean | |
| `payload` | jsonb | raw event payload |
| `processed_at` | timestamptz nullable | |
| `processing_error` | text nullable | |
| `created_at` | timestamptz | |

#### ルール

- 同一 `stripe_event_id` は二重処理しない。
- 処理失敗時は `processing_error` を残す。
- operator が再処理できるようにする。

### 6.3 `billing_audit_logs`

課金・解約・店舗追加・override に関わる audit log。

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `org_root_clinic_id` | uuid | |
| `actor_type` | text | `user` / `stripe` / `system` / `operator` |
| `actor_user_id` | uuid nullable | |
| `event_type` | text | |
| `before_state` | jsonb nullable | |
| `after_state` | jsonb nullable | |
| `stripe_event_id` | text nullable | |
| `request_id` | text nullable | |
| `created_at` | timestamptz | |

#### event_type例

- `billing.checkout_started`
- `billing.checkout_completed`
- `billing.portal_opened`
- `billing.subscription_created`
- `billing.subscription_updated`
- `billing.subscription_cancel_scheduled`
- `billing.subscription_canceled`
- `billing.trial_started`
- `billing.trial_will_end`
- `billing.trial_ended`
- `billing.payment_failed`
- `billing.payment_recovered`
- `billing.tenant_add_requested`
- `billing.tenant_pending_created`
- `billing.tenant_activated`
- `billing.tenant_activation_failed`
- `billing.override_created`
- `billing.override_expired`
- `billing.override_removed`

### 6.4 `billing_overrides`

社内PoC・特別契約・障害対応のための一時的な課金 override。

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `org_root_clinic_id` | uuid | |
| `override_status` | text | `active` / `disabled` |
| `reason` | text | 必須 |
| `expires_at` | timestamptz | 必須 |
| `created_by` | uuid nullable | operator user |
| `disabled_at` | timestamptz nullable | |
| `disabled_by` | uuid nullable | |
| `created_at` | timestamptz | |

#### ルール

- override は必ず期限付き。
- reason 必須。
- 作成 / 無効化 / 期限切れは audit log に残す。
- 期限切れ後は通常の subscription status に戻る。

---

## 7. Billing State Machine

Stripe status をそのまま画面・アクセス制御に使わない。アプリ側で `billing_state` を計算する。

| billing_state | 業務利用 | billing画面 | 店舗追加 | データ閲覧 | エクスポート | 備考 |
|---|---|---|---|---|---|---|
| `none` | 不可 | 可 | 不可 | 不可 | 不可 | 未契約 |
| `trialing` | 可 | 可 | 可 | 可 | 可 | trial中 |
| `active` | 可 | 可 | 可 | 可 | 可 | 通常契約 |
| `cancel_scheduled` | 可 | 可 | 原則不可 | 可 | 可 | `cancel_at_period_end=true` |
| `past_due_grace` | 可 | 可 | 不可 | 可 | 可 | grace期間中 |
| `past_due_locked` | 不可 | 可 | 不可 | 可 | 可 | 支払い失敗後の猶予超過 |
| `canceled` | 不可 | 可 | 不可 | 可 | 可 | 解約後保持期間内 |
| `expired` | 不可 | 可 | 不可 | 制限 | 可/問い合わせ | 保持期間終了 |
| `override_active` | 可 | 可 | 条件付き | 可 | 可 | PoC / 特別対応 |

### 7.1 State calculation

優先順位:

1. 有効な `billing_overrides` がある → `override_active`
2. subscription がない → `none`
3. `status=trialing` → `trialing`
4. `status=active` and `cancel_at_period_end=true` → `cancel_scheduled`
5. `status=active` → `active`
6. `status=past_due` and now <= `grace_period_ends_at` → `past_due_grace`
7. `status=past_due` and now > `grace_period_ends_at` → `past_due_locked`
8. `status=canceled` and within retention → `canceled`
9. retention expired → `expired`

---

## 8. Trial Policy

- 期間: 30日
- カード登録: 必須
- 終了後: 自動課金
- 1組織1回
- `trial_consumed=true` の組織には2回目の trial を付与しない
- Single → Group upgrade 時も trial は引き継ぐ
- 再契約時も trial は付与しない

### 8.1 Trial notifications

- trial 終了3日前
- trial 終了当日
- trial 終了後 active 移行

MVPでは `email_outbox` 経由で送信する。

---

## 9. Checkout Flow

### 9.1 Single Plan checkout

Route:

- `POST /api/admin/billing/checkout`

Input:

```json
{
  "plan_code": "single_clinic"
}
```

処理:

1. `admin` 認可
2. root clinic scope 確認
3. 既存 active/trialing subscription がないことを確認
4. `stripe_customer_id` 取得または作成
5. trial 可否判定
6. Checkout Session 作成
   - line item: `STRIPE_PRICE_SINGLE_CLINIC_ID`, quantity 1
7. session URL を返す
8. audit log: `billing.checkout_started`

### 9.2 Group Plan checkout

Input:

```json
{
  "plan_code": "group"
}
```

処理:

1. `admin` 認可
2. root clinic scope 確認
3. billable store quantity 算出
4. quantity が 1 未満なら 1 に補正するか、店舗作成後に checkout させる
5. Checkout Session 作成
   - line item 1: `STRIPE_PRICE_GROUP_BASE_ID`, quantity 1
   - line item 2: `STRIPE_PRICE_STORE_ADDON_ID`, quantity = billable store quantity
6. session URL を返す

---

## 10. Customer Portal / Cancellation

### 10.1 方針

解約は自前 UI では作り込まず、Stripe Customer Portal に委譲する。

`/admin/billing` に以下ボタンを置く。

```txt
[お支払い管理・解約]
```

### 10.2 Portal route

Route:

- `POST /api/admin/billing/portal`

処理:

1. `admin` 認可
2. root clinic scope 確認
3. `stripe_customer_id` 取得
4. Customer Portal Session 作成
5. URL を返す
6. audit log: `billing.portal_opened`

### 10.3 解約方式

MVPでは期間末解約を標準にする。

- 解約申請時:
  - Stripe subscription: `cancel_at_period_end=true`
  - アプリ: `billing_state=cancel_scheduled`
- 期間末まで:
  - 業務利用可能
  - 店舗追加は原則不可
- 期間末後:
  - Stripe `customer.subscription.deleted`
  - アプリ: `status=canceled`

### 10.4 解約予約の取り消し

期間末前なら Customer Portal または operator 操作で解約予約を取り消せる。

- Stripe: `cancel_at_period_end=false`
- アプリ: `billing_state=active`

### 10.5 解約後アクセス

解約後90日間は以下を許可する。

許可:

- データ閲覧
- CSVエクスポート
- 請求履歴確認
- 再契約導線

禁止:

- 新規日報作成
- 予約同期
- 店舗追加
- スタッフ追加
- AI分析
- シフト生成
- 設定変更

90日経過後は read access を制限し、エクスポートは問い合わせ対応または operator 経由にする。

---

## 11. Dunning / Payment Failure

### 11.1 方針

支払い失敗で即停止しない。B2B業務システムとして grace period を設ける。

MVP:

- grace period: 14日
- grace中: 業務利用可能
- grace超過後: 業務操作不可。閲覧・エクスポート・billing画面のみ許可。

### 11.2 Webhook handling

- `invoice.payment_failed`
  - `status=past_due`
  - `past_due_since=now()`
  - `grace_period_ends_at=now()+14 days`
  - `billing_state=past_due_grace`
  - notification: 支払い失敗
- `invoice.paid`
  - `status=active`
  - `past_due_since=null`
  - `grace_period_ends_at=null`
  - `billing_state=active`
  - notification: 支払い復旧

### 11.3 Locked state

`past_due_locked` では以下のみ許可。

- `/admin/billing`
- `/api/admin/billing/*`
- 請求履歴
- データ閲覧
- CSVエクスポート
- ログアウト

---

## 12. Tenant Addition Billing Flow

### 12.1 方針

Group Plan において、テナント追加は課金イベントである。

テナント追加は Stripe Customer Portal ではなく、Tiramisu の `/admin/tenants` から行う。

### 12.2 不変条件

常に以下を満たす。

```txt
active_billable_store_count <= subscriptions.quantity
```

この条件を破る変更は禁止。テストで固定する。

### 12.3 Flow: Add store

1. admin が `/admin/tenants` で「店舗を追加」を押す。
2. 店舗情報を入力する。
3. サーバー側で pending clinic を作成する。
   - `is_active=false`
   - `clinic_billing_type='store'`
   - `is_billable=true`
   - `billing_activation_status='pending'`
4. Stripe subscription item の store add-on quantity を +1 する。
5. MVPでは `proration_behavior='none'` を推奨する。
6. Stripe webhook `customer.subscription.updated` で `subscriptions.quantity` を同期する。
7. `active_billable_store_count < subscriptions.quantity` を確認する。
8. 条件を満たせば pending clinic を有効化する。
   - `is_active=true`
   - `billing_activation_status='active'`
   - `billing_activated_at=now()`
9. 失敗時は pending のままにし、admin UI に「課金反映待ち / 有効化失敗」を表示する。

### 12.4 Flow: Disable store

MVPでは即時返金・日割り減額は行わない。

1. admin が店舗停止を要求する。
2. clinic を `is_active=false` にする。
3. 次回請求期間から quantity を減らす。
4. Stripe update では `proration_behavior='none'`。
5. webhook 同期後、`subscriptions.quantity` を確認する。

### 12.5 Single Plan restriction

Single Plan では child clinic 作成を拒否する。

- response: 403 or 409
- error code: `PLAN_REQUIRES_GROUP`
- UI: 「店舗追加には Group Plan へのアップグレードが必要です」

---

## 13. Access Gate

### 13.1 MVP方針

初期MVPでは middleware に heavy DB lookup を入れない。

理由:

- middleware は全画面に影響する
- Supabase session / cookie / edge runtime の影響範囲が大きい
- 課金実装初期では障害時の切り分けが難しい

### 13.2 初期実装

- page / layout level gate
- API route level gate
- server helper: `assertBillingAccess(orgRootClinicId, action)`

### 13.3 GA前実装

GA前に以下を検討する。

- JWT custom claim: `billing_state`
- short TTL cache
- middleware gate

### 13.4 Always allow routes

- `/admin/billing`
- `/api/admin/billing/checkout`
- `/api/admin/billing/portal`
- `/api/stripe/webhook`
- `/logout`
- `/unauthorized`

---

## 14. Billing Actions / Permissions

| Action | none | trialing | active | cancel_scheduled | past_due_grace | past_due_locked | canceled | override_active |
|---|---|---|---|---|---|---|---|---|
| view billing | yes | yes | yes | yes | yes | yes | yes | yes |
| start checkout | yes | no | no | no | yes | yes | yes | conditional |
| open portal | no | yes | yes | yes | yes | yes | yes | conditional |
| use app | no | yes | yes | yes | yes | no | no | yes |
| create daily report | no | yes | yes | yes | yes | no | no | yes |
| add store | no | yes | yes | no | no | no | no | conditional |
| export data | no | yes | yes | yes | yes | yes | yes | yes |
| view data | no | yes | yes | yes | yes | yes | yes | yes |

---

## 15. Webhook Events

### 15.1 Required events

| Event | Handling |
|---|---|
| `checkout.session.completed` | subscription upsert, trial_consumed update |
| `customer.subscription.created` | subscription sync |
| `customer.subscription.updated` | status / quantity / cancel_at_period_end sync |
| `customer.subscription.deleted` | status canceled |
| `invoice.paid` | payment recovered / active sync |
| `invoice.payment_failed` | past_due / grace start |
| `customer.subscription.trial_will_end` | notification |

### 15.2 Webhook processing order

1. Verify signature.
2. Insert into `stripe_webhook_events`.
3. If duplicate, return 200.
4. Dispatch by `event.type`.
5. Fetch latest Stripe object if needed.
6. Upsert `subscriptions`.
7. Write `billing_audit_logs`.
8. Mark `processed_at`.
9. On error, write `processing_error`, return 500 only if retry is desired.

### 15.3 Out-of-order handling

Webhook payload を鵜呑みにせず、必要に応じて Stripe API から subscription の最新状態を取得して同期する。

---

## 16. Operator Billing Admin

### 16.1 方針

`admin` は顧客組織の管理者であり、SaaS運営者ではない。SaaS運営者向けの billing 操作は別導線にする。

### 16.2 Operator capabilities

閲覧:

- org_root_clinic_id
- clinic name
- plan_code
- stripe_customer_id
- stripe_subscription_id
- status
- billing_state
- quantity
- current_period_end
- trial_end
- cancel_at_period_end
- past_due_since
- grace_period_ends_at
- last_synced_at
- recent webhook events
- recent audit logs

操作:

- billing override 作成 / 無効化
- subscription 再同期
- webhook event 再処理
- pending clinic 有効化 / 無効化
- manual note 追加

### 16.3 MVP実装

初期は画面を作り込まない。

MVP:

- server-only script
- protected internal route
- Supabase SQL console直叩きを避ける最低限の operator command

---

## 17. Billing Override

### 17.1 Use cases

- 社内PoC
- 特別契約
- 障害対応
- Stripe障害時の一時救済
- 請求移行期間

### 17.2 Rules

- 期限必須
- reason必須
- actor必須
- audit log必須
- 無期限 override 禁止
- 期限切れ時は自動的に通常 billing state に戻る

### 17.3 Access

有効な override がある場合、`billing_state=override_active` として扱う。

ただし、override 中の店舗追加は明示許可制にする。

---

## 18. Notifications

MVPでは `email_outbox` 経由で送信する。

### 18.1 Required notifications

| Trigger | Recipient | Timing |
|---|---|---|
| trial ending | admin | 3日前 |
| trial ended | admin | 当日 |
| payment failed | admin | 即時 |
| grace ending | admin | 3日前 |
| access locked | admin | 即時 |
| cancel scheduled | admin | 即時 |
| subscription canceled | admin | 即時 |
| store activation succeeded | admin | 即時 |
| store activation failed | admin + operator | 即時 |
| override expiring | operator | 3日前 |

---

## 19. Environment / Config

### 19.1 Required env

```env
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

STRIPE_PRICE_SINGLE_CLINIC_ID=price_xxx
STRIPE_PRICE_GROUP_BASE_ID=price_xxx
STRIPE_PRICE_STORE_ADDON_ID=price_xxx

NEXT_PUBLIC_ENABLE_BILLING=false
BILLING_GRACE_PERIOD_DAYS=14
BILLING_CANCELLATION_RETENTION_DAYS=90
```

### 19.2 Rules

- secret は server-only。
- client に Stripe secret を出さない。
- `src/lib/env.ts` で検証する。
- `.env.local.example` / `.env.production.example` に placeholder を追加する。
- 実値はコミットしない。

---

## 20. API / Routes

### 20.1 Customer-facing routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/admin/billing` | billing status / checkout / portal |
| POST | `/api/admin/billing/checkout` | Checkout Session作成 |
| POST | `/api/admin/billing/portal` | Customer Portal Session作成 |
| POST | `/api/admin/tenants` | 店舗追加。Groupのみ |
| PATCH | `/api/admin/tenants/:id` | 店舗停止 / 有効化 |
| POST | `/api/stripe/webhook` | Stripe webhook |

### 20.2 Operator routes / commands

| Method | Route / Command | Purpose |
|---|---|---|
| POST | `/api/operator/billing/resync` | Stripeから再同期 |
| POST | `/api/operator/billing/override` | override作成 |
| DELETE | `/api/operator/billing/override/:id` | override無効化 |
| POST | `/api/operator/billing/webhook-events/:id/replay` | webhook再処理 |

MVPでは operator route は feature flag で無効化してもよい。

---

## 21. UI Requirements

### 21.1 `/admin/billing`

表示:

- 現在の plan
- billing_state
- subscription status
- trial 残日数
- 次回請求日
- cancel_at_period_end
- 契約店舗数
- 有効店舗数
- 支払い失敗時の grace 残日数
- 解約後のデータ保持期限

ボタン:

- `契約を開始`
- `Group Planへアップグレード`
- `お支払い管理・解約`
- `再契約する`
- `データをエクスポート`

### 21.2 `/admin/tenants`

表示:

- plan
- 契約店舗数
- 有効店舗数
- 追加可能店舗数
- pending clinic
- activation error

Single Plan:

```txt
店舗追加には Group Plan へのアップグレードが必要です。
[Group Planへアップグレード]
```

Group Plan:

```txt
契約店舗数: 5
有効店舗数: 5
追加可能店舗数: 0

[店舗を追加して契約数を増やす]
```

---

## 22. Implementation Order

### PR1: DB foundation

- `subscriptions`
- `stripe_webhook_events`
- `billing_audit_logs`
- `billing_overrides`
- clinic billing activation fields
- RLS
- rollback SQL

Done:

- cross-tenant read不可
- user JWT write不可
- service role write可
- rollback可能

### PR2: Stripe foundation

- `stripe` package追加
- `src/lib/stripe/server.ts`
- env追加
- webhook route
- signature verification
- event idempotency
- subscription sync

Done:

- 不正署名は400
- duplicate eventは二重処理しない
- subscription created / updated / deleted を同期
- invoice paid / failed を同期

### PR3: Checkout / Portal / Billing UI

- `/admin/billing`
- checkout API
- portal API
- Single / Group plan selection
- trial handling
- cancel state display

Done:

- adminのみ
- checkout URL発行
- portal URL発行
- trial_consumed制御

### PR4: Tenant addition billing

- `/api/admin/tenants` billing guard
- pending-first clinic creation
- Stripe quantity update
- activation after sync
- Single Plan restriction

Done:

- Singleは子店舗追加不可
- Groupは quantity 範囲内のみ active化
- pending clinic が課金前に active にならない

### PR5: Access gate / dunning / cancellation

- billing state helper
- API/page gate
- past_due grace
- cancellation retention
- export-only mode

Done:

- past_due grace中は利用可
- grace超過で業務操作不可
- canceled後は閲覧/エクスポートのみ

### PR6: Operator / override / audit polish

- billing override
- operator resync
- webhook replay
- audit log coverage
- notification hooks

---

## 23. Test Plan

### 23.1 DB / RLS

1. 組織A admin は組織A subscription を読める。
2. 組織A admin は組織B subscription を読めない。
3. user JWT で `subscriptions` へ insert/update/delete できない。
4. service role で webhook sync できる。
5. `stripe_event_id` duplicate は unique 制約で防げる。

### 23.2 Checkout

6. Single Plan checkout は single price quantity=1 で作成される。
7. Group Plan checkout は group base item + store add-on item で作成される。
8. trial 未消化なら trial_period_days=30 が付く。
9. trial_consumed=true なら trial は付かない。
10. 既存 active/trialing subscription がある場合は新規 checkout を拒否する。

### 23.3 Webhook

11. `checkout.session.completed` で subscription upsert。
12. `customer.subscription.updated` で status / quantity / cancel_at_period_end 同期。
13. `invoice.payment_failed` で `past_due_since` と `grace_period_ends_at` が入る。
14. `invoice.paid` で past_due が解除される。
15. `customer.subscription.deleted` で canceled になる。
16. 不正署名は400。
17. 同一 event は二重処理されない。
18. 処理失敗時に `processing_error` が残る。

### 23.4 State machine

19. active は業務利用可能。
20. trialing は業務利用可能。
21. cancel_scheduled は業務利用可能だが店舗追加不可。
22. past_due_grace は業務利用可能だが店舗追加不可。
23. past_due_locked は業務操作不可。
24. canceled は閲覧/エクスポートのみ。
25. override_active は未契約でも利用可能。

### 23.5 Tenant addition

26. Single Plan は child clinic 作成を拒否する。
27. Group Plan で pending clinic は `is_active=false` で作成される。
28. Stripe quantity 更新前に active にならない。
29. `active_billable_store_count < quantity` のとき active化できる。
30. `active_billable_store_count >= quantity` のとき active化を拒否する。
31. quantity 更新失敗時は pending のまま残る。
32. activation failure は admin UI に表示される。

### 23.6 Cancellation / data retention

33. `cancel_at_period_end=true` で `cancel_scheduled` になる。
34. cancel_scheduled 中は period end まで利用可能。
35. canceled 後90日間は閲覧/エクスポート可能。
36. canceled 後は新規日報・予約同期・店舗追加不可。
37. retention 期限後は read access が制限される。

### 23.7 Override / operator

38. override は reason なしでは作成不可。
39. override は expires_at なしでは作成不可。
40. override 期限切れ後は通常 billing state に戻る。
41. operator resync で Stripe 最新状態に同期できる。
42. webhook replay は audit log を残す。

---

## 24. Rollback

### 24.1 Feature flag

緊急停止:

```env
NEXT_PUBLIC_ENABLE_BILLING=false
```

これにより billing gate を無効化する。

### 24.2 DB rollback

`supabase/rollbacks/` に以下の rollback SQL を用意する。

- `subscriptions` drop
- `stripe_webhook_events` drop
- `billing_audit_logs` drop
- `billing_overrides` drop
- clinic billing columns drop

### 24.3 Code rollback

revert対象:

- Stripe SDK wrapper
- webhook route
- checkout / portal API
- billing UI
- tenant billing guard
- billing state gate
- operator commands
- tests

### 24.4 Stripe side

Stripe側の subscription / customer は dashboard から手動確認する。  
本番課金後は DB rollback だけで課金状態を破棄しない。

---

## 25. Open Questions

1. 具体的な価格
   - Single Plan
   - Group base
   - Store add-on
2. 年額割引をいつ入れるか
3. Group Plan で root clinic が実店舗を兼ねるケースを MVP で扱うか
4. 店舗停止時の quantity 減算タイミング
5. 日割り請求を将来有効にするか
6. 解約後のデータ保持期間を90日で確定するか
7. Stripe Tax / インボイス制度対応の時期
8. 口座振替 / 請求書払いの必要性
9. operator role の実装方式
10. Customer Portal の具体的な設定制限

---

## 26. References

- Stripe Checkout Sessions API: https://docs.stripe.com/api/checkout/sessions/create
- Stripe Customer Portal / customer management: https://docs.stripe.com/customer-management
- Stripe webhook signature verification: https://docs.stripe.com/webhooks/signature
- Stripe subscription cancellation: https://docs.stripe.com/billing/subscriptions/cancel
- Stripe subscription prorations: https://docs.stripe.com/billing/subscriptions/prorations

---

## 27. Final MVP Boundary

MVPで作るもの:

```txt
Single Plan
Group Plan
Checkout
Customer Portal
subscriptions
stripe_webhook_events
billing_audit_logs
billing_overrides
billing_state
trial
cancel_at_period_end
past_due grace
post-cancellation read/export
pending-first tenant addition
operator resync
```

MVPで作らないもの:

```txt
価格確定ロジック
年額割引
複雑なティア
coupon
使用量課金
Stripe Tax完全対応
自前請求書UI
自前解約UI
返金UI
```

この境界を守る。
課金基盤の目的は「会計システムを作ること」ではなく、Tiramisu が売上を受け取れる状態を最短で作ること。

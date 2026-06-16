# Stripe Billing Spec v0.1

- Status: draft
- Date: 2026-06-15
- File: `docs/stabilization/spec-stripe-billing-v0.1.md`
- Target repository: `IFs1991/seikotsuin_management_saas`
- Feature: マルチテナント SaaS の課金基盤（Stripe）。本部（組織）を契約主体とし、店舗数で課金する。
- Related specs:
  - `spec-rls-tenant-boundary-v0.1.md`（テナント境界・組織 = root clinic 階層の正本）
  - `spec-auth-role-alignment-v0.1.md`（ロール定義・admin = 本部管理者）
  - `spec-manager-admin-section-v0.1.md`（admin/manager 配下の画面設計の先行事例）

---

## 0. Background / Decisions

### 0.1 決定事項（壁打ちで確定）

- **契約主体は「顧客の本部（組織オーナー）」**。`admin` ロール = 1 組織のオーナーであり、SaaS 運営者ではない。
- **課金入口は本部（`admin`）**。本部から「店舗テナント」を単位として購入していく。
- **従業員（ユーザー）アカウント作成は課金対象外**（seat 課金しない）。
- **課金手段は Stripe**。サブスク・トライアル・請求書・解約は Stripe Billing / Customer Portal に委譲し、自前で決済 UI を作り込まない（PCI 対応も Stripe 側）。
- **1か月無料トライアル**を付ける。**カード登録必須・終了で自動課金移行**。1 組織につき 1 回。

### 0.2 現状のデータ/認可モデル（2026-06-15 コード調査結果）

| 観点 | 事実 |
|---|---|
| 組織の実体 | 独立した `organizations`/`tenants` テーブルは存在しない。**組織 = `clinics` の自己参照階層**。`clinics.parent_id IS NULL` が本部/単独院（HQ/Standalone）、`parent_id` を持つ行が子店舗。同一 `parent_id` の兄弟はテナント境界を共有（`squashed_baseline.sql` の `clinics` / `clinic_hierarchy` view） |
| 階層の深さ | 意図的に 2 層（親テナント → 子テナント）。`mergeScopedClinicHierarchyIds`（`src/lib/clinics/scope.ts`）のコメント参照 |
| admin の実スコープ | 全件横断ではない。`resolveScopedClinicIds()`（`src/lib/supabase/server.ts`）= `clinic_scope_ids` > `clinic_id` フォールバック。`resolveHierarchicalClinicScopeIds()` が `canManageClinicSettings`（admin/clinic_admin/manager）に対し parent→child を展開。`/api/admin/tenants` も `createScopedAdminContext` → `buildClinicScopeOrFilter(scopedClinicIds)` で自階層に限定 |
| RLS | `app_private.can_access_clinic()`（`20260508000300_*.sql`）は `clinic_scope_ids` or primary `clinic_id` で縛り、admin 専用バイパスは持たない |
| 残存リスク | `CROSS_CLINIC_ROLES = {admin}` / `canAccessCrossClinic`（`src/lib/constants/roles.ts`）という横断フラグが別に存在。multi-store 比較・横断 analytics 系で admin が「全組織横断」扱いになっていないかは複数組織を載せる前に監査が必要（§9） |

結論: **「組織 = root clinic（本部）＋子店舗群」** が課金の単位として既に成立しており、admin は自組織に scope されている。Stripe 課金はこの構造に素直に乗る。

---

## 1. Summary

本部（root clinic）を Stripe Customer とし、**店舗数を quantity** とするサブスクリプションで課金する。

- Stripe Customer = 本部（組織のルート clinic）
- Subscription item = 「店舗」price × quantity（= 課金対象店舗数）
- 店舗追加 = quantity +1（proration で日割り）
- トライアル = `trial_period_days: 30`・カード必須・自動移行・1 組織 1 回
- 自前 UI は薄く（現在のプラン・店舗数・「お支払い管理」）、解約/カード更新/請求履歴は **Customer Portal** へリダイレクト
- Stripe を正本とし、**webhook で `subscriptions` テーブルに同期**
- アクセス制御は **middleware** で subscription status を見てペイウォール

---

## 2. Scope

### 2.1 In scope

1. `subscriptions`（組織課金状態）テーブルの新規マイグレーション + RLS + ロールバック SQL
2. `clinics`（root）への `stripe_customer_id` 紐付け（または billing テーブルで保持）
3. Stripe Checkout（トライアル付きサブスク開始）導線（`/admin/billing`）
4. Stripe Customer Portal セッション発行 API（解約/カード更新/請求履歴）
5. Stripe Webhook 受信ルート（`/api/stripe/webhook`）と `subscriptions` 同期
6. 店舗購入フロー（quantity 増分 → webhook 確認 → 子 clinic 有効化、購入数 = 有効化上限ガード）
7. middleware のアクセスゲート（active/trialing 以外はペイウォール）
8. GA ゲートフラグ（`NEXT_PUBLIC_ENABLE_BILLING`）と pilot 期間の手動無償運用
9. TDD テスト（webhook 同期・ゲート・店舗購入上限・トライアル）

### 2.2 Out of scope（follow-up / 別仕様）

- 具体的な料金（店舗単価・ティア・月額/年額）の確定（§10 open question）
- 日本の決済手段拡張（コンビニ・口座振替）。初期はカードのみ
- インボイス制度対応の細部（適格請求書番号の表示など）。Stripe Tax/Invoicing の設定で別途
- 使用量ベース課金（メーター課金）。本仕様は「店舗数 = 固定 quantity」
- CROSS_CLINIC 横断スコープの全面監査・是正（§9 で項目化のみ）
- 解約後のデータ保持/削除ポリシー（§10 open question）

---

## 3. Domain Model

### 3.1 用語

| 用語 | 定義 |
|---|---|
| 組織 / org | `parent_id IS NULL` の root clinic とその子店舗群 |
| 本部 / HQ | 組織のルート clinic（契約主体） |
| 店舗 / 課金対象店舗 | 課金 quantity の単位（§3.2 で確定） |
| subscription | Stripe のサブスクリプション。1 組織 = 1 subscription |

### 3.2 課金対象店舗の定義（要確定 / 暫定方針）

quantity の数え方を明確化する。暫定方針:

- **課金対象店舗 = 組織内の `is_active = true` の「運営店舗」数**。
- チェーン（root + 子）の場合: 子店舗が運営店舗。本部 root が純粋な管理拠点（非運営）かどうかはデータ上区別されていないため、**「運営店舗」を示す明示フラグの導入**を検討（例: `clinics.is_billable` or `clinic_type`）。
- 単独院（root のみ・子なし）の場合: root 自身が運営店舗 = quantity 1。

→ 詳細は §10 open question。実装時は「quantity を算出する単一関数」に閉じ込め、定義変更に強くする。

---

## 4. Stripe Mapping

| ドメイン | Stripe |
|---|---|
| 本部（組織） | Customer（`metadata.org_root_clinic_id` を保持） |
| 店舗数 | Subscription item の `quantity` |
| 店舗単価 | Price（`STRIPE_PRICE_ID`、recurring） |
| 店舗追加 | `subscription.items` の quantity 更新（`proration_behavior: 'create_prorations'`） |
| トライアル | `trial_period_days: 30` + 決済手段必須（Checkout の `payment_method_collection: 'always'`） |
| 解約/カード更新/請求履歴 | Customer Portal |
| 状態同期 | Webhook → `subscriptions` テーブル |

### 4.1 トライアルのルール

- 期間: 30 日（`trial_period_days: 30`）
- カード: 必須。終了時に自動課金移行
- 1 組織 1 回: `subscriptions` に当該組織のトライアル消化履歴を持ち、2 回目以降は付与しない
- 終了 3 日前に `customer.subscription.trial_will_end` を受けて通知（既存 `email_outbox` パターンで送信可）

---

## 5. Data Model

### 5.1 新規テーブル `subscriptions`

組織（root clinic）単位の課金状態を保持する。Stripe を正本とし、本テーブルは同期キャッシュ兼アクセスゲート用。

想定カラム（マイグレーションで確定）:

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `org_root_clinic_id` | uuid unique | 本部 root clinic（`clinics.id`、`parent_id IS NULL`）。FK |
| `stripe_customer_id` | text unique | |
| `stripe_subscription_id` | text unique | |
| `status` | text | Stripe の subscription status（`trialing`/`active`/`past_due`/`canceled` など） |
| `plan_price_id` | text | `STRIPE_PRICE_ID` |
| `quantity` | int | 課金対象店舗数 |
| `current_period_end` | timestamptz | |
| `trial_end` | timestamptz null | |
| `trial_consumed` | boolean default false | 1 組織 1 回トライアル判定用 |
| `cancel_at_period_end` | boolean default false | |
| `created_at` / `updated_at` | timestamptz | |

- `stripe_customer_id` は `subscriptions` に集約（`clinics` に増やさない）。
- マイグレーション + **ロールバック SQL**（`supabase/rollbacks/`）をセットで用意（AGENTS.md 要件）。

### 5.2 RLS

- **read**: 当該組織の `admin`（および本部スコープを持つロール）のみ自組織行を読める。`app_private.can_access_clinic(org_root_clinic_id)` 相当でスコープ。
- **write**: アプリ経路からの直接 write は禁止。**更新は webhook（service role）のみ**。`createAdminClient` 経由で書き込み、ユーザー JWT 経由の insert/update/delete は RLS で拒否。
- テナント分離不変条件: 他組織の subscription 行は一切読めないこと（テスト必須）。

---

## 6. API / Routes

### 6.1 `/admin/billing`（画面）

- 表示: 現在のプラン / status / 課金対象店舗数 / 次回請求日 / トライアル残日数。
- ボタン:
  - 「契約を開始」→ Checkout（トライアル付き）セッション作成 → リダイレクト
  - 「お支払い管理」→ Customer Portal セッション作成 → リダイレクト
- ロール: 当該組織の `admin` のみ。clinic_admin/manager/therapist/staff には出さない。

### 6.2 `POST /api/admin/billing/checkout`

- `verifyAdminAuth()` + `createScopedAdminContext` で本部スコープ確認。
- 当該組織に既存の active/trialing subscription が無いことを確認。
- Stripe Checkout Session 作成（mode: `subscription`、`trial_period_days: 30`、`payment_method_collection: 'always'`、price = `STRIPE_PRICE_ID`、quantity = §3.2 の算出値、`customer` 既存 or 新規、`metadata.org_root_clinic_id`）。
- レスポンスは統一エンベロープ（`createSuccessResponse`）で session URL を返す。

### 6.3 `POST /api/admin/billing/portal`

- 同様に admin スコープ確認 → Customer Portal Session 作成 → URL 返却。

### 6.4 `POST /api/stripe/webhook`

- **middleware の認証・Origin 検証をバイパス**し、**Stripe 署名検証**（`STRIPE_WEBHOOK_SECRET`）で認証する。
- Next.js App Router で raw body を読む（`await request.text()`）。`processApiRequest` は通さない（CSRF/Origin チェックではなく署名検証で守る）。
- 冪等性: `event.id` を記録し重複処理を防ぐ。
- 処理イベント:
  - `checkout.session.completed` → subscription 行を upsert、`trial_consumed = true`
  - `customer.subscription.created|updated` → status/quantity/period 同期
  - `customer.subscription.deleted` → `status = canceled`
  - `invoice.paid` → period 更新
  - `invoice.payment_failed` → `status = past_due`（ダニング）
  - `customer.subscription.trial_will_end` → 終了前通知（`email_outbox`）
- middleware matcher / `PROTECTED_ROUTE_PREFIXES` に `/api/stripe/webhook` を保護対象から除外する（要確認）。

### 6.5 店舗購入フロー（quantity 増分）

1. 本部 admin が `/admin/tenants` で「店舗を追加」。
2. サーバ側で **Stripe subscription の quantity を +1**（`proration_behavior: 'create_prorations'`）。
3. webhook（`customer.subscription.updated`）で `subscriptions.quantity` を同期。
4. **子 clinic の作成/有効化は購入数を上限にガード**: `組織内の有効店舗数 <= subscriptions.quantity` を満たす場合のみ `is_active = true` で作成/有効化。超過は 4xx で拒否。
5. 店舗の停止（`is_active=false`）時は period 末に quantity を減算（`proration_behavior` は要検討、即時返金はしない方針が無難）。

> 既存 `/api/admin/tenants` の作成ロジック（`createScopedAdminContext` + 親スコープ検証）に上記の「購入数上限ガード」を追加する形。認可・スコープ検証は現状実装を流用。

---

## 7. Access Gate（middleware）

- `middleware.ts` のパイプライン（レート制限 → CSP → 保護ルート判定 → pilot）に **subscription ゲート**を追加。
- 対象: `(app)` / `(app)/admin` 配下の業務ルート。
- ロジック:
  - `NEXT_PUBLIC_ENABLE_BILLING !== 'true'` または `NEXT_PUBLIC_PILOT_MODE === 'true'` の間は**ゲートをスキップ**（pilot は手動無償運用）。
  - 有効時、当該組織の subscription `status` が `trialing` / `active` 以外（`past_due`/`canceled`/未契約）なら `/admin/billing`（ペイウォール）へリダイレクト。
  - 例外的に常に許可: `/admin/billing`、`/api/admin/billing/*`、`/api/stripe/webhook`、ログアウト、`/unauthorized`。
- subscription status は middleware で都度 DB 参照すると重いので、JWT claim へ反映（`supabase/config.toml` の custom_access_token_hook で `billing_status` を載せる）か、短 TTL キャッシュ（Upstash）を検討。fail の方針は **fail-closed**（医療系・課金境界のため）だが、status 取得失敗時に正規顧客を締め出さないよう、取得不能時は短時間 grace + ログ。→ §10 open question。

---

## 8. Environment / Config

- 追加 env（`src/lib/env.ts` で検証、直接 `process.env` 参照は ESLint 禁止に従う）:
  - `STRIPE_SECRET_KEY`（server 専用）
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID`（店舗単価 price）
  - `NEXT_PUBLIC_ENABLE_BILLING`（GA ゲートフラグ。default false）
- `.env.local.example` / `.env.production.example` にプレースホルダ追記。`scan:secrets` に引っかからない形（実値はコミットしない）。
- Stripe SDK は server 専用。クライアントに secret を載せない。

---

## 9. Tenant Isolation 監査（GA 前提条件）

複数組織を本番に載せる前に、admin が他組織を覗けないことを保証する。

- `CROSS_CLINIC_ROLES` / `canAccessCrossClinic` / `canAccessCrossClinicWithCompat` の**全使用箇所を棚卸し**。
- 特に multi-store 比較（`/multi-store`）・横断 analytics・admin 集計系で、scope が `resolveScopedClinicIds`（自組織階層）に閉じているか確認。
- service-role（`createAdminClient`）直叩き箇所が `createScopedAdminContext` 経由になっているか確認。
- subscription 行のクロス組織 read 不可をテストで固定。

→ これは課金のブロッカーではないが、**マルチ組織 GA のゲート条件**。別タスクで spec 化推奨。

---

## 10. Open Questions

1. **課金対象店舗の定義（§3.2）**: 本部 root を課金対象に含めるか。「運営店舗」フラグ（`is_billable`/`clinic_type`）を導入するか。単独院の扱い。
2. **料金**: 店舗単価、ティア（数量割引）、月額/年額、年額割引。→ 料金が決まれば `STRIPE_PRICE_ID` を確定。
3. **past_due の猶予**: 支払い失敗後、何日でアクセス遮断するか（ダニング期間）。
4. **解約後のデータ**: 保持期間・エクスポート提供・削除。医療データのため法令/契約と整合が必要。
5. **middleware の status 取得方法**: JWT claim 反映 vs Redis キャッシュ vs 都度 DB。fail-closed の安全な実装。
6. **店舗減算時の proration**: 即時減額/返金なし（period 末減算）で良いか。
7. **日本の決済手段**: 初期カードのみで良いか（コンビニ/口座振替は follow-up）。

---

## 11. Test Plan（TDD）

### 11.1 Webhook 同期（server）

1. `checkout.session.completed` で `subscriptions` 行が upsert され `status=trialing` / `trial_consumed=true`。
2. `customer.subscription.updated` で `quantity` / `status` / `current_period_end` が同期。
3. `invoice.payment_failed` で `status=past_due`。
4. `customer.subscription.deleted` で `status=canceled`。
5. 不正署名（`STRIPE_WEBHOOK_SECRET` 不一致）は 400 で拒否。
6. 同一 `event.id` の二重配信が冪等（二重反映しない）。

### 11.2 アクセスゲート

7. `NEXT_PUBLIC_ENABLE_BILLING=false` または pilot 中はゲートをスキップ。
8. 有効時、`status=active`/`trialing` は業務ルート通過。
9. 有効時、`past_due`/`canceled`/未契約は `/admin/billing` へリダイレクト。
10. `/admin/billing`・`/api/stripe/webhook` は status に関わらず到達可能。

### 11.3 店舗購入上限

11. `有効店舗数 < quantity` のとき店舗作成/有効化が成功。
12. `有効店舗数 == quantity` で追加作成は 4xx 拒否。
13. quantity 増分後の webhook 同期で上限が緩和される。

### 11.4 トライアル

14. 初回契約は `trial_period_days=30`・カード必須で開始。
15. `trial_consumed=true` の組織は 2 回目のトライアルを付与しない。

### 11.5 テナント分離（セキュリティ不変条件）

16. 組織 A の admin は組織 B の subscription を read できない。
17. ユーザー JWT 経由の `subscriptions` への直接 write は RLS で拒否（webhook/service role のみ可）。

> セキュリティ不変条件: 課金境界・テナント分離を「テストを通すため」に弱めない。`org_root_clinic_id` / `status` に触れる変更はテスト追加必須。

---

## 12. Implementation Order

1. `subscriptions` マイグレーション + RLS + ロールバック SQL
2. env 追加（`STRIPE_*` / `NEXT_PUBLIC_ENABLE_BILLING`）
3. Stripe SDK ラッパ（server 専用）
4. webhook ルート + 署名検証 + 冪等 + 同期（テストファースト）
5. checkout / portal API
6. `/admin/billing` 画面（薄く）
7. 店舗購入上限ガードを `/api/admin/tenants` に追加
8. middleware アクセスゲート（フラグ default off）
9. trial_will_end 通知（`email_outbox`）
10. テスト一式 → lint / type-check / test:pr05:focused

---

## 13. Rollback

- DB: `subscriptions` マイグレーションのロールバック SQL（`supabase/rollbacks/`）で table/RLS を撤去。
- コード: webhook/checkout/portal ルート、`/admin/billing`、middleware ゲート、店舗購入ガード、env 追加、テストを revert。
- フラグ: `NEXT_PUBLIC_ENABLE_BILLING=false` で**即時にゲートを無効化**できる（コード revert 前の緊急停止手段）。Stripe 側の課金は Stripe ダッシュボード/Portal で個別対応。

---

## 14. Follow-up Candidates

- 料金プラン確定 + ティア（数量割引）+ 年額割引（§10-2）
- CROSS_CLINIC 横断スコープの全面監査・是正 spec（§9）
- 日本の決済手段拡張（コンビニ/口座振替）
- 解約後データ保持/エクスポート/削除ポリシー（医療データ）
- 使用量ベース/オプション機能課金（AI 分析等のアドオン）
- Stripe Tax / インボイス番号表示の本対応

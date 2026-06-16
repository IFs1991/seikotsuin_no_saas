# Stripe Billing Commercial Baseline Spec v0.5

- Status: draft / implementation-ready baseline
- Date: 2026-06-15
- File: `docs/stabilization/spec-stripe-billing-commercial-baseline-v0.5.md`
- Target repository: `IFs1991/seikotsuin_management_saas`
- Product: Tiramisu
- Feature: Commercial-grade Stripe Billing foundation for multi-tenant clinic SaaS
- Pricing: **TBD**. This spec defines billing structure only. Actual yen prices are configured by Stripe Price IDs.
- Supersedes:
  - `spec-stripe-billing-v0.1.md`
  - `spec-stripe-billing-v0.2.md`
  - `spec-stripe-billing-v0.3.md`
  - `spec-stripe-billing-commercial-baseline-v0.4.md`

---

## 0. Purpose

This document is written for LLM/Codex implementation.

The goal is to make Tiramisu commercially billable without turning the product into a fragile manual billing operation.

This is **not** a small MVP spec. It is a **Commercial Baseline**:

- The architecture defines commercial-grade billing states, exception paths, recovery, tenant quantity enforcement, and auditability.
- Implementation must still be shipped in small PRs behind feature flags.
- Do not enable every commercial feature at once.

The business objective is direct:

> Prevent Tiramisu from becoming a free internal convenience tool. Make contract status, store count, and access control enforceable through Stripe-backed subscription state.

---

## 1. Non-negotiable Decisions

These decisions must not be changed by implementation agents unless a new spec supersedes this one.

1. `admin` means **customer organization HQ administrator**.
2. `admin` is **not** the SaaS operator / platform owner.
3. Do **not** add an `operator` role in Phase A.
4. Platform/internal recovery operations use server-only scripts or `/api/internal/*` protected by `INTERNAL_API_SECRET` / `CRON_SECRET`.
5. Customer-facing billing operations are exposed only to scoped customer `admin` users.
6. Contract subject is the organization root clinic.
7. Organization model is root clinic + child clinics.
8. Employee/user accounts are not billable seats.
9. Stripe Billing is the source of truth for subscription status.
10. App `subscriptions` table is a synchronized cache and access-gate source.
11. Checkout / Portal / webhook should stay close to official Stripe flows.
12. Customer Portal handles payment method update, invoices, and cancellation.
13. Customer Portal must not allow quantity changes.
14. Store addition is an app-side billing event from `/admin/tenants`.
15. Store creation must be pending-first; never activate an unpaid store.
16. `active_billable_store_count <= paid_store_quantity` is a hard invariant.
17. Page/API-level billing gates come before middleware gates.
18. Middleware billing gate is out of this baseline unless explicitly approved later.
19. Prices are externalized through Stripe Price IDs and feature flags.
20. Do not weaken RLS or tenant boundaries to make billing tests pass.
21. Billing table read access requires both org scope and customer `admin` role.
22. Store activation must be serialized by a DB transaction/lock. Do not implement check-then-activate as separate non-atomic steps.

---

## 2. How Codex / LLM Should Work

### 2.1 Required work style

When implementing this spec, the LLM must:

1. Inspect existing repository files before editing.
2. Reuse existing route patterns and response envelopes.
3. Reuse existing auth / scoped admin helpers.
4. Keep each PR small.
5. Add tests with every behavioral change.
6. Add rollback SQL for DB migrations.
7. Keep feature flags default-off unless the PR explicitly turns on a test-only path.
8. Avoid touching middleware unless the PR is specifically about middleware.
9. Avoid adding new roles unless a later spec defines platform identity.
10. Never use client-side Stripe secret keys.

### 2.2 Stop conditions for LLM

The LLM must stop and ask for human decision if any of these are encountered:

- Stripe API shape differs from assumptions in this spec.
- Existing route helpers conflict with raw webhook body handling.
- Existing RLS makes intended service-role operation impossible.
- App has no reliable way to identify org root clinic from the current admin context.
- Single → Group upgrade would cause double billing without a safe cancellation path.
- Deleting or changing existing production clinic data is required.
- A store activation cannot be implemented atomically with a DB lock/transaction.
- Existing env handling makes secret validation inconsistent with this spec.

### 2.3 Explicit prohibitions

Do not implement:

- `/api/operator/*` customer-accessible or session-authenticated routes.
- `operator` role in `roles.ts`.
- Stripe quantity edits from Customer Portal.
- Immediate active clinic creation before payment capacity exists.
- User JWT write access to `subscriptions`.
- Manual DB-only subscription state changes without audit/internal tool.
- Direct `process.env.STRIPE_*` reads outside env wrapper.
- Direct `process.env.INTERNAL_API_SECRET` / `process.env.CRON_SECRET` reads in new billing code unless wrapped by the project env/internal-secret helper.
- Non-atomic store activation that checks capacity in one query and activates in a separate unlocked query.
- Webhook route through generic CSRF/Origin wrappers that consume/alter the raw body.

---

## 3. Repository Alignment

### 3.1 Existing patterns to reuse

| Concern | Existing implementation / review fact | Required action |
|---|---|---|
| Tenant creation | `POST /api/admin/tenants` | Reuse. Add billing guard and pending-first logic. |
| Tenant update / activation / deactivation | `PATCH /api/admin/tenants/[clinic_id]` | Reuse. Do not document or implement `:id`; App Router path is `[clinic_id]`. |
| Tenant authorization | admin + scoped context | Reuse. Billing must not widen scope. |
| Root/child organization model | `clinics.parent_id` hierarchy | Use root clinic as org billing subject. |
| Notifications | `email_outbox` pattern | Use for Phase C dunning/trial notifications. |
| Stripe SDK | not installed | Add in PR2. |
| SaaS operator role | not present | Do not invent in Phase A/B. |

### 3.2 Important path correction

Use:

```txt
/api/admin/tenants/[clinic_id]
```

Do not use:

```txt
/api/admin/tenants/:id
```

---

## 4. Release Phases

This spec defines a commercial baseline. Implementation is staged.

### 4.1 Phase A — Billing Core

Goal: receive money and synchronize subscription status safely.

In scope:

1. `subscriptions`
2. `stripe_webhook_events`
3. Stripe SDK wrapper
4. env validation
5. Checkout session API
6. Customer Portal session API
7. raw-body webhook route
8. signature verification
9. idempotent event log
10. subscription sync mapper
11. minimal `/admin/billing` page
12. page/API-level billing gate
13. `trialing` / `active` / `past_due` / `canceled` status handling
14. checkout pending expiry handling / TTL fallback
15. Single and Group plan definitions
16. feature flags for enabled plans

Out of Phase A:

- tenant quantity increase flow
- pending-first clinic activation
- billing overrides
- billing audit logs
- Single → Group automated upgrade
- dunning grace enforcement
- post-cancellation export-only mode
- platform operator UI

### 4.2 Phase B — Store Quantity Enforcement

Goal: make store count directly tied to subscription quantity.

In scope:

1. Group store add-on subscription item handling
2. `/api/admin/tenants` billing guard
3. `PATCH /api/admin/tenants/[clinic_id]` billing guard
4. pending-first clinic creation
5. clinic activation after capacity confirmation
6. store count reconciliation script/internal route
7. tests for `active_billable_store_count <= paid_store_quantity`

### 4.3 Phase C — Commercial Operations

Goal: reduce manual support risk.

In scope:

1. `billing_audit_logs`
2. `billing_overrides`
3. internal billing recovery routes
4. webhook replay / resync scripts
5. dunning grace period
6. payment failure notifications
7. trial ending notifications
8. cancel-at-period-end UI state
9. post-cancellation read/export policy hooks

### 4.4 Phase D — Plan Upgrades / Downgrades

Goal: support lifecycle changes without double billing.

In scope:

1. Single → Group upgrade
2. Group base-only state
3. cancel old Single subscription when creating Group subscription
4. preserve customer and root clinic
5. no second trial after upgrade
6. downgrade policy if needed

---

## 5. Plan Model

Prices are TBD. Do not hard-code yen amounts.

### 5.1 Plan codes

```ts
type BillingPlanCode = 'single_clinic' | 'group';
```

### 5.2 Single Clinic Plan

Target:

- single clinic owners
- small operators
- fast entry customers

Domain model:

- root clinic = contract subject
- root clinic = operating clinic
- billable quantity = 1
- child clinic creation is forbidden

Stripe mapping:

| Domain | Stripe |
|---|---|
| Single plan | `STRIPE_PRICE_SINGLE_CLINIC_ID` |
| Subscription item | single clinic price × 1 |

Feature restrictions:

- no child tenant creation
- no multi-store analytics
- no HQ cross-store management UI
- adding stores requires upgrade to Group

### 5.3 Group Plan

Target:

- multi-store clinic groups
- HQ operators
- organizations needing cross-store management

Domain model:

- root clinic = contract subject / HQ
- child clinics = stores
- billable store count = active billable child clinics
- root-as-store hybrid is deferred unless `clinic_type` / `is_billable` is implemented

Stripe mapping:

| Domain | Stripe |
|---|---|
| Group base | `STRIPE_PRICE_GROUP_BASE_ID` × 1 |
| Store add-on | `STRIPE_PRICE_STORE_ADDON_ID` × billable store quantity |

### 5.4 Group with zero stores

Group base-only subscription is allowed.

Policy:

- Group base item is always created.
- Store add-on item is created only when billable store quantity becomes greater than 0.
- Avoid quantity=0 add-on item unless Stripe behavior is explicitly verified.
- Store add-on subscription item ID is saved after first store add-on creation.

### 5.5 Enabled plan flags

```env
NEXT_PUBLIC_ENABLE_BILLING=false
BILLING_ENABLED_PLANS=single_clinic,group
```

If implementation resources are tight, one plan can be enabled first:

```env
BILLING_ENABLED_PLANS=single_clinic
# or
BILLING_ENABLED_PLANS=group
```

### 5.6 Trial rule

- Trial duration: 30 days.
- Payment method required at checkout.
- One trial per org.
- `trial_consumed=true` prevents second trial.
- Upgrade does not grant another trial.

---

## 6. Stripe Integration Assumptions

Implementation must verify current Stripe SDK/API shape at coding time.

### 6.1 Checkout

Use Checkout Session in `subscription` mode.

Required properties conceptually:

```ts
stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: stripeCustomerId,
  line_items: [
    { price: STRIPE_PRICE_..., quantity: ... },
  ],
  payment_method_collection: 'always',
  subscription_data: {
    trial_period_days: 30,
    metadata: {
      org_root_clinic_id,
      plan_code,
    },
  },
  client_reference_id: org_root_clinic_id,
  success_url,
  cancel_url,
});
```

Notes:

- `payment_method_collection: 'always'` is intended to require card collection for trial conversion.
- `client_reference_id` and metadata are both used for reconciliation.
- Do not rely only on client-returned success URL.
- Final subscription creation must be confirmed by webhook.
- Local `checkout_pending` state must have an expiry strategy. Do not leave an org permanently stuck in checkout-pending if the user abandons Checkout.

### 6.1.1 Checkout pending expiry

A Checkout Session can be abandoned or expire without completing a subscription.

Phase A must handle this in one of two ways:

1. Handle `checkout.session.expired` webhook and revert local `billing_state` from `checkout_pending` to `none` if no subscription exists.
2. Implement a TTL fallback: if a local checkout-pending state is older than the Checkout Session expiry window and no Stripe subscription exists, derive billing state as `none` and allow checkout retry.

Required behavior:

- `/admin/billing` must show retry checkout when pending expired.
- `checkout_pending` must never block a customer indefinitely.
- If a later `checkout.session.completed` arrives, webhook must still reconcile from Stripe and create/sync subscription normally.

### 6.2 Customer Portal

Use Customer Portal for:

- payment method update
- invoice history
- cancel at period end

Portal configuration must not allow:

- quantity changes
- arbitrary plan switching
- coupons/discounts unless explicitly approved

### 6.3 Subscription update / proration

For MVP commercial baseline:

```ts
proration_behavior: 'none'
```

Reason:

- simpler customer explanation
- fewer invoice surprises
- lower support burden

Future annual/daily proration policy can be a separate spec.

### 6.4 Subscription period fields

Stripe API versions can differ in where period fields are exposed.

Implementation rule:

- Create a mapper such as `mapStripeSubscriptionToBillingSnapshot()`.
- Do not scatter direct reads of `current_period_end` across the codebase.
- If period values are on subscription item rather than subscription, normalize in one mapper.
- Tests must use fixtures matching the project Stripe API version.

---

## 7. Domain Model

### 7.1 Terms

| Term | Meaning |
|---|---|
| org | root clinic + its child clinics |
| root clinic | `clinics.parent_id IS NULL`; contract subject |
| HQ | root clinic used as headquarters |
| store | operating child clinic under Group Plan |
| billable store | active store counted toward Stripe quantity |
| subscription | Stripe subscription for one org |
| billing state | app-derived access state from Stripe status + grace + override |

### 7.2 Hard invariants

```txt
one org_root_clinic_id has at most one current app subscription row
```

```txt
active_billable_store_count <= paid_store_quantity
```

```txt
single_clinic plan cannot have active child clinics
```

```txt
trial_consumed=true prevents any future free trial for the same org_root_clinic_id
```

```txt
customer admin can only read billing data for their own org
```

```txt
billing read access = role == 'admin' AND org_scope_contains(org_root_clinic_id)
```

```txt
store activation must be serialized; concurrent activation requests cannot make active_billable_store_count exceed paid_store_quantity
```

```txt
user JWT cannot insert/update/delete subscriptions
```

```txt
webhook processing is idempotent by Stripe event ID
```

---

## 8. Database Model

### 8.1 Table: `subscriptions`

Purpose:

- synchronized cache of Stripe subscription state
- access gate source
- org billing configuration

Suggested columns:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid pk | yes | default `gen_random_uuid()` |
| `org_root_clinic_id` | uuid unique fk | yes | references root `clinics.id` |
| `plan_code` | text | yes | `single_clinic` / `group` |
| `stripe_customer_id` | text unique null | no | created before/at checkout |
| `stripe_subscription_id` | text unique null | no | null until checkout completes |
| `stripe_single_subscription_item_id` | text unique null | no | Single plan item |
| `stripe_group_base_subscription_item_id` | text unique null | no | Group base item |
| `stripe_store_subscription_item_id` | text unique null | no | Group store add-on item |
| `stripe_status` | text | yes | raw Stripe status or `none` |
| `billing_state` | text | yes | app-derived state |
| `paid_store_quantity` | integer | yes | default 0; Group store add-on quantity |
| `current_period_start` | timestamptz null | no | normalized from Stripe |
| `current_period_end` | timestamptz null | no | normalized from Stripe |
| `trial_end` | timestamptz null | no | Stripe trial end |
| `trial_consumed` | boolean | yes | default false |
| `cancel_at_period_end` | boolean | yes | default false |
| `canceled_at` | timestamptz null | no | Stripe canceled_at |
| `ended_at` | timestamptz null | no | Stripe ended_at |
| `past_due_since` | timestamptz null | no | first payment failure time |
| `grace_until` | timestamptz null | no | Phase C |
| `last_stripe_event_id` | text null | no | latest processed event |
| `last_stripe_event_created` | timestamptz null | no | for out-of-order handling |
| `last_synced_at` | timestamptz null | no | app sync timestamp |
| `metadata` | jsonb | yes | default `{}` |
| `created_at` | timestamptz | yes | default now |
| `updated_at` | timestamptz | yes | trigger or explicit |

Constraints:

```sql
check (plan_code in ('single_clinic', 'group'))
```

```sql
check (paid_store_quantity >= 0)
```

```sql
check (billing_state in (
  'none',
  'checkout_pending',
  'trialing',
  'active',
  'cancel_scheduled',
  'past_due_grace',
  'past_due_locked',
  'canceled',
  'expired',
  'override_active'
))
```

Implementation note:

- `billing_state` may be stored for query speed, but must be computed by a single server-side function/helper.
- Do not let UI derive access behavior directly from raw `stripe_status`.

### 8.2 Table: `stripe_webhook_events`

Purpose:

- idempotency
- replayability
- debugging
- out-of-order handling

Suggested columns:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid pk | yes | default `gen_random_uuid()` |
| `stripe_event_id` | text unique | yes | event.id |
| `event_type` | text | yes | event.type |
| `stripe_created_at` | timestamptz null | no | event.created |
| `livemode` | boolean | yes | from event |
| `payload` | jsonb | yes | raw event payload |
| `processing_status` | text | yes | `received` / `processing` / `processed` / `ignored` / `failed` |
| `retryable` | boolean | yes | whether 500 retry may help |
| `processed_at` | timestamptz null | no | set when done |
| `processing_error` | text null | no | failure detail |
| `related_org_root_clinic_id` | uuid null | no | best-effort extraction |
| `related_stripe_subscription_id` | text null | no | best-effort extraction |
| `created_at` | timestamptz | yes | default now |
| `updated_at` | timestamptz | yes | trigger or explicit |

Constraints:

```sql
check (processing_status in ('received', 'processing', 'processed', 'ignored', 'failed'))
```

### 8.3 Table: `billing_audit_logs` — Phase C

Purpose:

- commercial auditability
- support diagnosis
- operator/internal action trace

Suggested columns:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid pk | yes | default `gen_random_uuid()` |
| `org_root_clinic_id` | uuid null | no | org target |
| `actor_type` | text | yes | `user` / `stripe` / `system` / `internal` |
| `actor_user_id` | uuid null | no | customer admin user when applicable |
| `internal_actor` | text null | no | script/route name for internal actions |
| `event_type` | text | yes | see event list below |
| `before_state` | jsonb null | no | snapshot |
| `after_state` | jsonb null | no | snapshot |
| `stripe_event_id` | text null | no | webhook source |
| `request_id` | text null | no | app request trace |
| `metadata` | jsonb | yes | default `{}` |
| `created_at` | timestamptz | yes | default now |

Event examples:

```txt
billing.checkout_started
billing.checkout_completed
billing.portal_opened
billing.subscription_synced
billing.subscription_canceled
billing.cancel_scheduled
billing.payment_failed
billing.payment_recovered
billing.trial_started
billing.trial_will_end
billing.tenant_add_requested
billing.tenant_pending_created
billing.tenant_activated
billing.tenant_activation_failed
billing.override_created
billing.override_expired
billing.internal_resync_started
billing.internal_resync_completed
billing.webhook_replayed
```

### 8.4 Table: `billing_overrides` — Phase C

Purpose:

- time-limited internal exceptions
- pilot/free access
- emergency access restoration

Do not add operator role for this table in Phase C. Use internal routes/scripts.

Suggested columns:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid pk | yes | default `gen_random_uuid()` |
| `org_root_clinic_id` | uuid fk | yes | target org |
| `override_state` | text | yes | `allow_full_access` / `allow_read_export` |
| `reason` | text | yes | required |
| `starts_at` | timestamptz | yes | default now |
| `expires_at` | timestamptz | yes | must be finite |
| `created_by_internal` | text | yes | script/route identifier |
| `revoked_at` | timestamptz null | no | manual revoke |
| `revoked_by_internal` | text null | no | script/route identifier |
| `metadata` | jsonb | yes | default `{}` |
| `created_at` | timestamptz | yes | default now |
| `updated_at` | timestamptz | yes | trigger or explicit |

Constraints:

```sql
check (override_state in ('allow_full_access', 'allow_read_export'))
```

```sql
check (expires_at > starts_at)
```

Policy:

- Overrides must always expire.
- No permanent free access override.
- Every override must create audit log.

### 8.5 Clinic billing fields — Phase B

To support pending-first store creation, add minimal clinic billing fields if not already present.

Suggested columns on `clinics`:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `billing_activation_status` | text | yes | default `active` for existing active clinics |
| `billing_activation_error` | text null | no | last activation failure |
| `billing_activated_at` | timestamptz null | no | set when paid capacity confirmed |

Allowed values:

```txt
active
pending_billing
activation_failed
suspended_billing
not_billable
```

Migration caution:

- Existing clinics should not be accidentally deactivated.
- Backfill existing active clinics as `active` or `not_billable` based on current tenant hierarchy and selected plan.
- For Single Plan root clinic, use `active` but prevent child creation.
- For Group root HQ, use `not_billable` unless root-as-store is explicitly supported.

---

## 9. RLS / Authorization

### 9.1 `subscriptions` RLS

Read:

- Customer `admin` can read only their own org subscription.
- RLS must check **both**:
  1. role is exactly customer `admin`
  2. user scope can access `org_root_clinic_id`
- Scope-only checks are insufficient. A manager/clinic_admin/staff/therapist/customer who happens to have root clinic scope must not read billing data.
- Do not rely on `can_access_clinic(org_root_clinic_id)` alone if that helper only validates clinic scope and does not validate role.

Recommended policy shape:

```sql
-- conceptual; adapt to existing auth claim/helper names
create policy "customer admin can read own subscription"
on public.subscriptions
for select
to authenticated
using (
  app_private.jwt_role() = 'admin'
  and app_private.can_access_clinic(org_root_clinic_id)
);
```

If the repository does not have a reliable SQL helper for current JWT role, create a small private helper or use the existing claim extraction pattern. Keep it fail-closed.

Write:

- User JWT insert/update/delete denied.
- Service-role writes only from webhook/internal server code.

Tests must prove that:

- org A admin cannot read org B subscription
- org A manager with org/root scope cannot read org A subscription
- clinic_admin/manager/therapist/staff/customer cannot read subscription rows unless a later spec explicitly grants limited billing visibility

### 9.2 `stripe_webhook_events` RLS

- No customer read access.
- No user JWT write access.
- Service-role only.

### 9.3 `billing_audit_logs` RLS — Phase C

Customer admin may read a limited subset for own org if a UI needs it.

Default policy:

- no customer read in first implementation
- service-role only
- internal support tools only

### 9.4 `billing_overrides` RLS — Phase C

- no customer read
- no customer write
- service-role/internal only

---

## 10. Billing State Machine

Do not drive app access directly from raw Stripe status.

### 10.1 Raw Stripe status examples

Expected statuses include:

```txt
incomplete
incomplete_expired
trialing
active
past_due
canceled
unpaid
paused
```

The app should tolerate unknown statuses by mapping them to a locked/safe state.

### 10.2 App billing states

| billing_state | Meaning | Business use |
|---|---|---|
| `none` | no subscription | paywall |
| `checkout_pending` | Checkout session created but webhook not completed | billing page only |
| `trialing` | trial active | full access |
| `active` | paid/current | full access |
| `cancel_scheduled` | active/trialing but `cancel_at_period_end=true` | full access until period end |
| `past_due_grace` | payment failed but within grace | limited/full depending phase |
| `past_due_locked` | payment failed beyond grace | no business writes |
| `canceled` | subscription ended | billing/read/export only |
| `expired` | post-retention state | restricted |
| `override_active` | internal temporary override | according to override |

### 10.3 Access matrix

| billing_state | Business read | Business write | Billing page | Portal | Tenant add | Export |
|---|---:|---:|---:|---:|---:|---:|
| `none` | no | no | yes | no | no | no |
| `checkout_pending` | no | no | yes | no | no | no |
| `trialing` | yes | yes | yes | yes | plan-dependent | yes |
| `active` | yes | yes | yes | yes | plan-dependent | yes |
| `cancel_scheduled` | yes | yes | yes | yes | no by default | yes |
| `past_due_grace` | yes | yes in Phase C policy | yes | yes | no | yes |
| `past_due_locked` | yes | no | yes | yes | no | yes |
| `canceled` | limited | no | yes | maybe | no | yes, policy-dependent |
| `expired` | no/limited | no | yes | maybe | no | policy-dependent |
| `override_active` | according to override | according to override | yes | maybe | maybe | yes |

### 10.4 State derivation helper

Implement a single helper:

```ts
function deriveBillingState(input: {
  stripeStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  graceUntil: Date | null;
  activeOverride?: BillingOverride | null;
  now: Date;
}): BillingState
```

No UI/API route should reimplement this logic.

---

## 11. API Routes

### 11.1 `GET /admin/billing`

Customer admin-only page.

Shows:

- plan
- billing state
- Stripe status
- current period end
- trial end
- cancel scheduled state
- paid store quantity
- active billable store count
- payment failure warning
- checkout button when eligible
- portal button when subscription/customer exists

Must not show:

- Stripe secrets
- raw webhook payloads
- other org billing data

### 11.2 `POST /api/admin/billing/checkout`

Purpose:

- create Checkout Session for eligible org

Auth:

- current user must be scoped customer `admin`
- org root must be derived from scoped context

Request body:

```ts
type CheckoutRequest = {
  plan_code: 'single_clinic' | 'group';
}
```

Server validations:

1. billing feature enabled
2. requested plan enabled
3. user is customer admin for org root
4. org has no active/trialing subscription
5. `trial_consumed` checked
6. plan restrictions checked
7. Single plan cannot have active child clinics
8. Group plan allowed with 0 child stores

Response:

```ts
type CheckoutResponse = {
  url: string;
  session_id: string;
}
```

Important:

- Create/update local `subscriptions` row as `checkout_pending` when session is created.
- Final active/trialing state only after webhook sync.

### 11.3 `POST /api/admin/billing/portal`

Purpose:

- create Customer Portal Session

Auth:

- customer admin only

Valid when:

- org has `stripe_customer_id`

Portal must be configured externally in Stripe Dashboard to disallow quantity changes.

Response:

```ts
type PortalResponse = {
  url: string;
}
```

### 11.4 `POST /api/stripe/webhook`

Purpose:

- receive Stripe events
- verify signature
- log event idempotently
- sync subscription state

Requirements:

- read raw body with `await request.text()` or equivalent
- verify `stripe-signature`
- do not pass through generic request body parsers that alter raw body
- do not require user session
- do not require Origin/Referer CSRF checks
- do not apply billing gate

### 11.5 Internal routes — Phase C

Use internal secret, not customer session.

Suggested paths:

```txt
POST /api/internal/billing/resync-subscription
POST /api/internal/billing/replay-webhook-event
POST /api/internal/billing/reconcile-tenant-quantity
POST /api/internal/billing/expire-overrides
POST /api/internal/billing/create-override
POST /api/internal/billing/revoke-override
```

Auth:

```txt
Authorization: Bearer ${INTERNAL_API_SECRET}
```

or existing project cron secret convention.

Rules:

- These routes must not be linked from customer UI.
- These routes must not use `admin` role as platform authority.
- Every mutating internal action must write audit log when Phase C audit exists.

---

## 12. Webhook Processing

### 12.1 Events to handle

Phase A required:

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
checkout.session.expired
```

Phase C additional:

```txt
customer.subscription.trial_will_end
```

Optional future:

```txt
invoice.finalized
invoice.voided
```

### 12.2 Response status rules

Return `400`:

- missing Stripe signature
- invalid Stripe signature
- malformed event payload before Stripe construction

Return `200`:

- duplicate already-processed event
- unsupported event type after logging as ignored
- stale out-of-order event that should not change state
- `checkout.session.expired` successfully reverting/marking stale pending checkout
- non-retryable domain error, such as missing metadata that cannot be fixed by retry

Return `500`:

- temporary DB/network failure
- Stripe API retrieve failure likely to succeed later
- transaction failure before event processing status is safely recorded

Do not return `500` for permanent data defects. That creates infinite retries without fixing the root cause.

### 12.3 Idempotency flow

Pseudo-flow:

```txt
1. read raw body
2. verify Stripe signature
3. insert stripe_webhook_events row with unique stripe_event_id
4. if unique conflict and already processed/ignored, return 200
5. mark as processing
6. process event in transaction where possible
7. update subscriptions / related rows
8. mark webhook event as processed or ignored
9. return 200
```

If processing fails after event row creation:

```txt
- mark processing_status='failed'
- retryable=true/false based on error
- return 500 only if retryable
- return 200 if non-retryable and alert/log
```

### 12.4 Out-of-order handling

Stripe events may arrive out of order.

Policy:

- Store `last_stripe_event_created` on `subscriptions`.
- If incoming event is older than the last processed event, do not blindly overwrite newer state.
- For subscription lifecycle events, retrieve the latest Stripe subscription when possible and sync from current Stripe object.
- Treat Stripe retrieve result as fresher than event payload.
- Log stale event as processed/ignored with reason.

### 12.5 Subscription sync mapper

Implement one mapper:

```ts
type BillingSnapshot = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeStatus: string;
  planCode: BillingPlanCode;
  itemIds: {
    single?: string;
    groupBase?: string;
    storeAddOn?: string;
  };
  paidStoreQuantity: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
};
```

Do not duplicate item parsing in API routes.

### 12.6 Metadata requirements

Stripe objects should contain enough metadata for reconciliation.

Required metadata where possible:

```txt
org_root_clinic_id
plan_code
app_environment
```

For Checkout Session:

```txt
client_reference_id = org_root_clinic_id
```

If metadata is missing:

1. try to resolve by `stripe_customer_id`
2. try to resolve by `stripe_subscription_id`
3. if unresolved, record non-retryable failure and alert

---

## 13. Checkout Rules

### 13.1 Single checkout

Line items:

```ts
[
  { price: STRIPE_PRICE_SINGLE_CLINIC_ID, quantity: 1 }
]
```

Preconditions:

- org has no active/trialing subscription
- no active child clinics
- plan enabled

### 13.2 Group checkout

If no child stores exist:

```ts
[
  { price: STRIPE_PRICE_GROUP_BASE_ID, quantity: 1 }
]
```

If child stores already exist and are billable:

```ts
[
  { price: STRIPE_PRICE_GROUP_BASE_ID, quantity: 1 },
  { price: STRIPE_PRICE_STORE_ADDON_ID, quantity: activeBillableStoreCount }
]
```

Preconditions:

- org has no active/trialing subscription
- plan enabled
- root clinic is valid org root

### 13.3 Trial behavior

If `trial_consumed=false`:

```ts
subscription_data.trial_period_days = 30
```

If `trial_consumed=true`:

- no trial
- immediate subscription start according to Stripe behavior

### 13.4 Checkout completion

`checkout.session.completed` must:

1. resolve org root clinic
2. retrieve subscription if needed
3. upsert `subscriptions`
4. set `trial_consumed=true` if trial was applied or session created with trial intent
5. set plan_code
6. save subscription item IDs
7. derive billing_state

Do not grant access based only on user redirect success.

---

## 14. Customer Portal / Cancellation

### 14.1 Portal scope

Customer Portal is used for:

- card update
- invoice history
- cancellation

Not used for:

- quantity changes
- arbitrary plan changes
- coupon application

### 14.2 Cancellation policy

Default cancellation mode:

```txt
cancel_at_period_end=true
```

Policy:

- period-end cancellation is standard
- immediate cancellation is not exposed in app UI
- if Stripe Portal allows immediate cancellation, disable it in Portal configuration if possible
- if immediate cancellation occurs, app must handle `customer.subscription.deleted`

### 14.3 Cancel scheduled state

When `customer.subscription.updated` indicates `cancel_at_period_end=true`:

- keep business access until `current_period_end`
- set `billing_state='cancel_scheduled'`
- show cancellation scheduled warning on `/admin/billing`
- disable tenant add by default

### 14.4 Cancel complete state

When `customer.subscription.deleted` arrives:

- set `stripe_status='canceled'`
- set `billing_state='canceled'`
- business writes disabled
- billing page remains accessible
- data access follows post-cancellation policy

### 14.5 Reactivation before period end

If cancellation is scheduled but period has not ended:

- cancellation can be reversed by setting `cancel_at_period_end=false`
- Phase A: use Customer Portal if supported by configuration
- Phase C: add internal recovery route if needed

### 14.6 Reactivation after canceled

After `status=canceled`:

- do not reuse old subscription as active
- create new Checkout Session
- reuse existing Stripe Customer when safe
- preserve `trial_consumed=true`
- no second trial

---

## 15. Store Addition / Tenant Billing — Phase B

### 15.1 Store addition is a billing event

For Group Plan, adding a tenant/store changes paid quantity.

Do not let customers add active stores without paid capacity.

### 15.2 Pending-first flow

Flow:

```txt
1. customer admin submits store creation from /admin/tenants
2. server validates admin scope and Group Plan
3. server creates clinic with:
   - is_active=false
   - billing_activation_status='pending_billing'
4. server updates Stripe store add-on quantity +1
5. webhook syncs paid_store_quantity
6. app confirms active_billable_store_count < paid_store_quantity
7. app activates pending clinic:
   - is_active=true
   - billing_activation_status='active'
   - billing_activated_at=now()
8. if activation fails, keep clinic pending/failed and show admin warning
```

### 15.3 Stripe quantity increase

If `stripe_store_subscription_item_id` exists:

```ts
stripe.subscriptionItems.update(itemId, {
  quantity: paidStoreQuantity + 1,
  proration_behavior: 'none',
});
```

If it does not exist:

- create new subscription item for `STRIPE_PRICE_STORE_ADDON_ID`
- quantity should be 1 or the computed target quantity
- save item ID from Stripe response/webhook

### 15.4 Store deactivation

When store is deactivated:

- app may set `is_active=false`
- paid quantity reduction should default to next period / manual review policy
- no immediate refund in commercial baseline
- Phase C can implement scheduled quantity decrease

### 15.5 Invariant check and concurrency guard

Before any store activation:

```txt
active_billable_store_count + pending_activation_count_to_activate <= paid_store_quantity
```

For the actual activation transaction:

```txt
active_billable_store_count < paid_store_quantity
```

This invariant must be protected against concurrent activation requests.

Do not implement this as:

```txt
query count -> if count < quantity -> update clinic active
```

unless the count and update happen inside a transaction that serializes competing activations.

Required implementation approach:

1. Create a database RPC/function such as `activate_billable_store_if_capacity(org_root_clinic_id, clinic_id)`.
2. In that function, start a transaction and lock the org subscription row:

```sql
select *
from public.subscriptions
where org_root_clinic_id = target_org_root_clinic_id
for update;
```

3. Recompute active billable store count inside the same transaction.
4. Activate exactly one pending clinic only if capacity remains.
5. Otherwise raise a domain error / return a typed failure.

Alternative acceptable approach:

- Use a transaction-level advisory lock keyed by `org_root_clinic_id` if row locking is not feasible.

Not acceptable:

- app-layer only locking
- separate unlocked count and update queries
- trusting Stripe quantity update alone without DB-side serialization

Tests must simulate two concurrent activation attempts where only one paid slot remains. Exactly one activation may succeed.

### 15.6 Existing route integration

Add billing logic to:

```txt
POST /api/admin/tenants
PATCH /api/admin/tenants/[clinic_id]
```

Do not create parallel tenant routes unless there is a strong reason.

### 15.7 Failure handling

Stripe success, DB activation failure:

- keep pending clinic
- show recovery message
- internal reconcile route can activate later

DB pending creation success, Stripe failure:

- keep clinic inactive pending/failed
- show payment/update failure
- allow retry or deletion before activation

Webhook delay:

- show `課金反映待ち`
- do not activate until paid quantity confirmed

---

## 16. Single → Group Upgrade — Phase D

Upgrade is valuable but dangerous because it can double bill.

### 16.1 Policy

When upgrading Single → Group:

1. preserve `org_root_clinic_id`
2. preserve existing Stripe Customer when safe
3. create or switch to Group subscription
4. cancel old Single subscription
5. do not grant a second trial
6. enable child tenant creation only after Group subscription is active/trialing

### 16.2 Safe implementation options

Option A — replace subscription in Stripe:

- update existing subscription items from Single item to Group base item
- add store add-on item when stores are added
- avoids two active subscriptions
- requires careful Stripe item mutation

Option B — create new Group subscription, cancel Single:

- simpler mental model
- risk of temporary double billing
- must cancel Single at the correct time
- must handle failure between creation and cancellation

Preferred:

```txt
Option A if Stripe item mutation is straightforward.
Option B only with explicit compensating logic and tests.
```

### 16.3 Required tests

- no two active subscriptions for the same org
- no second trial
- old Single item is removed or old subscription is canceled
- root clinic remains same
- child tenant creation remains disabled until Group state is active/trialing

---

## 17. Dunning / Payment Failure — Phase C

### 17.1 Phase A behavior

Phase A simple policy:

- `invoice.payment_failed` sets raw status / billing state based on Stripe subscription status
- business writes may be blocked once mapped to `past_due_locked`
- billing page remains accessible
- Customer Portal remains accessible

### 17.2 Phase C grace period

Recommended commercial policy:

```txt
past_due grace = 14 days
```

Flow:

```txt
1. invoice.payment_failed
2. set past_due_since if null
3. set grace_until = past_due_since + 14 days
4. billing_state='past_due_grace'
5. send notification
6. after grace_until, set billing_state='past_due_locked'
7. block business writes
8. if payment recovers, clear past_due_since/grace_until and return active/trialing
```

### 17.3 Dunning notifications

Use `email_outbox` pattern.

Events:

- payment failed
- grace ending soon
- access locked
- payment recovered

---

## 18. Post-Cancellation Data Policy

This is a legal/commercial policy area.

### 18.1 Baseline product stance

After cancellation:

Allowed by default:

- billing page
- invoice access through Stripe Portal when possible
- limited read access if policy permits
- CSV export if implemented

Blocked:

- new daily reports
- new reservations sync
- new staff creation
- AI analysis
- shift generation
- tenant addition
- settings mutation, except billing/contact essentials

### 18.2 Legal review required

Do not hard-code a final retention period as product truth without legal/contract review.

Open legal items:

- medical/clinic operational data retention
- personal information handling
- customer export rights
- deletion obligations
- contract termination language
- Japanese invoice/tax document obligations

### 18.3 Temporary implementation stance

Until legal policy is finalized:

- do not auto-delete customer business data
- lock business writes after cancellation
- keep admin billing access
- expose export only if implementation is tested
- document manual export support if needed

---

## 19. Billing Override — Phase C

### 19.1 Use cases

- internal pilot
- emergency access restoration
- billing incident compensation
- temporary manual contract

### 19.2 Rules

- override must expire
- reason required
- internal actor required
- audit log required
- customer admin cannot create override
- override cannot permanently bypass billing

### 19.3 Internal route example

```txt
POST /api/internal/billing/create-override
Authorization: Bearer ${INTERNAL_API_SECRET}
```

Request:

```ts
type CreateOverrideRequest = {
  org_root_clinic_id: string;
  override_state: 'allow_full_access' | 'allow_read_export';
  reason: string;
  expires_at: string;
}
```

---

## 20. Billing Gate

### 20.1 Gate location

Phase A:

- page/server layout gate
- API-level guard

Do not implement middleware billing gate initially.

Reason:

- middleware is high blast-radius
- DB lookups in middleware are expensive/fragile
- existing auth/session behavior can be sensitive

### 20.2 Allowed routes regardless of billing state

Always allow:

```txt
/admin/billing
/api/admin/billing/checkout
/api/admin/billing/portal
/api/stripe/webhook
/logout
/unauthorized
```

Internal routes are separately protected by secret.

### 20.3 Guard helper

Implement:

```ts
async function assertBillingAccess(input: {
  userId: string;
  orgRootClinicId: string;
  operation: 'business_read' | 'business_write' | 'tenant_add' | 'billing_manage' | 'export';
}): Promise<BillingAccessResult>
```

No route should implement ad-hoc status checks.

---

## 21. Environment Variables

Add through `src/lib/env.ts` or the existing env validation pattern. New billing code should use a single env/internal-secret helper rather than scattered direct `process.env` reads.

Server-only:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_SINGLE_CLINIC_ID=
STRIPE_PRICE_GROUP_BASE_ID=
STRIPE_PRICE_STORE_ADDON_ID=
INTERNAL_API_SECRET=
CRON_SECRET=
```

Public / safe config:

```env
NEXT_PUBLIC_ENABLE_BILLING=false
BILLING_ENABLED_PLANS=single_clinic,group
```

Notes:

- Never expose Stripe secret key to client.
- Use placeholder values in `.env.example` files.
- Do not commit real secrets.
- Secret scanning must pass.
- Existing internal routes may already read `process.env.CRON_SECRET` directly. Do not copy that pattern into new billing code unless the project standard is explicitly kept as-is. Prefer wrapping `INTERNAL_API_SECRET` and `CRON_SECRET` in `src/lib/env.ts` or a dedicated `src/lib/internal/secrets.ts`.

---

## 22. UI Requirements

### 22.1 `/admin/billing`

Minimum sections:

```txt
Current Plan
Billing Status
Trial / Next Billing Date
Paid Store Quantity
Active Store Count
Payment Warning
Actions
```

Actions:

- Start subscription
- Manage payment / invoices / cancellation
- Retry checkout if pending expired

### 22.2 Cancel scheduled UI

When `cancel_at_period_end=true`:

```txt
契約は YYYY-MM-DD に終了予定です。終了日までは通常通り利用できます。
```

Tenant addition should be disabled by default.

### 22.3 Past due UI

During grace:

```txt
お支払いに失敗しました。YYYY-MM-DD までにお支払い方法を更新してください。
```

Locked:

```txt
お支払い確認ができないため、業務操作を一時停止しています。お支払い管理から更新してください。
```

### 22.4 Tenant add UI — Phase B

Show:

```txt
契約店舗数: N
有効店舗数: M
追加可能店舗数: N - M
```

When adding store:

```txt
この操作により契約店舗数が増加します。
```

If pending:

```txt
課金反映待ちです。反映後に店舗を有効化します。
```

---

## 23. Security Requirements

### 23.1 Stripe webhook

- Verify signature.
- Use raw body.
- No user auth required.
- No CSRF Origin/Referer check.
- Only accept configured webhook secret.

### 23.2 Customer admin APIs

- Require authenticated user.
- Require scoped admin authorization.
- Resolve org root from server-side context.
- Ignore client-provided org_root_clinic_id unless validated against scope.

### 23.3 Internal APIs

- Require internal secret.
- Not exposed in UI.
- Rate-limit if public URL accessible.
- Audit all mutating actions.

### 23.4 Data leaks

- Customer admin cannot read other org subscription.
- Stripe webhook payloads are never exposed to customer UI.
- Billing override reasons are not exposed unless intentionally designed.

---

## 24. Testing Strategy

### 24.1 Unit tests

- `deriveBillingState()`
- `mapStripeSubscriptionToBillingSnapshot()`
- plan line item builder
- billing access guard
- active billable store count calculator
- trial eligibility

### 24.2 Webhook tests

Required:

1. invalid signature returns 400
2. valid `checkout.session.completed` creates/syncs subscription
3. duplicate event returns 200 and does not double update
4. unsupported event is logged and ignored with 200
5. `customer.subscription.updated` updates status/quantity/period
6. `customer.subscription.deleted` maps to canceled
7. `invoice.payment_failed` maps to payment failure state
8. retryable DB failure returns 500
9. non-retryable missing metadata logs failure and returns 200
10. older event does not overwrite newer state incorrectly
11. `checkout.session.expired` clears/expires checkout-pending without consuming trial
12. expired checkout allows retry checkout

### 24.3 Checkout / Portal tests

1. customer admin can create checkout
2. non-admin cannot create checkout
3. other org admin cannot create checkout for unrelated org
4. Single checkout creates single line item quantity 1
5. Group checkout creates base-only when 0 stores
6. Group checkout creates base + add-on when stores exist
7. `trial_consumed=true` prevents second trial
8. portal session requires existing customer
9. portal session is scoped to own org customer

### 24.4 Tenant billing tests — Phase B

1. Single plan rejects child tenant creation
2. Group plan allows pending clinic creation
3. pending clinic is inactive
4. Stripe quantity update failure keeps clinic inactive
5. active store count cannot exceed paid quantity
6. webhook quantity sync enables activation
7. `PATCH /api/admin/tenants/[clinic_id]` cannot activate unpaid store
8. deactivation does not create immediate refund behavior
9. two concurrent activations with one remaining paid slot result in exactly one active clinic
10. activation guard uses DB transaction/lock, not only app-layer check

### 24.5 RLS / tenant isolation tests

1. org A admin cannot read org B subscription
2. org A manager with root/org scope cannot read org A subscription
3. clinic_admin/manager/therapist/staff/customer cannot read subscriptions unless explicitly allowed by a later spec
4. user JWT cannot insert subscription
5. user JWT cannot update subscription
6. user JWT cannot delete subscription
7. service role can process webhook writes

### 24.6 Commercial ops tests — Phase C

1. override grants access until expiry
2. expired override no longer grants access
3. override requires reason
4. override action writes audit log
5. internal route rejects missing/invalid secret
6. resync route updates subscription from Stripe mock
7. audit logs capture before/after state

### 24.7 Upgrade tests — Phase D

1. Single → Group does not create two active subscriptions
2. old Single item/subscription is removed or canceled
3. no second trial
4. root clinic stays same
5. child tenant creation enabled only after Group state active/trialing

---

## 25. PR Plan for Codex

Each PR must include tests and be independently reviewable.

### PR1 — Billing DB Core

Files likely touched:

- `supabase/migrations/*`
- `supabase/rollbacks/*`
- generated types if applicable

Implement:

- `subscriptions`
- `stripe_webhook_events`
- RLS
- constraints
- rollback SQL

Done when:

- migration applies
- rollback applies
- RLS tests pass, including role-based denial for non-admin scoped users
- type generation passes

Codex instruction:

```txt
Implement only billing DB core. Do not add Stripe SDK or routes in this PR.
```

### PR2 — Stripe SDK / Env / Server Wrapper

Implement:

- install `stripe`
- env validation
- `src/lib/stripe/server.ts`
- Stripe client singleton/server helper
- test fixtures/helpers

Done when:

- no client bundle imports Stripe secret
- env examples updated
- lint/type-check pass

Codex instruction:

```txt
Add Stripe server infrastructure only. Do not implement checkout or webhook yet.
```

### PR3 — Webhook Core

Implement:

- `POST /api/stripe/webhook`
- raw body handling
- signature verification
- event log idempotency
- subscription sync mapper
- event handlers for Phase A events

Done when:

- webhook tests pass
- duplicate event safe
- invalid signature returns 400
- `checkout.session.expired` clears/retries pending checkout safely
- route bypasses generic auth/CSRF wrappers safely

Codex instruction:

```txt
Implement webhook core with idempotency. Do not add customer-facing billing UI in this PR.
```

### PR4 — Checkout / Portal APIs

Implement:

- `POST /api/admin/billing/checkout`
- `POST /api/admin/billing/portal`
- plan line item builder
- trial eligibility
- customer creation/reuse

Done when:

- admin scoped auth tests pass
- Single/Group line items correct
- checkout creates local `checkout_pending` row
- portal requires own customer

Codex instruction:

```txt
Implement customer admin checkout/portal APIs. Do not implement tenant quantity guard yet.
```

### PR5 — Billing Page

Implement:

- `/admin/billing`
- minimal UI
- checkout action
- portal action
- status display
- cancel scheduled display

Done when:

- admin-only access
- no cross-org data
- feature flag respected

Codex instruction:

```txt
Implement minimal billing page. Do not add complex charts or self-made invoice UI.
```

### PR6 — Billing Gate

Implement:

- `deriveBillingState()`
- `assertBillingAccess()`
- page/API-level guards for business routes
- allowlist routes

Done when:

- active/trialing allowed
- none/canceled blocked for business write
- billing page allowed
- middleware unchanged

Codex instruction:

```txt
Implement page/API-level billing gate only. Do not modify middleware.
```

### PR7 — Tenant Billing Guard

Implement:

- clinic billing fields if needed
- pending-first creation in `POST /api/admin/tenants`
- activation guard in `PATCH /api/admin/tenants/[clinic_id]`
- Stripe store add-on quantity update
- paid quantity invariant

Done when:

- unpaid active store cannot be created
- pending clinic remains inactive until paid quantity exists
- Stripe failure does not activate clinic
- concurrent activation cannot exceed paid capacity
- capacity check and activation are serialized by DB transaction/lock

Codex instruction:

```txt
Implement Group tenant billing guard using existing admin tenant routes. Do not create parallel tenant routes.
```

### PR8 — Internal Recovery Tools

Implement:

- internal route secret validation
- resync subscription
- reconcile tenant quantity
- replay webhook event if safe

Done when:

- invalid secret rejected
- no customer session access
- logs/audit where available

Codex instruction:

```txt
Implement internal recovery routes protected by INTERNAL_API_SECRET. Do not add operator role or UI.
```

### PR9 — Audit / Override

Implement:

- `billing_audit_logs`
- `billing_overrides`
- override derivation in billing state
- expire override route/script

Done when:

- overrides expire
- every override writes audit log
- customer admin cannot create/read overrides

Codex instruction:

```txt
Implement commercial ops DB and internal override behavior. Do not expose operator UI.
```

### PR10 — Upgrade Hardening

Implement:

- Single → Group upgrade flow
- no double billing
- no second trial
- root clinic preservation
- tests

Done when:

- there is never more than one active/trialing subscription for org
- child tenant creation only after Group active/trialing

Codex instruction:

```txt
Implement Single to Group upgrade only after baseline billing and tenant guard are stable.
```

---

## 26. Feature Flags

Required:

```env
NEXT_PUBLIC_ENABLE_BILLING=false
BILLING_ENABLED_PLANS=single_clinic,group
```

Optional:

```env
ENABLE_BILLING_TENANT_GUARD=false
ENABLE_BILLING_OVERRIDES=false
ENABLE_BILLING_INTERNAL_ROUTES=false
ENABLE_BILLING_UPGRADE=false
```

Flag policy:

- DB can exist before feature is on.
- Routes can exist but return disabled response if flag off.
- Gates must be disabled by default until explicitly enabled in target environment.
- Webhook can be deployed before billing gate is enabled.

---

## 27. Rollback Plan

### 27.1 Emergency disable

Set:

```env
NEXT_PUBLIC_ENABLE_BILLING=false
```

Expected result:

- billing gate disabled
- customer business access restored according to old behavior
- Stripe subscriptions still exist externally
- billing routes may remain accessible but should not gate product

### 27.2 DB rollback

Each migration must have rollback SQL.

Rollback order:

1. disable feature flags
2. stop webhook endpoint in Stripe Dashboard if necessary
3. rollback dependent code
4. rollback DB tables/columns only after data export/backups

### 27.3 Stripe rollback

Stripe state cannot be rolled back by DB rollback.

Manual/operational steps:

- cancel test subscriptions
- archive test prices if needed
- remove webhook endpoint if broken
- use Stripe Dashboard for customer-specific fixes

---

## 28. Observability

Minimum logs:

- checkout session created
- portal session created
- webhook received
- webhook processed/ignored/failed
- subscription synced
- billing gate denied
- tenant activation pending/failed/activated
- internal resync called

Log fields:

```txt
request_id
org_root_clinic_id
stripe_customer_id
stripe_subscription_id
stripe_event_id
event_type
billing_state
plan_code
```

Do not log:

- card details
- Stripe secret keys
- full personal data unless necessary

---

## 29. Open Questions

These are intentionally not resolved in this spec.

1. Exact prices in JPY.
2. Whether root clinic can be both HQ and billable store in Group Plan.
3. Legal retention period after cancellation.
4. Stripe Tax / Japanese invoice registration details.
5. Annual plan / discount policy.
6. Refund policy.
7. Group → Single downgrade policy.
8. Whether platform identity should become `platform_admin` or separate auth system.
9. Whether middleware gate should ever replace page/API gate.
10. Whether store deactivation should reduce quantity immediately or at next renewal.

---

## 30. Acceptance Criteria

Commercial baseline is acceptable when:

1. A customer admin can start a subscription through Checkout.
2. Stripe webhook syncs subscription status idempotently.
3. A customer admin can manage payment/cancellation through Portal.
4. App gates business access based on derived billing state.
5. User JWT cannot mutate billing state.
6. Customer admin cannot read another org billing data.
7. Non-admin scoped users cannot read subscription rows.
8. Single Plan cannot create child stores.
9. Group Plan can add stores only with paid capacity.
10. Concurrent store activation cannot exceed paid capacity.
11. Checkout pending cannot trap an org permanently after session expiry.
12. Webhook duplicate/out-of-order events do not corrupt state.
13. Internal recovery exists without inventing an operator role.
14. Feature flags can disable billing gate safely.
15. Tests cover critical invariants.

---

## 31. Implementation Checklist

Before implementation:

- [ ] Confirm current Stripe API version in dashboard/project.
- [ ] Create Stripe products/prices in test mode.
- [ ] Configure Customer Portal to disallow quantity changes.
- [ ] Decide initial enabled plan(s).
- [ ] Confirm env validation pattern.
- [ ] Confirm RLS helper for org root scope.
- [ ] Confirm SQL/JWT helper for role == admin in subscription RLS.
- [ ] Confirm existing admin tenant route behavior.
- [ ] Choose store activation serialization method: subscription row `FOR UPDATE` or advisory lock.

During implementation:

- [ ] Keep PRs small.
- [ ] Add tests per PR.
- [ ] Add rollback SQL per migration.
- [ ] Keep feature flags default-off.
- [ ] Use raw body for webhook.
- [ ] Use service role only where justified.
- [ ] Do not touch middleware unless explicitly scoped.

Before enabling billing gate:

- [ ] Test Stripe Checkout in test mode.
- [ ] Test webhook duplicate delivery.
- [ ] Test subscription cancellation.
- [ ] Test payment failure fixture/simulation.
- [ ] Test tenant isolation.
- [ ] Test non-admin scoped users cannot read billing rows.
- [ ] Test concurrent tenant activation.
- [ ] Test emergency disable flag.
- [ ] Confirm Customer Portal quantity changes are disabled.

---

## 32. v0.5 Review Fixes

This version incorporates review-team invariant feedback.

### 32.1 Must-fix invariants added

1. `subscriptions` RLS is not scope-only. It must require customer `admin` role plus org scope.
2. Store activation must be serialized using DB transaction/lock semantics so concurrent activation cannot exceed paid quantity.

### 32.2 Additional hardening added

1. `checkout.session.expired` is Phase A required, or equivalent TTL fallback is required.
2. New billing code should use env/internal-secret helper for `INTERNAL_API_SECRET` / `CRON_SECRET`, even if older internal routes direct-read `process.env.CRON_SECRET`.
3. Trial reuse through newly-created org roots is acknowledged as an onboarding/governance issue, not solved in billing logic.

### 32.3 Trial reuse caveat

`trial_consumed` is enforced per `org_root_clinic_id`.

If onboarding allows customers to freely create new root clinics, a customer could create a new org and receive a new trial. This baseline assumes org/root creation is controlled by onboarding/admin processes. If self-serve org creation is later introduced, add an account-level or verified-business-level trial eligibility model.

## 33. Final Position

This spec intentionally favors commercial correctness over minimal implementation size.

The implementation strategy is still incremental:

```txt
Commercial design upfront.
Small PRs.
Feature flags.
Tests around invariants.
No invented operator role.
No unpaid active stores.
No middleware blast radius.
```

If a future implementation agent tries to simplify this by removing idempotency, pending-first activation, role-aware RLS boundaries, serialized activation, checkout expiry recovery, or access-state derivation, reject that change.

Those are not optional polish. They are the billing spine of Tiramisu.

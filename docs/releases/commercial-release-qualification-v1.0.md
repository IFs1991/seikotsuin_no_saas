# Commercial Release Qualification v1.0

## 文書情報と目的

- Status: CURRENT / SSOT
- Scope: 有人常時介入なしで複数顧客へ継続課金する一般商用提供
- Owner: `UNASSIGNED`
- Implementation reference: [Commercial hardening migration spec](../stabilization/spec-commercial-hardening-migration-v1.0.md)

PR番号の完了ではなく、以下の商用品質不変条件を証拠で判定する。status・証跡形式は [Change DoD](../quality/change-dod-v1.0.md#共通status) と同一。

## Database contract（COMM-DB、全てblocking）

- `001` migration履歴append-only、`002` clean replay、`003` local/remote parity、`004` generated Supabase types parity、`005` schema drift検出、`006` seed再現性、`007` pgTAP、`008` linked/staging検証。

## Tenant integrity（COMM-TENANT、全てblocking・waiver不可）

- `001` RLS、`002` table GRANT/default privilege、`003` function EXECUTE/fixed search_path、`004` composite FK、`005` parent rehome protection、`006` tenant A/B CRUD negative test、`007` internal table client拒否、`008` shared master read-only、`009` legacy table隔離。

## Authentication / authorization（COMM-AUTH、全てblocking・waiver不可）

- `001` DB権限をauthoritative source、`002` permissions query error/missing permissionをfail-closed、`003` stale JWTで権限復活なし、`004` inactive拒否、`005` manager assignment失効、`006` invite acceptance atomicity、`007` concurrent invite claim、`008` partial write防止。

## API boundary（COMM-API、全てblocking）

- `001` 全POST/PUT/PATCH/DELETE分類、`002` side-effect GET明示、`003` clinic scope、`004` billing gate、`005` public validation、`006` internal secret、`007` webhook signature/idempotency、`008` rate limit、`009` 未分類routeをCI failure。

## Billing（COMM-BILL、全てblocking・waiver不可）

- `001` Stripe test mode Checkout、`002` webhook署名/idempotency/out-of-order、`003` Customer Portal、`004` checkout expiry recovery、`005` cancellation/payment failure、`006` subscription state同期、`007` tenant数量制御/concurrent store activation、`008` emergency disable、`009` 他org/non-adminのbilling data拒否。

## Operations / release（COMM-OPS、全てblocking）

- `001` isolated staging、`002` migration apply rehearsalとpre/post advisor diff、`003` backup、`004` restore drillとrestore後tenant isolation、`005` RTO/RPO実測、`006` branch protection/required checks/no direct push/review required、`007` canaryとproduction apply plan、`008` post-deploy smoke、`009` 24h/72h monitoring、`010` incident/forward-fix runbook、`011` release sign-off。

## 証跡・再検証

PASSは環境・commit SHAに拘束する。local PASSはstaging/production readinessを、staging PASSはproductionを証明しない。manual testは実行者、日時、環境、手順が必須。設定変更・新commit・期限切れ・incidentで再検証する。仕様の予定、PR計画、過去のDoD PASSは証拠ではない。

## 判定

- `GO`: 全blockingが対象commit/環境の有効な`PASS`。
- `CONDITIONAL_GO`: blockingは全PASSで、non-blockingだけにowner・期限・mitigation付き`PASS_WITH_RISK`。security、tenant isolation、data loss、backup/restore、billing integrityには使用不可。
- `NO_GO`: blockingに`FAIL`/`NOT_RUN`/期限切れ/証拠なし/原則`PASS_WITH_RISK`が1つでもある、restore drill未実施、実課金経路未検証、重大riskのowner不在。

```yaml
id: COMM-TENANT-006
title: Tenant A/B negative tests
status: NOT_RUN
blocking: true
environment: staging
commit: '<git sha>'
owner: UNASSIGNED
verified_at: '<ISO-8601>'
expires_at: null
evidence: []
residual_risk: []
notes: 'facts only'
```

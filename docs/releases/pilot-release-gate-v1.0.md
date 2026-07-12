# Pilot Release Gate v1.0

## 文書情報と目的

- Status: CURRENT / SSOT
- Scope: 2〜3院、有人サポート付き限定pilotまたは有償β
- Owner: `UNASSIGNED`

「コードがある」ではなく治療院の実業務へ安全に出せるかを判断する。status・証跡形式は [Change DoD](../quality/change-dod-v1.0.md#共通status) と同一とし、各項目にstable ID、blocking、環境、commit、owner、日時、有効期限、実在証跡、残余riskを記録する。ページ表示だけを業務フロー完了としない。

## A. Core product flow（全てblocking）

| ID             | 実業務シナリオ                                  |
| -------------- | ----------------------------------------------- |
| PILOT-CORE-001 | スタッフログイン                                |
| PILOT-CORE-002 | 予約作成・変更・キャンセル                      |
| PILOT-CORE-003 | 患者作成・検索・情報更新                        |
| PILOT-CORE-004 | 日報入力・保存                                  |
| PILOT-CORE-005 | 日報から収益・会計情報への反映確認              |
| PILOT-CORE-006 | 公開予約/公開メニューが対象tenant限定           |
| PILOT-CORE-007 | validation、通信・権限errorから利用者が復旧可能 |

実データ相当の一連操作、永続化、再読込、期待される副作用を確認する。

## B. Tenant / authorization（全てblocking、waiver不可）

| ID            | 条件                                                         |
| ------------- | ------------------------------------------------------------ |
| PILOT-SEC-001 | tenant AからBをread不可                                      |
| PILOT-SEC-002 | tenant AからBへinsert/update/delete不可                      |
| PILOT-SEC-003 | URL直接入力とAPI request改ざんによる越境拒否                 |
| PILOT-SEC-004 | admin / clinic_admin / manager / therapist / staffの主要境界 |
| PILOT-SEC-005 | inactive accountと権限削除後/stale権限を拒否                 |
| PILOT-SEC-006 | service role使用前にuserとclinic scope確定                   |

RLSを含む実DBnegative testを要求し、UIまたはmockだけではPASSにしない。

## C. Reliability / operations

| ID            | Blocking条件                                                   |
| ------------- | -------------------------------------------------------------- |
| PILOT-OPS-001 | health check、Sentry等のerror監視、最低限alert                 |
| PILOT-OPS-002 | backup取得確認、incident runbook、rollback/feature disable手順 |
| PILOT-OPS-003 | support責任者、known issues、問い合わせ/障害記録方法           |
| PILOT-OPS-004 | feature flagsとpilot対象外機能の遮蔽                           |
| PILOT-OPS-005 | maintenance window、初期導入手順                               |

## D. Data / legal

全てblocking。`PILOT-DATA-001` 利用規約/Privacy Policy、`002` 患者情報access方針、`003` service role key管理、`004` logへ患者情報/secretを不要に残さない、`005` audit log対象操作、`006` 削除・退会・契約終了時の暫定運用、`007` 本番データtest禁止または厳格統制を確認する。

## E. Pilot launch

`PILOT-LAUNCH-001` 対象院/ユーザー/機能/対象外機能、`002` onboarding/release/support/monitoring owner、`003` launch日時、`004` 24h/72h review、`005` 継続/停止判断を事前記録する。全てblockingでowner不在は`NOT_RUN`。

## 支払い

手動請求・請求書払いでもよいが、方式、owner、請求・回収・未払い対応をblocking項目`PILOT-PAY-001`として明示する。アプリ内Stripe Billingを有効化する場合のみ、test mode Checkout、署名付きwebhook、Portal、重複event、解約、支払失敗を`PILOT-PAY-002`〜`007`としてblocking追加する。

## 判定

- `GO`: 全blockingが対象commit/環境の有効な`PASS`（または根拠付き`NOT_APPLICABLE`）。
- `CONDITIONAL_GO`: blockingは全てPASS、non-blockingだけにowner・期限・mitigation付き`PASS_WITH_RISK`。
- `NO_GO`: blockingの`FAIL`/`NOT_RUN`/期限切れ/証拠なし、security/tenant/data loss risk、owner不在の重大risk。

## Gate item template

```yaml
id: PILOT-SEC-001
title: Tenant A cannot read Tenant B
status: NOT_RUN
blocking: true
environment: staging
commit: '<git sha>'
owner: UNASSIGNED
verified_at: '<ISO-8601>'
expires_at: null
evidence: []
residual_risk: []
notes: 'No evidence means NOT_RUN'
```

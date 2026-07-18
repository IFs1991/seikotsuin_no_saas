---
title: "整骨院SaaS 商用ハードニング・DBマイグレーション改修仕様書"
document_id: "SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11"
version: "1.0"
status: "READY_FOR_TEAM_IMPLEMENTATION"
language: "ja"
audit_date: "2026-07-11"
repository: "IFs1991/seikotsuin_no_saas"
base_branch: "main"
base_commit: "c12f7c13b0dca2c05e4ac7ced53b3bf9e665592e"
supabase_project_ref: "qnanuoqveidwvacvbhqp"
target_executor: "Codex implementation team"
risk_class: "CRITICAL_SECURITY_AND_DATA_INTEGRITY"
production_change_requires_explicit_operator_approval: true
---

# 整骨院SaaS 商用ハードニング・DBマイグレーション改修仕様書 v1.0

## 0. LLM START HERE

この文書は、`IFs1991/seikotsuin_no_saas` を**有人運用前提の有償βから、再現可能な商用運用基盤へ引き上げるための実装正本**である。

実装担当Codexは、作業開始時に必ず次の順序で読むこと。

1. リポジトリ直下の `AGENTS.md`
2. リポジトリ直下の `CLAUDE.md`
3. 本仕様書
4. 対象ディレクトリ直下の追加 `AGENTS.md` / `AGENTS.override.md`
5. 対象PRの実装チケット
6. 変更対象の既存テスト・マイグレーション・ロールバックSQL

### 0.1 最重要命令

- **1 task = 1 PR**を維持する。下記PR計画を巨大な1本へ統合しない。
- 適用済みマイグレーションを編集しない。常に新しいforward migrationを追加する。
- RLS、GRANT、認可、課金、clinic scopeを、テストを通す目的で弱めない。
- DB境界のTDDでは、モックだけで完了させない。ローカルSupabaseの実DBで失敗を再現する。
- 実装担当と最終監査担当を分離する。**実装者自身の自己承認だけでマージしない。**
- 複数の書き込みエージェントを同一worktreeで並列稼働させない。
- サブエージェントは、原則として探索・監査・テスト分析をread-onlyで並列化する。
- 本番DBへの `db push`、migration apply、設定変更、バックアップ操作は、人間の明示承認なしに実行しない。
- 未検証事項をPASSと報告しない。`UNVERIFIED` として残す。
- 既存データの不整合を、任意のclinicへ寄せて「直したこと」にしない。不明データが1件でもあれば停止する。
- セキュリティを後退させるrollbackを作らない。ロールバック不能な場合はforward-fix手順を定義する。

### 0.2 完了の定義

本プログラムは、コードが動くだけでは完了しない。次をすべて満たしたときに完了する。

- ローカルの全migration replayが成功する。
- リモート適用済みmigrationとGitHubのmigration履歴が一致する。
- `src/types/supabase.ts` がローカルDB・対象リモートDBの双方と一致する。
- RLS・GRANT・関数EXECUTE・複合FKの機械検査がCI必須ゲートになる。
- テナントAの全主要ロールからテナントBのデータをread/write/deleteできない。
- 全mutating APIが認証・clinic scope・課金・公開例外・内部secretのいずれかに明示分類される。
- Security Advisorの既知警告が解消されるか、期限・owner・理由付き例外として管理される。
- Playwrightの主要業務フローがgreenになる。
- staging相当環境へのmigration適用と復元訓練の証跡が残る。
- `main`にrequired checksが設定され、赤いCIをマージできない。

---

# 1. 要約

## 1.1 結論

現行コードは、認証fail-closed、課金書き込みゲート、セキュリティテスト、全Jest、運用文書の面で大きく改善している。

しかし、商用境界として次の構造的未完了が残る。

1. **リモートDBとコミット済みSupabase生成型が不一致**
2. **RLS有効化だけでは消えない過剰GRANT・default privilegeが残存**
3. **RLS policyの対象ロールが曖昧、重複permissive policyが多い**
4. **関数のEXECUTE権限・mutable `search_path`が残存**
5. **同一clinicを保証しない単一列FKが複数残存**
6. **招待受諾が複数テーブルにまたがる非原子的処理**
7. **権限DB取得失敗時にJWT `app_metadata`へフォールバックし得る**
8. **課金書き込みゲートがルート側のopt-in**
9. **CIにDB契約ゲートを追加したが、赤い状態でマージされた**
10. **DR文書はあるが、復元能力の実測証跡がない**

したがって、次フェーズは機能追加ではなく、**DB契約・認可・リリース統制の一体化**を行う。

## 1.2 事業判断

この改修はペイする。

理由は、機能価値を増やす改修ではなく、以下の破滅リスクを直接減らすためである。

- 他院患者・予約・日報の越境
- 誤ったclinic_idを持つ関連データの蓄積
- 退職者・停止アカウントの残存アクセス
- 未契約テナントの業務書き込み
- 招待レースによる部分的な権限付与
- DB復旧後の認可崩壊
- migration再現不能による本番だけ異なる状態

優先順位は、**技術的綺麗さではなく、事故確率 × 事故損失 × 修正不可逆性**で決める。

---

# 2. 監査基準点

## 2.1 対象

| 項目 | 値 |
|---|---|
| Repository | `IFs1991/seikotsuin_no_saas` |
| Base branch | `main` |
| Base commit | `c12f7c13b0dca2c05e4ac7ced53b3bf9e665592e` |
| Base PR | `#83 Codex/commercial integration verify` |
| Audit date | `2026-07-11` |
| Supabase project ref | `qnanuoqveidwvacvbhqp` |
| Region | `ap-northeast-1` |
| Phase | `0.1.0-pilot` |
| DB source of truth | `supabase/migrations/` |
| Generated type | `src/types/supabase.ts` |

## 2.2 監査証跡

最低限、以下を根拠として再確認した。

- `.github/workflows/ci.yml`
- `package.json`
- `scripts/generate-supabase-types.mjs`
- `supabase/config.toml`
- `supabase/migrations/00000000000001_squashed_baseline.sql`
- `supabase/migrations/20260507000200_security_advisor_rpc_hardening.sql`
- `supabase/migrations/20260707000200_pr06_outreach_rls_integrity_and_notification_grants.sql`
- `supabase/rollbacks/20260707000200_pr06_outreach_rls_integrity_and_notification_grants_rollback.sql`
- `src/types/supabase.ts`
- `src/lib/supabase/auth-context.ts`
- `src/lib/supabase/server.ts`
- `src/lib/billing/business-write.ts`
- `src/lib/api-helpers.ts`
- `src/lib/auth/staff-invite.ts`
- `src/app/(public)/invite/actions.ts`
- `AGENTS.md`
- `CLAUDE.md`
- GitHub Actions run `29134288572`
- Supabaseのmigration一覧、table metadata、TypeScript type生成、Security Advisor、Performance Advisor

---

# 3. 事実・解釈・仮定

## 3.1 事実

### F-01 CI

PR #83のCIでは、以下が成功した。

- Quality Checks
- Security Tests
- Build
- Fixture Preflight
- Supabase Types Contractの先頭行検査
- Full Jest Regression

一方、`App E2E (Local Supabase + Chromium)` は失敗した。

失敗点は `npm run supabase:types` 後の `git diff --exit-code -- src/types/supabase.ts` である。そのため、その後のfixture DB検証、Chromium install、Playwright smokeは実行されなかった。

### F-02 型ドリフト

ローカルmigration replayで生成される型では、少なくとも次のFKが複合FKになっている。

- `patient_outreach_recipients_booked_reservation_clinic_fkey`
- `patient_outreach_recipients_customer_clinic_fkey`
- `reservations_campaign_clinic_fkey`

コミット済み `src/types/supabase.ts` は旧単一列FKを保持していた。

### F-03 baseline privilege

squashed baselineには、多数のtable/function/sequenceについて `anon` と `authenticated` への `GRANT ALL` が含まれる。

また、`postgres` roleのdefault privilegesとして、将来作成されるtable/function/sequenceへ `anon` と `authenticated` の `GRANT ALL` が付与される定義がある。

後続migrationで一部は修正されているが、**baselineだけを見ても安全、RLSがあるから安全、と判断してはいけない。**

### F-04 Security Advisor

2026-07-11のライブ監査では、少なくとも次を確認した。

#### RLS enabled / no policy

- `clinic_line_credentials`
- `encryption_keys`
- `internal_job_runs`
- `line_message_outbox`
- `master_categories`
- `master_patient_types`
- `master_payment_methods`
- `menu_categories`
- `treatment_menu_records`
- `treatments`

この警告は一律に「policy追加が必要」を意味しない。service-role onlyの内部tableでは、RLS有効・policyなし・client privilegeなしが正しい場合がある。

#### Function / extension / auth

- `public.normalize_customer_phone` にmutable `search_path`
- `public.update_reservation_notifications_updated_at()` が `anon` / `authenticated` から実行可能
- `public.validate_shift_requests_clinic_refs()` が `anon` / `authenticated` から実行可能
- `btree_gist` extensionが`public` schema
- leaked password protectionが無効

### F-05 Performance Advisor

以下の種類の警告が多数ある。

- unindexed foreign keys
- `auth_rls_initplan`
- multiple permissive policies
- unused indexes

unused indexは低トラフィック期間だけでは削除根拠にならない。今回のプログラムで一括削除しない。

### F-06 認証権限

`fetchUserPermissionsRecord()` は、権限レコードなしとDB query errorの双方で `null` を返し得る。

`resolvePermissionRecord()` はDB権限がない場合に、ユーザーの `app_metadata` からrole・clinic_id・clinic_scope_idsを解決し得る。

`app_metadata` は通常ユーザー自身が変更できないため即時の権限昇格とは限らないが、DB障害・権限削除・JWT残存の状態を区別できず、商用のfail-closed境界として弱い。

### F-07 課金書き込み

`processApiRequest()` は `requireBusinessWriteAccess: true` が指定された場合のみ課金書き込みゲートを実行する。

主要ルートには適用が進んでいるが、新規または既存mutating routeの付け忘れを構造的に防ぐ仕組みがない。

### F-08 招待受諾

招待受諾は、概ね次の順で複数クエリを実行している。

1. invite lookup
2. profile insert/update
3. user_permissions upsert
4. invite claim/update

途中失敗時に、profileまたはpermissionだけが更新された部分状態が残り得る。inviteの並行受諾もアプリ層で事後判定している。

### F-09 既存商用type boundary

`tsconfig.commercial.json` はstrictだが、共通auth/billing/webhook周辺が中心で、全mutating APIを包含していない。

### F-10 ドキュメントドリフト

`CLAUDE.md` のCI説明には、旧CI状態の記述が残っている。実際のCIはSecurity Tests必須・Full Jest・App E2Eを含むため、コードベース地図が現状とずれている。

## 3.2 解釈

- 現在の最大リスクは個別バグではなく、**コード・migration・リモートDB・生成型・CIの契約が分離していること**である。
- RLSの存在だけではテナント分離の十分条件にならない。GRANT、policy対象role、FK、service-role使用、公開APIが同時に正しくなければならない。
- `anon`に権限があってもRLSで0件になる設計はあり得るが、医療系SaaSでは意図が不明瞭な権限を残すメリットがない。
- migration rollbackで旧脆弱状態へ戻す設計は、可逆性ではなくセキュリティ後退である。forward-fixを基本にする。
- 性能Advisorの警告は、セキュリティ改修と同じPRで無差別に解消すると回帰リスクが上がる。段階分離する。

## 3.3 仮定

以下は実装前に再確認する。異なる場合、PR-00で仕様差分を提出し、黙って設計を変更しない。

- 本番相当DBはGitHubのmigration履歴と概ね同じ順序で適用されている。
- `appointments`、`visits`、`revenues`、`treatments`、`treatment_menu_records`の一部はlegacyまたは限定用途である。
- public bookingはアプリAPIを経由し、ブラウザからmaster tableへ直接自由アクセスする必要はない。
- `service_role`はサーバー内のみで使用される。
- 限定有償βでは、短時間のメンテナンス窓を設定できる。
- 価格・プラン・請求ロジック自体は今回変更しない。
- UI redesignは今回の非スコープである。

---

# 4. スコープ

## 4.1 In scope

- migration履歴と生成型の整合
- table privilege / default privilege
- RLS policyの明示化・重複整理
- tenant composite FK
- tenant columnのNULL・不整合調査
- SECURITY DEFINER / trigger function / search_path
- internal table・shared master・tenant table・legacy tableの分類
- invite acceptanceのtransaction化
- 権限取得のfail-closed化
- mutating routeの完全台帳
- 課金・scope・公開・内部cron・webhookの強制分類
- SQL/pgTAP/Jest/Playwright TDD
- CI required gate
- staging rollout、canary、post-deploy検証
- DR restore drill
- Codex用 `AGENTS.md` / custom subagent設定

## 4.2 Non-goals

- 新規業務機能
- UI全面改修
- 課金プラン再設計
- 全indexの一括最適化
- 全legacy tableの同時削除
- baseline migrationの編集
- production secretのローテーション実行
- 全SQLの美観目的リファクタ
- Security Advisor警告を0に見せるためだけの抑制
- RLSをservice-role依存に置換すること

---

# 5. Target state / 不変条件

## INV-01 Migration SSOT

`supabase/migrations/` だけが実行正本である。

- 適用済みfileは編集禁止
- 新しい変更は新migration
- migration、spec、rollback/forward-fix runbook、testを同一PRに含める
- `src/types/supabase.ts` は手書き禁止

## INV-02 Tenant identity

業務データのtenant境界は `clinic_id` である。

関連先がtenant tableの場合、FKは可能な限り次をDBで保証する。

```text
(child.foreign_id, child.clinic_id)
    -> (parent.id, parent.clinic_id)
```

アプリ側チェックだけで同一clinicを保証しない。

## INV-03 Fail closed

以下はすべて拒否側に倒す。

- permissions query error
- permissions row missing
- profile status query error
- profile row missing
- invalid or stale clinic scope
- billing configuration不足
- unknown mutating route classification
- unresolved migration backfill
- unknown invite role
- invite email mismatch

拒否レスポンスは、セキュリティ上必要な範囲で403/402/503を区別し、利用者へ内部詳細を露出しない。

## INV-04 Least privilege

- `GRANT ALL`を`anon` / `authenticated`へ付与しない
- default privilegesでclient roleへ自動付与しない
- `service_role`向けRLS policyは作らない
- internal tableはclient roleのtable privilegeを持たない
- shared masterは原則read-only
- public endpointが必要なデータは、専用API/RPCで最小露出する

## INV-05 Explicit RLS role

RLS policyは原則として対象roleを明示する。

```sql
to authenticated
```

公開用途だけを `to anon, authenticated` とし、理由をpolicy commentとspecへ記録する。

## INV-06 Function hardening

SECURITY DEFINERまたは権限境界に関与するfunctionは次を満たす。

- 固定 `search_path`
- `PUBLIC`, `anon`, `authenticated` から不要なEXECUTEをrevoke
- 必要roleだけへgrant
- dynamic SQLはidentifierを安全にquote
- exceptionで認可失敗を握りつぶさない
- ownerと利用経路を明記

## INV-07 Atomic identity mutation

profile、permission、invite claimなどの一連の権限変更は、単一transaction内で成功または失敗する。

## INV-08 Classified mutations

全 `POST` / `PUT` / `PATCH` / `DELETE` APIは、次のいずれかに1つだけ分類される。

- `PUBLIC_VALIDATED`
- `AUTH_SCOPED_BILLED`
- `AUTH_SCOPED_UNBILLED`
- `ADMIN_SCOPED`
- `INTERNAL_SECRET`
- `SIGNED_WEBHOOK`
- `HEALTH_OR_NO_MUTATION`（実際に状態変更しない特殊ケース）

未分類routeはCI failure。

## INV-09 Security-preserving rollback

rollbackは旧脆弱状態を再有効化しない。

- composite FKを外すだけのrollbackは禁止
- revokeしたdangerous privilegeを戻すrollbackは禁止
- old insecure RPCを復活させない
- 緊急時はcode rollback + feature disable + forward migrationを使う

## INV-10 Evidence

各PRは次を残す。

- before state
- RED test
- migration dry-run
- GREEN test
- advisor/catalog diff
- residual risk
- unverified items
- deploy/rollback decision

---

# 6. データ分類

実装前にPR-00で自動inventoryを生成し、下表を確定する。分類未確定のtableへDDLを入れない。

## 6.1 Class A: tenant canonical

原則として `clinic_id NOT NULL`、RLS、明示policy、tenant composite integrityを持つ。

候補:

- `clinics`
- `profiles`
- `user_permissions`
- `staff`
- `manager_clinic_assignments`
- `customers`
- `menus`
- `resources`
- `reservations`
- `blocks`
- `care_episodes`
- `customer_insurance_coverages`
- `menu_billing_profiles`
- `daily_reports`
- `daily_report_items`
- `daily_report_item_tags`
- `reservation_history`
- `reservation_notifications`
- `staff_preferences`
- `staff_shifts`
- `shift_requests`
- `patient_outreach_campaigns`
- `patient_outreach_recipients`
- `calendar_feed_tokens`
- billing/subscription関連tenant table

Target:

- client権限は必要最小限
- policyは`authenticated`を明示
- `(id, clinic_id)` unique contract
- childは複合FK
- cross-tenant insert/updateはDBで失敗
- manager scopeは既存仕様と一致

## 6.2 Class B: internal service-role only

候補:

- `clinic_line_credentials`
- `encryption_keys`
- `internal_job_runs`
- `line_message_outbox`
- `email_outbox`
- `email_delivery_logs`
- secret/audit/operational queue tables

Target:

- RLS enabled
- client向けpolicyなしでもよい
- `anon` / `authenticated` table privilegeなし
- public schemaに置く必要がない新規objectは `app_private` を優先
- service roleはRLS policyではなくserver credentialでアクセス
- direct client testはpermission denied

注意: Advisorの「RLS enabled, no policy」は、このclassでは意図的deny-allとしてallowlist管理できる。ただし**privilegeが残っていないことを機械検査する。**

## 6.3 Class C: shared master / authenticated read-only

候補:

- `master_categories`
- `master_patient_types`
- `master_payment_methods`
- `menu_categories`

初期Target decision:

- `anon`: no direct table access
- `authenticated`: `SELECT`のみ
- write: admin用server API経由
- public bookingで必要なら、専用のread-only API/RPCを作り、必要列だけ返す
- RLS policyは `FOR SELECT TO authenticated USING (true)`
- insert/update/deleteはclientから不可

PR-00でクライアントからの直接参照を調査し、互換性がなければ移行期間を設ける。

## 6.4 Class D: public-surface special

候補:

- public bookingで必要なclinics/menus/resources/availability
- invite token lookup
- password reset/callback
- webhook/cron

Target:

- base tableを広く`anon`へ開けない
- server route、署名検証、token-bound RPCのいずれかで公開
- tokenから取得できる列を最小化
- rate limit / CAPTCHA / idempotency / origin policyを明示
- public queryでもclinic_idをrequest bodyだけから信用しない

## 6.5 Class E: legacy quarantine

候補:

- `appointments`
- `visits`
- `revenues`
- `treatments`
- `treatment_menu_records`
- その他 `CLAUDE.md` またはinventoryでlegacyと判定されたtable

Target:

- 新規write禁止
- `anon` / `authenticated` privilege revoke
- service-role read-only、またはmigration専用
- runtime import/route参照を機械検索
- 削除は別spec・別PR
- tenant keyを安全に導出できないtableへ形式だけのRLSを追加しない

---

# 7. Tenant composite FK 設計

## 7.1 原則

parent側に次のunique contractを用意する。

```sql
unique (id, clinic_id)
```

child側には次を追加する。

```sql
foreign key (foreign_id, clinic_id)
references parent (id, clinic_id)
```

既存単一列FKは、複合FKの検証完了後に削除する。

## 7.2 Core候補

PR-00のcatalog scanで実在・nullable・delete action・既存constraint名を確定する。

| Child | Columns | Parent | Parent columns |
|---|---|---|---|
| `reservations` | `(customer_id, clinic_id)` | `customers` | `(id, clinic_id)` |
| `reservations` | `(menu_id, clinic_id)` | `menus` | `(id, clinic_id)` |
| `reservations` | `(resource_id, clinic_id)` | `resources` | `(id, clinic_id)` |
| `blocks` | `(resource_id, clinic_id)` | `resources` | `(id, clinic_id)` |
| `care_episodes` | `(customer_id, clinic_id)` | `customers` | `(id, clinic_id)` |
| `customer_insurance_coverages` | `(customer_id, clinic_id)` | `customers` | `(id, clinic_id)` |
| `menu_billing_profiles` | `(menu_id, clinic_id)` | `menus` | `(id, clinic_id)` |

## 7.3 Daily report / revenue候補

| Child | Columns | Parent | Parent columns |
|---|---|---|---|
| `daily_report_items` | `(daily_report_id, clinic_id)` | `daily_reports` | `(id, clinic_id)` |
| `daily_report_items` | `(reservation_id, clinic_id)` | `reservations` | `(id, clinic_id)` |
| `daily_report_items` | `(customer_id, clinic_id)` | `customers` | `(id, clinic_id)` |
| `daily_report_items` | `(care_episode_id, clinic_id)` | `care_episodes` | `(id, clinic_id)` |
| `daily_report_items` | `(coverage_id, clinic_id)` | `customer_insurance_coverages` | `(id, clinic_id)` |
| `daily_report_items` | `(menu_id, clinic_id)` | `menus` | `(id, clinic_id)` |
| `daily_report_items` | `(menu_billing_profile_id, clinic_id)` | `menu_billing_profiles` | `(id, clinic_id)` |
| `daily_report_items` | `(resource_id, clinic_id)` | `resources` | `(id, clinic_id)` |
| `daily_report_item_tags` | `(daily_report_item_id, clinic_id)` | `daily_report_items` | `(id, clinic_id)` |
| `reservation_history` | `(reservation_id, clinic_id)` | `reservations` | `(id, clinic_id)` |
| `reservation_notifications` | `(reservation_id, clinic_id)` | `reservations` | `(id, clinic_id)` |

## 7.4 Staff候補

次はID意味論を先に監査する。

- `user_permissions.staff_id`
- `staff_preferences.staff_id`
- `staff_shifts.staff_id`
- `shift_requests.staff_id`
- `profiles.user_id`
- `staff.user_id`相当列

`auth.users.id`、`profiles.user_id`、`staff.id`、`user_permissions.staff_id`が混在している可能性がある。名前から推測してFKを追加しない。

PR-00で、各列について次を出力する。

```yaml
column: user_permissions.staff_id
semantic_owner: auth.users.id | profiles.user_id | staff.id | unknown
current_fk: ...
runtime_writers:
  - path:symbol
runtime_readers:
  - path:symbol
data_match_rate: 0.00
decision: KEEP | RENAME_LATER | ADD_FK | BLOCK
```

## 7.5 不整合preflight

各複合FK追加前に必ず実行する。

```sql
select
  count(*) as mismatch_count
from child c
join parent p on p.id = c.foreign_id
where c.foreign_id is not null
  and c.clinic_id is distinct from p.clinic_id;
```

`mismatch_count > 0` の場合:

1. migrationを停止
2. 件数、ID、双方clinic_id、作成日時、更新経路をartifact化
3. 自動で親clinic_idへ上書きしない
4. business ownerの判断を取得
5. repair migrationを別PRにする

## 7.6 nullable clinic_id

`clinic_id IS NULL` のrowは次の順で扱う。

1. 親relationから一意に導出できるか
2. audit/event sourceから一意に導出できるか
3. 既存tenant ownerが明確か
4. 1〜3で不明ならBLOCK

禁止:

- 最初のclinicへ割り当てる
- adminのdefault clinicへ割り当てる
- NULLを許したまま「後で直す」
- production migration内で例外を握りつぶす

---

# 8. RLS / GRANT / policy設計

## 8.1 Privilege matrix

PR-00で実DBから以下をCSVまたはJSONで生成する。

```text
schema
object_type
object_name
grantee
privilege_type
is_grantable
source_migration_if_known
classification
expected
difference
```

保存先:

```text
docs/stabilization/evidence/commercial-hardening/
  privilege-before.csv
  policies-before.csv
  functions-before.csv
  constraints-before.csv
  indexes-before.csv
```

## 8.2 Default privilege target

少なくとも次を明示的にrevokeする。

```sql
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
```

実行前に、実際のobject ownerを確認する。`postgres`以外のownerにもdefault privilegeがあれば同様に扱う。

## 8.3 Table privilege target

原則:

```sql
revoke all on table public.<table> from anon, authenticated;
```

その後、必要な権限だけを戻す。

例: shared master

```sql
grant select on table public.master_categories to authenticated;
```

例: tenant table

- RLS client accessを使う場合のみ必要なDML privilegeを付与
- read-only roleにwrite privilegeを付与しない
- `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`をclient roleへ付与しない

## 8.4 Policy target

良い例:

```sql
create policy customers_select_scoped
on public.customers
for select
to authenticated
using (app_private.can_access_clinic(clinic_id));
```

write:

```sql
create policy customers_insert_scoped
on public.customers
for insert
to authenticated
with check (app_private.can_access_clinic(clinic_id));
```

禁止:

```sql
create policy anything on public.customers using (true);
create policy service_role_all on public.customers to service_role using (true);
```

## 8.5 InitPlan最適化

Advisorで警告されたpolicyでは、同一statement内で毎row評価される認証関数を次の形へ寄せる。

```sql
(select auth.uid())
```

ただし、`app_private.can_access_clinic()`など独自functionのSTABLE性・実行計画を確認し、意味を変えない。

## 8.6 Multiple permissive policy

同じtable/action/roleに複数permissive policyがある場合:

1. 全policy式をdump
2. OR合成時の実効権限を評価
3. roleごとの意図を決める
4. 1つのpolicyへ統合、または明確なrole分離
5. tenant A/Bの負テスト
6. explainでinitplanを確認

style目的の統合はしない。権限意味論が変わるため、必ずTDD対象とする。

---

# 9. Function / RPC / extension hardening

## 9.1 直近対象

- `public.normalize_customer_phone`
- `public.update_reservation_notifications_updated_at()`
- `public.validate_shift_requests_clinic_refs()`

Target:

```sql
alter function public.normalize_customer_phone(<signature>)
  set search_path = public, auth, extensions;

revoke execute on function public.update_reservation_notifications_updated_at()
  from public, anon, authenticated;

revoke execute on function public.validate_shift_requests_clinic_refs()
  from public, anon, authenticated;
```

signatureはcatalogから取得し、推測しない。

trigger functionの場合、一般clientにEXECUTEをgrantする必要は通常ない。trigger owner経由の実行をテストする。

## 9.2 SECURITY DEFINER監査

次をcatalogから全件出力する。

```sql
select
  n.nspname,
  p.proname,
  p.oid::regprocedure,
  p.prosecdef,
  p.proconfig,
  pg_get_userbyid(p.proowner)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private')
order by 1, 2;
```

各functionに対して:

- exposed schemaか
- Data API経由で呼べるか
- EXECUTE grantee
- `search_path`
- user input
- tenant scope
- owner
- caller
- tests

を記録する。

## 9.3 btree_gist

`btree_gist`を即時に移動しない。

preflight:

```sql
select extname, extnamespace::regnamespace, extrelocatable
from pg_extension
where extname = 'btree_gist';
```

- relocatableなら、依存objectとstaging検証後に`extensions` schemaへ移動
- non-relocatableなら、再install/maintenance手順を別spec化
- 既存constraintやoperator classを壊さない
- migration rollbackでextensionをdropしない

## 9.4 Leaked password protection

これはDB migrationだけでは完結しない。

Operations task:

- Supabase Auth設定で有効化
- 変更前後の設定証跡
- login/reset/invite E2E
- support runbook更新
- false positive対応
- rollback条件

secretや利用者passwordを証跡へ残さない。

---

# 10. Auth authority redesign

## 10.1 問題

現状は「permission rowなし」と「permission query失敗」が同じ`null`へ落ち、JWT metadata fallbackへ進み得る。

## 10.2 Target contract

DB query結果を判別可能unionにする。

```ts
type PermissionLookupResult =
  | { status: 'found'; value: AuthPermissionRecord }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };
```

profileも同様。

```ts
type ProfileStatusLookupResult =
  | { status: 'found'; value: ProfileStatusRow }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };
```

## 10.3 Decision

- permission `missing` -> access denied
- permission `error` -> access denied + server-side error + 503相当
- profile `missing` -> account inactive扱い
- profile `error` -> access denied + 503相当
- DB role/clinic_idをJWTで補完しない
- JWT `clinic_scope_ids`は、DBで認められたscopeを**狭めるためのintersection**にのみ使用
- JWTにDBより広いscopeがあれば拒否またはDB scopeへ縮小し、security eventを出す
- DBに権限がなくJWTだけに権限がある場合は拒否
- account deactivation後のsession refresh/revoke挙動を検証

## 10.4 Tests

- DB permission found / profile active
- DB permission missing
- DB permission query error
- profile missing
- profile query error
- stale JWT role
- stale JWT clinic_id
- JWT scope superset
- JWT scope subset
- malformed JWT claim
- manager assignment revoked
- inactive account with valid JWT
- admin account missing profile

---

# 11. Atomic staff invite acceptance

## 11.1 Target

public schemaにservice-role専用RPCを作る。

Suggested name:

```text
public.accept_staff_invite_atomic
```

`app_private`はData API expose対象外であるため、Supabase JS `.rpc()`経由が必要ならpublic function + strict EXECUTE revokeを採用する。

## 11.2 Function contract

Input:

```text
p_token uuid
p_user_id uuid
p_account_email text
```

Output:

```json
{
  "success": true,
  "clinic_id": "uuid",
  "role": "manager|therapist|staff",
  "idempotent": false
}
```

Failureは安定したerror codeを返すか、専用SQLSTATEを使う。

## 11.3 Transaction semantics

function内で:

1. `staff_invites`をtokenで`FOR UPDATE`
2. existence / expiry / accepted state確認
3. normalized email一致
4. allowed role確認
5. 同一userの再実行ならidempotent success
6. 別userがclaim済みならconflict
7. profile insert/update
8. user_permissions upsert
9. invite accepted_at/accepted_by update
10. security/audit event
11. return

全処理はfunction transaction内で行う。

## 11.4 Security

- `SECURITY DEFINER`
- fixed `search_path`
- `PUBLIC`, `anon`, `authenticated`からEXECUTE revoke
- `service_role`だけgrant
- callerのp_user_idをブラウザから自由指定させない
- server側で`auth.getUser()`したIDとemailだけを渡す
- roleはinvite row由来のみ
- clinic_idはinvite row由来のみ

## 11.5 Concurrency tests

- same token / same user / concurrent two calls -> one commit、もう一方idempotent success
- same token / different user -> exactly one success
- permission upsert failure -> profileもinviteも変更なし
- profile failure -> permissionもinviteも変更なし
- invite expiry during transaction
- invalid role
- email case/whitespace normalization
- old insecure RPCにclient EXECUTEなし

---

# 12. Mutating route policy manifest

## 12.1 新規artifact

Suggested:

```text
src/lib/security/mutating-route-policy.ts
scripts/security/verify-mutating-routes.mjs
src/__tests__/security/mutating-route-policy.test.ts
```

## 12.2 Schema

```ts
type MutationClass =
  | 'PUBLIC_VALIDATED'
  | 'AUTH_SCOPED_BILLED'
  | 'AUTH_SCOPED_UNBILLED'
  | 'ADMIN_SCOPED'
  | 'INTERNAL_SECRET'
  | 'SIGNED_WEBHOOK';

type RouteMutationPolicy = {
  route: string;
  methods: readonly ('POST' | 'PUT' | 'PATCH' | 'DELETE')[];
  classification: MutationClass;
  clinicScope: 'required' | 'derived' | 'not-applicable';
  billing: 'required' | 'explicit-exception' | 'not-applicable';
  auth:
    | 'supabase-user'
    | 'admin-role'
    | 'cron-secret'
    | 'internal-secret'
    | 'webhook-signature'
    | 'public';
  idempotency: 'required' | 'recommended' | 'not-applicable';
  rateLimit: 'required' | 'middleware' | 'not-applicable';
  exceptionReason?: string;
  owner: string;
};
```

## 12.3 CI enforcement

scriptは `src/app/api/**/route.ts` を走査し、mutation handler exportを抽出する。

failure条件:

- manifest未登録
- method不一致
- billed classなのにbilling gateの証跡なし
- scoped classなのにclinic scope helperの証跡なし
- internal routeなのにsecret verificationなし
- webhookなのにsignature verificationなし
- public mutationなのにschema validationなし
- exceptionReason欠落
- duplicate entry

文字列検索だけに依存せず、最低限ASTまたは明示wrapperを使う。

## 12.4 Wrapper

新規業務mutationの標準wrapperを用意する。

Suggested:

```ts
processBusinessMutation()
processUnbilledScopedMutation()
processPublicMutation()
processInternalMutation()
```

既存 `processApiRequest()`を破壊せず、段階的にwrapperへ移行する。

## 12.5 Billing decision

「課金対象か」はHTTP methodだけで決めない。

例:

- business data create/update -> 原則billed
- account login、password reset -> not applicable
- Stripe webhook -> signed webhook
- internal outbox processing -> internal secret
- security configuration -> admin scoped、必要ならunbilled exception
- public reservation -> product decisionを明示し、現行仕様をテストで固定

---

# 13. Migration engineering standard

## 13.1 Naming

実装時点で次を使う。

```powershell
supabase migration new <descriptive_slug>
```

timestampを手で再利用しない。

Suggested slugs:

- `commercial_schema_contract_sync`
- `commercial_privilege_baseline_hardening`
- `commercial_rls_role_policy_normalization`
- `commercial_function_execution_hardening`
- `commercial_core_tenant_composite_fks`
- `commercial_daily_report_composite_fks`
- `commercial_legacy_quarantine`
- `commercial_atomic_staff_invite`

## 13.2 1 migration / 1責務

避ける:

- privilege + FK + UI + auth refactorを同一migration/PR
- 数十tableの意味論変更を1file
- performance index削除とsecurity policy変更の同時実施

## 13.3 Preflight

各migrationの冒頭または別preflight scriptで次を確認する。

- expected constraint exists
- expected column type
- null count
- orphan count
- cross-clinic mismatch count
- duplicate `(id, clinic_id)`
- target policy name conflict
- active long-running transaction
- table size
- lock risk

期待と違えば `raise exception`。

## 13.4 Lock / timeout

transactional migration例:

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- DDL / checks

commit;
```

大tableでは数値を盲目的に使わず、staging計測で決める。

## 13.5 Composite FK rollout

推奨順序:

1. parent duplicate確認
2. parent `(id, clinic_id)` unique index/constraint
3. child mismatch確認
4. supporting index
5. child composite FK `NOT VALID`
6. `VALIDATE CONSTRAINT`
7. application test
8. old single FK drop
9. remote verification

Template:

```sql
alter table public.<child>
  add constraint <name>
  foreign key (<foreign_id>, clinic_id)
  references public.<parent> (id, clinic_id)
  on delete <preserve_existing_action>
  not valid;

alter table public.<child>
  validate constraint <name>;
```

## 13.6 Concurrent index

`CREATE INDEX CONCURRENTLY`はtransaction block内で実行できない。

- 必要なら専用migration fileへ分離
- migration runnerのtransaction挙動を確認
- failure後のinvalid index cleanup手順を記載
- 小規模pilot tableで通常indexが十分なら、maintenance window内で通常作成する

## 13.7 Backfill

- backfillとconstraint追加を分離できる場合は分離
- batch size、resume point、row countを記録
- update trigger/audit/notification副作用を確認
- application writeとの競合を考慮
- unresolved rowは停止

## 13.8 Rollback

rollback SQLは、次を含む。

- 実行前提
- code versionとの互換性
- data lossの有無
- security regressionの有無
- lock risk
- forward-fix代替
- operator approval requirement

「元のGRANT ALLを戻す」は禁止。

---

# 14. TDD規約

## 14.1 Commit sequence

最低限:

1. `test: reproduce <risk>` — RED
2. `fix(db): ...` / `fix(auth): ...` — GREEN
3. `refactor: ...` — 必要な場合のみ
4. `docs: record evidence and runbook`

PR bodyにRED時の失敗名・exit code・期待理由を記載する。

## 14.2 DB test layer

推奨配置:

```text
supabase/tests/
  commercial_privileges_test.sql
  commercial_rls_tenant_isolation_test.sql
  commercial_composite_fk_test.sql
  commercial_function_execution_test.sql
  commercial_staff_invite_atomic_test.sql
```

実行:

```powershell
supabase start
supabase db reset
supabase test db
npm run supabase:types
git diff --exit-code -- src/types/supabase.ts
```

破壊的ローカル操作は、AGENTS.mdに従い実行前承認を得る。CI ephemeral environmentでは自動実行可。

## 14.3 Tenant isolation matrix

最低限:

| Actor | Tenant A read A | read B | write A | write B | delete B |
|---|---:|---:|---:|---:|---:|
| anon | feature-specific | deny | feature-specific | deny | deny |
| staff A | allow by role | deny | allow by role | deny | deny |
| therapist A | allow by role | deny | allow by role | deny | deny |
| manager A assignment | allow assigned | deny unassigned | role-dependent | deny | deny |
| clinic_admin A | allow | deny | allow | deny | deny |
| admin | explicit product rule | explicit product rule | explicit | explicit | explicit |
| inactive user | deny | deny | deny | deny | deny |

adminのglobal accessを暗黙に仮定せず、現行プロダクト仕様に固定する。

## 14.4 GRANT test

RLSの0件だけでなく、privilege自体を検査する。

- internal table direct SELECT -> permission denied
- client direct INSERT -> permission denied
- shared master authenticated SELECT -> success
- shared master authenticated write -> permission denied
- unsafe RPC execute -> permission denied
- service server flow -> success

## 14.5 Composite FK negative test

- Tenant A customer ID + Tenant B clinic_idでreservation insert -> FK failure
- Tenant A resource + Tenant B block -> FK failure
- Tenant A reservation + Tenant B report item -> FK failure
- same tenant -> success
- nullable optional relation -> intended behavior

## 14.6 Auth tests

モック単体に加え、local Supabase integrationを入れる。

- DB permission errorを人工的に発生
- stale JWT
- revoked manager assignment
- inactive profile
- permission row delete
- session refresh

## 14.7 Invite tests

- transaction rollback
- concurrent claim
- idempotent retry
- invalid role
- email mismatch
- expired token
- direct client EXECUTE denied

## 14.8 Route manifest tests

- dummy unclassified route fixture -> RED
- public route without validator -> RED
- internal route without secret -> RED
- billed route without wrapper -> RED
- explicit exception -> GREEN

## 14.9 Playwright

最低限:

- admin login
- clinic_admin login
- staff/therapist login
- manager assigned/unassigned
- patient list isolation
- reservation create/update/cancel
- public booking
- invite acceptance
- inactive account
- billing locked write
- mobile UIUX smoke
- tenant B URL/direct API tampering

---

# 15. PR分割計画

## PR-00: Audit inventory and RED contracts

### Objective

変更前状態を機械可読に固定し、後続PRの対象を確定する。

### Changes

- DB catalog export scripts
- mutating route inventory generator
- table classification draft
- current Security/Performance Advisor snapshot
- RED tests
- `CLAUDE.md`のCI記述更新
- 本仕様書をrepoへ追加
- nested `AGENTS.md`追加
- `.codex/agents/`追加

### No production migration

このPRではproduction schemaを変えない。

### Required RED

- stale generated types
- unsafe default privileges
- unsafe function EXECUTE
- unclassified mutating routes
- known composite FK mismatch test fixture
- non-atomic invite failure simulation

### Acceptance

- inventory files生成
- unknown table/route/column semanticが明示
- 後続PRのBLOCK条件確定
- audit subagentsが全員レポート提出

---

## PR-01: Schema contract, generated types, CI stop-the-line

### Objective

migration replay・generated type・CIを一致させる。

### Changes

- `src/types/supabase.ts`再生成
- Supabase CLI versionを単一箇所へ固定
- header-only `Supabase Types Contract`を廃止または補助扱い
- `database-contract` job追加
- `App E2E`がDB contract成功後に進む構造
- branch protection required checks手順
- `CLAUDE.md`同期

### Commands

```powershell
supabase start
supabase db reset
npm run supabase:types
git diff --exit-code -- src/types/supabase.ts
supabase test db
```

### Acceptance

- clean checkoutからtype diff 0
- local reset成功
- Full Jest / Security / Build / Playwright green
- 赤いrequired checkでmerge不可
- remote type generationとの差分レビュー

### Risk

CLI version差でtype出力順だけが変わる可能性。versionを固定し、意味差とformat差を分離する。

---

## PR-02: Default privilege and table grant hardening

### Objective

baseline由来のclient向け過剰GRANTと将来objectへの自動付与を止める。

### Migration

- default privileges revoke
- internal table client grant revoke
- shared masterのSELECT-only grant
- tenant table privilege matrix適用
- policyは大きく変えない

### RED

- `anon`がinternal tableへアクセス可能
- `authenticated`がshared masterへwrite可能
- new test tableにdefault GRANTが付く

### GREEN

- internal denied
- shared read-only
- application flows maintained

### Acceptance

- `GRANT ALL` to anon/authenticated = 0
- client roleにTRUNCATE/TRIGGER/MAINTAIN = 0
- no new privilege Advisor regression
- direct PostgREST-equivalent tests

---

## PR-03: RLS role normalization and policy consolidation

### Objective

policyの対象role・意味・重複を明示し、tenant isolationを維持したままAdvisor警告を減らす。

### Migration

- `TO authenticated`明示
- public policyの限定
- duplicate permissive policy統合
- service_role policy削除
- `(select auth.uid())`等initplan改善
- policy comments追加

### RED

- policyがanonにも展開される
- duplicate policyのORで意図以上に許可される
- manager unassigned access

### Acceptance

- policy matrixと実DB一致
- tenant A/B matrix green
- public flow green
- Advisor diffに新規security warningなし
- explain plan evidence

---

## PR-04: Function execution, search_path, extension, Auth setting

### Objective

function/RPCの権限境界を閉じる。

### Migration

- `normalize_customer_phone` fixed search_path
- 2 trigger/validator functionのEXECUTE revoke
- SECURITY DEFINER inventory remediation
- default function privilege revoke
- extension relocationはpreflight結果により実施または別spec

### Operations

- leaked password protection有効化

### RED

- anon/authenticated direct RPC success
- mutable search_path lint
- triggerがgrant revoke後に壊れるケース

### Acceptance

- Advisor対象解消
- legitimate trigger/RPC flow green
- no public EXECUTE on private functions
- Auth E2E green

---

## PR-05: Core tenant composite foreign keys

### Objective

reservation/customer/menu/resource/clinicの同一tenantをDBで保証する。

### Migration

Section 7.2対象。

### Rollout

- parent unique
- mismatch preflight
- child index
- NOT VALID FK
- VALIDATE
- old FK drop

### RED

cross-clinic insert/updateが成功するfixture。

### Acceptance

- mismatch count 0
- negative tests all fail as expected
- existing flow green
- type regeneration committed
- migration replay green

---

## PR-06: Daily report and operational composite foreign keys

### Objective

日報・予約履歴・通知のtenant連鎖をDBで保証する。

### Migration

Section 7.3対象。

### Risk

日報は関連が多く、FK追加で既存fixtureの誤りが顕在化する。テストを変更して逃げず、fixtureかデータを正す。

### Acceptance

- all listed FK validated
- no cross-clinic report linkage
- report APIs and mobile UIUX green
- types regenerated
- performance indexes追加

---

## PR-07: Legacy quarantine and nullable clinic remediation

### Objective

tenant keyを持たない、または意味論が曖昧なlegacy tableを商用経路から隔離する。

### Changes

- runtime references inventory
- write path disable
- client grant revoke
- unresolved nullable rowsのrepair plan
- deletion候補を別specへ
- `treatment_menu_records` / `treatments` decision

### Acceptance

- no application write to quarantined tables
- no client direct access
- data preservation evidence
- deletionは未実施

---

## PR-08: Atomic staff invite acceptance

### Objective

profile・permission・invite claimを単一transactionへ統合する。

### Migration / Code

Section 11。

### RED

- partial write
- race
- direct RPC execution

### Acceptance

- all-or-nothing
- same-user retry idempotent
- different-user race safe
- direct anon/authenticated execute denied
- old insecure path unreachable

---

## PR-09: Auth permission authority fail-closed

### Objective

DB権限をauthoritative sourceにする。

### Code

Section 10。

### Acceptance

- DB errorでアクセス不可
- DB missingでアクセス不可
- stale JWT cannot restore privilege
- scope intersection
- error observability
- login/admin/mobile/API regression green

---

## PR-10: Mutating route manifest and billing/scope default-deny

### Objective

新旧APIのgate付け忘れをCIで防止する。

### Code

Section 12。

### Acceptance

- mutation route coverage 100%
- unknown route blocks CI
- explicit exception list
- public/internal/webhook tests
- commercial type/lint targetを全境界へ拡張

---

## PR-11: Performance-safe indexes and RLS plan cleanup

### Objective

security semanticsを固定した後、FK indexとRLS performance warningを処理する。

### Changes

- unindexed FK対応
- initplan residual
- duplicate policy residual
- index usage観測
- unused indexは原則保持

### Acceptance

- representative query plan
- no material latency regression
- write amplification計測
- index dropは別承認

### Pilot-only performance exception

Any fixed local wall-clock failure remains FAIL and is not recalculated,
rounded, or reclassified as PASS. A time-bounded pilot-only owner waiver may
classify only an explicitly listed latency result as non-blocking
`PASS_WITH_RISK`. RLS, tenant isolation, SQLSTATE/message compatibility, ACL,
composite FK, WAL, plan shape, restoration hashes, clean replay, and required
CI remain non-waivable.

The exception is limited to an attended two-to-three-clinic pilot with bulk
imports, external bulk synchronization, and unattended multi-thousand-row
batches disabled. It expires on its recorded date and must be re-reviewed
before a fourth clinic, bulk enablement, a related DDL/policy/helper or database
tier change, or a related incident. It authorizes PR-11 merge eligibility only;
it does not authorize staging/production apply or general commercial release.

---

## PR-12: Release qualification, staging migration, DR drill

### Objective

コード品質を運用品質へ変換する。

### Steps

1. staging clone/isolated project
2. full migration replay
3. anonymized/representative data validation
4. types parity
5. advisor scan
6. all role smoke
7. canary deploy
8. backup/restore drill
9. measured RTO/RPO
10. production change plan
11. operator approval
12. production apply
13. post-deploy verification
14. 24h/72h monitoring review

### Acceptance

- restore evidence
- tenant isolation after restore
- no duplicate external side effects
- incident rollback/forward-fix runbook
- production sign-off

---

# 16. CI設計

## 16.1 Required checks

推奨:

```text
Quality Checks
Database Contract
Security Tests
Full Jest Regression
Build
App E2E (Local Supabase + Chromium)
Migration Safety Audit
Codex Detached Review
```

## 16.2 Database Contract job

最低限:

```powershell
npm ci
supabase start
supabase db reset
supabase test db
npm run supabase:types
git diff --exit-code -- src/types/supabase.ts
npm run db:verify-privileges
npm run db:verify-rls
npm run db:verify-composite-fks
npm run security:verify-mutating-routes
```

実際のscript名はPR-00で確定する。

## 16.3 Advisor gate

CIローカルではPostgres catalog testを正本にする。

リリース時はライブAdvisor結果を取得し、次を比較する。

- new security warnings = 0
- existing warning closed or exception
- exceptionにowner、期限、理由
- warning抑制だけの変更禁止

## 16.4 Branch protection

`main`:

- required status checks
- require branch up to date
- no direct push
- review required
- dismiss stale approvals
- require conversation resolution
- force push禁止
- admin bypassは緊急runbook時のみ
- merge queueは利用可能なら検討

設定画面のスクリーンショットまたはAPI出力を証跡へ保存する。

---

# 17. Codex運用設定

## 17.1 AGENTS.md分割

Codexはrootからcurrent directoryまでの`AGENTS.md`を結合し、より近いdirectoryの指示を優先する。rootを肥大化させず、次を追加する。

```text
AGENTS.md
supabase/AGENTS.md
src/app/api/AGENTS.md
src/__tests__/AGENTS.md
.codex/config.toml
.codex/agents/*.toml
```

## 17.2 Root AGENTS.md 追記案

```md
## 商用ハードニング・migration program

- `docs/stabilization/spec-commercial-hardening-migration-v1.0.md` を実装正本とする
- 本programはPR-00から依存順に実施し、複数PRを1本へ統合しない
- DB/RLS/auth/billing変更はRED testを先に追加する
- 実装後、read-only監査subagentを最低2つ走らせる
- 実装者自身のレビューだけでPASSにしない
- production DB・Auth設定・branch protection変更は人間承認が必要
```

## 17.3 `supabase/AGENTS.md` 案

```md
# Supabase migration rules

- 適用済みmigrationを編集しない
- migration追加時はspec、SQL test、rollback/forward-fix runbookを同梱する
- RLS、GRANT、FK、function EXECUTEは実DBtest必須
- tenant relationは `(foreign_id, clinic_id) -> (id, clinic_id)` を優先
- backfill不明rowが1件でもあれば停止
- `GRANT ALL` to anon/authenticatedは禁止
- policyは対象roleを明示する
- service_role policyを追加しない
- SECURITY DEFINERはfixed search_path + minimum EXECUTE
- migration前後のcatalog snapshotを保存する
- security-regressive rollbackは禁止
```

## 17.4 `src/app/api/AGENTS.md` 案

```md
# API mutation boundary rules

- POST/PUT/PATCH/DELETEを追加・変更したらmutating route manifestを更新する
- routeはPUBLIC_VALIDATED / AUTH_SCOPED_BILLED / AUTH_SCOPED_UNBILLED /
  ADMIN_SCOPED / INTERNAL_SECRET / SIGNED_WEBHOOKのいずれかに分類する
- clinic_idをbodyだけから信用しない
- business mutationはbilling gateを明示する
- exceptionはownerと理由を必須とする
- service roleを使う前にauthenticated scopeを確定する
- client-side authorizationだけで完了させない
```

## 17.5 `src/__tests__/AGENTS.md` 案

```md
# Test rules

- DB security boundaryをmockだけで検証しない
- tenant A/B、allow/deny、error/missingの両側を書く
- REDが正しい理由をPRへ記録する
- 壊れた実装に合わせて期待値を弱めない
- skipped testをgreenの代替にしない
- production-only behaviorは環境差を明示する
```

---

# 18. Codex custom subagents

## 18.1 `.codex/config.toml`

```toml
[agents]
max_threads = 6
max_depth = 1
job_max_runtime_seconds = 1800
interrupt_message = true
```

depthは1を維持し、subagentによる再帰fan-outを禁止する。

## 18.2 共通出力形式

全監査agentは最終出力を次のYAMLにする。

```yaml
agent: <name>
verdict: PASS | BLOCK | PASS_WITH_RISK
scope:
  base: <sha>
  head: <sha>
findings:
  - id: <stable-id>
    severity: CRITICAL | HIGH | MEDIUM | LOW
    category: SECURITY | DATA_INTEGRITY | MIGRATION | AUTH | BILLING | TEST | OPERATIONS
    evidence:
      - path:line-or-symbol
    failure_mode: <what breaks>
    exploit_or_reproduction: <steps or null>
    required_fix: <specific>
    blocking: true | false
unverified:
  - <item>
tests_observed:
  - command: <command>
    result: PASS | FAIL | NOT_RUN
residual_risk:
  - <risk>
```

根拠なしの`PASS`は禁止。

## 18.3 `.codex/agents/db-schema-explorer.toml`

```toml
name = "db_schema_explorer"
description = "Read-only database schema explorer for migrations, constraints, grants, policies, and generated-type drift."
sandbox_mode = "read-only"
developer_instructions = """
Read AGENTS.md, CLAUDE.md, and the commercial hardening migration spec.
Do not edit files.
Map actual migrations, current generated types, constraint names, table ownership,
RLS state, grants, functions, and runtime callers.
Distinguish fact from inference.
Report unknown ID semantics as BLOCK rather than guessing.
Return the required YAML audit format.
"""
nickname_candidates = ["SchemaAtlas", "CatalogScout"]
```

## 18.4 `.codex/agents/rls-red-team.toml`

```toml
name = "rls_red_team"
description = "Read-only adversarial reviewer for tenant isolation, RLS, grants, RPC exposure, and service-role bypass."
sandbox_mode = "read-only"
developer_instructions = """
Act as a hostile tenant and security reviewer.
Do not edit files.
Try to find read, insert, update, delete, RPC, view, and indirect-FK paths
from tenant A into tenant B.
Check anon, authenticated roles, manager assignments, stale JWT, inactive accounts,
table grants, function execute, and service-role call ordering.
Style findings are out of scope unless they hide a security defect.
Return the required YAML audit format with concrete reproduction steps.
"""
nickname_candidates = ["RedFence", "TenantBreaker"]
```

## 18.5 `.codex/agents/migration-safety-auditor.toml`

```toml
name = "migration_safety_auditor"
description = "Read-only reviewer for PostgreSQL migration correctness, lock risk, data repair, rollback, and replay safety."
sandbox_mode = "read-only"
developer_instructions = """
Do not edit files.
Review only the migration diff, rollback/forward-fix runbook, and DB tests.
Check applied-migration immutability, lock/statement timeouts, table size assumptions,
preflight assertions, null/orphan/mismatch handling, NOT VALID/VALIDATE ordering,
index transaction rules, ON DELETE preservation, idempotence assumptions,
generated-type regeneration, and security-preserving rollback.
BLOCK if data is guessed, silently discarded, or assigned to an arbitrary clinic.
Return the required YAML audit format.
"""
nickname_candidates = ["Locksmith", "MigrationSentinel"]
```

## 18.6 `.codex/agents/api-boundary-auditor.toml`

```toml
name = "api_boundary_auditor"
description = "Read-only reviewer for mutating API classification, auth, clinic scope, billing, internal secrets, and webhooks."
sandbox_mode = "read-only"
developer_instructions = """
Do not edit files.
Enumerate every changed and newly discovered POST, PUT, PATCH, and DELETE route.
Verify manifest coverage and the real execution path.
Check authentication, origin, role, clinic scope, billing, validation, rate limit,
idempotency, cron/internal secret, webhook signature, service-role ordering,
error mapping, and audit logging.
Do not accept UI checks as authorization.
Return the required YAML audit format.
"""
nickname_candidates = ["BoundaryMap", "Gatekeeper"]
```

## 18.7 `.codex/agents/test-adequacy-auditor.toml`

```toml
name = "test_adequacy_auditor"
description = "Read-only reviewer for RED/GREEN evidence, tenant-negative cases, real DB coverage, concurrency, and skipped tests."
sandbox_mode = "read-only"
developer_instructions = """
Do not edit files.
Assess whether tests would fail on the old vulnerable implementation.
Require tenant A/B negative tests, missing/error cases, direct privilege/RPC tests,
real local Supabase coverage, migration replay, concurrency where relevant,
and Playwright for critical user flows.
Identify mocks that make the test unable to prove the DB boundary.
Treat skipped or unexecuted tests as NOT_RUN, never PASS.
Return the required YAML audit format.
"""
nickname_candidates = ["TestOracle", "CoverageSkeptic"]
```

## 18.8 `.codex/agents/release-auditor.toml`

```toml
name = "release_auditor"
description = "Read-only final release reviewer for CI, migration evidence, staging, observability, DR, and residual risk."
sandbox_mode = "read-only"
developer_instructions = """
Do not edit files.
Review the entire branch against main after implementation is complete.
Confirm required checks, migration replay, generated-type parity, catalog/advisor diff,
staging application, smoke results, rollback or forward-fix plan, monitoring,
restore drill evidence, and production approval gates.
Run or request /review against the base branch.
BLOCK on red CI, skipped critical tests, missing DB evidence, or unverifiable claims.
Return the required YAML audit format.
"""
nickname_candidates = ["ReleaseJudge", "OpsVerifier"]
```

## 18.9 Agent orchestration rule

### Before implementation

Parallel read-only:

- `db_schema_explorer`
- `rls_red_team`
- `api_boundary_auditor`

Main agent consolidates facts and freezes PR scope.

### During TDD

- main/worker writes RED test
- `test_adequacy_auditor` confirms RED is meaningful
- main/worker implements GREEN
- no parallel write agents

### After implementation

Parallel read-only:

- `migration_safety_auditor`
- `rls_red_team`
- `api_boundary_auditor`
- `test_adequacy_auditor`

### Before merge

- Codex `/review` against `main`
- `release_auditor`
- human owner review

---

# 19. Codex実行プロンプト

## 19.1 Program kickoff

```text
Read AGENTS.md, CLAUDE.md, and
docs/stabilization/spec-commercial-hardening-migration-v1.0.md in that order.

We are executing PR-<NN> only. Do not expand into later PRs.

First:
1. Confirm base SHA.
2. Delegate read-only discovery to db_schema_explorer, rls_red_team, and the
   relevant boundary auditor.
3. Produce a fact/decision/unknown table.
4. Add a RED test that fails for the exact old behavior.
5. Ask for approval before any destructive local Supabase command.
6. Implement the smallest migration/code change that makes the RED test GREEN.
7. Regenerate Supabase types; never hand-edit them.
8. Run the required focused tests, then full relevant gates.
9. Delegate final read-only audits.
10. Return the PR evidence template. Do not claim PASS for unrun checks.
```

## 19.2 Migration implementation prompt

```text
Implement only the approved migration scope.

Non-negotiable:
- Do not edit existing applied migrations.
- Inventory exact constraint names and signatures first.
- Abort on null/orphan/cross-clinic mismatch.
- Preserve current ON DELETE semantics unless the spec explicitly changes it.
- Use parent unique (id, clinic_id), supporting indexes, NOT VALID, VALIDATE,
  then remove old single-column FK.
- Add SQL tests that fail on the base commit and pass on the branch.
- Include rollback or forward-fix runbook that does not restore unsafe privileges.
- Regenerate src/types/supabase.ts.
- Run migration_safety_auditor and rls_red_team after implementation.
```

## 19.3 Audit-only prompt

```text
Review this branch against main. Do not modify files.

Spawn:
- db_schema_explorer for schema and migration evidence
- rls_red_team for tenant attacks
- migration_safety_auditor for DDL/rollback
- api_boundary_auditor for routes and billing
- test_adequacy_auditor for RED/GREEN proof

Collect their required YAML reports.
Then run a detached Codex /review against main.
Return only prioritized blocking findings, residual risks, and unverified evidence.
```

---

# 20. PR body template

```md
## Objective

## Spec / PR number
- Program: SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11
- PR phase: PR-XX
- Base SHA:

## Scope
### Included
### Explicitly excluded

## Facts observed before change
- path / function / policy / constraint:
- live DB evidence:

## RED evidence
- Test:
- Command:
- Old failure:
- Why this proves the defect:

## Implementation
### Code
### Migration
### Privileges / RLS
### Generated types

## Data preflight
- null count:
- orphan count:
- cross-clinic mismatch count:
- duplicate parent key count:
- table size / lock assumption:

## Verification
| Command | Result | Evidence |
|---|---|---|

## Subagent audits
| Agent | Verdict | Blocking findings |
|---|---|---|

## Migration rollout
- staging:
- production preconditions:
- maintenance window:
- post-deploy checks:

## Rollback / forward-fix
- code compatibility:
- security impact:
- data loss:
- operator steps:

## Residual risk
## Unverified
## DoD
```

---

# 21. Audit report template

```md
# Commercial hardening audit

## Verdict
PASS / BLOCK / PASS_WITH_RISK

## Blocking findings

## Evidence
- Repo SHA:
- Migration head:
- Remote migration head:
- Generated type hash:
- Advisor snapshot time:

## Tenant matrix

## Privilege matrix

## Function/RPC matrix

## Composite FK matrix

## Mutation route coverage

## Tests actually run

## Tests not run

## Staging result

## Restore drill result

## Residual risk

## Required owner decisions
```

---

# 22. Release runbook

## 22.1 Pre-staging

- branch up to date
- all required checks green
- no unresolved BLOCK
- migration file immutable
- migration list captured
- DB size/row counts captured
- backup capability confirmed
- secrets not in logs
- types diff zero

## 22.2 Staging apply

1. isolate project
2. restore representative snapshot where permitted
3. apply migration
4. capture duration and locks
5. run SQL tests
6. generate types
7. run all role API/Playwright
8. advisor snapshot
9. compare row counts
10. test external side effects disabled or sandboxed

## 22.3 Production approval packet

- exact migration list
- expected duration
- lock risk
- data repair status
- backup/restore point
- code deploy order
- feature flags
- abort criteria
- rollback/forward-fix
- communication owner
- monitoring owner

## 22.4 Abort criteria

- unresolved mismatch
- migration duration > approved threshold
- lock timeout
- error rate spike
- cross-tenant test failure
- Auth/login failure
- billing false lock/unlock
- notification duplication
- generated type mismatch
- Advisor new critical warning

## 22.5 Post-deploy

Immediately:

- health/live
- admin login
- clinic_admin login
- staff login
- manager scope
- patient read
- reservation mutation
- public booking
- invite
- billing lock
- tenant B tampering
- outbox/cron
- Sentry/log/audit events

At 24h / 72h:

- authorization denials
- 4xx/5xx
- DB lock/latency
- duplicate notification
- failed invite
- billing denial
- RLS-related errors
- customer support incidents

---

# 23. DR / restore drill

## 23.1 Goal

RTO 8h / RPO 24hは現時点では内部目標であり、訓練で実測する。

## 23.2 Drill

1. restore point選定
2. isolated Supabase projectへ復元
3. Vercel/environment再構成
4. migration head確認
5. generated types parity
6. auth
7. tenant isolation
8. critical row counts
9. reservation create/update
10. no duplicate external side effects
11. measured RTO/RPO
12. gap report

## 23.3 必須証跡

- start/end
- operator
- restore source
- missing data interval
- schema hash
- test results
- tenant isolation
- external side effects
- failures
- follow-up owner/date

---

# 24. Risk register

| Risk | Category | Severity | First mitigation PR |
|---|---|---:|---|
| Schema/type drift | Technical | Critical | PR-01 |
| Red CI merge | Operational | Critical | PR-01 |
| Broad client grants | Legal/Security | Critical | PR-02 |
| Cross-tenant relation | Security/Data | Critical | PR-05/06 |
| Ambiguous RLS role | Security | High | PR-03 |
| Function EXECUTE exposure | Security | High | PR-04 |
| Partial invite grant | Security/Operations | High | PR-08 |
| JWT stale authority | Security | High | PR-09 |
| Billing gate omission | Revenue | High | PR-10 |
| Legacy table ambiguity | Data | High | PR-07 |
| Missing FK indexes | Performance | Medium | PR-11 |
| Unproven restore | Operations/Fund | High | PR-12 |
| Mass unused-index drop | Performance | High if mishandled | Explicitly prohibited |

---

# 25. Definition of Done

## Code / DB

- [ ] migration replay from zero
- [ ] generated types clean
- [ ] no applied migration modified
- [ ] privilege matrix matches target
- [ ] RLS matrix matches target
- [ ] function EXECUTE matrix matches target
- [ ] composite FKs validated
- [ ] no unresolved mismatch/null repair
- [ ] route manifest 100%
- [ ] auth fail-closed
- [ ] invite atomic
- [ ] billing/scope classification complete

## Tests

- [ ] RED proof
- [ ] SQL tests
- [ ] focused Jest
- [ ] Full Jest
- [ ] Security Tests
- [ ] Build
- [ ] Playwright
- [ ] tenant A/B negative cases
- [ ] concurrency
- [ ] direct privilege/RPC denial
- [ ] no critical skip

## Audit

- [ ] db_schema_explorer
- [ ] rls_red_team
- [ ] migration_safety_auditor
- [ ] api_boundary_auditor
- [ ] test_adequacy_auditor
- [ ] Codex `/review`
- [ ] release_auditor
- [ ] human approval

## Release

- [ ] staging
- [ ] advisor diff
- [ ] backup evidence
- [ ] restore drill
- [ ] production approval
- [ ] post-deploy smoke
- [ ] 24h/72h review

---

# 26. SQL参考テンプレート

## 26.1 Cross-tenant mismatch

```sql
select
  c.id as child_id,
  c.clinic_id as child_clinic_id,
  p.id as parent_id,
  p.clinic_id as parent_clinic_id
from public.<child> c
join public.<parent> p on p.id = c.<foreign_id>
where c.<foreign_id> is not null
  and c.clinic_id is distinct from p.clinic_id;
```

## 26.2 Parent duplicate

```sql
select id, clinic_id, count(*)
from public.<parent>
group by id, clinic_id
having count(*) > 1;
```

## 26.3 Privilege inventory

```sql
select
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema in ('public', 'app_private')
order by table_schema, table_name, grantee, privilege_type;
```

## 26.4 Function EXECUTE inventory

```sql
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema in ('public', 'app_private')
order by routine_schema, routine_name, grantee;
```

## 26.5 Policy inventory

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## 26.6 RLS status

```sql
select
  n.nspname,
  c.relname,
  c.relrowsecurity,
  c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;
```

## 26.7 Foreign keys without clinic pair

```sql
select
  conrelid::regclass as child_table,
  conname,
  pg_get_constraintdef(oid)
from pg_constraint
where contype = 'f'
  and connamespace = 'public'::regnamespace
order by 1, 2;
```

この出力を機械解析し、tenant table間の単一列FKを抽出する。

---

# 27. Evidence directory contract

```text
docs/stabilization/evidence/commercial-hardening/
  README.md
  audit-metadata.yaml
  migrations-local.txt
  migrations-remote.txt
  types-local.sha256
  types-remote.sha256
  privilege-before.csv
  privilege-after.csv
  policies-before.csv
  policies-after.csv
  functions-before.csv
  functions-after.csv
  constraints-before.csv
  constraints-after.csv
  advisor-security-before.json
  advisor-security-after.json
  advisor-performance-before.json
  advisor-performance-after.json
  route-manifest.json
  red-tests.md
  green-tests.md
  subagent-audits/
  staging/
  restore-drill/
```

secret、token、患者個人情報、実メール、電話番号を保存しない。

---

# 28. Open decisions requiring owner sign-off

PR-00終了時に、以下だけは人間ownerが決定する。

1. `admin`が全clinicへアクセスできる現行仕様を維持するか
2. public booking中、契約inactive clinicの新規予約を拒否するか
3. shared masterをauthenticated direct SELECTにするか、全てserver API経由にするか
4. legacy tableの保持期限
5. maintenance window
6. unresolved legacy rowの扱い
7. leaked password protectionのUX影響
8. RTO/RPO目標の商用契約への採用可否

決定がない場合は、最も権限の狭い安全側を採用し、外部保証はしない。

---

# 29. 最終実装順

```text
PR-00  inventory + RED + Codex setup
  ↓
PR-01  types + CI + required checks
  ↓
PR-02  grants/default privileges
  ↓
PR-03  RLS policies
  ↓
PR-04  functions/Auth setting
  ↓
PR-05  core composite FKs
  ↓
PR-06  report/operational composite FKs
  ↓
PR-07  legacy quarantine
  ↓
PR-08  atomic invite
  ↓
PR-09  auth authority
  ↓
PR-10  mutation manifest/billing
  ↓
PR-11  performance-safe indexes
  ↓
PR-12  staging/DR/production qualification
```

PR-02以降を、PR-01がgreenになる前にmergeしない。

---

# 30. Final directive to the team

このプログラムの目的は、Advisorの警告数を減らすことでも、テスト件数を増やすことでもない。

目的は次の3つである。

1. **他院データへ到達できないこと**
2. **不正なtenant関係をDBへ保存できないこと**
3. **その保証をclean replay・CI・復元後にも再現できること**

実装がこの3つを強めない場合、その変更は商用ハードニングではない。

機能開発へ戻る条件は、少なくともPR-01〜PR-10が完了し、PR-12のstaging qualificationがPASSした後とする。

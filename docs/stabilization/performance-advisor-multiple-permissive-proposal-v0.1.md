# Supabase Performance Advisor Multiple Permissive Policies Proposal v0.1

- 作成日: 2026-04-13
- スコープ: `multiple_permissive_policies` の残件整理
- 方針:
  - RLS のアクセス境界は広げない
  - `admin` / `authenticated` / `anon` の意味は変えない
  - `USING` / `WITH CHECK` の意味は変えない
  - 自動統合はしない
  - この文書は proposal only とし、実 migration はまだ作成しない
- 関連 DoD:
  - `docs/stabilization/DoD-v0.1.md` の `DOD-04`
  - `docs/stabilization/DoD-v0.1.md` の `DOD-08`

## 1. 現在地

1. 2026-04-13 時点で、ローカル `supabase db advisors --local --type performance -o json` の実測は `117` 件で、すべて `multiple_permissive_policies`
2. 同日取得済み CSV `C:/Users/seekf/Downloads/Supabase Performance Security Lints 3(qnanuoqveidwvacvbhqp) (1).csv` では `175` 件で、こちらもすべて `multiple_permissive_policies`
3. 差分は local と CSV export の対象 state が一致していないことを示す。少なくとも「もう一度 `supabase db push` するだけ」で警告数が減る状況ではない
4. したがって次の作業は push ではなく、policy の重複を exact duplicate と semantic overlap に分けること

## 2. 件数内訳

### 2.1 Local advisor 実測

- `clinic_settings`: 16
- `improvement_backlog`: 16
- `staff_preferences`: 16
- `staff_shifts`: 16
- `beta_feedback`: 4
- `beta_usage_metrics`: 4
- `clinics`: 4
- `critical_incidents`: 4
- `mfa_usage_stats`: 4
- `profiles`: 4
- `registered_devices`: 4
- `security_events`: 4
- `session_policies`: 4
- `staff_invites`: 4
- `user_mfa_settings`: 4
- `user_permissions`: 4
- `user_sessions`: 4
- `menus`: 1

### 2.2 CSV export 実測

- `clinic_settings`: 24
- `improvement_backlog`: 24
- `staff_preferences`: 24
- `staff_shifts`: 24
- `beta_feedback`: 6
- `beta_usage_metrics`: 6
- `clinics`: 6
- `critical_incidents`: 6
- `mfa_usage_stats`: 6
- `profiles`: 6
- `registered_devices`: 6
- `security_events`: 6
- `session_policies`: 6
- `staff_invites`: 6
- `user_mfa_settings`: 6
- `user_permissions`: 6
- `user_sessions`: 6
- `menus`: 1

## 3. 低リスク候補

以下は「片方が完全重複」であり、残す policy を固定して duplicate を drop するだけでよい候補。`TO role` / `FOR cmd` / predicate が一致しているため、意味保存がしやすい。

### 3.1 `public.staff_shifts`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:5342`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5346`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5350`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5354`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5358`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5362`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5366`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5370`

候補:

1. `staff_shifts_delete_policy` を削除し `staff_shifts_delete` を残す
2. `staff_shifts_insert_policy` を削除し `staff_shifts_insert` を残す
3. `staff_shifts_select_policy` を削除し `staff_shifts_select` を残す
4. `staff_shifts_update_policy` を削除し `staff_shifts_update` を残す

性能上の意図:

- 同一 action に対して同一 predicate を二重評価しない
- planner が評価する permissive policy 数を減らす

権限上の安全性:

- 生き残る policy の predicate は削除対象と同一
- `manager` / `therapist` / `staff` / `clinic_admin` / `admin` の可否は変わらない
- `USING` / `WITH CHECK` の式は減るだけで、残る式は元と同一

### 3.2 `public.staff_preferences`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:5293`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5297`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5313`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5317`

候補:

1. `staff_preferences_delete_policy` を削除し `staff_preferences_delete` を残す
2. `staff_preferences_select_policy` を削除し `staff_preferences_select` を残す

性能上の意図:

- `DELETE` / `SELECT` の exact duplicate を解消する

権限上の安全性:

- 上記 2 組は predicate が完全一致
- 削除対象を落としても `DELETE` / `SELECT` の可否集合は不変

## 4. 高リスク候補

以下は warning 自体は出ているが、単純 drop や機械統合で意味が変わる可能性が高い。proposal の対象にはしてよいが、自動 migration 化はまだしない。

### 4.1 `public.staff_preferences` の INSERT / UPDATE

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:5301`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5305`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5321`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5325`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5329`

理由:

1. `staff_preferences_insert` は `therapist` / `staff` を含む
2. `staff_preferences_insert_policy` は comment どおり admin 側に制限している
3. `staff_preferences_update` は self-update を許す
4. `staff_preferences_update_policy` は管理側のみ
5. ここをまとめると self-service / admin-side の境界が崩れやすい

### 4.2 `public.clinic_settings`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:4872`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4876`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4888`

理由:

1. `clinic_settings_select` は `get_current_role()` と `can_access_clinic(clinic_id)` を使う
2. `clinic_settings_select_policy` / `clinic_settings_upsert_policy` は `profiles` / `user_permissions` を直接見る
3. しかも `p.clinic_id = p.clinic_id`, `up.clinic_id = up.clinic_id` という自己比較を含むため、まず仕様確認が必要
4. 単純統合すると `SELECT` / `UPDATE` / `DELETE` / `INSERT` の境界が変わりうる

### 4.3 `public.improvement_backlog`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:4663`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4737`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4996`

理由:

1. `Users can view backlog` は `USING (true)`
2. `improvement_backlog_authenticated_select` は `auth.role() = 'authenticated'`
3. ここを 1 本化すると `anon` と `authenticated` の意味が変わる可能性がある

### 4.4 `public.beta_feedback` / `public.beta_usage_metrics` / `public.critical_incidents`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:4681`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4687`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4693`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4745`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4751`

理由:

1. admin 用 SELECT policy と clinic/self 用 SELECT policy が OR 挙動を担っている
2. 単純に 1 本落とすと admin か一般利用者のどちらかを狭める

### 4.5 `public.clinics`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:4907`
- `supabase/migrations/00000000000001_squashed_baseline.sql:4924`

理由:

1. `clinics_admin_select` は admin / clinic_admin 明示
2. `clinics_own_select` は `can_access_clinic(id)` だけ
3. 両者の統合には `can_access_clinic` の意味論を前提にした written spec が必要

### 4.6 `public.menus`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:5011`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5015`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5019`

理由:

1. `menus_select_for_managers` は manager 以上
2. `menus_select_for_staff` は `TO authenticated` かつ `therapist` / `staff` のみ、さらに `is_active = true` と `is_deleted = false` を要求
3. これは exact duplicate ではなく、役割別の可視範囲分割

### 4.7 `public.profiles` / `public.registered_devices` / `public.security_events` / `public.session_policies` / `public.staff_invites` / `public.user_mfa_settings` / `public.user_permissions` / `public.user_sessions`

根拠:

- `supabase/migrations/00000000000001_squashed_baseline.sql:5087`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5091`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5102`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5106`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5210`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5222`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5228`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5234`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5251`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5257`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5381`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5390`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5394`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5409`
- `supabase/migrations/00000000000001_squashed_baseline.sql:5413`

理由:

1. 多くが `admin side policy` と `self policy` の組み合わせ
2. 統合には `OR` 条件化が必要になるが、`TO authenticated` や `WITH CHECK` の付け方次第で意味が変わる
3. 今回の「意味保存最優先」では proposal 止まりにすべき

## 5. SQL migration 案

以下は「低リスク exact duplicate だけ」に限定した draft。まだ commit しない。

```sql
begin;

drop policy if exists "staff_shifts_delete_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_insert_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_select_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_update_policy" on public.staff_shifts;

drop policy if exists "staff_preferences_delete_policy" on public.staff_preferences;
drop policy if exists "staff_preferences_select_policy" on public.staff_preferences;

commit;
```

rollback 案:

```sql
begin;

create policy "staff_shifts_delete_policy" on public.staff_shifts
for delete
using ((("public"."get_current_role"() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and "public"."can_access_clinic"("clinic_id")));

create policy "staff_shifts_insert_policy" on public.staff_shifts
for insert
with check ((("public"."get_current_role"() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and "public"."can_access_clinic"("clinic_id")));

create policy "staff_shifts_select_policy" on public.staff_shifts
for select
using ((("public"."get_current_role"() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])) and "public"."can_access_clinic"("clinic_id")));

create policy "staff_shifts_update_policy" on public.staff_shifts
for update
using ((("public"."get_current_role"() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and "public"."can_access_clinic"("clinic_id")));

create policy "staff_preferences_delete_policy" on public.staff_preferences
for delete
using ((("public"."get_current_role"() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and "public"."can_access_clinic"("clinic_id")));

create policy "staff_preferences_select_policy" on public.staff_preferences
for select
using ((("public"."get_current_role"() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])) and "public"."can_access_clinic"("clinic_id")));

commit;
```

## 6. ロール別テストケース

実装するとしたら、最低限次を通す。`DROP POLICY` は成功条件が「生き残る片方だけで同じ結果になる」こと。

### 6.1 `staff_shifts`

1. `anon`
   - `SELECT` / `INSERT` / `UPDATE` / `DELETE` が従来どおり拒否されること
2. `authenticated + therapist/staff`
   - 自 clinic の `SELECT` が通ること
   - `INSERT` / `UPDATE` / `DELETE` は従来どおり role 制約に従うこと
3. `authenticated + manager`
   - 自 clinic の `SELECT` / `INSERT` / `UPDATE` / `DELETE` が通ること
4. `authenticated + clinic_admin/admin`
   - 自 clinic 範囲の全 action が従来どおり通ること

### 6.2 `staff_preferences`

1. `anon`
   - `SELECT` / `DELETE` が従来どおり拒否されること
2. `authenticated + therapist/staff`
   - 自 clinic の `SELECT` は通ること
   - 今回は `INSERT` / `UPDATE` には触れないこと
3. `authenticated + manager`
   - 自 clinic の `SELECT` / `DELETE` が通ること
4. `authenticated + clinic_admin/admin`
   - 自 clinic の `SELECT` / `DELETE` が従来どおり通ること

### 6.3 退行防止

1. `pg_policies` から対象 table の policy 数を比較し、意図した policy だけ減っていること
2. `USING` / `WITH CHECK` の surviving policy 定義が baseline と一致すること
3. `supabase db advisors --local --type performance -o json` で `staff_shifts` / `staff_preferences` の件数だけが減ること

## 7. 適用順

1. remote export 175 件と local advisor 117 件の差分を先に確認する
2. 差分が role expansion だけで、対象 policy 定義が同じと確認できたら exact duplicate 候補だけを migration 化する
3. `supabase db push --local --dry-run` で drift が proposal migration のみであることを確認する
4. ロール別テストと `pg_policies` 比較を local で実施する
5. 問題なければ user が手動で `supabase db push` する
6. 高リスク群は別 spec を切ってから、table ごとに 1 つずつ扱う

## 8. 結論

1. 今残っている警告は「push 不足」ではなく policy 構成の問題
2. 今すぐ安全に手を入れられるのは `staff_shifts` の 4 件と `staff_preferences` の 2 件の exact duplicate 候補まで
3. それ以外は OR 挙動か role 分離を担っているため、今回の制約下では proposal only を維持する

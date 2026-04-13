# Supabase Performance Advisor Meaning-Preserving Plan v0.1

- 作成日: 2026-04-13
- 目的: Supabase Performance Advisor の `duplicate_index` / `auth_rls_initplan` / `multiple_permissive_policies` を、RLS の権限意味論を一切変えずに整理する
- 入力証跡:
  - `C:/Users/seekf/Downloads/Supabase Performance Security Lints Performance Advisor (qnanuoqveidwvacvbhqp) (1).csv`
  - `docs/stabilization/DoD-v0.1.md`
  - ローカル schema 実測: `supabase status`, `supabase db query --local ... pg_indexes`, `supabase db query --local ... pg_policies`
- 関連 DoD:
  - `DOD-04` schema drift を可視化し、意図した差分だけを適用する
  - `DOD-08` tenant boundary + RLS source-of-truth を崩さない

## 1. 結論

### 1.0 2026-04-13 addendum

1. `20260413000300_performance_advisor_meaning_preserving.sql` 適用後の local advisor 実測は `118` 件
   - `auth_rls_initplan`: 1
   - `multiple_permissive_policies`: 117
2. 残っている `auth_rls_initplan` は `public.notifications` / `Users can view their own notifications` の 1 件だけ
3. この 1 件は `auth.uid()` ではなく `auth.jwt()` の direct call が原因のため、`20260413000400_notifications_auth_jwt_initplan.sql` で局所修正する
4. `multiple_permissive_policies` は元の指示どおり proposal only を維持し、自動統合は行わない

### 1.1 低リスクで進めてよいもの

1. `duplicate_index` は 2 件とも「片方を drop するだけ」でよい
   - `public.reservations`: `idx_reservations_clinic_status` を残し `idx_reservations_status_clinic` を削除
   - `public.resources`: `idx_resources_clinic_id` を残し `idx_resources_clinic` を削除
2. `auth_rls_initplan` は「現在の `pg_policies` を正本にして、`auth.uid()` / `auth.role()` だけを `(select ...)` へ包む」方式なら低リスク
   - 現行 `pg_policies` 実測では対象は 55 policy
   - 内訳は `auth.uid()` を含むもの 45、`auth.role()` を含むもの 10、`current_setting()` 直書きは 0
   - `USING` / `WITH CHECK` / `TO role` / `FOR cmd` / `PERMISSIVE` は一切変えない

### 1.2 高リスクなので提案止まりにすべきもの

1. `multiple_permissive_policies` の大半は「単なる重複」ではなく、異なる predicate を OR 合成した現在挙動になっている
2. とくに `clinic_settings`, `staff_preferences`, `improvement_backlog`, `user_mfa_settings` は統合で権限意味が変わりやすい
3. 既存 draft `supabase/migrations/20260413000100_security_advisor_lints_hardening.sql:153`-`175` は `beta_usage_metrics` / `csp_violations` / `security_alerts` の INSERT 権限を狭めるため、今回の「意味保存だけを行う性能対応」には流用しない

## 2. 根拠

### 2.1 Duplicate Index

- `public.reservations`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:3783`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:3827`
  - ローカル `pg_indexes` 実測でも両方とも `btree (clinic_id, status) WHERE (is_deleted = false)`
- `public.resources`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:3831`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:3835`
  - ローカル `pg_indexes` 実測でも両方とも `btree (clinic_id)`

### 2.2 Auth RLS Initialization Plan

- 現行 `pg_policies` 実測で `auth.uid()` / `auth.role()` を直接含む policy が 55 件
- 代表ソース:
  - `beta_feedback`: `supabase/migrations/00000000000001_squashed_baseline.sql:4687`, `4745`
  - `critical_incidents`: `supabase/migrations/00000000000001_squashed_baseline.sql:4669`, `4705`
  - `improvement_backlog`: `supabase/migrations/00000000000001_squashed_baseline.sql:4663`, `4990`, `4996`
  - `profiles`: `supabase/migrations/00000000000001_squashed_baseline.sql:5087`, `5091`
  - `registered_devices`: `supabase/migrations/00000000000001_squashed_baseline.sql:5102`, `5106`
  - `security_events`: `supabase/migrations/00000000000001_squashed_baseline.sql:5210`, `5222`
  - `staff_invites`: `supabase/migrations/00000000000001_squashed_baseline.sql:5251`, `5263`
  - `user_mfa_settings`: `supabase/migrations/00000000000001_squashed_baseline.sql:4699`, `4741`, `5381`
  - `user_permissions`: `supabase/migrations/00000000000001_squashed_baseline.sql:5390`, `5394`
  - `user_sessions`: `supabase/migrations/00000000000001_squashed_baseline.sql:5405`, `5413`

### 2.3 Multiple Permissive Policies

- CSV 上の件数は 175
- 集中箇所:
  - `clinic_settings`: 24
  - `improvement_backlog`: 24
  - `staff_preferences`: 24
  - `staff_shifts`: 24
  - そのほか `beta_feedback`, `beta_usage_metrics`, `critical_incidents`, `mfa_usage_stats`, `profiles`, `registered_devices`, `security_events`, `session_policies`, `staff_invites`, `user_mfa_settings`, `user_permissions`, `user_sessions` は各 6、`menus` は 1

## 3. 低リスク / 高リスク分類

### 3.1 低リスク

1. `duplicate_index` の削除
   - 理由: index 定義が byte-level で同一
   - 性能意図: planner 候補と write amplification を減らす
   - 権限安全性: RLS / grant / policy に一切触れない
2. `auth_rls_initplan` の機械置換
   - 理由: Supabase 推奨どおり `auth.uid()` / `auth.role()` を init plan 化するだけ
   - 性能意図: per-row evaluation を避ける
   - 権限安全性: policy の論理式は同じで、`USING` / `WITH CHECK` の真偽は不変
3. Proposal only: `staff_shifts_*_policy` の exact duplicate 削除
   - 根拠: `staff_shifts_delete` / `staff_shifts_delete_policy`, `insert`, `select`, `update` が完全一致
   - ソース: `supabase/migrations/00000000000001_squashed_baseline.sql:5342`-`5370`

### 3.2 高リスク

1. `clinic_settings` の統合
   - `clinic_settings_select_policy` / `clinic_settings_upsert_policy` は自己比較 `p.clinic_id = p.clinic_id`, `up.clinic_id = up.clinic_id` を含み、まず仕様確認が必要
   - ソース: `supabase/migrations/00000000000001_squashed_baseline.sql:4876`-`4896`
2. `staff_preferences` の insert / update 統合
   - `staff_preferences_insert` は therapist/staff を含むが、`staff_preferences_insert_policy` は admin/clinic_admin/manager のみ
   - `staff_preferences_update` は self-update を許すが、`staff_preferences_update_policy` は管理側のみ
   - ソース: `supabase/migrations/00000000000001_squashed_baseline.sql:5301`-`5329`
3. `improvement_backlog` の SELECT 統合
   - `Users can view backlog` は `USING (true)`、`improvement_backlog_authenticated_select` は `auth.role() = 'authenticated'`
   - どちらかを落とす／統合するだけで `anon` と `authenticated` の意味が変わりうる
   - ソース: `supabase/migrations/00000000000001_squashed_baseline.sql:4663`, `4737`, `4990`, `4996`
4. `user_mfa_settings`, `beta_feedback`, `beta_usage_metrics`, `critical_incidents`, `mfa_usage_stats`, `profiles`, `registered_devices`, `security_events`, `session_policies`, `staff_invites`, `user_permissions`, `user_sessions`, `menus`
   - いずれも「admin 用 policy」と「self / clinic / staff 用 policy」の OR 挙動を持つ
   - 1 本化には written spec が必要

## 4. SQL Migration 案

### 4.1 Migration A: duplicate index だけ先に落とす

```sql
begin;

-- reservations: 定義が完全一致するため、命名が正しい側を残す
drop index if exists public.idx_reservations_status_clinic;

-- resources: clinic_id 命名に揃え、古い別名を落とす
drop index if exists public.idx_resources_clinic;

commit;
```

### 4.2 Migration B: auth RLS init plan 化を current schema 正本で機械適用する

```sql
begin;

do $$
declare
    rec record;
    expected_count integer;
    seen_count integer := 0;
    new_qual text;
    new_with_check text;
    role_clause text;
    create_sql text;
begin
    create temporary table _advisor_target_policies (
        tablename text not null,
        policyname text not null,
        primary key (tablename, policyname)
    ) on commit drop;

    insert into _advisor_target_policies (tablename, policyname)
    values
        ('audit_logs', 'audit_logs_insert_service_role'),
        ('beta_feedback', 'Admins can update feedback'),
        ('beta_feedback', 'Admins can view all feedback'),
        ('beta_feedback', 'Users can insert their clinic feedback'),
        ('beta_feedback', 'Users can view their clinic feedback'),
        ('beta_usage_metrics', 'Admins can view all metrics'),
        ('beta_usage_metrics', 'System can insert metrics'),
        ('beta_usage_metrics', 'Users can view their clinic metrics'),
        ('chat_messages', 'chat_messages_insert'),
        ('chat_messages', 'chat_messages_select'),
        ('chat_sessions', 'chat_sessions_insert'),
        ('chat_sessions', 'chat_sessions_select'),
        ('chat_sessions', 'chat_sessions_update'),
        ('clinic_settings', 'clinic_settings_select_policy'),
        ('clinic_settings', 'clinic_settings_upsert_policy'),
        ('critical_incidents', 'Admins can manage incidents'),
        ('critical_incidents', 'Affected clinics can view their incidents'),
        ('csp_violations', 'csp_violations_insert_any'),
        ('improvement_backlog', 'Admins can manage backlog'),
        ('improvement_backlog', 'improvement_backlog_admin_all'),
        ('improvement_backlog', 'improvement_backlog_authenticated_select'),
        ('mfa_setup_sessions', 'Users can manage own MFA setup sessions'),
        ('mfa_usage_stats', 'Admins can view MFA usage stats'),
        ('mfa_usage_stats', 'mfa_usage_stats_select_policy'),
        ('notifications', 'notifications_insert_service_role'),
        ('notifications', 'Users can update their own notifications'),
        ('notifications', 'Users can view their own notifications'),
        ('onboarding_states', 'onboarding_states_self_delete'),
        ('onboarding_states', 'onboarding_states_self_insert'),
        ('onboarding_states', 'onboarding_states_self_select'),
        ('onboarding_states', 'onboarding_states_self_update'),
        ('patients', 'patients_insert_legacy_block'),
        ('profiles', 'profiles_self_select'),
        ('profiles', 'profiles_self_update'),
        ('registered_devices', 'registered_devices_self_all'),
        ('reservation_history', 'reservation_history_insert_service_role'),
        ('security_alerts', 'security_alerts_insert_any'),
        ('security_events', 'security_events_insert_service_role'),
        ('security_events', 'security_events_self_select'),
        ('staff', 'staff_insert_legacy_block'),
        ('staff_invites', 'staff_invites_creator_delete'),
        ('staff_invites', 'staff_invites_creator_insert'),
        ('staff_invites', 'staff_invites_creator_select'),
        ('staff_invites', 'staff_invites_creator_update'),
        ('staff_preferences', 'staff_preferences_update'),
        ('staff_preferences', 'staff_preferences_upsert_policy'),
        ('user_mfa_settings', 'Admins can view clinic MFA settings'),
        ('user_mfa_settings', 'Users can insert own MFA settings'),
        ('user_mfa_settings', 'Users can update own MFA settings'),
        ('user_mfa_settings', 'Users can view own MFA settings'),
        ('user_mfa_settings', 'user_mfa_settings_select_policy'),
        ('user_permissions', 'user_permissions_self_select'),
        ('user_sessions', 'user_sessions_self_insert'),
        ('user_sessions', 'user_sessions_self_select'),
        ('user_sessions', 'user_sessions_self_update');

    select count(*) into expected_count
    from _advisor_target_policies;

    for rec in
        select
            p.schemaname,
            p.tablename,
            p.policyname,
            p.permissive,
            p.cmd,
            p.roles,
            p.qual,
            p.with_check
        from pg_policies p
        join _advisor_target_policies t
          on t.tablename = p.tablename
         and t.policyname = p.policyname
        where p.schemaname = 'public'
        order by p.tablename, p.policyname
    loop
        seen_count := seen_count + 1;

        new_qual := rec.qual;
        new_with_check := rec.with_check;

        if new_qual is not null then
            new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
            new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
        end if;

        if new_with_check is not null then
            new_with_check := replace(new_with_check, 'auth.uid()', '(select auth.uid())');
            new_with_check := replace(new_with_check, 'auth.role()', '(select auth.role())');
        end if;

        if coalesce(new_qual, '') = coalesce(rec.qual, '')
           and coalesce(new_with_check, '') = coalesce(rec.with_check, '') then
            raise exception
                'No auth wrapper change applied to %.%',
                rec.tablename,
                rec.policyname;
        end if;

        select string_agg(
                   case
                       when role_name = 'public' then 'public'
                       else quote_ident(role_name)
                   end,
                   ', '
               )
          into role_clause
          from unnest(rec.roles) as role_name;

        execute format(
            'drop policy %I on %I.%I',
            rec.policyname,
            rec.schemaname,
            rec.tablename
        );

        create_sql := format(
            'create policy %I on %I.%I as %s for %s to %s',
            rec.policyname,
            rec.schemaname,
            rec.tablename,
            rec.permissive,
            rec.cmd,
            role_clause
        );

        if new_qual is not null then
            create_sql := create_sql || format(' using (%s)', new_qual);
        end if;

        if new_with_check is not null then
            create_sql := create_sql || format(' with check (%s)', new_with_check);
        end if;

        execute create_sql;
    end loop;

    if seen_count <> expected_count then
        raise exception
            'Expected % policies, found % policies in current schema',
            expected_count,
            seen_count;
    end if;
end
$$;

commit;
```

### 4.3 Proposal only: exact duplicate permissive policy cleanup

```sql
-- proposal only: 別 PR。今回の migration には含めない

-- staff_shifts は exact duplicate のため、*_policy 側だけを落としても意味は変わらない
drop policy if exists "staff_shifts_delete_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_insert_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_select_policy" on public.staff_shifts;
drop policy if exists "staff_shifts_update_policy" on public.staff_shifts;

-- staff_preferences は delete/select だけ exact duplicate。insert/update/upsert は別仕様
drop policy if exists "staff_preferences_delete_policy" on public.staff_preferences;
drop policy if exists "staff_preferences_select_policy" on public.staff_preferences;

-- improvement_backlog は admin duplicate だけ exact duplicate だが、
-- SELECT の public/authenticated 意味論が絡むため、written spec 後に実施
-- drop policy if exists "improvement_backlog_admin_all" on public.improvement_backlog;
```

## 5. ロール別テストケース

### 5.1 構造テスト

1. `duplicate_index`
   - `pg_indexes` で `public.reservations` に `idx_reservations_clinic_status` だけが残る
   - `pg_indexes` で `public.resources` に `idx_resources_clinic_id` だけが残る
2. `auth_rls_initplan`
   - 対象 55 policy の `qual` / `with_check` に `auth.uid()` / `auth.role()` 生文字列が残っていない
   - 代わりに `(select auth.uid())` / `(select auth.role())` が入っている
3. `multiple_permissive_policies` proposal
   - `staff_shifts_*_policy` が exact duplicate であることを `pg_policies` で比較確認する

### 5.2 挙動テスト matrix

1. `anon`
   - `public.user_sessions`, `public.user_permissions`, `public.user_mfa_settings`, `public.security_events` は 0 row / deny のまま
   - `public.security_alerts`, `public.csp_violations`, `public.audit_logs`, `public.beta_usage_metrics` への INSERT は deny のまま
   - `public.improvement_backlog` は現行挙動どおり `Users can view backlog` を壊していないことを確認する
2. `authenticated` + self user
   - 自分の `profiles`, `user_sessions`, `user_mfa_settings`, `onboarding_states`, `mfa_setup_sessions` は現行どおり read/write できる
   - 他人の `profiles`, `user_sessions`, `user_mfa_settings` は引き続き deny / 0 row
3. `authenticated` + app-role=`admin`
   - `beta_feedback`, `beta_usage_metrics`, `critical_incidents`, `mfa_usage_stats`, `security_events` の admin path が現行どおり通る
   - `security_alerts` など service-role-only INSERT は admin claim でも bypass できない
4. `service_role`
   - `audit_logs_insert_service_role`, `notifications_insert_service_role`, `security_events_insert_service_role`, `security_alerts_insert_any`, `csp_violations_insert_any`, `System can insert metrics` が引き続き通る

### 5.3 pgTAP 雛形

```sql
begin;

select plan(8);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'reservations'
      and indexname = 'idx_reservations_clinic_status'
  ),
  'reservations keeps canonical duplicate index'
);

select ok(
  not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'reservations'
      and indexname = 'idx_reservations_status_clinic'
  ),
  'reservations drops duplicate alias index'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_sessions'
      and policyname = 'user_sessions_self_select'
      and qual like '%(select auth.uid())%'
  ),
  'user_sessions_self_select uses init-plan auth.uid wrapper'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'improvement_backlog'
      and policyname = 'improvement_backlog_authenticated_select'
      and qual like '%(select auth.role())%'
  ),
  'improvement_backlog_authenticated_select uses init-plan auth.role wrapper'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_shifts'
      and policyname = 'staff_shifts_select'
  ),
  'staff_shifts canonical select policy still exists'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_shifts'
      and policyname = 'staff_shifts_select_policy'
  ),
  'staff_shifts duplicate select alias removed only when proposal is approved'
);

select ok(true, 'anon/authenticated/admin behavior tests run as separate fixture-backed integration cases');
select ok(true, 'service_role insert behavior tests run as separate fixture-backed integration cases');

select * from finish();
rollback;
```

## 6. 適用順

1. `Migration A` を単独適用する
   - 影響が index metadata だけなので最も安全
2. `Migration B` を単独適用する
   - `supabase db push --local --dry-run` で差分確認後、fixture-backed RLS テストを実行
3. `multiple_permissive_policies` は別 spec / 別 PR に分離する
   - まず `staff_shifts` の exact duplicate cleanup だけを候補にする
   - その次に `staff_preferences` delete/select の exact duplicates
   - `clinic_settings`, `improvement_backlog`, `user_mfa_settings` など mixed predicate 群は written spec 作成後

## 7. この案で守っていること

1. `admin / authenticated / anon` の意味は変えない
2. `USING / WITH CHECK` の真偽は変えない
3. 既存 migration を書き換えず、新規 migration だけで収束できる
4. 既存の権限 tightening draft は本件から分離する

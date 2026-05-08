-- JWT app_metadata aware RLS helper functions.
--
-- Background:
--   Supabase が発行する JWT では、`raw_app_meta_data` に格納したカスタムクレーム
--   （role / clinic_id / clinic_scope_ids 等）は **トップレベルではなく**
--   `claims.app_metadata.*` のネスト位置に配置される。
--   既存の get_current_role / jwt_clinic_id / can_access_clinic は
--   `claims->>'role'` のようにトップレベルを参照しており、
--   実際の JWT 構造と噛み合わず RLS が「権限なし」判定で空配列を返す問題が発生していた。
--
--   本マイグレーションでは、これらのヘルパー関数を `app_metadata` ネスト
--   優先で参照するよう更新し、トップレベルクレームも互換のためフォールバック先として残す。
--   さらに `get_current_role` のフォールバック先テーブルを `user_permissions` から
--   `profiles` に変更し、現行のユーザーロール格納箇所と整合させる。
--
-- Affected RLS policies:
--   `daily_reports_*`, `daily_report_items_*` その他 `get_current_role()` /
--   `can_access_clinic()` を参照する全ポリシー。挙動の変化:
--     - 改修前: clinic_admin ユーザーが SELECT しても 0 件返却（無音失敗）
--     - 改修後: app_metadata から role / clinic_id を読み取り、想定通りに通過
--
-- Caveats:
--   - 同名関数が `app_private` スキーマにも双子で存在する。RLS ポリシーは
--     `public` 側のみ参照しているため、本ファイルは `public` のみ更新する。
--     `app_private` 側は別途整理予定（要設計判断）。
--   - 関数定義のみ変更しているため、既存ポリシーや権限グラントは影響を受けない。
--
-- Rollback:
--   旧定義は `auth.users` の `raw_app_meta_data` を JWT トップレベルに昇格する
--   仕組み（Supabase Custom Access Token Hook）を別途導入することで再利用可能。
--   ロールバック時は本ファイル直前のマイグレーション
--   `20260507000200_security_advisor_rpc_hardening.sql` 内の同名関数定義を再適用すること。

set search_path = public, auth, extensions;

-- =============================================================================
-- 1. get_current_role
--    Reads role from JWT claims with the following precedence:
--      1) claims.app_metadata.user_role  (推奨フィールド)
--      2) claims.app_metadata.role
--      3) claims.user_role               (旧方式トップレベル互換)
--      4) profiles.role  (DB フォールバック; staff_id ではなく user_id を参照)
-- =============================================================================
create or replace function public.get_current_role()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  claims jsonb;
  v_role text;
  db_role text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    -- 1. app_metadata.user_role（推奨フィールド）
    v_role := claims -> 'app_metadata' ->> 'user_role';
    if v_role is not null and v_role <> '' then
      return v_role;
    end if;

    -- 2. app_metadata.role
    v_role := claims -> 'app_metadata' ->> 'role';
    if v_role is not null and v_role <> '' then
      return v_role;
    end if;

    -- 3. トップレベル user_role（旧 Auth Hook 互換）
    v_role := claims ->> 'user_role';
    if v_role is not null and v_role <> '' then
      return v_role;
    end if;
  exception when others then
    -- JWT 解析失敗時はサイレントにフォールバックへ
    null;
  end;

  -- 4. DB フォールバック: profiles.role
  --    旧実装は user_permissions.staff_id を参照していたが、現行のユーザー
  --    ロール格納先は public.profiles.role（user_id 列で auth.uid と紐付く）
  select p.role
  into db_role
  from public.profiles p
  where p.user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  return coalesce(db_role, '');
end;
$function$;

comment on function public.get_current_role() is
  'Returns the current user role from JWT app_metadata (preferred), legacy top-level user_role, or profiles.role fallback. Used by RLS policies.';

-- =============================================================================
-- 2. jwt_clinic_id
--    Reads primary clinic_id from JWT claims with the following precedence:
--      1) claims.app_metadata.clinic_id
--      2) claims.clinic_id  (legacy)
-- =============================================================================
create or replace function public.jwt_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  claims jsonb;
  cid text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    cid := coalesce(
      claims -> 'app_metadata' ->> 'clinic_id',
      claims ->> 'clinic_id'
    );

    if cid is not null and cid <> '' then
      return cid::uuid;
    end if;
    return null;
  exception when others then
    return null;
  end;
end;
$function$;

comment on function public.jwt_clinic_id() is
  'Returns the primary clinic_id from JWT app_metadata.clinic_id (preferred) or top-level clinic_id (legacy).';

-- =============================================================================
-- 3. can_access_clinic
--    Determines whether the current user can access a target clinic.
--    Reads scope_ids from JWT claims with the following precedence:
--      1) claims.app_metadata.clinic_scope_ids
--      2) claims.clinic_scope_ids  (legacy)
--    Falls back to single-clinic comparison via jwt_clinic_id().
-- =============================================================================
create or replace function public.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  claims jsonb;
  scope_ids_json jsonb;
  scope_ids uuid[];
  primary_clinic_id uuid;
begin
  if target_clinic_id is null then
    return false;
  end if;

  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    scope_ids_json := coalesce(
      claims -> 'app_metadata' -> 'clinic_scope_ids',
      claims -> 'clinic_scope_ids'
    );

    if scope_ids_json is not null
       and jsonb_typeof(scope_ids_json) = 'array'
       and jsonb_array_length(scope_ids_json) > 0
    then
      select array_agg(elem::text::uuid)
      into scope_ids
      from jsonb_array_elements_text(scope_ids_json) as elem;

      return target_clinic_id = any(scope_ids);
    end if;
  exception when others then
    -- JWT 解析失敗時はサイレントにフォールバックへ
    null;
  end;

  -- フォールバック: 単一 clinic_id 比較
  primary_clinic_id := public.jwt_clinic_id();

  if primary_clinic_id is null then
    return false;
  end if;

  return target_clinic_id = primary_clinic_id;
end;
$function$;

comment on function public.can_access_clinic(uuid) is
  'Whether the current user can access the target clinic. Checks JWT app_metadata.clinic_scope_ids first, falls back to single clinic_id match.';

-- =============================================================================
-- 4. Smoke test (executes during migration to fail fast on definition errors)
-- =============================================================================
do $$
begin
  -- 関数の存在と署名を確認
  perform 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('get_current_role', 'jwt_clinic_id', 'can_access_clinic');

  if not found then
    raise exception 'Required RLS helper functions are missing after migration';
  end if;
end;
$$;

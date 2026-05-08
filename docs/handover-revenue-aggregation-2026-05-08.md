# 引き継ぎ: 日報→収益集計が表示されない問題

- **作成日**: 2026-05-08
- **対象機能**: `/daily-reports/input` での日報入力 → `/revenue` ページでの集計表示
- **作業ブランチ**: `claude/infallible-euler-2ca16a`（main にマージ済み・未 push）
- **関連コミット**: `da24867 fix: daily-reports/input と revenue の JST 統一・revenue 自動再フェッチ`
- **状況**: クライアント側の問題を 2 件修正済み。**RLS 関数を修正しても改善せず**、未解決のまま引き継ぎ。

## 2026-05-08 Codex 追記

未解決だった原因は、現行の RLS ポリシー参照先が `public.*` ではなく `app_private.*` に移っていたこと。

`20260507000200_security_advisor_rpc_hardening.sql` と `20260507000300_repair_app_private_policy_references.sql` により、tenant-scoped RLS ポリシーは `app_private.get_current_role()` / `app_private.jwt_clinic_id()` / `app_private.can_access_clinic()` を呼ぶ。したがって、`20260508000200_jwt_app_metadata_aware_rls_helpers.sql` で `public` 側だけを修正しても revenue の SELECT には効かない。

対策として `supabase/migrations/20260508000300_app_private_jwt_app_metadata_rls_helpers.sql` を追加した。これは active な `app_private` ヘルパーを `claims.app_metadata.*` 対応にし、`role: "authenticated"` をアプリケーションロールとして返さないようにする。rollback は `supabase/rollbacks/20260508000300_app_private_jwt_app_metadata_rls_helpers_rollback.sql`、spec は `docs/stabilization/spec-revenue-rls-app-private-jwt-2026-05-08.md`。

---

## 1. 報告された症状

clinic_admin ロールで `/daily-reports/input` から日報を入力しても、`/revenue` ページでの集計（日次・週次・月次売上、メニューランキング等）が **すべて 0 のまま** 表示される。

`/api/revenue?clinic_id=...` のレスポンスは Status 200 で `success: true` だが、`data` のすべての数値が 0：

```json
{
  "success": true,
  "data": {
    "dailyRevenue": 0,
    "weeklyRevenue": 0,
    "monthlyRevenue": 0,
    "insuranceRevenue": 0,
    "selfPayRevenue": 0,
    "menuRanking": [],
    "hourlyRevenue": [],
    "revenueForecast": 0,
    "growthRate": "0%",
    "revenueTrends": [],
    "costAnalysis": "32.5%",
    "staffRevenueContribution": []
  }
}
```

---

## 2. システム構成の前提

### 集計フロー（設計）

1. `/daily-reports/input`（クライアント）
   - `POST /api/daily-reports/items` で `daily_report_items` に行を追加
2. **DB トリガー**（`supabase/migrations/20260507000100_daily_report_items.sql`）
   - `daily_report_items_recalculate_totals` AFTER INSERT/UPDATE/DELETE
   - `recalculate_daily_report_totals()` を呼んで `daily_reports` の `total_revenue / insurance_revenue / private_revenue / total_patients` を集計
3. `/api/revenue` GET
   - `daily_reports` から推移・合計、`daily_report_items` からメニューランキングを取得

### 関連ファイル

| パス | 役割 |
|---|---|
| `src/app/(app)/daily-reports/input/page.tsx` | 日報入力 UI |
| `src/app/api/daily-reports/items/route.ts` | 明細 CRUD API |
| `src/app/api/daily-reports/route.ts` | 日報サマリ API |
| `src/app/api/revenue/route.ts` | 収益集計 API |
| `src/hooks/useRevenue.ts` | revenue ページのフック |
| `src/app/(app)/revenue/page.tsx` | revenue UI |
| `src/lib/jst.ts` | 共有 JST 日付ユーティリティ（今回新設） |
| `supabase/migrations/20260507000100_daily_report_items.sql` | items テーブル + トリガー |

---

## 3. 既に行った修正

### 修正 ① タイムゾーン不一致の解消（コミット済み）

**問題**: 入力ページの `getTodayDateInputValue()` がローカル TZ で日付を作成、一方 `/api/revenue` の `toJSTDateString()` は JST 固定。サーバーがUTC稼働かつユーザーが非 JST 環境の場合、`report_date` と `dateRange.lte` がずれて当日売上が 0 になる。

**修正内容**:
- `src/lib/jst.ts` を新設し、`toJSTDateString()` を共有化
- `src/app/(app)/daily-reports/input/page.tsx` の `getTodayDateInputValue()` を JST 固定に変更

### 修正 ② revenue ページの自動再フェッチ（コミット済み）

**問題**: `useRevenue` の `useEffect` 依存が `[clinicId]` のみで、入力 → revenue タブ移動時にキャッシュ表示される可能性。

**修正内容**:
- `fetchData` を `useCallback` 化、`isMounted` を `useRef` 化
- `visibilitychange` / `window.focus` イベントで再フェッチを追加

### 修正 ③ JWT クレームの注入（DB 直接、未マイグレーション）

**問題**: 後述の 4 章参照。`auth.users.raw_app_meta_data` に role/clinic_id が無く、JWT のクレームが空だった。

**実施した SQL**:
```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'user_role', 'clinic_admin',
  'role', 'clinic_admin',
  'clinic_id', 'a330cd56-2120-4930-84b6-1bb3cd7b986b',
  'clinic_scope_ids', jsonb_build_array('a330cd56-2120-4930-84b6-1bb3cd7b986b')
)
where email = 'seek.foryour.light@gmail.com';
```

実行後、再ログインで JWT のクレームが反映されたことを Console から確認済み（5 章参照）。**ただし症状は改善せず**。

### 修正 ④ RLS 関数の `app_metadata` ネスト対応（マイグレーション作成済み・未適用）

**マイグレーションファイル**: `supabase/migrations/20260508000200_jwt_app_metadata_aware_rls_helpers.sql`

このファイルには以下が含まれる:
- `get_current_role()` の `app_metadata` ネスト対応 + フォールバック先を `profiles` に変更
- `jwt_clinic_id()` の `app_metadata` ネスト対応
- `can_access_clinic()` の `app_metadata` ネスト対応
- 関数存在確認のスモークテスト

**未適用** のため、引き継ぎ先で以下のいずれかで適用すること:
- Supabase CLI: `supabase db push`
- Studio SQL Editor で内容を直接実行

**問題**: 後述の 5 章参照。Supabase は `raw_app_meta_data` のキーを **JWT のトップレベルに昇格しない**。`get_current_role()` などはトップレベルのキーを見ているため、ネストされた `app_metadata` 配下のクレームを読めず、空文字列を返す。

**マイグレーションファイル化された修正案**（`supabase/migrations/20260508000200_jwt_app_metadata_aware_rls_helpers.sql` に格納済）:

```sql
-- 1. get_current_role
create or replace function public.get_current_role()
returns text
language plpgsql
stable security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  claims jsonb;
  v_role text;
  db_role text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;
    v_role := claims->'app_metadata'->>'user_role';
    if v_role is not null and v_role <> '' then return v_role; end if;
    v_role := claims->'app_metadata'->>'role';
    if v_role is not null and v_role <> '' then return v_role; end if;
    v_role := claims->>'user_role';
    if v_role is not null and v_role <> '' then return v_role; end if;
  exception when others then null;
  end;
  select role into db_role from public.profiles where user_id = auth.uid() limit 1;
  return coalesce(db_role, '');
end;
$$;

-- 2. jwt_clinic_id
create or replace function public.jwt_clinic_id()
returns uuid
language plpgsql
stable security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  claims jsonb;
  cid text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;
    cid := coalesce(claims->'app_metadata'->>'clinic_id', claims->>'clinic_id');
    if cid is not null and cid <> '' then return cid::uuid; end if;
  exception when others then null;
  end;
  return null;
end;
$$;

-- 3. can_access_clinic
create or replace function public.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  claims jsonb;
  scope_ids_json jsonb;
  scope_ids uuid[];
  primary_clinic_id uuid;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;
    scope_ids_json := coalesce(
      claims->'app_metadata'->'clinic_scope_ids',
      claims->'clinic_scope_ids'
    );
    if scope_ids_json is not null and jsonb_array_length(scope_ids_json) > 0 then
      select array_agg(elem::text::uuid)
      into scope_ids
      from jsonb_array_elements_text(scope_ids_json) as elem;
      return target_clinic_id = any(scope_ids);
    end if;
  exception when others then null;
  end;
  primary_clinic_id := public.jwt_clinic_id();
  if primary_clinic_id is null then return false; end if;
  return target_clinic_id = primary_clinic_id;
end;
$$;
```

**2026-05-08 Codex 補足**: 上記の「RLS ポリシーが参照しているのは `public` 側」という前提は、`20260507000200_security_advisor_rpc_hardening.sql` / `20260507000300_repair_app_private_policy_references.sql` 適用後の実態と逆だった。現行ポリシーは `app_private` 側を参照するため、追加対策 `20260508000300_app_private_jwt_app_metadata_rls_helpers.sql` で `app_private` 側を修正した。

---

## 4. 診断で確定した事実

### DB 側は正常

トリガー `daily_report_items_recalculate_totals` は正しく動作しており、`daily_reports.total_revenue` は items 合計と一致している：

```
clinic_id    : a330cd56-2120-4930-84b6-1bb3cd7b986b（健康堂整骨院）
report_date  : 2026-05-07
total_patients: 2
total_revenue: 9000.00
items        : ¥4,000 (鍼灸) + ¥5,000 (骨格調整) = ¥9,000 ✓
```

両方の items は `source: 'reservation'`（予約 arrived からの自動反映）。手動入力 (`source: 'manual'`) はまだ未投入。

### 関数とテーブル

- トリガー（`daily_report_items` 上）:
  - `daily_report_items_clinic_ref_check` ✓
  - `daily_report_items_recalculate_totals` ✓
  - `update_daily_report_items_updated_at` ✓
- 関数 ✓:
  - `recalculate_daily_report_totals`
  - `sync_daily_report_item_totals`
- 注意: `sync_arrived_reservation_daily_report_item` がマイグレーション内では `reservations` テーブルに対するトリガーとして定義されているが、上記クエリでは未確認。`reservations` 側のトリガーは別途要確認。

### ロール / スキーマ

- `profiles` テーブルに `id` と `user_id` の 2 つの UUID カラムが存在
  - `profiles.id = 66bbf2b4-...`（profiles 主キー）
  - `profiles.user_id = e8386b4e-...`（auth.users.id への参照）
  - `profiles.role = clinic_admin` ✓
  - `profiles.clinic_id = a330cd56-...` ✓
- `get_current_role()` のフォールバックは **`user_permissions` テーブル**（`staff_id = auth.uid()`）を参照
  - **`profiles` テーブルではない** ← アーキテクチャ上の不整合
  - `user_permissions` の中身は未確認（要確認項目）

---

## 5. 未解決の問題

### 現状

1. RLS 関数 (`get_current_role`, `jwt_clinic_id`, `can_access_clinic`) は **トップレベル JWT クレーム** を参照する実装。
2. しかし Supabase は `raw_app_meta_data` のキーを **トップレベルに昇格しない**。実際の JWT は以下のような構造：

```js
{
  role: 'authenticated',          // ← Supabase 組み込みの postgres ロール（カスタムではない）
  sub: 'e8386b4e-...',
  app_metadata: {
    role: 'clinic_admin',         // ← ここに入っている（ネスト）
    user_role: 'clinic_admin',
    clinic_id: 'a330cd56-...',
    clinic_scope_ids: ['a330cd56-...']
  },
  user_metadata: { ... }
}
```

3. `get_current_role()` は `claims->>'role'` で `'authenticated'` を取得してしまう。`'authenticated'` は許可ロール一覧に無いため RLS 失敗。
4. `jwt_clinic_id()` も `claims->>'clinic_id'` が NULL を返し、`can_access_clinic` が false で全弾き。

### RLS 関数を修正しても改善しなかった事実

ユーザーには 3 章修正 ④ の SQL を提示したが、適用後も revenue ページの集計が出ないとの報告。

**残された可能性**:

1. 修正 SQL を実行した直後にキャッシュ／PGBouncer のプリペアドステートメントなどで関数が新しく解釈されていない（Supabase 側で関数定義変更後、コネクションプール経由で旧定義が残ることは稀にある）
2. 実は別の RLS ポリシーが効いている（`daily_reports_select_for_staff` 以外）
3. 修正 SQL の `app_metadata` 参照が JWT 構造と微妙にズレている（`claims::jsonb` の挙動を再検証）
4. `request.jwt.claims` が `request.jwt.claim.app_metadata` のように分離されている（PostgREST の設定による）
5. `auth.users.raw_app_meta_data` の更新後、ユーザーが完全な再ログインをしておらず JWT に反映されていない（ただし Console 経由で JWT 内に `app_metadata.clinic_id` 等を確認済みなので、これは可能性低）
6. 別の middleware や API ルートでサービスロールクライアント (`createScopedAdminContext`) が使われていて、本来 RLS をバイパスしているはずがそうなっていない

### 確定情報（フロント側）

`/revenue` を開いた状態でブラウザ Console から JWT 解析した結果（再ログイン後）:

```
JWT claims:
  iss: 'https://qnanuoqveidwvacvbhqp.supabase.co/auth/v1'
  sub: 'e8386b4e-02ca-4b12-b986-45c7f4530cd9'
  aud: 'authenticated'
  role: 'authenticated'                  ← トップレベル（Supabase 標準）
  user_role: undefined                    ← トップレベルには無い
  clinic_id: undefined                    ← トップレベルには無い
  clinic_scope_ids: undefined             ← トップレベルには無い
  app_metadata: {
    role: 'clinic_admin',                 ← ネスト内に存在
    user_role: 'clinic_admin',
    clinic_id: 'a330cd56-2120-4930-84b6-1bb3cd7b986b',
    clinic_scope_ids: ['a330cd56-...'],
    provider: 'email',
    providers: ['email']
  }
  iat: 2026/5/8 16:21:55
```

---

## 6. 次にやるべき調査・対策

### 優先度 高

**A. 修正 SQL（3 章 ④）が DB に適用されているか確認**

Supabase Studio で：
```sql
select pg_get_functiondef(oid) from pg_proc
where proname = 'get_current_role' and pronamespace = 'public'::regnamespace;
```

`claims->'app_metadata'->>` の文字列が含まれていれば適用済み。

**B. 適用済みなら、本当に通るかを直接テスト**

PostgREST 経由ではなく SQL Editor で（service_role 権限のためバイパスされるが、関数の動作確認用）：
```sql
-- JWT を擬似設定して関数の挙動を確認
set request.jwt.claims = '{
  "sub": "e8386b4e-02ca-4b12-b986-45c7f4530cd9",
  "role": "authenticated",
  "app_metadata": {
    "role": "clinic_admin",
    "user_role": "clinic_admin",
    "clinic_id": "a330cd56-2120-4930-84b6-1bb3cd7b986b",
    "clinic_scope_ids": ["a330cd56-2120-4930-84b6-1bb3cd7b986b"]
  }
}';

select public.get_current_role();   -- 'clinic_admin' が返るべき
select public.jwt_clinic_id();      -- a330cd56-... が返るべき
select public.can_access_clinic('a330cd56-2120-4930-84b6-1bb3cd7b986b'::uuid);  -- true が返るべき

reset request.jwt.claims;
```

**C. 本来あるべき設計: Supabase Custom Access Token Hook の導入**

Supabase の標準機能でカスタムクレームを **JWT トップレベルに昇格** する方法：
- [Supabase docs - Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- これを導入すれば RLS 関数を変更せずに既存設計のまま動く
- profiles テーブルとの自動同期も Hook 内に書ける

### 優先度 中

**D. アーキテクチャ整合性の確認**

- `get_current_role()` のフォールバックが `user_permissions` を見ている件
  - `profiles` を見るべきなのか、`user_permissions` テーブルを正として保ち profiles と双方向同期するのか、設計判断が必要
  - 関連: `docs/stabilization/spec-auth-role-alignment-v0.1.md`（メモリに記載）
- `app_private` スキーマと `public` スキーマで関数が二重に定義されている件
  - どちらが「正」なのか、ポリシーから参照されているのは `public` のみだが `app_private` 側も用途があるなら同期維持が必要

**E. マイグレーション化**

3 章 ③・④ で行った変更は **DB 直接編集** であり、`supabase/migrations/` には残っていない。

- `auth.users` のメタデータ更新は本来 Auth Hook で自動化すべきだが、暫定としては各ユーザー作成時にバックフィルする運用 / 関数を用意
- RLS 関数の修正は新規マイグレーションファイルとしてコミット必須（CLAUDE.md ルール: `supabase/migrations/` が source of truth）

### 優先度 低

**F. その他のキャッシュ可能性の排除**

- `/api/revenue/route.ts` に `export const dynamic = 'force-dynamic'` が無い件
- 開発環境では問題ないが本番で route segment cache が効く可能性

---

## 7. 再現手順（引き継ぎ先向け）

1. リポジトリ取得 + worktree チェックアウト

```bash
git fetch
git switch claude/infallible-euler-2ca16a   # または main（マージ済み）
```

2. 環境セットアップ（CLAUDE.md 参照）

```bash
./start_serena_mcp.sh
npm install
npm run dev
```

3. 以下のアカウントでログイン

```
email: seek.foryour.light@gmail.com
auth.users.id : e8386b4e-02ca-4b12-b986-45c7f4530cd9
profiles.id   : 66bbf2b4-9d8e-4df4-89d8-63792ed5f854
role          : clinic_admin
clinic_id     : a330cd56-2120-4930-84b6-1bb3cd7b986b（健康堂整骨院）
```

4. `/revenue` ページを開く → 月次・週次が ¥0 のままなら問題再現

5. DevTools Network タブで `/api/revenue?clinic_id=a330cd56-...` のレスポンスを確認

6. Supabase Studio で 4 章のクエリを再実行して DB 側のデータ確認

---

## 8. 添付資料 / 参考リンク

- 関連ファイル一覧: 2 章を参照
- 既存マイグレーション: `supabase/migrations/20260507000100_daily_report_items.sql`
- 関連メモリ: `C:\Users\seekf\.claude\projects\C--Users-seekf-Desktop-seikotsuin-management-saas\memory\MEMORY.md`
  - 特に "DB Source of Truth" セクション
  - "Critical Fix: @supabase/ssr Version Mismatch" セクション
- スタビライゼーション計画: `docs/stabilization/plan-src-supabase-refactor-v0.1.md`

---

## 9. 連絡事項

- main ブランチにマージ済みだが **未 push**。引き継ぎ先で動作確認後 `git push origin main` 想定。
- `daily-reports/input` の手動入力フローは **まだ実証されていない**（既存データはすべて予約 arrived からの自動反映）。RLS 解決後に手動入力テストも実施推奨。
- `clinics` テーブルに **重複登録**が見られる（"健康堂整骨院" x 2、"町中整骨院" x 2）。データクレンジング検討。

# 予約UIのローカル起動手順まとめ

## 目的
- Supabase ローカル環境で予約画面まで正しく動作させる
- 次回の再作業を迷わず再現できる状態にする

## 前提
- Supabase はローカル起動済み（`supabase start`）
- ポートは以下を想定
  - API: `http://127.0.0.1:54331`
  - DB: `postgresql://postgres:postgres@127.0.0.1:54332/postgres`
  - Studio: `http://127.0.0.1:54333`

## 1. DB初期化
```bash
supabase db reset
```

## 2. Studio でユーザー作成
1. `http://127.0.0.1:54333`
2. Authentication → Users → Add user
3. メール/パスワードを作成（記録しておく）

## 3. クリニック作成 + profiles 付与
### 3-1. クリニック作成
```sql
insert into public.clinics (name, is_active)
values ('テスト整骨院', true)
returning id;
```

### 3-2. profiles を作成・有効化（ユーザー紐付け）
```sql
insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
select
  u.id,
  c.id,
  u.email,
  'テスト整骨院',
  'admin',
  true
from auth.users u
cross join (
  select id from public.clinics order by created_at desc limit 1
) c
where u.email = 'YOUR_EMAIL'
on conflict (user_id) do update
set clinic_id = excluded.clinic_id,
    role = excluded.role,
    is_active = true;
```

## 4. clinic_id を既存データに付与
予約系の API は `clinic_id` で絞るため、サンプルデータに clinic_id が必要。
```sql
update public.customers set clinic_id = 'YOUR_CLINIC_ID' where clinic_id is null;
update public.menus set clinic_id = 'YOUR_CLINIC_ID' where clinic_id is null;
update public.resources set clinic_id = 'YOUR_CLINIC_ID' where clinic_id is null;
```

## 5. 型生成（ローカル）
```bash
npm run supabase:types
```

## 6. 開発サーバー起動
```bash
npm run dev
```

## 7. ログインと予約画面確認
- ログイン: `http://localhost:3000/admin/login`
- 予約画面: `http://localhost:3000/reservations`

## 8. よくあるエラーと対処
### 8-1. 「メールアドレスまたはパスワードが正しくありません」
- `db reset` 後は **auth.users が消える**
- Studio でユーザーを再作成し、`profiles` を再登録

### 8-2. 「アカウントが無効化されています」
- `profiles.is_active` が false または profiles が未作成
- 3-2 の SQL を再実行

### 8-3. `Failed to execute 'json' ... Unexpected token '<'`
- API が 500 を返して HTML が返却されている
- 4 の `clinic_id` 付与を確認

### 8-4. `NEXT_REDIRECT` ログが出る
- Next.js の正常な挙動（警告として出るだけ）
- 動作に大きな影響はない

## 9. seed でユーザー/clinic/profiles を固定化する方法
`supabase db reset` のたびにユーザーが消えるのを防ぐため、seed を使う。

### 9-1. seed 用 SQL を作成
`supabase/seed.sql` を作成し、以下を入れる（メール/パスワードは適宜変更）:
```sql
-- 1) クリニック作成
insert into public.clinics (name, is_active)
values ('テスト整骨院', true)
on conflict do nothing;

-- 2) auth ユーザー作成（Supabase の auth.users に直接登録）
-- ※パスワードは暗号化済みの hash が必要になるため、開発用として最低限の形で作成する
--    実運用では Auth API 経由推奨
insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values (
  gen_random_uuid(),
  'dead.parrot0906@gmail.com',
  crypt('YOUR_PASSWORD', gen_salt('bf')),
  now(),
  now(),
  now()
) on conflict (email) do nothing;

-- 3) profiles 作成（user_id と clinic_id を紐付け）
insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
select
  u.id,
  c.id,
  u.email,
  'テスト整骨院',
  'admin',
  true
from auth.users u
cross join (
  select id from public.clinics order by created_at desc limit 1
) c
where u.email = 'dead.parrot0906@gmail.com'
on conflict (user_id) do update
set clinic_id = excluded.clinic_id,
    role = excluded.role,
    is_active = true;
```

### 9-2. config.toml を確認
`supabase/config.toml` の `[db.seed]` が有効になっていることを確認:
```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

### 9-3. reset で反映
```bash
supabase db reset
```
これで毎回ユーザー/クリニック/プロフィールが再作成される。

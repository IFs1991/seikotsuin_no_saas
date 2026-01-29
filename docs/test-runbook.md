# E2Eテスト実行ガイド

## 概要

このドキュメントはE2Eテスト（Playwright）の実行に必要な前提条件と手順を記載します。

## 関連仕様書

- `docs/stabilization/spec-staff-invite-e2e-stability-v0.1.md` (スタッフ招待E2E安定化)
- `docs/stabilization/spec-admin-settings-contract-v0.1.md` (data-testid契約)
- `docs/stabilization/spec-playwright-baseurl-windows-v0.1.md` (baseURL/port整合)

## 前提条件

### 1. ローカルSupabaseの起動

E2Eテストはローカルで起動したSupabaseを使用します。

```bash
# Supabase起動
supabase start

# 起動確認（URLとキーを確認）
supabase status
```

### 2. 環境変数の設定

`.env.test.example` を参考に `.env.test` または `.env.local` を設定します。

#### 必須環境変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | ローカルSupabaseのURL | `http://127.0.0.1:54331` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon key | `supabase status` で取得 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのservice_role key | `supabase status` で取得 |
| `NEXT_PUBLIC_APP_URL` | アプリケーションURL | `http://127.0.0.1:3000` |

#### E2Eテスト専用フラグ

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `E2E_INVITE_MODE` | スタッフ招待のE2Eモード | `skip` |
| `E2E_SKIP_DB_CHECK` | preflight全体をスキップ | `0` |
| `E2E_DB_READY_TIMEOUT_MS` | Supabase readiness待機の最大時間 | `30000` |
| `E2E_DB_READY_RETRY_MS` | readinessリトライ間隔 | `1000` |

### 3. URL整合性の確認

以下のURLが一致していることを確認してください：

- `.env.local` の `NEXT_PUBLIC_APP_URL`
- `supabase/config.toml` の `auth.site_url`
- `playwright.config.ts` の `baseURL`

現在の設定:
- `supabase/config.toml`: `auth.site_url = "http://127.0.0.1:3000"`
- 推奨 `NEXT_PUBLIC_APP_URL`: `http://127.0.0.1:3000`

### 4. Inbucket（メールテスト）

ローカルSupabaseは Inbucket を使用してメールをキャプチャします。
招待メールなどの確認が必要な場合は以下のURLでアクセスできます：

```
http://127.0.0.1:54334
```

## テスト実行

### 全E2Eテストを実行

```bash
npm run test:e2e:pw
```

### 特定のテストを実行

```bash
# Staff invites のテストのみ
npm run test:e2e:pw -- --grep "Staff invites"

# 管理設定永続化のテスト
npm run test:e2e:pw -- --grep "管理設定永続化"
```

### デバッグモードで実行

```bash
# ヘッドあり（ブラウザ表示）
npx playwright test --headed

# デバッグモード
npx playwright test --debug
```

## スタッフ招待E2E安定化

### 背景

`inviteUserByEmail` はSupabase Authを通じて実際にメールを送信しようとするため、
E2E環境ではレスポンスが遅延またはハングする場合があります（TD-001）。

### 解決策

`E2E_INVITE_MODE=skip` を設定することで、以下の動作になります：

1. `inviteUserByEmail` の呼び出しをスキップ
2. `staff_invites` テーブルへのINSERTのみ実行
3. 即座に成功応答を返す

これにより、E2Eテストが決定的に成功するようになります。

### 注意事項

- `NODE_ENV=production` の場合は `E2E_INVITE_MODE` は無効化されます
- 本番環境では常に `inviteUserByEmail` が呼び出されます

## トラブルシューティング

### テストがタイムアウトする

1. ローカルSupabaseが起動しているか確認
2. 環境変数が正しく設定されているか確認
3. `npm run dev` でアプリケーションが起動しているか確認

### スタッフ招待が「送信中...」で止まる

1. `E2E_INVITE_MODE=skip` が設定されているか確認
2. `NODE_ENV` が `production` でないことを確認

### 認証エラーが発生する

1. `SUPABASE_SERVICE_ROLE_KEY` が正しいか確認
2. E2Eテスト用のユーザーがシードされているか確認

### Preflight失敗：「Supabase not ready」

1. `supabase status` でローカルSupabaseが起動しているか確認
2. `supabase start` で起動していない場合は起動
3. `E2E_DB_READY_TIMEOUT_MS` を増やして待機時間を延長

### Preflight失敗：「Required table(s) missing」

1. `supabase db reset --local` でマイグレーションを適用
2. テーブルが存在するか確認: `psql "postgresql://postgres:postgres@127.0.0.1:54332/postgres" -c "\dt"`

## 安定性検証

テストの安定性を確認するには、3回連続で成功することを確認します：

```bash
# 3回連続テスト
npm run test:e2e:pw -- --grep "Staff invites" --repeat-each=3
```

または手動で3回実行して全てパスすることを確認します。

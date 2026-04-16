# Password Reset Auth Email Preflight v0.1

作成日: 2026-04-16  
対象: パスワードリセット実装 PR-00  
正本仕様:
- `docs/パスワードリセット_UIUX機能一体仕様書_v0.1.md`
- `docs/パスワードリセット_実装タスクリスト_v0.1.md`
- `docs/認証と権限制御_MVP仕様書.md`
- `docs/メール_LINE送信責務整理.md`

## 1. 目的

パスワードリセット本体の実装前に、Auth Email 基盤が利用可能かを切り分ける。

この PR-00 では機能追加や migration は行わず、以下を確認対象として固定する。

- Auth Email の既存送信経路がどこにあるか
- `NEXT_PUBLIC_APP_URL` と callback 契約がどこで効いているか
- ローカル確認で分かること / Supabase Dashboard と Resend 側確認が必要なこと
- signup / invite / 今後の password reset で失敗原因をどう切り分けるか

## 2. 現在のコード根拠

### 2.1 signup / resend

- `src/app/(public)/register/actions.ts`
  - `registerOwner()`
    - `supabase.auth.signUp(...)`
    - `assertEnv('NEXT_PUBLIC_APP_URL')`
    - `options.emailRedirectTo = \`${appUrl}/admin/callback\``
  - `resendVerificationEmail()`
    - `supabase.auth.resend({ type: 'signup' })`
    - `assertEnv('NEXT_PUBLIC_APP_URL')`

### 2.2 invite

- `src/app/api/admin/staff/invites/route.ts`
  - `POST`
  - `createAdminClient().auth.admin.inviteUserByEmail(...)`
  - `assertEnv('NEXT_PUBLIC_APP_URL')`
  - `redirectTo = \`${appUrl}/admin/callback?invited=true\``
- `src/app/api/onboarding/invites/route.ts`
  - `POST`
  - `createAdminClient().auth.admin.inviteUserByEmail(...)`
  - `assertEnv('NEXT_PUBLIC_APP_URL')`
  - `redirectTo = \`${appUrl}/admin/callback?invited=true\``

### 2.3 callback 契約

- `src/app/(public)/admin/callback/route.ts`
  - `supabase.auth.exchangeCodeForSession(code)`
  - `next` パラメータを解釈して遷移先を決める

パスワードリセット仕様では、この callback 契約を再利用して
`/admin/callback?next=/reset-password/{source}` に戻す前提である。

### 2.4 環境変数と fail-fast

- `src/lib/env.ts`
  - `REQUIRED_ENV_VARS` に `NEXT_PUBLIC_APP_URL` を含む
  - `assertEnv(name)` で未設定時 fail-fast
- `.env.local.example`
  - `RESEND_SMTP_HOST`
  - `RESEND_SMTP_PORT`
  - `RESEND_SMTP_USERNAME`
  - `RESEND_SMTP_PASSWORD`
- `.env.production.example`
  - `RESEND_SMTP_HOST`
  - `RESEND_SMTP_PORT`
  - `RESEND_SMTP_USERNAME`
  - `RESEND_SMTP_PASSWORD`

### 2.5 ローカル Supabase の制約

- `supabase/config.toml`
  - `[inbucket] enabled = true`
  - `[auth] site_url = "http://127.0.0.1:3000"`
  - `[auth.email] enable_confirmations = false`
  - `[auth.email.smtp]` はコメントアウト状態

つまりローカルは「実メール送信の検証」ではなく、「Auth フローと callback 契約の確認」が中心である。  
本番想定の SMTP 実送確認は、Supabase Dashboard 側 SMTP 設定と Resend 側ドメイン認証の確認が別途必要である。

## 3. 責務整理

`docs/メール_LINE送信責務整理.md` のとおり、パスワードリセットメールは `Auth Email` 層の責務とする。

- Tiramisu アプリが Resend API を直接送るものではない
- Supabase Auth が送信主体である
- Resend は Supabase Auth の SMTP プロバイダとして利用する
- password reset も signup / invite と同じ Auth Email 経路に載せる

この前提が崩れている場合、パスワードリセット実装で吸収しない。

## 4. プレフライト判定

以下が満たせれば、PR-01 以降に進める。

### 4.1 必須

- `src/app/(public)/register/actions.ts` の `registerOwner()` が `signUp()` と `assertEnv('NEXT_PUBLIC_APP_URL')` を利用している
- `src/app/api/admin/staff/invites/route.ts` の `POST` が `inviteUserByEmail()` を利用している
- `src/app/api/onboarding/invites/route.ts` の `POST` が `inviteUserByEmail()` を利用している
- `src/app/(public)/admin/callback/route.ts` が `exchangeCodeForSession()` を行う
- `src/lib/env.ts` で `NEXT_PUBLIC_APP_URL` が fail-fast 対象に含まれる
- `.env.local.example` と `.env.production.example` に `RESEND_SMTP_*` が定義されている

### 4.2 本番前に必須

- Supabase Dashboard の Auth SMTP で custom SMTP が有効
- SMTP 接続先が Resend になっている
- Resend の送信ドメイン認証が完了している
- `NEXT_PUBLIC_APP_URL` が実運用 URL と一致している
- callback の遷移先 URL が allow-list と整合している

## 5. 確認手順

### 5.1 ローカル確認

1. `supabase start`
2. `supabase status`
3. 開発サーバー起動
4. `/register` から登録操作を行う
5. Inbucket で確認メールが生成されることを確認する
6. 管理画面または API から `POST /api/admin/staff/invites` を叩き、招待処理が成立することを確認する

ローカルで確認できること:

- Auth API 呼び出し経路が壊れていないこと
- callback に戻す URL 契約が成立していること
- `NEXT_PUBLIC_APP_URL` 未設定時に fail-fast すること

ローカルで確認できないこと:

- Resend SMTP による外部実送
- Supabase Hosted 側の custom SMTP 設定
- Resend ドメイン認証状態

### 5.2 ステージング / 本番前確認

1. Supabase Dashboard で Auth > SMTP Settings を開く
2. custom SMTP が enabled であることを確認する
3. host / port / username が Resend 用設定と一致することを確認する
4. Resend 管理画面で送信ドメインが verified であることを確認する
5. `NEXT_PUBLIC_APP_URL` と実際の公開 URL が一致することを確認する
6. signup を 1 件実施し、確認メール受信を確認する
7. invite を 1 件実施し、招待メール受信を確認する

## 6. 切り分け表

| 症状 | まず見る場所 | 主な原因候補 |
| --- | --- | --- |
| ローカル signup でメールが出ない | `supabase/config.toml` の `[inbucket]`, `[auth.email]` | Supabase local 未起動、ローカル Auth フロー失敗 |
| signup は動くが invite が失敗する | `src/app/api/admin/staff/invites/route.ts` `POST` | service role 設定不備、招待 API 側例外、タイムアウト |
| signup / invite の両方が外部実送されない | Supabase Dashboard SMTP 設定 | custom SMTP 未有効、Resend SMTP 資格情報不備 |
| callback 後の遷移先が壊れる | `src/app/(public)/admin/callback/route.ts`, `NEXT_PUBLIC_APP_URL` | callback URL と公開 URL の不一致、許可 URL 不整合 |
| password reset だけ失敗する | 今後追加する `resetPasswordForEmail(...)` 呼び出し | 実装差分、`redirectTo` の source 正規化漏れ、rate limit 超過 |

## 7. パスワードリセット実装への含意

PR-01 以降では以下を前提としてよい。

- password reset メールは新しい配送基盤を追加せず、既存の Auth Email 層を使う
- `redirectTo` は `NEXT_PUBLIC_APP_URL` と `/admin/callback` 契約の上に載せる
- 実メール未達の問題は password reset UI/action の責務ではなく、SMTP / domain / callback 設定の切り分け対象として扱う

## 8. DoD ひも付け

- `docs/stabilization/DoD-v0.1.md` `DOD-01`
  - local Supabase が起動し、Auth フロー確認ができること
- `docs/stabilization/DoD-v0.1.md` `DOD-06`
  - `NEXT_PUBLIC_APP_URL` と callback / web URL の整合を前提にすること
- `docs/stabilization/DoD-v0.1.md` `DOD-10`
  - 実装 PR で build を壊さない前提の事前整理として扱うこと

## 9. PR-00 の結論

現行 repo には、パスワードリセットが依存する Auth Email の前提が既に存在する。

- 送信 API 根拠: `signUp()`, `resend()`, `inviteUserByEmail()`
- callback 根拠: `exchangeCodeForSession()` + `next` 契約
- URL 根拠: `assertEnv('NEXT_PUBLIC_APP_URL')`
- SMTP 根拠: `.env.local.example`, `.env.production.example` の `RESEND_SMTP_*`

したがって PR-00 の到達点は「Auth Email 基盤を新設すること」ではなく、「password reset は既存 Auth Email 基盤に載せる」と repo 内の運用前提を固定した状態とする。

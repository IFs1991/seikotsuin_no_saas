# パスワードリセット UI/UX機能一体仕様書 v0.1

作成日: 2026-04-16  
対象: 整骨院向け管理SaaS（Next.js + Supabase Auth + Resend SMTP）

---

## 0. 現状整理

### 0.1 既存実装で揃っているもの

- ログイン画面
  - [スタッフログイン](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/login/page.tsx)
  - [管理者ログイン](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/admin/login/page.tsx)
- Auth callback
  - [admin/callback route](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/admin/callback/route.ts)
  - `next` パラメータを受け取り、`exchangeCodeForSession()` 後に安全な遷移先へ送れる
- 認証スキーマ
  - [auth schema](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/schemas/auth.ts)
  - `passwordResetSchema` は既に存在する
- Supabase Auth メール送信前提
  - [register actions](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/register/actions.ts)
  - `signUp()` / `resend()` は既に稼働前提
- 環境変数
  - [env.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/env.ts)
  - `NEXT_PUBLIC_APP_URL` は既に必須
- Auth メール配送基盤
  - [メール / LINE 送信責務整理](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/メール_LINE送信責務整理.md)
  - Auth Email は Supabase Auth + Resend SMTP 前提

### 0.2 現時点で未実装のもの

- `resetPasswordForEmail(...)` の呼び出し
- パスワード再設定依頼画面
- パスワード再設定完了画面
- recovery 用の新パスワード更新アクション

### 0.3 実装上の重要前提

- **本機能は Supabase Auth の recovery フローを利用する**
- **メール送信自体は Tiramisu 独自メール層ではなく Auth Email 層の責務**
- **Resend SMTP が Supabase Auth に設定済みであることが前提**

---

## 1. 目的

- ログインできない既存ユーザーが、自力で安全にパスワード再設定できるようにする
- 管理者ログイン / スタッフログインの両方に対応する
- 既存の `/register` `/invite` `/admin/callback` フローを壊さずに追加する
- アカウント列挙を防ぎ、Auth セキュリティを維持する

---

## 2. 設計原則

- 1画面1目的
- リセット依頼と再設定完了を分離する
- 既存 callback を再利用し、新しい認証プロトコルを増やさない
- メール有無や存在可否を開示しない
- DB マイグレーションは行わない
- 既存の `passwordChangeSchema` は流用しない

理由:

- `passwordChangeSchema` は `currentPassword` を必須とするため、recovery フローには不適合

---

## 3. スコープ

### 3.1 In Scope

- `/forgot-password` 公開ページの追加
- `/reset-password/[source]` 公開ページの追加
- `/login` と `/admin/login` からの導線追加
- `resetPasswordForEmail()` を使った recovery メール送信
- `updateUser({ password })` を使ったパスワード更新
- 非列挙型レスポンス
- 期限切れ / 無効リンク時の案内UI
- 監査ログの追加
- レート制限対象への追加

### 3.2 Out of Scope

- Supabase マイグレーション変更
- カスタムメールテンプレートの大幅変更
- MFA 回復フロー
- LINE 通知連携
- パスワードレス認証

---

## 4. ルート設計

### 4.1 新規ルート

- `/forgot-password`
  - パスワード再設定メール送信依頼画面
- `/reset-password/[source]`
  - `source` は `admin | clinic`
  - recovery セッション確立後の新パスワード入力画面

### 4.2 既存ルートの再利用

- `/admin/callback`
  - recovery メールの `redirectTo` 先として再利用する
  - `next=/reset-password/admin` または `next=/reset-password/clinic` を受ける

### 4.3 route group 上の配置

- `src/app/(public)/forgot-password/page.tsx`
- `src/app/(public)/reset-password/[source]/page.tsx`

`/forgot-password` と `/reset-password/*` は protected prefix に含まれないため、middleware 上は公開ルートとして扱える。

---

## 5. 画面・遷移設計

### 5.1 `/login` と `/admin/login`

両画面に `パスワードを忘れた方はこちら` リンクを追加する。

- スタッフログインから:
  - `/forgot-password?source=clinic`
- 管理者ログインから:
  - `/forgot-password?source=admin`

### 5.2 `/forgot-password`

#### 入力項目

- メールアドレス

#### 表示要素

- 見出し: `パスワード再設定`
- 説明文
- メールアドレス入力
- 主CTA: `再設定メールを送信する`
- 副CTA:
  - `スタッフログインへ戻る`
  - `管理者ログインへ戻る`

#### 振る舞い

- バリデーションは `passwordResetSchema` を使用する
- 成功時は同一の成功文言を返す
- 存在しないメールでも同一文言を返す
- 送信中はボタンを disabled にする

#### 成功メッセージ

例:

`メールアドレスが登録されている場合、パスワード再設定用のメールを送信しました。受信トレイと迷惑メールフォルダをご確認ください。`

### 5.3 `/reset-password/[source]`

#### source の意味

- `admin`
  - 管理者ログイン導線に戻す
- `clinic`
  - スタッフログイン導線に戻す

#### 入力項目

- 新しいパスワード
- 新しいパスワード（確認）

#### 表示要素

- 見出し: `新しいパスワードを設定`
- 強度補助
- 主CTA: `パスワードを更新する`
- リンク無効時 CTA:
  - `再度メールを送る`
  - `ログイン画面へ戻る`

#### 振る舞い

- recovery セッションが有効な場合のみフォームを表示する
- セッションが無い、または期限切れの場合は無効状態UIを表示する
- 更新成功後は **サインアウトして** ログイン画面に戻す

理由:

- recovery セッションをそのまま残さず、再ログインを明示した方が運用が安定する

---

## 6. フロー仕様

### 6.1 リセット依頼フロー

1. ユーザーが `/login` または `/admin/login` から `/forgot-password` へ遷移する
2. メールアドレスを入力する
3. Server Action が `supabase.auth.resetPasswordForEmail(...)` を呼ぶ
4. `redirectTo` には以下を指定する

#### clinic の場合

```ts
${NEXT_PUBLIC_APP_URL}/admin/callback?next=/reset-password/clinic
```

#### admin の場合

```ts
${NEXT_PUBLIC_APP_URL}/admin/callback?next=/reset-password/admin
```

5. 結果に関係なく非列挙型の成功文言を返す

### 6.2 リカバリーフロー

1. ユーザーが recovery メール内リンクを押す
2. Supabase から `/admin/callback?code=...&next=/reset-password/{source}` に到達する
3. [admin/callback route](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/(public)/admin/callback/route.ts) が `exchangeCodeForSession()` を実行する
4. callback は `next` に従って `/reset-password/{source}` に遷移する
5. `/reset-password/{source}` はセッション存在を確認してフォームを表示する
6. 新パスワード送信時に `supabase.auth.updateUser({ password })` を実行する
7. 成功後、`supabase.auth.signOut()` を実行してログイン画面へ戻す

---

## 7. スキーマ・型設計

### 7.1 再利用する既存スキーマ

- [passwordResetSchema](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/schemas/auth.ts)
  - メールアドレス入力用に再利用する

### 7.2 流用しない既存スキーマ

- [passwordChangeSchema](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/schemas/auth.ts)
  - `currentPassword` 必須のため不使用

### 7.3 新規追加するスキーマ

`src/lib/schemas/auth.ts` に、recovery 用の新スキーマを追加する。

候補名:

- `passwordRecoverySchema`

仕様:

- `password`: `passwordSchema`
- `confirmPassword`: string
- `password === confirmPassword` を検証

### 7.4 レスポンス型

既存の `AuthResponse` は `confirmPassword` エラーを表現できないため、そのまま流用しない。

#### 追加する型

- `ForgotPasswordResponse`
- `ResetPasswordResponse`

または route-local 型として各 actions.ts で定義する。

---

## 8. サーバーアクション仕様

### 8.1 `requestPasswordReset`

配置:

- `src/app/(public)/forgot-password/actions.ts`

責務:

1. 入力検証
2. `source` の正規化
3. `assertEnv('NEXT_PUBLIC_APP_URL')`
4. `resetPasswordForEmail()` を実行
5. 結果に関係なく非列挙型レスポンスを返す
6. 監査ログ記録

### 8.2 `completePasswordReset`

配置:

- `src/app/(public)/reset-password/actions.ts`

責務:

1. recovery セッション付き Supabase client を取得
2. 新パスワード入力を検証
3. `supabase.auth.updateUser({ password })`
4. 成功時に `supabase.auth.signOut()`
5. `source` に応じてログイン画面へ遷移
6. 監査ログ記録

---

## 9. セキュリティ要件

### 9.1 非列挙化

`/forgot-password` では、メールアドレスが存在するかどうかを返さない。

### 9.2 レート制限

[rate-limiting middleware](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/rate-limiting/middleware.ts) の `isAuthEntryPoint()` に以下を追加する。

- `/forgot-password`
- `/reset-password/` prefix

### 9.3 セッション前提

`/reset-password/[source]` の更新処理は recovery セッション前提とする。  
有効なセッションがなければ更新を拒否する。

### 9.4 監査ログ

最低限、以下を記録する。

- `password_reset_requested`
- `password_reset_completed`
- `password_reset_invalid_link`

---

## 10. 実装対象ファイル

### 10.1 新規追加

- `src/app/(public)/forgot-password/page.tsx`
- `src/app/(public)/forgot-password/actions.ts`
- `src/app/(public)/reset-password/[source]/page.tsx`
- `src/app/(public)/reset-password/actions.ts`

### 10.2 変更

- `src/app/(public)/login/page.tsx`
  - forgot password 導線追加
- `src/app/(public)/admin/login/page.tsx`
  - forgot password 導線追加
- `src/lib/schemas/auth.ts`
  - recovery 用スキーマ追加
- `src/lib/rate-limiting/middleware.ts`
  - forgot/reset path を認証入口として扱う

### 10.3 非変更

- DB migration
- `src/app/(public)/admin/callback/route.ts`
  - 既存の `next` 契約を再利用する
- `/register`
- `/invite`

---

## 11. 受け入れ基準

- AC-01: `/login` に forgot password 導線が表示される
- AC-02: `/admin/login` に forgot password 導線が表示される
- AC-03: `/forgot-password` は有効なメール形式のみ受け付ける
- AC-04: 存在しないメールでも同一の成功文言を返す
- AC-05: `resetPasswordForEmail()` の `redirectTo` は `/admin/callback?next=/reset-password/{source}` を使う
- AC-06: recovery メールリンクから `/reset-password/{source}` に到達できる
- AC-07: `/reset-password/{source}` は無効セッション時に再送導線を表示する
- AC-08: 有効セッション時は新パスワード更新ができる
- AC-09: 更新成功後はセッションを破棄してログイン画面へ戻す
- AC-10: `/register` `/invite` 既存導線が回帰しない
- AC-11: DB マイグレーションなしで実装できる

---

## 12. テスト観点

### 12.1 Unit

- `passwordRecoverySchema`
- source 正規化
- 非列挙型レスポンス契約

### 12.2 Integration

- `requestPasswordReset` 成功 / 失敗 / 非列挙化
- `completePasswordReset` 成功 / 無効セッション / バリデーション失敗

### 12.3 Component

- forgot-password page の入力 / メッセージ表示
- reset-password page の有効 / 無効状態

### 12.4 Regression

- `/login` 既存ログイン
- `/admin/login` 既存ログイン
- `/register`
- `/invite`
- `/admin/callback?next=/reset-password/admin` の遷移

### 12.5 E2E（任意だが推奨）

- forgot password request
- recovery link landing
- password update
- post-success login

---

## 13. DoD 紐付け

参照: [DoD-v0.1](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/DoD-v0.1.md)

- DOD-10: `npm run build` が成功する
- DOD-11: `npm run test -- --ci --testPathIgnorePatterns=e2e` が成功する
- DOD-06: Playwright を追加する場合、回帰なく安定実行できる

---

## 14. リスクと対策

### リスク 1

Supabase Auth SMTP 未設定で recovery メールが送れない

対策:

- Resend SMTP を先に有効化する
- 事前に signup / invite メールが動作していることを確認する

### リスク 2

`passwordChangeSchema` を流用して currentPassword 要求が残る

対策:

- recovery 用スキーマを明示的に新設する

### リスク 3

管理者導線とスタッフ導線の戻り先が混ざる

対策:

- `source=admin|clinic` を path segment に持たせる

### リスク 4

既存 callback の next 契約を壊す

対策:

- `next` は pathname のみ利用する
- query を next に持ち込まない

---

## 15. ロールバック

- `forgot-password` / `reset-password` 関連ルートを削除
- login ページの導線を戻す
- `passwordRecoverySchema` を削除
- `rate-limiting/middleware.ts` の forgot/reset 追加を戻す

DB 変更はないため、データロールバックは不要。

---

## 16. 実装順

1. スキーマと型を追加
2. forgot-password の UI と action を追加
3. reset-password の UI と action を追加
4. login 画面の導線を追加
5. rate limit 対象を追加
6. unit / integration / component テストを追加
7. 必要なら Playwright を追加

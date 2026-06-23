# 初回ユーザー登録（オーナー登録）UI/UX機能一体仕様書 v0.1

作成日: 2026-02-18  
対象: 整骨院管理SaaS（Next.js + Supabase）

## 1. 背景と課題
- 現状は `src/app/admin/login/page.tsx` にログインとサインアップが同居しており、初回登録導線が不明瞭。
- `src/app/login/page.tsx` はスタッフログイン専用で、新規登録導線を持たない。
- 実態として「初回オーナー登録 -> オンボーディング -> 管理者機能利用」の体験が仕様として分離されていない。

## 2. この仕様のゴール
- 「SaaSを初めて使うユーザー」が迷わず登録完了できる専用導線を提供する。
- UI設計と機能仕様を1ドキュメントで定義し、1PRで着手できる粒度にする。
- 既存のオンボーディング実装（`/onboarding`）へ自然接続する。

## 2.1 To-Be仕様（位置づけ）
- 本書は「現状実装の説明」ではなく、初回ユーザー登録導線を完成させるための To-Be（目標）仕様である。
- 記載されたルート、UI、アクション、受け入れ基準は、今後の実装完了を前提とした要件定義として扱う。
- 実装中は本書を基準に差分管理を行い、セルフテスト完了後に `v0.2` として確定版を作成する。

## 2.2 未実装差分（As-Isとの差分）
- `src/app/register/page.tsx` が未作成で、初回オーナー登録の専用画面が存在しない。
- `src/app/register/actions.ts` が未作成で、登録専用のサーバーアクションが存在しない。
- `src/app/register/verify/page.tsx` が未作成で、確認メール送信後の案内画面が存在しない。
- `src/app/admin/login/page.tsx` はログイン専用ではなく、`isSignUp` トグルで signup を内包している。
- `src/lib/schemas/auth.ts` の signup 用スキーマは `email/password` のみで、`confirmPassword` と `termsAccepted` 要件が未反映。

## 3. スコープ
### In Scope
- 新規オーナー登録画面（新ルート）実装
- 登録完了（確認メール送信）画面
- 管理者ログイン画面からの導線整理
- バリデーション、エラー表示、ローディング、成功表示
- 既存 `src/app/admin/callback/route.ts` -> `/onboarding` 分岐との接続

### Out of Scope
- 課金/プラン選択
- マイグレーション変更
- 招待フロー仕様変更（`/invite`）

## 4. 情報設計（IA）
- `/admin/login`: 管理者ログインのみ（新規登録はリンク遷移）
- `/register`: 初回オーナー登録
- `/register/verify`: 「確認メール送信済み」案内
- `/admin/callback`: 認証完了後に `clinic_id` 未設定なら `/onboarding`
- `/onboarding`: 既存の初期設定フローを継続利用

## 5. 画面仕様（UI/UX）
## 5.1 `/register` 初回オーナー登録画面
### 目的
- 初回ユーザーが3分以内に登録操作を完了できること。

### UIブロック
- ヘッダー: サービス名、サブコピー「まずは無料で始める」
- フォーム:
  - メールアドレス
  - パスワード
  - パスワード確認
  - 利用規約同意チェックボックス
- CTA:
  - 主ボタン: `無料で始める`
  - 副リンク: `管理者ログインはこちら` (`/admin/login`)
- 補助情報:
  - パスワード強度インジケータ
  - セキュリティ説明（短文）

### 振る舞い
- 入力中リアルタイム検証
- submit中はボタンdisabled + スピナー表示
- 成功時は `/register/verify?email=...` へ遷移
- 失敗時はフォーム直下にエラー表示

### 入力ルール
- email: 必須、RFC準拠
- password: `signupSchema` 準拠（既存 `src/lib/schemas/auth.ts` を再利用）
- confirmPassword: `password` と一致必須
- termsAccepted: `true` 必須

### エラー文言
- 既存登録済み: `このメールアドレスは既に登録されています`
- 通信失敗: `通信に失敗しました。時間をおいて再度お試しください`
- 汎用: `アカウント作成に失敗しました。入力内容を確認してください`

## 5.2 `/register/verify` 確認メール送信済み画面
### 目的
- 次アクションを迷わせない。

### UIブロック
- 完了アイコン
- 見出し: `確認メールを送信しました`
- 本文: 宛先メール、迷惑メール確認案内
- CTA:
  - `メールを再送する`（同一アクション再実行）
  - `管理者ログインへ戻る` (`/admin/login`)

## 5.3 `/admin/login` の変更
- `isSignUp` トグルを廃止し、ログイン専用画面化。
- 新規登録は固定リンクで `/register` に遷移。

## 6. 機能仕様
## 6.1 サーバー処理
- 新規登録アクションを `src/app/register/actions.ts` に新設する。
- 処理内容:
  1. 入力検証（Zod）
  2. サニタイズ（既存 `sanitizeAuthInput`）
  3. `supabase.auth.signUp`
  4. `emailRedirectTo`: `${NEXT_PUBLIC_APP_URL}/admin/callback?next=/onboarding`
  5. 成功レスポンス返却

## 6.2 権限/遷移
- 登録時点では `clinic_id` 未設定を許可。
- `src/app/admin/callback/route.ts` で `clinic_id` 未設定時に `/onboarding` へ遷移（既存仕様を維持）。
- スタッフ作成は既存の管理者招待API（`src/app/api/admin/staff/invites/route.ts`）を継続。

## 6.3 セキュリティ
- クライアントから `SUPABASE_SERVICE_ROLE_KEY` は使用しない。
- エラーメッセージは列挙型の安全文言に限定。
- 監査ログは既存 `AuditLogger` を利用して signup失敗/成功を記録。

## 7. 実装対象ファイル（1タスク1PR）
### 新規
- `src/app/register/page.tsx`
- `src/app/register/actions.ts`
- `src/app/register/verify/page.tsx`

### 変更
- `src/app/admin/login/page.tsx`（signupトグル削除、registerリンク追加）
- 必要に応じて `src/lib/schemas/auth.ts`（confirmPassword/terms用schema追加）

### ドキュメント
- 本仕様書

## 8. 受け入れ基準（Acceptance Criteria）
- AC-01: `/register` で有効な入力時に確認メール送信完了画面へ遷移する。
- AC-02: 無効入力時、該当フィールドに即時エラーが表示される。
- AC-03: 既存メール登録時に適切な重複エラーを表示する。
- AC-04: `/admin/login` はログイン専用となり、新規登録リンクで `/register` へ遷移する。
- AC-05: 認証後、`clinic_id` 未設定ユーザーは `/onboarding` に到達する。
- AC-06: 既存のスタッフ招待フロー（`/invite`）に影響を与えない。

## 9. テスト観点
- Unit:
  - Zod検証（email/password/confirmPassword/terms）
  - サーバーアクションのエラー分岐
- Integration:
  - signUp成功 -> verify画面遷移
  - 既存登録済みエラー
- E2E (Playwright):
  - `/register` 完了まで
  - `/admin/login` -> `/register` 遷移確認

## 10. ロールアウト/リスク
- ロールアウト: 機能フラグ不要（ルート追加 + 既存画面の軽微変更）
- 主リスク: 既存 `/admin/login` のsignup依存テストが落ちる
- 対策: テスト期待値を「registerリンク遷移」に更新

## 11. ロールバック方針
- 変更ファイルをrevertして `src/app/admin/login/page.tsx` のsignupトグルを復元。
- DB変更は含まないため、データロールバック不要。

## 12. 実装メモ（UX指針）
- フォームは1カラム固定、モバイル優先（最大幅 480px）
- 主要CTAは1画面1つに限定
- エラーはフィールド直下 + フォーム上部の要約で二重提示
- 「スタッフ登録は招待制」の補助文を必ず表示し、役割混同を防ぐ

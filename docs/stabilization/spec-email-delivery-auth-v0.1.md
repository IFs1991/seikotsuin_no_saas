# メール送信基盤（登録/招待）実装仕様書 v0.3

- 作成日: 2026-02-22
- 更新日: 2026-02-22
- 対象: `Supabase Auth + Resend SMTP` を前提とした登録/招待メール送信
- 方針: 安定化優先（Supabase/Docker/Playwright/RLS）、小さなPRで段階導入
- 制約: マイグレーション変更は本仕様の対象外（別spec + rollback必須）

## 0. 目的

- 登録確認メール、確認メール再送、スタッフ招待メールを本番運用可能な品質に揃える。
- 実装差分で分岐している送信契約（`admin/staff/invites` と `onboarding/invites`）を統一する。
- ユーザー列挙リスクを排除し、運用・監視・切替手順まで含めて拡張可能な仕様にする。

## 1. 現状調査（コードベース根拠）

### 1-1. 送信経路

- 登録:
  - `src/app/register/actions.ts` `registerOwner()`
  - `supabase.auth.signUp()` + `emailRedirectTo`
- 再送:
  - `src/app/register/actions.ts` `resendVerificationEmail()`
  - `supabase.auth.resend({ type: 'signup' })`
- 管理設定の招待:
  - `src/app/api/admin/staff/invites/route.ts` `POST`
  - `createAdminClient().auth.admin.inviteUserByEmail()`
- オンボーディングの招待:
  - `src/app/api/onboarding/invites/route.ts` `POST`
  - `createAdminClient().auth.admin.inviteUserByEmail()`

### 1-2. 重要な実装差分（P0ギャップ）

- `admin/staff/invites`:
  - `Promise.race` タイムアウトあり（`INVITE_TIMEOUT_MS = 10000`）
  - `E2E_INVITE_MODE=skip` 分岐あり（`NODE_ENV !== 'production'` ガード）
- `onboarding/invites`:
  - タイムアウトなし
  - `E2E_INVITE_MODE` 分岐なし
  - `for` 逐次送信で累積遅延リスク（10秒相当 x 件数）
  - `authError.message` をレスポンスへ素通し（列挙リスク）

### 1-3. 旧サインアップ経路

- `src/app/admin/actions.ts` `signup()` が残存
  - `"already registered"` を分岐して明示文言返却
  - `registerOwner()` の非列挙方針と不一致
  - 監査ログも `registerOwner()` と同等の整理が未実施

### 1-4. callback URL解決

- `src/app/admin/callback/route.ts` は `new URL(request.url).origin` を基準にリダイレクト先を構築
- 逆プロキシ/内部URL環境で `NEXT_PUBLIC_APP_URL` と乖離し得る

### 1-5. SMTP設定保存の不整合

- UI: `src/components/admin/communication-settings.tsx` は `smtpSettings.username` + `secure`
- API: `src/app/api/admin/settings/route.ts` `CommunicationSchema` は `smtpSettings.user`（`secure` なし）
- DB: `clinic_settings.settings` に JSONB 保存
- `smtpSettings.password` が平文保存されうる

### 1-6. Supabaseローカル設定

- `supabase/config.toml`
  - `[auth.email] enable_confirmations = false`（ローカル既定）
  - `[auth.email.smtp]` 未有効
  - `[inbucket] enabled = true`

## 2. リリース優先度

### P0（リリースブロッカー）

- P0-1: `onboarding/invites` のタイムアウト + E2Eスキップ + 契約統一
- P0-2: `onboarding/invites` の `authError.message` 素通し廃止（非列挙化）
- P0-3: `admin/actions.ts#signup` の廃止または非列挙へ完全整合

### P1（本番前に対処）

- P1-1: `username/user` と `secure` のスキーマ不整合解消
- P1-2: `smtpSettings.password` 平文保存禁止 + 既存データクレンジング
- P1-3: `callback/route.ts` の origin 依存を `NEXT_PUBLIC_APP_URL` 基準に是正

### P2（早期に対処）

- P2-1: `src/app/invite/actions.ts` の列挙文言整合性見直し
- P2-2: 送信量見積りに将来の業務通知（テンプレート送信）を合算

## 3. 要件

### 3-1. 機能要件（FR）

- FR-01: `/register` は確認メール送信を開始できる。
- FR-02: `/register/verify` の再送が機能する。
- FR-03: `admin/staff/invites` と `onboarding/invites` は同一の失敗契約を持つ。
- FR-04: メールリンク生成とcallback遷移先は `NEXT_PUBLIC_APP_URL` を正とする。
- FR-05: staging/prod では Supabase Auth の confirmations を有効にする。

### 3-2. セキュリティ要件（SR）

- SR-01: クライアントに返すメール関連エラーは非列挙型（ユーザー存在を推測不可）。
- SR-02: 詳細エラー（provider message）はサーバログのみで保持する。
- SR-03: `smtpSettings.password` を平文永続化しない。
- SR-04: 秘密情報は `clinic_settings` ではなく環境変数/プロジェクト設定で管理する。

### 3-3. 信頼性要件（RR）

- RR-01: `onboarding/invites` は 1件送信あたり `10000ms` でタイムアウト。
- RR-02: タイムアウト時は `504` を返す。
- RR-03: 複数招待時の累積遅延を回避する（逐次のみ禁止、上限付き並列または全体タイムボックス）。
- RR-04: E2Eでは `E2E_INVITE_MODE=skip` を `onboarding/invites` にも適用可能にする。

### 3-4. 拡張性要件（XR）

- XR-01: 送信量増加時にプラン変更中心でスケールできる。
- XR-02: SMTP障害時に代替プロバイダへ運用切替できる。
- XR-03: Authメールと将来の業務通知メールを運用分離する。

## 4. API契約統一（必須）

対象:
- `src/app/api/admin/staff/invites/route.ts`
- `src/app/api/onboarding/invites/route.ts`

統一ルール:
- タイムアウト: `10000ms`
- タイムアウトHTTP: `504`
- E2E分岐: `E2E_INVITE_MODE=skip` かつ `NODE_ENV !== 'production'`
- クライアント向けエラー: 固定安全文言のみ
- ログ項目: `endpoint`, `method`, `userId`, `params.email`, `params.role`, `params.clinicId`
- 複数招待: 件数上限 + 上限付き並列（例: 2-3）で累積遅延を抑制

## 5. 実装計画（1 task = 1 PR）

### PR-EML-01（P0）: `onboarding/invites` 契約統一

- 変更対象:
  - `src/app/api/onboarding/invites/route.ts`
  - `docs/test-runbook.md`
- 実装:
  - `Promise.race` タイムアウト導入（10000ms / 504）
  - `E2E_INVITE_MODE=skip` 対応（production無効化）
  - `authError.message` 素通し廃止、非列挙文言化
  - 複数招待処理を逐次から改善（累積遅延抑制）
- DoD:
  - DOD-06, DOD-11

### PR-EML-02（P0）: 旧 `admin/actions.ts#signup` の整理

- 変更対象:
  - `src/app/admin/actions.ts`
  - 呼び出し元（`rg -n "signup\\("` で特定）
- 実装:
  - 未使用なら削除、使用中なら `registerOwner()` と同一の非列挙契約へ変更
  - 監査ログを `registerOwner()` 方針に整合
- DoD:
  - DOD-10, DOD-11

### PR-EML-03（P1）: SMTP設定整合 + 秘密情報対策

- 変更対象:
  - `src/components/admin/communication-settings.tsx`
  - `src/app/api/admin/settings/route.ts`
  - `src/types/settings.ts`
  - `src/__tests__/api/admin-settings.test.ts`
- 実装:
  - `username` を正式キーに統一
  - `secure` をスキーマ/デフォルト/型に追加
  - 互換読み取り: 旧 `user` を `username` に吸収
  - 互換書き込み: 1リリースのみ `user` 併記を許容、その後削除
  - `smtpSettings.password` は保存禁止（受領しても破棄またはマスク）
- 既存データクレンジング:
  - マイグレーションなしで運用手順化（管理API再保存 or 運用SQL手順）
  - 既存 `settings->smtpSettings->password` を削除/空化する手順をRunbook記載
- DoD:
  - DOD-09, DOD-10, DOD-11

### PR-EML-04（P1）: callback URL基準の是正

- 変更対象:
  - `src/app/admin/callback/route.ts`
  - 必要なら `src/lib/env.ts`
- 実装:
  - リダイレクトベースURLを `NEXT_PUBLIC_APP_URL` 基準へ変更
  - `request.url origin` はフォールバック扱いまたは検証用途のみ
- DoD:
  - DOD-06, DOD-10

### PR-EML-05（P2）: 招待受諾フローの列挙整合レビュー

- 変更対象:
  - `src/app/invite/actions.ts`
- 実装:
  - `signupAndAcceptInvite()` のエラーメッセージを脅威モデルに沿って見直し
  - 必要なら非列挙化、または許容理由を明文化
- DoD:
  - DOD-10, DOD-11

### PR-EML-06（P2）: Resend運用拡張

- 変更対象:
  - `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`
  - `docs/operations/RUNBOOK.md`
  - `docs/test-runbook.md`
- 実装:
  - confirmations有効化チェック
  - SPF/DKIM/DMARC確認
  - bounce/complaint監視と閾値対応
  - 障害時の代替SMTP切替手順
- DoD:
  - DOD-01, DOD-06, DOD-10

## 6. 受け入れ基準（AC）

- AC-01: `onboarding/invites` は遅延時に `10000ms` で `504` を返す。
- AC-02: `onboarding/invites` で provider生メッセージをクライアント返却しない。
- AC-03: `admin/actions.ts#signup` は非列挙契約と整合する（削除または修正）。
- AC-04: `communication.smtpSettings` の `username`/`secure` が保存・復元で破綻しない。
- AC-05: `smtpSettings.password` がDBへ平文保存されない。
- AC-06: callback が `NEXT_PUBLIC_APP_URL` 基準で安全に遷移する。
- AC-07: staging/prod で confirmations有効化 + 実メール到達を確認できる。
- AC-08: E2Eでメール依存ハングが再発しない。

## 7. 検証手順

- E2E（招待）:
  - `npm run test:e2e:pw -- --grep "Staff invites"`
- ENV整合:
  - `NEXT_PUBLIC_APP_URL`
  - `supabase/config.toml` `auth.site_url`
  - `playwright.config.ts` `baseURL`
- ローカルメール:
  - `supabase start`
  - Inbucket `http://127.0.0.1:54334`
- 非列挙確認:
  - 既存/未登録メールで同一外部文言になることをAPIテストで確認

## 8. 送信量見積り（Auth + 将来業務通知）

- 月間送信通数（概算）:
  - `登録確認` + `再送` + `招待`
  - `予約確認/リマインド/キャンセル通知（将来）` を必ず合算
- 最低限の見積り式:
  - `total = auth_flows + notification_flows`
- 運用:
  - 月次で実績通数を記録し、プラン閾値の手前で見直し

## 9. ロールバック

- RB-01: `onboarding/invites` の新タイムアウト/分岐を戻す（必要時）
- RB-02: callback URL変更を元へ戻す
- RB-03: SMTP整合変更を互換モードへ戻す
- 注記: 本仕様はDBマイグレーションを含まないためDBロールバック不要

## 10. 参照（対象ファイル）

- `supabase/config.toml`
- `src/app/register/actions.ts`
- `src/app/api/admin/staff/invites/route.ts`
- `src/app/api/onboarding/invites/route.ts`
- `src/app/admin/actions.ts`
- `src/app/invite/actions.ts`
- `src/app/admin/callback/route.ts`
- `src/components/admin/communication-settings.tsx`
- `src/app/api/admin/settings/route.ts`
- `src/types/settings.ts`
- `supabase/migrations/20251231000100_clinic_settings_table.sql`
- `playwright.config.ts`
- `docs/stabilization/DoD-v0.1.md`

## 11. 変更履歴

- v0.3 (2026-02-22):
  - Claude Codeレビュー指摘を反映
  - P0/P1/P2で実装順を再定義
  - `onboarding/invites` の契約統一要件を明文化
  - 旧 `admin/actions.ts#signup` 対応PRを追加
  - SMTP `secure` と既存passwordクレンジング手順を追加
  - callback origin依存修正タスクを追加

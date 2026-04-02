# Env Preflight Checklist v0.1

目的:
- Supabase / Vercel / Sentry の実値投入前に、環境変数の抜け漏れを止める
- 値の正しさではなく、キーの網羅性と環境ごとの整合だけを確認する

参照:
- `docs/specs/pilot-release-spec-v0.1.md`
- `docs/operations/deployment-checklist-supabase-vercel-v0.1.md`

## 1. 共通必須キー

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_APP_VERSION`
- `NEXT_PUBLIC_BUILD_DATE`
- `NEXT_PUBLIC_DEFAULT_CLINIC_ID`
- `NEXT_PUBLIC_DEFAULT_TIMEZONE`
- `NEXT_PUBLIC_CLINIC_GROUP_NAME`
- `ENCRYPTION_KEY`
- `JWT_SECRET`
- `CSP_ROLLOUT_PHASE`
- `NEXT_PUBLIC_ENABLE_CHAT`
- `NEXT_PUBLIC_ENABLE_AI_INSIGHTS`
- `NEXT_PUBLIC_ENABLE_ADMIN_FEATURES`
- `NEXT_PUBLIC_PILOT_MODE`
- `NEXT_PUBLIC_MAX_CLINICS`

## 2. インフラ必須キー

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_DSN`

## 3. 環境別の期待値

- `development`
  `NEXT_PUBLIC_APP_ENV=development`
  `NEXT_PUBLIC_PILOT_MODE=false`
  `CSP_ROLLOUT_PHASE=report-only`
- `staging`
  `NEXT_PUBLIC_APP_ENV=staging`
  `NEXT_PUBLIC_PILOT_MODE=true`
  `NEXT_PUBLIC_ENABLE_CHAT=false`
  `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false`
  `NEXT_PUBLIC_MAX_CLINICS=3`
- `production`
  `NEXT_PUBLIC_APP_ENV=production`
  `NEXT_PUBLIC_PILOT_MODE=true`
  `CSP_ROLLOUT_PHASE=full-enforce`
  `NEXT_PUBLIC_ENABLE_CHAT=false`
  `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false`
  `NEXT_PUBLIC_MAX_CLINICS=3`

## 4. 禁止または整理対象

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

注記:
- このプロジェクトは Supabase Auth 前提なので、上記 `NEXTAUTH_*` は source of truth に含めない
- 既存ファイルに残っていても、実値投入前に削除または無視方針を明文化する

## 5. 実値投入前の最終確認

- `SENTRY_DSN` が staging / production で空欄ではない
- `SUPABASE_SERVICE_ROLE_KEY` が client 側公開変数に混ざっていない
- `NEXT_PUBLIC_APP_URL` が Vercel の配備 URL と一致している
- `NEXT_PUBLIC_DEFAULT_CLINIC_ID` が対象環境の実在 clinic を指している
- `CSP_ROLLOUT_PHASE` が environment ごとの期待値に一致している
- `NEXT_PUBLIC_ENABLE_AI_INSIGHTS` と `NEXT_PUBLIC_ENABLE_CHAT` が pilot 方針に一致している

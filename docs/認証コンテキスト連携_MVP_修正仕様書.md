# 認証コンテキスト連携 MVP 修正仕様書（Phase 1）

## 目的
- 実装済みの Phase 1 を、TDD（E2E含む）観点で検証可能な状態に整える。
- E2Eフィクスチャの不整合とテスト未完了箇所を解消し、回帰の見逃しを防ぐ。

## 背景/課題
- clinic未割当ユーザーの認証情報がテスト/シード/仕様で不一致。
- MFA E2E の selector が実装に存在せず、検証が成立しない。
- createdBy 検証が try/catch により黙殺され、失敗が検知できない。
- 一部ユニットテストが未完了で、TDD前提の保証が欠落。

## 対象範囲
- `docs/E2E共通フィクスチャ仕様書.md`
- `scripts/e2e/fixtures.mjs`
- `src/__tests__/e2e-playwright/fixtures.ts`
- `src/__tests__/e2e-playwright/auth-context.spec.ts`
- `src/components/mfa/MFADashboard.tsx`
- `src/app/admin/(protected)/mfa-setup/page.tsx`
- `src/__tests__/pages/blocks.test.tsx`
- `src/__tests__/pages/mfa-setup.test.tsx`

## 非対象
- 認証フロー自体（サインイン/サインアップ）
- RLSポリシー・DBスキーマの変更
- Phase 2 以降の機能追加

## 仕様詳細

### 1) E2Eフィクスチャ統一（clinic未割当ユーザー）
**方針**
- 仕様書・シード・テストで同一の認証情報を使用する。

**固定値（確定）**
- `NO_CLINIC_EMAIL`: `e2e-no-clinic@clinic.local`
- `NO_CLINIC_PASSWORD`: `NoClinic#12345`
- `USER_NO_CLINIC_ID`: `00000000-0000-0000-0000-00000000ffff`（既存維持）

**変更要件**
- `docs/E2E共通フィクスチャ仕様書.md` に上記2つの認証情報を追記する。
- `scripts/e2e/fixtures.mjs` の該当ユーザーの email/password を上記に統一する。
- `src/__tests__/e2e-playwright/fixtures.ts` は上記を正として維持/更新する。

**受け入れ基準**
- `loginAsNoClinicUser` が E2E で成功し、`/chat` と `/blocks` の clinic未割当シナリオが実行できる。

### 2) MFA E2E セレクタ整備
**方針**
- E2Eで必要な最小限の `data-testid` を実装側に用意する。

**変更要件**
- `src/components/mfa/MFADashboard.tsx` に `data-testid="mfa-dashboard"` を付与できるようにする。
- `mfa-user-id` / `mfa-clinic-id` を取得できる要素を追加する（可視/不可視は任意だが `data-testid` 必須）。
  - 例: 画面に影響しない `sr-only` な `span` を追加。
- `src/app/admin/(protected)/mfa-setup/page.tsx` からの `data-testid` 付与が TS 上も成立するよう props を拡張する。

**受け入れ基準**
- `src/__tests__/e2e-playwright/auth-context.spec.ts` の MFA シナリオが selector で安定して通る。

### 3) createdBy E2E 検証の確実化
**方針**
- 実際に発生するリクエストに対して必ず検証し、失敗を黙殺しない。

**変更要件**
- `src/__tests__/e2e-playwright/auth-context.spec.ts` の createdBy 検証は try/catch で握りつぶさない。
- リクエスト監視は以下のいずれかに統一する（どちらか一つに決定）:
  - A. Supabase REST への `POST /rest/v1/blocks` を監視
  - B. `/api/blocks` を実装して監視（実装が無い場合はAを採用）
- 検証値は `USER_ADMIN_ID` と一致することを明示的に検証する（truthyのみは不可）。

**受け入れ基準**
- createdBy の検証が必ず実行され、失敗時にテストが落ちる。

### 4) ユニットテストの未完了箇所を完了
**方針**
- TODO を撤廃し、仕様書の受け入れ基準を検証できる状態にする。

**変更要件**
- `src/__tests__/pages/blocks.test.tsx` の createdBy 関連テストを完了させる。
  - 必須入力を埋め、`mockCreateBlock` の payload を検証する。
  - `createdBy !== 'current-user-id'` も明示的に検証する。
- `src/__tests__/pages/mfa-setup.test.tsx` の staff ロールケースを明確に検証する。
  - `mockPush('/unauthorized')` を確認し、`mfa-dashboard` が表示されないことを検証する。

**受け入れ基準**
- 追加したアサーションが全て有効で、テストが仕様を保証する。

## テスト戦略（TDD / E2E）
- 仕様変更に合わせて先にテストを更新し、fail を確認してから実装を修正する。
- E2Eは `Playwright_E2E手引書.md` に従い、fixtures/seed を必ず整合させる。

## 受け入れ基準（全体）
- E2E: `auth-context.spec.ts` が必ず createdBy と MFA を検証できる。
- E2E: clinic未割当ログインが成功し、案内表示まで到達できる。
- Unit: TODO/未完アサーションが残っていない。

## 変更対象ファイル（一覧）
- `docs/E2E共通フィクスチャ仕様書.md`
- `scripts/e2e/fixtures.mjs`
- `src/__tests__/e2e-playwright/fixtures.ts`
- `src/__tests__/e2e-playwright/auth-context.spec.ts`
- `src/components/mfa/MFADashboard.tsx`
- `src/app/admin/(protected)/mfa-setup/page.tsx`
- `src/__tests__/pages/blocks.test.tsx`
- `src/__tests__/pages/mfa-setup.test.tsx`

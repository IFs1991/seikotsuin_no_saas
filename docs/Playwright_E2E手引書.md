# Playwright_E2E手引書

## 目的
- E2EをPlaywrightで統一し、UI・API・認証の動作を安定的に検証する。

## 前提
- `docs/E2E共通フィクスチャ仕様書.md` を前提にシードする。
- E2Eは専用の `clinic_id` / `user_id` を使う。

## 依存追加（提案）
- `@playwright/test` をdevDependenciesに追加
- `npx playwright install` でブラウザを準備

## 推奨ディレクトリ構成
- `playwright.config.ts`
- `src/__tests__/e2e-playwright/`（新規）
  - `auth.spec.ts`
  - `chat.spec.ts`
  - `dashboard.spec.ts`
  - `patients.spec.ts`
  - `security.spec.ts`

## Playwright設定（指針）
- `baseURL`: `http://localhost:3000`
- `storageState`: `storage/admin.json` などロール別に分離
- `testDir`: `src/__tests__/e2e-playwright`
- `retries`: 1〜2
- `trace`: `on-first-retry`

## 認証戦略
1. 最初のテストでログイン → `storageState` を保存
2. 以降のテストは `storageState` を再利用
3. ロール別にstateを分ける（admin/manager/staff）

## シード戦略
- `globalSetup` で `scripts/e2e/seed-e2e-data.mjs` を実行
- `globalTeardown` で `scripts/e2e/cleanup-e2e-data.mjs` を実行
- ローカルSupabaseの場合は `npm run e2e:seed` でも可

## 実行コマンド例
- `npm run test:e2e:pw`
- `npm run test:e2e:pw -- --project=chromium`
- `npm run test:e2e:pw:ui`

## 安定化のガイド
- UIの待機は `expect(locator).toBeVisible()` を基本にする
- APIの完了待ちは `page.waitForResponse` を使う
- 時刻依存のテストは固定日付/モックを使用

## 失敗時の切り分け
- 403/401 → 権限・認証stateが誤り
- 空表示 → シード不足
- タイムアウト → UI待機不足 or API遅延

## 参照
- `docs/E2E共通フィクスチャ仕様書.md`
- 各MVP仕様書の「E2Eテスト仕様」

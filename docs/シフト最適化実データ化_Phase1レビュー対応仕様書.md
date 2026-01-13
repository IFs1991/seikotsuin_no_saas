# シフト最適化実データ化_Phase1レビュー対応仕様書

## 目的
- Phase1の実装が画面/テストで実利用可能になるように統合・整合を取る。
- TDD(E2E)手引書に準拠し、Playwrightで「実データ表示」を保証する。

## 背景/課題（レビュー指摘）
- `shift-optimizer` が `/staff` 画面にマウントされておらず、実装がユーザーに届かない。
- E2Eが「ダミーが出ない」のみで、実データ表示を検証できていない。
- 「データなし」シナリオが実際には成立していない（DB/seedを削除せずに実行）。
- APIテストがルートハンドラを実行せず、回帰検知ができない。
- 日付・時間帯の計算がUTC/ローカル混在でズレる可能性がある。

---

## 対象範囲
- UI統合
  - `src/app/staff/page.tsx`
  - `src/components/staff/shift-optimizer.tsx`
- APIの実データ集計/日時処理
  - `src/app/api/staff/demand-forecast/route.ts`
- テスト（TDD/E2E）
  - `src/__tests__/e2e-playwright/shift-optimizer.spec.ts`
  - `playwright.config.ts`
  - `src/__tests__/api/staff-shifts.test.ts`
  - `src/__tests__/e2e-playwright/global-setup.ts`（必要な場合）
  - `scripts/e2e/seed-e2e-data.mjs`（必要な場合）

## 非対象（Phase2以降）
- シフト作成/編集/承認ワークフロー
- 需要予測の高度化
- 通知機能

---

## 実装方針

### 1) UI統合（Phase1の実表示）
- `/staff` 画面に **新タブ「シフト最適化」** を追加し `ShiftOptimizer` を表示する。
- `clinicId` は `useUserProfileContext()` から取得し、`ShiftOptimizer` に渡す。
- 既存の「シフト分析」タブは維持する（Phase1で削除しない）。

**受け入れ条件**
- `/staff` → 「シフト最適化」タブで実データが表示される。
- APIエラー時は `ShiftOptimizer` のエラー表示が出る。

### 2) 日付/時間帯の一貫性（JST）
- 需要予測APIとUIで **同一タイムゾーン（Asia/Tokyo）** を前提に集計/表示する。
- `toISOString()` 由来のUTC日付キーは使用しない。
- 例: `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' })` で日付キー/時間帯を生成。

**受け入れ条件**
- JST環境で「表示日」と「需要予測の集計日」が一致する。
- 需要予測の時間帯表示が予約のローカル時間と一致する。

### 3) テスト（TDD/E2E準拠）
**手引書:** `docs/Playwright_E2E手引書.md` / `docs/E2E共通フィクスチャ仕様書.md`

#### 3-1. E2E（Playwright）
- `storageState` を利用してログインを最小化する。
- テストは **実データが表示されること** を明示的に検証する。
- 「データなし」シナリオは `page.route` でAPIを空レスポンスに差し替える（DB削除はしない）。

**追加/更新シナリオ**
1. **実データ表示**
   - `/staff` → 「シフト最適化」タブ
   - `E2E Staff 1`/`E2E Staff 2` が表示される
   - ダミー名（山田太郎等）が出ない
2. **空状態**
   - `page.route` で `/api/staff/shifts` `/api/staff/preferences` `/api/staff/demand-forecast` を空レスポンス化
   - 「シフトデータがありません」「需要予測データがありません」「スタッフ希望データがありません」を確認
3. **需要予測**
   - 予約シードに基づく `forecast` の日時/件数表示を確認

#### 3-2. APIテスト（Jest）
- `GET /api/staff/shifts` `GET /api/staff/preferences` `GET /api/staff/demand-forecast` の **ルートハンドラを実行** する。
- `ensureClinicAccess` をモックし、`supabase.from(...).select(...).eq(...)...` の戻りを制御。
- `clinic_id` が欠落した場合は 400 を検証。

---

## 実装タスク

### UI
- `src/app/staff/page.tsx`
  - タブに「シフト最適化」を追加
  - `useUserProfileContext()` を追加し `clinicId` を取得
  - `<ShiftOptimizer clinicId={clinicId} />` をマウント
- `src/components/staff/shift-optimizer.tsx`
  - 日付/時間帯キー生成の一貫化（JST）
  - 空値の表示は `''` または `—` に統一（NULは使わない）

### API
- `src/app/api/staff/demand-forecast/route.ts`
  - 予約の `start_time` をJST基準で日付/時間帯に集計
  - `forecast.date` はJST日付キー

### E2E
- `playwright.config.ts`
  - `storageState` の運用（global-setupで生成し、projectに設定）
- `src/__tests__/e2e-playwright/shift-optimizer.spec.ts`
  - 実データ表示のアサーション追加
  - 空状態を `page.route` で再現
  - 需要予測の表示を `forecast` 由来で検証

### APIテスト
- `src/__tests__/api/staff-shifts.test.ts`
  - ルートハンドラ実行型に書き換え
  - 400/401/403/500 の分岐を実際に検証

---

## 受け入れ基準
- `/staff` からシフト最適化UIが表示される。
- E2Eで「実データ表示」「空状態」「需要予測」の3シナリオが安定して通る。
- APIテストがルートハンドラを実行し、バリデーション/権限/整形の回帰を検知できる。

---

## 変更対象ファイル（予定）
- `src/app/staff/page.tsx`
- `src/components/staff/shift-optimizer.tsx`
- `src/app/api/staff/demand-forecast/route.ts`
- `playwright.config.ts`
- `src/__tests__/e2e-playwright/shift-optimizer.spec.ts`
- `src/__tests__/api/staff-shifts.test.ts`
- `src/__tests__/e2e-playwright/global-setup.ts`（必要時）
- `scripts/e2e/seed-e2e-data.mjs`（必要時）

---

## 関連ドキュメント
- `docs/シフト最適化実データ化_MVP仕様書.md`
- `docs/Playwright_E2E手引書.md`
- `docs/E2E共通フィクスチャ仕様書.md`

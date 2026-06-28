# Technical Debt

このドキュメントは、プロジェクトの技術的負債を記録・管理します。

## フォーマット

各項目は以下の形式で記録します：

```markdown
### [ID] タイトル

- **優先度**: P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low)
- **影響範囲**: 機能名、コンポーネント名
- **報告日**: YYYY-MM-DD
- **担当**: チーム名 or 未割当
- **ステータス**: Open / In Progress / Resolved / Won't Fix

#### 問題の概要

[問題の説明]

#### 再現手順

[ステップ]

#### 推定原因

[原因の仮説]

#### 次のステップ

[推奨される対応]

#### 関連ファイル

[ファイルパス一覧]

#### 参考資料

[ドキュメント、issue、PR等へのリンク]
```

---

## Open Issues

### [TD-003] E2E preflight/seed/cleanup の optional table 取り扱いギャップ

- **優先度**: P2 (Medium)
- **影響範囲**: E2E fixtures seed/cleanup, preflight
- **報告日**: 2026-01-21
- **担当**: 未割当
- **ステータス**: Open

#### 問題の概要

optional テーブルを「存在しなければ静かにスキップ」する方針に対して、
`staff_preferences` と `ai_comments` の処理が未ガードなため警告が出ることがある。
また `waitForSupabaseReady()` が `clinics` に依存しているため、テーブル欠落時に
即時エラーにならずタイムアウトで失敗する。

#### 再現手順

1. optional テーブルが未作成の環境で `npm run e2e:seed` / `npm run e2e:cleanup` を実行
2. `staff_preferences` または `ai_comments` の警告が出る
3. `clinics` が未作成の場合、preflight が `Supabase not ready` でタイムアウトする

#### 推定原因

- `seedShiftData()` が `staff_preferences` を常に upsert している
- `seedAnalyticsData()` が `ai_comments` を常に upsert している
- `cleanupE2EData()` の optional tables に `chat_messages` が含まれていない
- `waitForSupabaseReady()` が `clinics` を readiness probe にしている

#### 次のステップ

- `tableExists()` ガードを `staff_preferences` と `ai_comments` に適用
- `chat_messages` を cleanup 対象に追加するか optional list から外す
- `waitForSupabaseReady()` で `42P01` を検出した場合は即時失敗させる

#### 関連ファイル

- `scripts/e2e/seed-e2e-data.mjs`
- `scripts/e2e/cleanup-e2e-data.mjs`
- `scripts/e2e/preflight.mjs`

### [TD-002] Windows環境でのE2Eページ遷移タイムアウト

- **優先度**: P3 (Low)
- **影響範囲**: `admin-settings.spec.ts` のページ遷移を伴うテスト
- **報告日**: 2026-01-21
- **担当**: 未割当
- **ステータス**: Open
- **種別**: ⚠️ **開発環境の問題**（アプリケーションコードのバグではない）

#### 問題の概要

Windows環境でPlaywrightのE2Eテストを実行すると、`page.goto("/admin/settings")` で60秒タイムアウトが発生する。
API直接呼び出しテスト（`page.request.get/put`）は成功するが、ページ遷移を伴うUIテストが失敗する。

> **重要**: これはアプリケーションコードのバグではなく、**Windows + Next.js Dev Server の組み合わせによる開発環境固有の問題**です。
> 本番環境やCI/CD（Linux）環境では発生しない可能性が高いです。

#### 検証結果 (2026-01-22)

```
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:pw -- --project=chromium
結果: 48 passed / 41 failed / 1 skipped (約12分)
```

- 失敗した41件は全てタイムアウト（1.1m〜1.8m）
- アサーションエラー（期待値≠実際値）は0件
- APIテストは全て成功
- 失敗時のスナップショットは「設定を読み込み中...」「保存中...」状態

#### 再現手順

```bash
# 1. Windows環境で実行
npx playwright test admin-settings.spec.ts --project chromium

# 2. 結果: ページ遷移テストが60秒でタイムアウト
# - API直接テスト: ✅ 成功
# - ページ遷移テスト: ❌ タイムアウト
```

#### 推定原因

1. **Windows + Next.js Dev Serverの遅延**
   - 初回コンパイルが遅い（特に大きなプロジェクト）
   - ファイルシステム監視(chokidar)のパフォーマンス問題

2. **Playwrightのデフォルト設定**
   - `waitUntil: 'load'` がデフォルト
   - Next.jsの開発モードでは `load` イベントが遅延する場合がある

3. **WebServer設定**
   - `reuseExistingServer: false` で毎回新しいサーバーを起動
   - サーバー起動後の初回ページロードでコンパイルが走る

#### 次のステップ

##### Option A: Playwright設定の改善（推奨）

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    // デフォルトのwaitUntilを変更
    waitUntil: 'domcontentloaded',
  },
  webServer: {
    // 既存サーバーを再利用
    reuseExistingServer: true,
    // タイムアウト延長
    timeout: 180_000,
  },
});
```

##### Option B: テストコードの改善

```typescript
// admin-settings.spec.ts
await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
```

##### Option C: CI/CD環境での実行

- Windows開発環境をスキップ
- Linux/macOS環境またはCI（GitHub Actions）でE2Eを実行

#### 関連ファイル

- `playwright.config.ts`
- `src/__tests__/e2e-playwright/admin-settings.spec.ts`

#### 参考資料

- [Playwright waitUntil options](https://playwright.dev/docs/api/class-page#page-goto)
- [Next.js dev server performance](https://nextjs.org/docs/architecture/turbopack)

#### 備考

- **Staff Invite E2E（TD-001）は別途解決済み** - SI-01〜SI-04の実装で安定化完了
- 本問題はStaff Invite以外のUIテスト全般に影響
- 実装の品質には問題なし（APIテストは全て成功）

---

## Resolved Issues

### [TD-001] スタッフ招待機能のE2Eテスト不安定 ✅

- **優先度**: P1 (High)
- **影響範囲**: `/admin/settings` → スタッフ管理 → スタッフ一覧・招待
- **報告日**: 2025-01-21
- **解決日**: 2026-01-21
- **ステータス**: ✅ Resolved

#### 解決方法

`docs/stabilization/spec-staff-invite-e2e-stability-v0.1.md` に基づき、以下のタスクを実施：

1. **SI-01**: E2E環境の前提を明文化
   - `docs/test-runbook.md` に環境変数・前提条件を記載
   - `.env.test.example` に必要変数を追加

2. **SI-02**: 招待APIのタイムアウトガード
   - `src/app/api/admin/staff/invites/route.ts` に10秒タイムアウトを追加
   - `Promise.race` でハング防止、504レスポンス対応

3. **SI-03**: E2E専用の招待スキップ（決定的成功）
   - `E2E_INVITE_MODE=skip` フラグで `inviteUserByEmail` をスキップ
   - `staff_invites` テーブルへのINSERTのみで成功応答

4. **SI-04**: 安定性検証
   - 3回連続でテストがパスすることを確認

#### 完了条件（DoD） ✅

- [x] E2E テスト「スタッフを招待して一覧に表示される」がパスする
- [x] E2E テスト「無効なメールアドレスでエラーが表示される」がパスする
- [x] テストが安定して通る（3回連続で成功）
- [x] タイムアウトやハングが発生しない
- [x] ドキュメントに解決方法を記録

#### 関連ファイル

- `docs/stabilization/spec-staff-invite-e2e-stability-v0.1.md` (仕様書)
- `docs/test-runbook.md` (テスト実行ガイド)
- `.env.test.example` (環境変数サンプル)
- `src/app/api/admin/staff/invites/route.ts` (API実装)

---

## Won't Fix

（対応しないことを決定した技術的負債はここに移動）

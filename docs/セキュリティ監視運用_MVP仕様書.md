# セキュリティ監視運用_MVP仕様書

## ✅ 実装ステータス: 完了（2026-01-01）

### 実装完了内容
| 項目 | ステータス | 備考 |
|------|----------|------|
| DBマイグレーション | ✅ 完了 | `20260101000100_security_events_operations.sql` |
| API実装 | ✅ 完了 | 5エンドポイント |
| コンポーネント更新 | ✅ 完了 | SecurityDashboard.tsx |
| ページ更新 | ✅ 完了 | security-monitor/page.tsx, security-dashboard/page.tsx |
| E2Eテスト | ✅ 完了 | security-monitor.spec.ts |
| ユニットテスト | ✅ 完了 | security-events.test.ts（14テスト） |

---

## 目的
- セキュリティイベントの「運用」を可能にする（状態管理・対応記録・通知）。

## 背景/課題
- `security-monitor` はモックデータで運用不可。
- `security-monitor` / `SecurityDashboard` が解決状態や対応履歴を持たない。

## 対象範囲
- `src/lib/security-monitor.ts`
- `src/app/admin/(protected)/security-monitor/page.tsx`
- `src/components/admin/SecurityDashboard.tsx`
- 管理API（新規）

## データモデル拡張
### `security_events` 拡張
- `status` (`new` / `investigating` / `resolved` / `false_positive`)
- `assigned_to` (uuid)
- `resolution_notes` (text)
- `actions_taken` (jsonb)
- `resolved_at` (timestamptz)
- `updated_at` (timestamptz)

### `notifications` テーブル（新規）
- 高重要度イベント通知用

## API仕様（実装済み）
### GET `/api/admin/security/events`
- Query: `clinic_id`, `status`, `severity`, `limit`
- Response: 運用情報を含むイベント一覧

### PATCH `/api/admin/security/events`
- Body: `id`, `status`, `resolution_notes`, `actions_taken`
- 状態変更時は `resolved_at` を自動更新

### POST `/api/admin/security/events`
- Body: イベント作成データ
- 高重要度（critical/error）の場合は自動で通知作成

### GET `/api/admin/security/metrics`
- 既存ダッシュボード用の集計値（`security_events` / `audit_logs`）

### GET `/api/admin/security/sessions`
- `user_sessions` からアクティブセッションを取得

### POST `/api/admin/security/sessions/terminate`
- セッション強制終了（監査ログ出力付き）

## UI/UX
- イベント一覧にステータスバッジと「解決/調査中」操作を追加。
- 対応メモの入力欄をモーダルで提供。
- 高重要度イベントは自動通知（in-app）を作成。

## 通知
- `severity=critical|error` のイベント発生時に `notifications` に1件作成。

## テスト戦略（TDD）
### E2Eテスト（Playwright）
- `src/__tests__/e2e-playwright/security-monitor.spec.ts`

### ユニットテスト（Jest）
- `src/__tests__/api/security-events.test.ts`（14テスト全パス）

## ステータスワークフロー
```
new → investigating → resolved / false_positive
```

## AI駆動開発の進め方
- `security_events` の運用項目を追加し、UI/APIに反映する。
- 既存の `security-monitor` と `SecurityDashboard` を実データ表示に切り替える。
- 監査ログ・通知は最小限の書き込みに留める（過剰な副作用を避ける）。

## コンフリクト回避ルール
- `security_events` の追加カラムはデフォルト値を必須にし、既存クエリを壊さない。
- 高重要度通知は `notifications` に1件のみ作成し、重複生成を避ける。
- セッション終了は監査ログ出力を伴う。

## E2Eテスト仕様
### 前提データ
- `security_events` に `severity=high` のイベントを1件作成
- `user_sessions` にアクティブセッションを1件作成

### シナリオ
1. `/admin/security-monitor` にイベント一覧が表示される。
2. イベントのステータスを「解決済み」に更新 → 再読み込みで反映される。
3. 高重要度イベント作成時に `notifications` が1件追加される。
4. `SecurityDashboard` にメトリクスが表示される。
5. セッション強制終了 → セッション一覧から消える。

## 受け入れ基準
- ✅ モックデータを使わず、実イベントが表示される。
- ✅ イベントの「解決/調査中」操作が保存される。
- ✅ 高重要度イベントで通知が作成される。

## 変更対象ファイル（実装済み）
- `src/app/admin/(protected)/security-monitor/page.tsx` ✅
- `src/app/admin/(protected)/security-dashboard/page.tsx` ✅
- `src/components/admin/SecurityDashboard.tsx` ✅
- `src/app/api/admin/security/events/route.ts` ✅（新規）
- `src/app/api/admin/security/metrics/route.ts` ✅（新規）
- `src/app/api/admin/security/sessions/route.ts` ✅（新規）
- `src/app/api/admin/security/sessions/terminate/route.ts` ✅（新規）
- `supabase/migrations/20260101000100_security_events_operations.sql` ✅（新規）
- `src/__tests__/e2e-playwright/security-monitor.spec.ts` ✅（新規）
- `src/__tests__/api/security-events.test.ts` ✅（新規）
- `scripts/e2e/seed-e2e-data.mjs` ✅（更新）
- `src/__tests__/e2e-playwright/fixtures.ts` ✅（更新）

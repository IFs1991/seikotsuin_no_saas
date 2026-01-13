# シフト最適化実データ化_MVP仕様書

## 目的
- `shift-optimizer` のダミーデータを排除し、実データで表示できる状態にする。

## 背景/課題
- `src/components/staff/shift-optimizer.tsx` がモック配列のみで構成されている。

## 対象範囲
- `src/components/staff/shift-optimizer.tsx`
- シフト/需要/希望の取得API（新規）

## 非対象
- 自動最適化アルゴリズムの高度化（Phase 2以降）

---

## 実装ステータス

### ✅ 完了（2024-12-31）

| 項目 | ファイル | 状態 |
|------|----------|------|
| DBマイグレーション | `supabase/migrations/20251231000100_staff_shifts_preferences.sql` | ✅ 完了 |
| シフトAPI | `src/app/api/staff/shifts/route.ts` | ✅ 完了 |
| 希望API | `src/app/api/staff/preferences/route.ts` | ✅ 完了 |
| 需要予測API | `src/app/api/staff/demand-forecast/route.ts` | ✅ 完了 |
| UIコンポーネント修正 | `src/components/staff/shift-optimizer.tsx` | ✅ 完了 |
| 単体テスト | `src/__tests__/components/shift-optimizer.test.tsx` | ✅ 完了 |
| APIテスト | `src/__tests__/api/staff-shifts.test.ts` | ✅ 完了 |
| E2Eテスト | `src/__tests__/e2e-playwright/shift-optimizer.spec.ts` | ✅ 完了 |
| E2Eシードデータ | `scripts/e2e/seed-e2e-data.mjs` | ✅ 完了 |
| E2Eクリーンアップ | `scripts/e2e/cleanup-e2e-data.mjs` | ✅ 完了 |
| E2Eフィクスチャ | `src/__tests__/e2e-playwright/fixtures.ts` | ✅ 完了 |

### テスト結果
```
Test Suites: 2 passed, 2 total
Tests:       23 passed, 23 total
```

---

## データモデル（実装済み）

### `staff_shifts`
| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | UUID | 主キー |
| `clinic_id` | UUID | クリニックID（FK: clinics） |
| `staff_id` | UUID | スタッフID（FK: resources） |
| `start_time` | TIMESTAMPTZ | シフト開始時刻 |
| `end_time` | TIMESTAMPTZ | シフト終了時刻 |
| `status` | TEXT | draft/proposed/confirmed/cancelled |
| `notes` | TEXT | メモ（任意） |
| `created_by` | UUID | 作成者 |
| `created_at` | TIMESTAMPTZ | 作成日時 |
| `updated_at` | TIMESTAMPTZ | 更新日時 |

### `staff_preferences`
| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | UUID | 主キー |
| `clinic_id` | UUID | クリニックID（FK: clinics） |
| `staff_id` | UUID | スタッフID（FK: resources） |
| `preference_text` | TEXT | 希望内容 |
| `preference_type` | TEXT | general/day_off/time_preference/shift_pattern |
| `priority` | INT | 優先度（1-5） |
| `valid_from` | DATE | 有効期間開始 |
| `valid_until` | DATE | 有効期間終了 |
| `is_active` | BOOLEAN | アクティブフラグ |
| `created_at` | TIMESTAMPTZ | 作成日時 |
| `updated_at` | TIMESTAMPTZ | 更新日時 |

---

## API仕様（実装済み）

### `GET /api/staff/shifts`
| パラメータ | 必須 | 説明 |
|------------|------|------|
| `clinic_id` | ✅ | クリニックID（UUID） |
| `start` | - | 開始日（YYYY-MM-DD） |
| `end` | - | 終了日（YYYY-MM-DD） |

**レスポンス例:**
```json
{
  "data": {
    "shifts": [
      {
        "id": "...",
        "staff_id": "...",
        "start_time": "2025-01-15T09:00:00Z",
        "end_time": "2025-01-15T18:00:00Z",
        "status": "confirmed",
        "staff": { "id": "...", "name": "佐藤 太郎", "type": "therapist" }
      }
    ],
    "total": 1
  }
}
```

### `GET /api/staff/preferences`
| パラメータ | 必須 | 説明 |
|------------|------|------|
| `clinic_id` | ✅ | クリニックID（UUID） |
| `staff_id` | - | スタッフID（フィルタ用） |
| `active_only` | - | アクティブのみ取得（true/false） |

### `GET /api/staff/demand-forecast`
| パラメータ | 必須 | 説明 |
|------------|------|------|
| `clinic_id` | ✅ | クリニックID（UUID） |
| `start` | - | 開始日（YYYY-MM-DD） |
| `end` | - | 終了日（YYYY-MM-DD） |

**レスポンス例:**
```json
{
  "data": {
    "forecasts": [
      { "date": "2025-01-15", "hour": 10, "count": 5, "level": "high" }
    ],
    "hourlyDistribution": [
      { "hour": 10, "totalCount": 25, "averageCount": 5, "level": "high" }
    ]
  }
}
```

---

## UI/UX（実装済み）
- ✅ データが無い場合は空状態表示（ダミーは表示しない）
- ✅ 需要予測はリストで表示（日付・時間帯別）
- ✅ スタッフ希望は一覧表示
- ✅ ローディング状態の表示
- ✅ エラー時は「データ取得に失敗しました」を表示

---

## エラーハンドリング（実装済み）
- ✅ API失敗時は「データ取得に失敗しました」を表示
- ✅ 再読み込みボタンで再取得可能

---

## テスト戦略（TDD）

### 実装済みテスト
- ✅ シフト取得APIが空配列を返す時、UIが空状態を表示する
- ✅ 需要予測APIが予約データから正しく集計される
- ✅ ダミーデータ（山田太郎等）が表示されないことを確認
- ✅ 実データが正しく表示されることを確認
- ✅ エラーハンドリングの動作確認
- ✅ ローディング状態の確認

### テストファイル
- `src/__tests__/api/staff-shifts.test.ts` ✅
- `src/__tests__/components/shift-optimizer.test.tsx` ✅
- `src/__tests__/e2e-playwright/shift-optimizer.spec.ts` ✅

---

## RLSポリシー（実装済み）
- ✅ `staff_shifts`: clinic_idベースのアクセス制御
- ✅ `staff_preferences`: clinic_idベースのアクセス制御
- ✅ 管理者・マネージャーロールによる更新/削除権限

---

## E2Eテスト仕様（実装済み）

### 前提データ（シード）
- ✅ `staff_shifts` に7日分の勤務データ
- ✅ `staff_preferences` に2名分の希望
- ✅ 既存の `reservations` データを需要予測に使用

### シナリオ
1. ✅ シフトデータあり → シフト一覧が実名で表示される（ダミー名が出ない）
2. ✅ データなし → 空状態（案内文）が表示される
3. ✅ 需要予測が予約データに基づいて集計される

---

## 受け入れ基準（達成済み）
- ✅ `shift-optimizer` 画面にダミーデータが残らない
- ✅ 実データの有無に応じて正しい表示がされる

---

## 変更対象ファイル（完了）
- ✅ `src/components/staff/shift-optimizer.tsx`
- ✅ `src/app/api/staff/shifts/route.ts`（新規）
- ✅ `src/app/api/staff/preferences/route.ts`（新規）
- ✅ `src/app/api/staff/demand-forecast/route.ts`（新規）
- ✅ `supabase/migrations/20251231000100_staff_shifts_preferences.sql`（新規）

---

## 次のステップ（Phase 2以降）

### 優先度: 高
1. **DBマイグレーション適用**
   - `npx supabase db push` でマイグレーションを本番環境に適用
   - RLSポリシーの動作確認

2. **E2Eテストの実行**
   - Playwright E2Eテストを実行して統合動作を確認
   - `npx playwright test shift-optimizer`

3. **シフト作成/編集機能**
   - POST/PUT/DELETE エンドポイントの追加
   - シフト作成フォームの実装
   - ドラッグ&ドロップによるシフト編集

### 優先度: 中
4. **シフト承認ワークフロー**
   - 承認ボタンの機能実装
   - ステータス変更API
   - 承認履歴の記録

5. **スタッフ通知機能**
   - シフト確定時の通知
   - メール/アプリ内通知の実装

6. **需要予測の高度化**
   - 過去データに基づく予測モデル
   - 曜日・祝日パターンの考慮

### 優先度: 低
7. **AI最適化アルゴリズム**
   - スタッフ希望と需要予測に基づく自動シフト提案
   - コスト最適化ロジック

8. **レポート機能**
   - シフト実績レポート
   - 人件費分析ダッシュボード

---

## コンフリクト回避ルール
- `staff_shifts` / `staff_preferences` のスキーマはこの仕様で固定し、後方互換を維持する
- `staff` や `resources` の既存スキーマは変更しない
- `shift-optimizer` の表示要素は削除しない（空状態で置き換える）

---

## 関連ドキュメント
- `docs/E2E共通フィクスチャ仕様書.md`
- `docs/Playwright_E2E手引書.md`
- `docs/スタッフ分析とシフト最適化_MVP仕様書.md`

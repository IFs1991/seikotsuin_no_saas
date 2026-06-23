# ダッシュボード・分析UI実データ化_MVP仕様書

## 実装ステータス

| 項目 | ステータス | 備考 |
|------|-----------|------|
| revenue-chart.tsx 実データ対応 | ✅ 完了 | Rechartsで3系列表示 |
| patient-flow-heatmap.tsx 実データ対応 | ✅ 完了 | 曜日×時間帯マトリクス変換 |
| menu-ranking.tsx 実データ対応 | ✅ 完了 | props経由でデータ受け取り |
| conversion-funnel.tsx 実データ対応 | ✅ 完了 | 先頭100%基準で転換率計算 |
| dashboard/page.tsx 統合 | ✅ 完了 | 「準備中」テキスト削除 |
| コンポーネント単体テスト | ✅ 完了 | 28テスト全パス |
| E2Eテスト（Playwright） | ⏳ 拡張済み | シードデータ投入後に実行可能 |
| revenue/page.tsx MenuRanking統合 | ❌ 未着手 | 次フェーズ |
| patients/page.tsx ConversionFunnel統合 | ❌ 未着手 | 次フェーズ |

**最終更新**: 2025-12-31

---

## 目的
- ダッシュボード/分析画面からダミー表示を排除し、実データで可視化する。
- 既存APIの返却データをUIに接続する。

## 背景/課題
- ダッシュボードのチャート/ヒートマップが「準備中」表示。
- `revenue-chart` / `patient-flow-heatmap` / `menu-ranking` / `conversion-funnel` がモックデータ。

## 対象範囲
- `src/app/dashboard/page.tsx`
- `src/components/dashboard/revenue-chart.tsx`
- `src/components/dashboard/patient-flow-heatmap.tsx`
- `src/components/revenue/menu-ranking.tsx`
- `src/components/patients/conversion-funnel.tsx`

## 依存/前提
- `/api/dashboard` が `revenueChartData` / `heatmapData` を返す
- `/api/revenue` が `menuRanking` を返す
- `/api/patients` が `conversionData` を返す
- `recharts` が利用可能

## 機能要件
### 収益トレンド
- `revenueChartData` を Recharts で可視化（総売上/保険/自費の3系列）。
- データが空の場合は「データがありません」表示。

### 混雑ヒートマップ
- `heatmapData` を曜日×時間帯のマトリクスに変換。
- `heatmapData` 形式（MVPで統一）:
  - `[{ day_of_week: 0-6, hour_of_day: 0-23, visit_count: number }]`
  - `day_of_week` はDBの `EXTRACT(DOW)` 前提（0=日曜日）。UI側で月曜起点に変換する。
- 変換後に `patient-flow-heatmap` へ渡す。

### メニューランキング
- `/api/revenue` の `menuRanking` を使用。
- モック配列を削除し、ランキングは売上降順で表示。

### 患者転換ファネル
- `/api/patients` の `conversionData.stages` を使用。
- `percentage` は先頭ステージを100%として計算。

## UI/UX
- 既存カードUIのトーンを維持。
- データ空の場合は空状態を表示し、誤解を招かない文言にする。

## エラーハンドリング
- API失敗時は該当カードでエラー表示。
- 部分的な失敗は他ウィジェットに影響させない。

## テスト戦略（TDD）
### 先に書くテスト（fail-first）
- `dashboardData.revenueChartData` が渡されるとチャートが描画される。
- `heatmapData` が空の場合に空状態が表示される。
- `menu-ranking` がモックデータを参照していない。

### テスト一覧
- `src/__tests__/pages/dashboard.test.ts`（更新）
  - チャート/ヒートマップの表示
- `src/__tests__/components/revenue-chart.test.tsx`（新規）
- `src/__tests__/components/patient-flow-heatmap.test.tsx`（新規）
- `src/__tests__/components/menu-ranking.test.tsx`（新規）
- `src/__tests__/components/conversion-funnel.test.tsx`（新規）

## AI駆動開発の進め方
- UIは既存の `DashboardData` / `Revenue` / `Patients` のAPI契約を前提に実装する。
- Recharts以外の新規グラフ依存を追加しない。
- コンポーネントをページに接続し、E2Eで到達できる状態にする。

## コンフリクト回避ルール
- `/api/dashboard` のレスポンス構造は固定。変更が必要な場合は `types/api` とテストを同時更新する。
- `patient-flow-heatmap` / `revenue-chart` のデータ変換ロジックはUI側に閉じる。
- 画面の「準備中」文言は削除し、代替の空状態に置き換える。

## E2Eテスト仕様
### 前提データ
- `daily_revenue_summary` に7日分のデータ
- `visits` に本日分の来院データ
- `ai_comments` に本日分のコメント
- `get_hourly_visit_pattern` が返る状態

### シナリオ
1. `/dashboard` で収益チャートが描画される（系列3本が存在する）。
2. `/dashboard` のヒートマップに曜日×時間帯のセルが描画される。
3. データが無い場合は「データがありません」空状態が表示される。
4. `/revenue` のメニューランキングがAPIデータで表示される。
5. `/patients` の転換率表示がAPIデータに一致する（先頭100%基準）。

## 受け入れ基準
- ダッシュボードに「準備中」表示が残らない。
- 全ウィジェットがAPIデータで描画される。
- 空データ時でもUI崩れや例外が発生しない。

## 変更対象ファイル
- `src/app/dashboard/page.tsx`
- `src/components/dashboard/revenue-chart.tsx`
- `src/components/dashboard/patient-flow-heatmap.tsx`
- `src/components/revenue/menu-ranking.tsx`
- `src/components/patients/conversion-funnel.tsx`

---

## 実装詳細（2025-12-31 完了分）

### 変更内容

#### 1. revenue-chart.tsx
- **変更前**: ハードコードされたモックデータ（chartData/previousPeriodData）、JSONプレースホルダー表示
- **変更後**: `RevenueChartPoint[]` をprops経由で受け取り、Rechartsの`LineChart`で3系列（総売上・保険診療・自費診療）を描画
- 空データ時は「データがありません」を表示

#### 2. patient-flow-heatmap.tsx
- **変更前**: ハードコードされた`congestionData`オブジェクト
- **変更後**: `HeatmapPoint[]`（`day_of_week`, `hour_of_day`, `visit_count`）をprops経由で受け取り、曜日×時間帯のマトリクスに変換
- `data-testid="heatmap-cell"` を追加してE2Eテスト対応

#### 3. menu-ranking.tsx
- **変更前**: `mockMenuData` がハードコードされていた
- **変更後**: `MenuRanking[]` をprops経由で受け取り、売上降順でソート
- グラフビュー（Recharts BarChart）とテーブルビューのタブ切り替え
- `data-testid="menu-ranking-item"` を追加

#### 4. conversion-funnel.tsx
- **変更前**: `mockFunnelData` がハードコードされていた
- **変更後**: `ConversionStage[]` をprops経由で受け取り、先頭ステージを100%として転換率を計算
- `data-testid="funnel-stage"`, `data-testid="conversion-rate"` を追加

#### 5. dashboard/page.tsx
- `RevenueChart` と `PatientFlowHeatmap` コンポーネントをインポート
- `memoizedData` に `revenueChartData` と `heatmapData` を追加
- 「チャート表示機能は準備中です」「ヒートマップ表示機能は準備中です」を削除し、実際のコンポーネントに置き換え

### 新規テストファイル

| ファイル | テスト内容 |
|---------|-----------|
| `src/__tests__/components/revenue-chart.test.tsx` | チャート描画、3系列表示、空状態、モックデータ非使用確認 |
| `src/__tests__/components/patient-flow-heatmap.test.tsx` | ヒートマップ描画、曜日/時間ラベル、空状態、API形式変換 |
| `src/__tests__/components/menu-ranking.test.tsx` | ランキング描画、売上降順ソート、タブ切り替え、空状態 |
| `src/__tests__/components/conversion-funnel.test.tsx` | ファネル描画、転換率計算（先頭100%基準）、空状態 |

### E2Eテスト拡張（dashboard.spec.ts）
- 収益チャートが描画される（系列3本が存在する）
- ヒートマップに曜日×時間帯のセルが描画される
- データが無い場合は空状態が表示される
- メニューランキングがAPIデータで表示される
- 転換率表示がAPIデータに一致する

---

## 次のステップ（残タスク）

### Phase 2: ページ統合

#### 1. `/revenue` ページに MenuRanking 統合
- **ファイル**: `src/app/revenue/page.tsx`
- **タスク**:
  - `useRevenue` フックから `menuRanking` データを取得
  - `MenuRanking` コンポーネントにデータを渡す
  - 既存のモック/プレースホルダーを置き換え

#### 2. `/patients` ページに ConversionFunnel 統合
- **ファイル**: `src/app/patients/page.tsx`
- **タスク**:
  - `usePatients` フックから `conversionData.stages` を取得
  - `ConversionFunnel` コンポーネントにデータを渡す
  - 既存のモック/プレースホルダーを置き換え

### Phase 3: E2Eテスト実行

#### 前提条件
1. Playwright セットアップ完了
2. E2Eシードデータ投入（`docs/E2E共通フィクスチャ仕様書.md` 参照）
   - `daily_revenue_summary` に7日分のデータ
   - `visits` に本日分の来院データ
   - `get_hourly_visit_pattern` RPC関数が動作する状態

#### 実行コマンド
```bash
npx playwright test src/__tests__/e2e-playwright/dashboard.spec.ts
```

### Phase 4: 既存ビルドエラー修正（任意）

以下のファイルに既存のビルドエラーがあり、今回の変更とは無関係ですが、ビルドを通すには修正が必要です：
- `src/hooks/useSystemSettings.ts:308` - Syntax Error
- `src/lib/supabase/server.ts` - server-only import issue
- `src/app/blocks/page.tsx:293` - Syntax Error

---

## 技術的な注意事項

### Rechartsモック（テスト用）
テストでは `jest.mock('recharts', ...)` でRechartsをモック化しています。実際のチャート描画はテストしていないため、視覚的な確認はE2Eまたは手動で行ってください。

### HeatmapPoint 形式
APIから返却される `heatmapData` は以下の形式です：
```typescript
interface HeatmapPoint {
  hour_of_day: number;  // 0-23
  day_of_week: number;  // 0=日曜日, 6=土曜日（DBのDOW準拠）
  visit_count: number;
  avg_revenue: number | null;
}
```

### 転換率計算ロジック
先頭ステージの `value` を100%として、各ステージの `percentage` を計算：
```typescript
percentage = Math.round((stage.value / stages[0].value) * 100)
```

# 多店舗分析_MVP仕様書（詳細版）

## 目的
- HQ向けに多店舗KPI比較を提供する。
- モックを排除する。

## 依存テーブル
- public.clinics
- public.daily_revenue_summary
- public.staff_performance_summary
- public.patient_visit_summary

## 仕様
### API
- GET /api/admin/tenants を拡張
- 返却: revenue, patients, staff_performance_score

### UI
- src/app/multi-store/page.tsx
- src/hooks/useMultiStore.ts

## 権限
- admin/clinic_managerのみ許可

## 受け入れ基準
- 実データで比較が表示される
- HQ以外はアクセス不可

---

## 実装状況 (2024-12-30 更新)

### 完了済み

| コンポーネント | ファイル | 状況 |
|---|---|---|
| カスタムフック | `src/hooks/useMultiStore.ts` | ✅ 完了 |
| API拡張 | `src/app/api/admin/tenants/route.ts` | ✅ 完了 (`include_kpi=true`) |
| UIページ | `src/app/multi-store/page.tsx` | ✅ 完了 |
| フックテスト | `src/__tests__/hooks/useMultiStore.test.ts` | ✅ 完了 |
| APIテスト | `src/__tests__/api/multi-store-kpi.test.ts` | ✅ 完了 |
| UIテスト | `src/__tests__/components/MultiStorePage.test.tsx` | ✅ 完了 |

### 実装詳細

#### useMultiStore フック
- `fetchClinicsWithKPI()` - KPI付きクリニック一覧取得
- `sortByRevenue()` / `sortByPatients()` / `sortByPerformance()` - ソート機能
- `totalRevenue` / `totalPatients` / `averagePerformanceScore` - 集計値

#### API (GET /api/admin/tenants?include_kpi=true)
- `daily_revenue_summary` から収益データ取得
- `patient_visit_summary` から患者数取得
- `staff_performance_summary` からパフォーマンススコア算出

#### UIページ
- サマリーカード（合計収益、合計患者数、平均パフォーマンス）
- 店舗別KPI比較テーブル（ソート機能付き）
- ローディング/エラー表示

### テスト結果
```
Test Suites: 3 passed, 3 total
Tests:       32 passed, 32 total
```

---

## 次のステップ (TODO)

### 優先度: 高
1. **ビルドエラー修正** - 別ファイルの問題により全体ビルドが失敗
   - `src/hooks/useSystemSettings.ts`
   - `src/hooks/useAdminMaster.ts`
   - `src/app/blocks/page.tsx`

2. **E2Eテスト追加** - 実際のSupabase接続でのテスト
   - admin権限でのアクセス確認
   - 非admin権限でのアクセス拒否確認

### 優先度: 中
3. **clinic_manager権限対応** - 現在adminのみ許可
   - API側で`allowedRoles`に`clinic_manager`追加
   - RLSポリシーの確認

4. **期間フィルター追加** - 月次/四半期/年次での比較
   - API: `period`パラメータ追加
   - UI: 期間選択UI

5. **グラフ表示** - 視覚的な比較
   - 棒グラフ/折れ線グラフ追加
   - recharts等のライブラリ検討

### 優先度: 低
6. **CSVエクスポート** - レポート出力機能
7. **ドリルダウン** - 店舗詳細への遷移

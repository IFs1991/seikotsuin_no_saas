# 収益分析_MVP仕様書（詳細版）

## 目的
- clinicIdに紐づく収益分析を提供する。
- サンプル値を排除する。

## 依存テーブル
- public.revenues
- public.daily_revenue_summary
- public.reservations
- get_hourly_revenue_pattern

## 仕様
### API
- GET /api/revenue?clinic_id=...
- ただし保険/自費分離は一部代替値を許容

### フロント
- useRevenue(clinicId) を必須化
- プロファイルのclinicIdを使用

## 競合回避
- ダッシュボードからのリンクは維持

## 受け入れ基準
- clinicIdなしで取得しない
- APIレスポンスで画面が描画される

---

## 実装状況（2024-12-30）

### 完了項目
- [x] useRevenue(clinicId) を必須化
- [x] サンプル値を排除（ゼロ値で初期化）
- [x] プロファイルのclinicIdを使用
- [x] loading/error状態の追加
- [x] テスト作成（24テストパス）

### 変更ファイル
- `src/hooks/useRevenue.ts`
- `src/app/revenue/page.tsx`
- `src/__tests__/hooks/useRevenue.test.tsx`（新規）
- `src/__tests__/pages/revenue.test.tsx`（更新）

---

## 次にやること（TODO）

### 高優先度
1. **曜日別収益パターンの実装**
   - 現在 `dailyRevenueByDayOfWeek` が空文字を返している
   - APIから曜日別データを取得して表示する

2. **施術者別収益貢献度の実装**
   - 現在 `staffRevenueContribution` が空文字を返している
   - スタッフごとの収益データをAPIから取得

3. **コスト分析の動的化**
   - 現在 API側で固定値（32.5%）を返している
   - 実際の人件費データに基づく計算を実装

### 中優先度
4. **グラフ/チャートの追加**
   - 日次トレンドの折れ線グラフ
   - 保険/自費の円グラフ
   - 時間帯別ヒートマップ

5. **期間フィルターの追加**
   - 週次/月次/年次の切り替え
   - カスタム日付範囲指定

6. **収益予測の精度向上**
   - 現在は単純な10%増で計算
   - 過去データに基づく予測アルゴリズム実装

### 低優先度
7. **既存の型エラー修正**
   - プロジェクト全体の型チェックでエラーあり（本機能とは無関係）

8. **ESLint設定の修正**
   - 依存関係の問題でlintが実行できない状態

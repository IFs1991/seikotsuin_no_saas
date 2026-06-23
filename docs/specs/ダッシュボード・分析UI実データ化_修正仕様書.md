# ダッシュボード・分析UI実データ化_修正仕様書

## 実装ステータス

| 項目 | ステータス | 備考 |
|------|-----------|------|
| 通貨フォーマット修正 | 未着手 | テンプレート文字列の誤り修正 |
| ヒートマップ曜日補正 | 未着手 | DOW(0=日)を月曜起点へ変換 |
| ヒートマップ24時間対応 | 未着手 | 0-23の全時間帯表示 |
| E2Eタイトル不一致修正 | 未着手 | 収益トレンド表記で統一 |
| Phase1/Phase2のE2E分離 | 未着手 | Phase1はdashboardのみ |
| E2Eシード調整 | 未着手 | daily_revenue_summaryが出るデータ状態にする |

**最終更新**: 2025-12-31

---

## 目的
- Phase1実装の不整合を解消し、ダッシュボードE2Eが安定して通る状態にする。
- 仕様/実装/テストの表記揺れとデータ前提のズレを是正する。

## 背景/課題
- 通貨表示がテンプレート文字列になっており、金額が表示されない。
- Postgres DOW(0=日)とUIの曜日配列(0=月)の不整合で表示が1日ズレる。
- ヒートマップが9-18時のみで、仕様の0-23を満たしていない。
- E2EがUIの見出しと一致せず失敗する。
- Phase1未統合の /revenue /patients テストが走ってしまう。
- `daily_revenue_summary` はビューだが、シードの予約状態が一致せず0件になる。

## 対象範囲
- `src/components/dashboard/revenue-chart.tsx`
- `src/components/revenue/menu-ranking.tsx`
- `src/components/dashboard/patient-flow-heatmap.tsx`
- `src/__tests__/e2e-playwright/dashboard.spec.ts`
- `scripts/e2e/seed-e2e-data.mjs`
- `docs/ダッシュボード・分析UI実データ化_MVP仕様書.md`（必要に応じて追記）

## 非対象
- Phase2のページ統合（`/revenue`, `/patients` へのコンポーネント統合）
- 新規APIやDBスキーマ変更

---

## 修正仕様

### 1. 通貨フォーマット修正
#### 要件
- `$`プレフィックスの誤記を修正し、`JPY` 表示に統一する。
- 日報カードと同じロケール（`ja-JP`）のフォーマットに合わせる。

#### 実装方針
- `formatCurrency` を `value.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY' })` に統一する。

#### 影響ファイル
- `src/components/dashboard/revenue-chart.tsx`
- `src/components/revenue/menu-ranking.tsx`

---

### 2. ヒートマップ曜日補正（DOW整合）
#### 要件
- DB関数の `EXTRACT(DOW)` (0=日) を前提に、UI側で月曜起点(0=月)へ変換する。
- 「UI変換ロジックはUI側に閉じる」ルールに準拠する。

#### 実装方針
- 行列生成時に `normalizedDayIndex = (point.day_of_week + 6) % 7` を使用する。
- `getVisitCount` の検索も同じ補正ロジックを用いる。

#### 影響ファイル
- `src/components/dashboard/patient-flow-heatmap.tsx`
- `docs/ダッシュボード・分析UI実データ化_MVP仕様書.md`（HeatmapPointの説明に注記追加）

---

### 3. ヒートマップ24時間対応
#### 要件
- 0-23 時間帯をすべて描画する。
- 列数増加に伴う最低幅を調整する。

#### 実装方針
- `hoursOfDay` を `Array.from({ length: 24 }, (_, i) => i)` に変更する。
- `grid-cols-[auto_repeat(10,_minmax(0,_1fr))]` を 24 に拡張し、`min-w` を再調整する。

#### 影響ファイル
- `src/components/dashboard/patient-flow-heatmap.tsx`

---

### 4. E2Eタイトル不一致修正
#### 要件
- `収益トレンド` 表記に統一する。

#### 実装方針
- `dashboard.spec.ts` の見出し期待値をUIに合わせる。

#### 影響ファイル
- `src/__tests__/e2e-playwright/dashboard.spec.ts`

---

### 5. Phase1/Phase2のE2E分離
#### 要件
- Phase1では `dashboard` のみ実行対象にする。
- Phase2統合が完了するまで `/revenue` と `/patients` のE2Eは無効化する。

#### 実装方針
- `E2E_PHASE` 環境変数で条件分岐し、`phase1`（デフォルト）時は `/revenue` `/patients` をスキップする。
- `E2E_PHASE=phase2` または `E2E_PHASE=all` でPhase2のE2Eを有効化する。

#### 影響ファイル
- `src/__tests__/e2e-playwright/dashboard.spec.ts`

---

### 6. E2Eシードの整合性修正
#### 要件
- `daily_revenue_summary` ビューが `reservations` から集計される前提に合わせる。
- 予約ステータスを `completed` または `arrived` に含める。

#### 実装方針
- 既存の予約データは維持し、直近7日分の完了予約を追加する。
- `status: 'completed'` を指定し、`daily_revenue_summary` が1週間分を返せる状態にする。
- `start_time` を `Asia/Tokyo` の日付に揃える（既存ロジックのままでも可）。

#### 影響ファイル
- `scripts/e2e/seed-e2e-data.mjs`

---

## テスト戦略（TDD / E2E）

### 先に書くテスト（fail-first）
- `formatCurrency` の表示が `JPY` になっていること。
- `day_of_week=0` が日曜ではなく月曜基準で描画されること（変換ロジックの単体テスト）。
- 24時間帯のラベルが描画されること（`0:00` と `23:00` の表示確認）。

### E2E方針（詳細）
#### 基本方針
- E2EはPlaywrightに統一し、`docs/Playwright_E2E手引書.md` の方針に準拠する。
- フェーズ切り替えは `E2E_PHASE` で制御する（デフォルト `phase1`）。
- Phase1では `dashboard` のみ実行し、Phase2のテストはスキップする。

#### 実行条件
- `globalSetup` で `scripts/e2e/seed-e2e-data.mjs` を実行する。
- `globalTeardown` で `scripts/e2e/cleanup-e2e-data.mjs` を実行する。
- DBチェックは既定で有効（必要に応じて `E2E_SKIP_DB_CHECK=1`）。

#### テスト粒度
- UIの待機は `expect(locator).toBeVisible()` を基本とする。
- API完了待機が必要な場合は `page.waitForResponse` を使用する。
- `daily_revenue_summary` が空の場合は空状態の検証を別ケースに分離する。

#### Phase1のE2E範囲
- `/dashboard` で `収益トレンド` の見出しが可視であること。
- `daily_revenue_summary` 由来のチャートが描画される（空状態ではない）。
- ヒートマップのセルが描画される。

#### Phase2以降の拡張
- `/revenue` のメニューランキングと `/patients` の転換ファネルを追加する。
- `E2E_PHASE=phase2` または `E2E_PHASE=all` で有効化する。

---

## 受け入れ基準
- 収益チャート/メニューランキングで金額が `JPY` 表示される。
- ヒートマップの曜日が実データと一致し、1日ズレが解消される。
- 0-23 時間帯が表示される。
- Phase1のE2Eが安定して通る。

---

## 変更対象ファイル
- `src/components/dashboard/revenue-chart.tsx`
- `src/components/revenue/menu-ranking.tsx`
- `src/components/dashboard/patient-flow-heatmap.tsx`
- `src/__tests__/e2e-playwright/dashboard.spec.ts`
- `scripts/e2e/seed-e2e-data.mjs`
- `docs/ダッシュボード・分析UI実データ化_MVP仕様書.md`

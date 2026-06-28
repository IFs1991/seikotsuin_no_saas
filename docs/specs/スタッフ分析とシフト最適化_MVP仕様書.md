# スタッフ分析とシフト最適化_MVP仕様書（詳細版）

## 目的
- 固定データを排除し、実データに基づくスタッフ分析を提供する。
- シフト最適化はMVPでは分析提示に限定する。

## 依存テーブル
- public.staff_performance_summary
- public.resources
- public.reservations

## 仕様
### データ取得
- /api/staff?clinic_id=...
- staffMetrics, revenueRanking, satisfactionCorrelation, performanceTrends

### UI
- src/app/staff/page.tsx
- ダミー表示を排除

### シフト分析
- 時間帯別予約数と稼働率を表示
- 推奨コメントを表示

## 競合回避
- 収益分析の集計定義は収益仕様で管理

## 受け入れ基準
- ランキングとトレンドが実データで表示
- ダミー表示が残らない

---

## 実装完了（2024-12-30）

### 実装内容

#### 1. ダミーデータの削除
**ファイル**: `src/app/api/staff/route.ts`
- `skillMatrix`（Math.random()使用）を削除
- ハードコードされた`trainingHistory`を削除

#### 2. シフト分析機能の追加
**ファイル**: `src/app/api/staff/route.ts`

| 項目 | 説明 | データソース |
|------|------|-------------|
| `hourlyReservations` | 過去30日の時間帯別予約数 | reservationsテーブル |
| `utilizationRate` | 稼働率（%） | resources + reservations |
| `recommendations` | 推奨コメント（配列） | ピーク時間・稼働率から生成 |

**稼働率計算ロジック**:
```
稼働率 = (予約時間合計 / スタッフ勤務可能時間合計) × 100
```

**推奨コメント生成ルール**:
- ピーク時間帯（平均の1.5倍以上）→ 増員推奨
- 稼働率 < 50% → 低稼働警告
- 稼働率 50-85% → 適正範囲
- 稼働率 > 85% → 過負荷警告

#### 3. UI更新
**ファイル**: `src/app/staff/page.tsx`

- メトリクスカード追加（平均患者数/日、総売上、平均満足度）
- タブ切り替え（パフォーマンス / シフト分析）
- シフト分析タブ:
  - 稼働率プログレスバー（色分け: 黄<50%, 緑50-85%, 赤>85%）
  - 時間帯別予約数棒グラフ（8時〜21時）
  - 推奨事項リスト
- スタッフ数バッジ（総スタッフ数、稼働中スタッフ数）

#### 4. フック更新
**ファイル**: `src/hooks/useStaffAnalysis.ts`
- ダミーデータを完全排除
- `/api/staff?clinic_id=...` からリアルデータを取得
- 新しいshiftAnalysis構造に対応

#### 5. テスト追加・更新
| ファイル | 状態 | テスト数 |
|---------|------|---------|
| `src/__tests__/api/staff-api.test.ts` | 新規作成 | 12 |
| `src/__tests__/api/staff-schema.test.ts` | 既存 | 3 |
| `src/__tests__/pages/staff.test.tsx` | 更新 | 6 |
| **合計** | | **21 passed** |

### 変更ファイル一覧
```
src/app/api/staff/route.ts          # API実装
src/hooks/useStaffAnalysis.ts       # データ取得フック
src/app/staff/page.tsx              # UIページ
src/__tests__/api/staff-api.test.ts # APIテスト（新規）
src/__tests__/pages/staff.test.tsx  # UIテスト（更新）
```

---

## 次にやるべきこと（TODO）

### 短期（次スプリント）
1. **E2Eテスト追加**
   - 実際のSupabase接続でのシフト分析表示確認
   - 稼働率計算の精度検証

2. **パフォーマンス最適化**
   - 過去30日分の予約データキャッシュ
   - 時間帯別集計のサーバーサイド最適化

3. **エラーハンドリング強化**
   - reservationsテーブル空の場合の表示
   - resourcesテーブルに勤務時間未設定の場合の対応

### 中期（将来スプリント）
4. **シフト最適化機能（Phase 2）**
   - 推奨シフトの自動生成
   - ドラッグ&ドロップでのシフト編集
   - シフト変更の影響シミュレーション

5. **分析機能拡張**
   - 曜日別予約傾向分析
   - 季節・月別トレンド表示
   - スタッフ別稼働率詳細

6. **通知・アラート機能**
   - 稼働率異常時のアラート
   - ピーク時間帯の事前通知

### 技術的負債
7. **TypeScriptエラー解消**
   - `ai-analysis-service.ts` の型エラー修正
   - 既存の型定義整理

8. **ESLint依存関係修正**
   - `es-abstract` モジュール問題の解決

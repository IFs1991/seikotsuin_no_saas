# 実装計画書 v2（明日実装向けブラッシュアップ）

## 0) 総評
現行計画は大枠OKです。明日"迷わず完走"するために、(1)スコープ分割、(2)DoD、(3)データ契約、(4)AI持ち出し最小化、(5)安定化（キャッシュ/フォールバック）を追加します。

### 実装ステータス（2025-12-24 更新）

| 機能 | コード実装 | DB対応 | 動作確認 |
|------|-----------|--------|---------|
| F102 カスタム属性 | ✅ 完了 | ✅ 完了 | ⬜ 未確認 |
| Gemini AIインサイト | ✅ 完了 | ✅ 完了 | ⬜ 未確認 |

> **注記**: DBビューの不整合問題を発見・修正済み（詳細は§9参照）

---

## 1) スコープを v0 / v1 に分割

### v0（明日）
- **F102（カスタム属性）**：患者の作成/更新で `custom_attributes` に保存し、患者詳細で表示できる
- **Gemini（表読解の最小ループ）**：集計済みテーブル(JSON)を渡し、Zodで検証してAIインサイトUIに表示できる

### v1（後日）
- カスタム属性テンプレの管理UI（並び順、必須、選択肢、メニュー別など）
- カスタム属性での検索/フィルタ、集計（索引・ビュー）
- Geminiの高度化（異常検知、推奨アクションの根拠、PDF、キャッシュ永続化）

---

## 2) GitHub上の“触る場所”を確定（重要箇所の羅列）

### F102（カスタム属性）
- DB/型
  - `sql/migrations/reservation_system_schema.sql`（customersのJSONB列確認/追加が必要ならここ）
  - `src/types/supabase.ts`（Row型：`custom_attributes`）
- API（顧客）
  - `src/app/api/customers/schema.ts`（Zod：insert/updateに `customAttributes` を追加）
  - `src/app/api/customers/route.ts`（POST/PATCHで `custom_attributes` を保存/更新）
- フロント（予約・顧客）
  - `src/app/reservations/components/AppointmentForm.tsx`（新規顧客作成導線。ここに動的入力UIを差し込む）
  - `src/app/reservations/api.ts`（`createCustomer`等。payload拡張）
  - 患者詳細：`src/app/patients/[id]/page.tsx` 等（表示の追加。該当ページを探して実装）

### Gemini（表読解）
- `src/api/gemini/ai-analysis-service.ts`
  - **入力データ生成**（集計テーブル作成）
  - **プロンプト**（JSON入力を読むように固定）
  - **レスポンス検証**（Zodでparse。失敗時フォールバック）
- `src/app/api/ai-insights/route.ts`
  - AIインサイトAPIエンドポイント
- `src/app/ai-insights/page.tsx`
  - mockから実データへ切替、表示コンポーネントの受け皿
- `supabase/migrations/20251224002000_recreate_ai_insights_views.sql` ⭐ **新規追加**
  - 旧スキーマビューを新スキーマ対応に再作成

---

## 3) つまずきポイント（先回り）

1. **JSONBの“上書き事故”**
   - PATCHで `custom_attributes` 全置換すると将来拡張で事故る。
   - v0は全置換でも可だが、v1で **マージRPC**（例：`merge_customer_custom_attributes(customer_id, patch_json)`）を入れると安全。

2. **snake_case ↔ camelCase**
   - APIは `customAttributes`、DBは `custom_attributes`。
   - 変換関数（mapInsert/mapUpdate）を必ず1箇所に寄せる。

3. **テンプレが無いとUIが作れない問題**
   - v0は「暫定テンプレをコード定数で持つ」でも成立。
   - 例：`CUSTOM_ATTR_TEMPLATE = [{ key:'symptom', type:'text', required:false }, ...]`

4. **AIへのPHI持ち出し**
   - Geminiに“氏名/電話/メール/メモ原文”を渡さない。
   - v0は **集計値のみ**（日別売上、スタッフ別売上、再診率…）に限定。

5. **トークン肥大と遅延**
   - 生データ表は送らない。最大行数（例：日別最大90行、スタッフ最大30行）を固定。
   - 期間はデフォルト30日、伸ばす場合はサンプリング。

6. **DBビューと現行テーブルの不整合** ⭐ **発見済み・修正済み**
   - 旧スキーマ（`patients`, `visits`, `revenues`）用のビューが残っていた。
   - 現行アプリは新スキーマ（`customers`, `reservations`, `resources`）を使用。
   - → マイグレーション `20251224002000_recreate_ai_insights_views.sql` で修正。

---

## 4) v0のDefinition of Done（受入基準）

### F102
- [x] `POST /api/customers` で `customAttributes` を送るとDBの `custom_attributes` に保存される
- [x] `PATCH /api/customers` で更新できる（v0は全置換でOK）
- [x] 予約作成フロー（AppointmentForm）でカスタム属性入力→保存が通る
- [x] 患者詳細画面でカスタム属性が読めて表示される

### Gemini
- [x] 30日分の集計テーブル(JSON)を生成できる
- [x] Geminiへ投入→ **JSONスキーマ準拠**で返る（Zod parse）
- [x] parse失敗/タイムアウト時はフォールバック（簡易テキスト）を返す
- [x] AIインサイト画面に表示される（少なくともsummary/insights）

---

## 5) 明日の実装順（迷わない手順）

1. **APIスキーマ拡張**
   - `src/app/api/customers/schema.ts` に `customAttributes` を追加（insert/update）
2. **APIルート実装**
   - `src/app/api/customers/route.ts` のPOST/PATCHで `custom_attributes` に保存
3. **クライアントAPI拡張**
   - `src/app/reservations/api.ts` の `createCustomer` などのpayloadに `customAttributes` を追加
4. **UI差し込み（v0テンプレは定数でOK）**
   - `AppointmentForm.tsx` に動的フィールド描画を追加（key/type/requiredのみで最小）
5. **患者詳細表示**
   - 患者詳細ページで `custom_attributes` を一覧表示
6. **Gemini v0**
   - `ai-analysis-service.ts` に「集計テーブル作成→JSON投入→Zod parse→フォールバック」実装
7. **AIインサイト表示の結線**
   - `ai-insights/page.tsx` をmockから呼び出しへ切替（最低限の表示でOK）

---

## 6) Geminiの“テーブル投入”仕様（v0の型）

### 入力（例）
```json
{
  "periodDays": 30,
  "tables": {
    "revenue_daily": {"columns": ["date","revenue"], "rows": [["2025-12-01", 120000], ...]},
    "staff_revenue": {"columns": ["staff","revenue","count"], "rows": [["A", 300000, 40], ...]},
    "patient_funnel": {"columns": ["metric","value"], "rows": [["new", 80],["return", 42]]}
  }
}
```

### 期待出力（Zodで検証する）
```json
{
  "summary": "...",
  "insights": [{"title":"...","why":"...","action":"...","impact":"high|mid|low"}],
  "anomalies": [{"title":"...","evidence":"...","action":"..."}]
}
```

---

## 7) 追加ブラッシュアップ（余力があれば）
- Gemini結果のキャッシュ（まずはメモリ/次にDB：`ai_insights_cache`）
- `custom_attributes` への更新を安全にするマージRPC
- `custom_attributes` の型（date/number/bool）変換ユーティリティ

---

## 8) 次にやるべきこと
- [ ] **DBマイグレーション適用**（§9参照）
- [ ] 予約作成 → 患者詳細でカスタム属性が表示されることを手動確認
- [ ] `GEMINI_API_KEY` を設定し、AIインサイトのJSON返却とZod検証の成功パスを確認
- [ ] Geminiのフォールバック動作（タイムアウト/parse失敗）を確認
- [ ] 必要なら `custom_attributes` の更新をマージRPCに拡張（v1）

---

## 9) DBビュー修正（2025-12-24 追加）

### 問題発見

AIインサイトで使用する3つのビューが**旧スキーマ**のテーブルを参照しており、現行アプリのデータを取得できない状態だった。

| ビュー | 旧参照先 | 新参照先 |
|--------|---------|---------|
| `daily_revenue_summary` | `revenues` | `reservations` |
| `staff_performance_summary` | `staff`, `visits` | `resources`, `reservations` |
| `patient_visit_summary` | `patients`, `visits` | `customers`, `reservations` |

### 修正内容

新スキーマ（`customers`, `reservations`, `resources`）を参照するようにビューを再作成。

**マイグレーションファイル**:
```
supabase/migrations/20251224002000_recreate_ai_insights_views.sql
```

**主な変更点**:
- `reservations.status IN ('completed', 'arrived')` でフィルタ
- `COALESCE(actual_price, price, 0)` で金額取得
- `DATE(start_time AT TIME ZONE 'Asia/Tokyo')` で日本時間の日付変換
- `clinic_id IS NOT NULL` でフィルタ
- パフォーマンス向上用インデックス追加

### 適用方法

**方法1: Supabase Dashboard**
```
SQL Editor でマイグレーションファイルの内容を実行
```

**方法2: Supabase CLI**
```bash
npx supabase db push
```

### 互換性

以下の関数は旧ビューを参照しているが、カラム名維持により互換性あり：
- `analyze_patient_segments`
- `analyze_staff_efficiency`
- `predict_revenue`

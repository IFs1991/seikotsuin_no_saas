# DBスキーマ複線化 解消計画書

## 目的
- レガシー/新スキーマが混在している状態を解消し、単一の正（Single Source of Truth）を確立する
- API/フロント/DBの不整合をなくし、`supabase db reset` が毎回安定して通る状態にする

## 現状の問題
- スキーマ定義が複数存在し、互いに互換性がない
  - `src/api/database/schema.sql`（レガシー）
  - `src/database/schemas/*`（新設計）
  - `sql/migrations/*`（予約/一部機能）
  - `supabase/migrations/*`（ローカル用）
- API が参照するカラムと、DB側の構造がずれることがある
  - 例: `revenues.amount` / `patients.name` / `master_*` など
- `db reset` 後に必須データ（profiles/clinic_id）が消え、動作確認が不安定になる

## ゴール（あるべき状態）
- **正のスキーマを 1 つに固定**
- `supabase/migrations` のみが唯一の実行ソース
- `npm run supabase:types` が常に成功し、型定義が最新
- ローカル/本番で同じ手順が使える

## 解消方針（推奨）
### Phase 1: 正のスキーマを確定
- まずは **現行APIに合うレガシースキーマを正** として固定
  - 対象: `src/api/database/schema.sql`
- 予約機能は `sql/migrations/reservation_system_*` を正に含める
- `supabase/migrations` に集約済みのものだけを採用

### Phase 2: 不要な複線を凍結
- 以下は **参照禁止** とし、実行対象から除外
  - `src/database/schemas/*`
  - 旧 `supabase/migrations` の新設計系
  - KPI用ビュー migration（互換性が崩れるため）

### Phase 3: 段階的に新スキーマへ移行（将来）
- 本当に移行するなら「API変更とDB変更を同時に行う」前提
- 互換ビューを挟み、既存APIを壊さずに移行する

## 実行ステップ
### Step 1: supabase/migrations を唯一の正とする
- `supabase/migrations` 以外のSQLは参照しない
- 追加/修正はすべて `supabase/migrations` に集約

### Step 2: 予約系に clinic_id を付与
- 予約APIが `clinic_id` で必ずフィルタするため
- migrations で `clinic_id` 追加済みであることを確認

### Step 3: seed の整備
- `profiles` / `clinics` / `auth.users` を固定化（開発用）
- `db reset` 後に即ログインできる状態にする

### Step 4: 本番への反映手順を固定
- ローカルで `db reset` が毎回成功する状態を確認
- その後に `supabase db push` で反映

## スコープ外（今回やらない）
- KPI 用の DWH 連携スキーマ
- 本番 Auth の完全移行（開発用 seed を含む）

## 判断基準
- `db reset` が毎回成功するか
- 予約画面で `api/*` が 500 にならないか
- `profiles` が失われずログインできるか

## 期待効果
- ローカル検証の再現性向上
- 予約機能の安定動作
- API/DB不整合による開発コストの削減

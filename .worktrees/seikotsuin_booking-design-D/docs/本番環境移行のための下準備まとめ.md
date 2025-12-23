# 本番環境移行のための下準備まとめ

最終更新: 2025-09-22 / 作成: Codex CLI アシスタント

## 目的
- 代替スキーマ（`master_*`, `daily_ai_comments` 等）から、フロントエンドが想定する正規スキーマ（`treatment_menus`, `treatment_menu_records`, `ai_comments` ほか）へ整合性を持って移行できる状態を整える。
- リポジトリからダミー/サンプルのシードを排除し、本番データのみで運用可能にする。

## 今回のリポジトリ変更点
- ダミー/サンプルシードの削除:
  - 削除: `sql/seeds/0001_master_data.sql`
  - 削除: `sql/seeds/0002_tenants_and_users.sql`
  - 削除: `sql/seeds/0003_sample_patients_visits_revenues.sql`
  - 削除: `sql/seeds/0004_daily_reports_and_ai.sql`
- 本番適用用SQLの追加:
  - クリーニング: `sql/cleanup/remove_dummy_data.sql`
  - 正規テーブル作成 + 旧スキーマからの最低限の移行: `sql/migrations/20250922_add_canonical_tables_and_migrate.sql`

## 追加SQLの役割
### sql/cleanup/remove_dummy_data.sql
- 目的: 既存DBから seed 由来のデータを安全に削除（テーブル存在チェック付き）。
- 削除対象:
  - `daily_ai_comments` の seed マーク付きデータ（`raw_ai_response` の JSON に `"source":"seed"`）
  - `clinics` の A/B/HQ（名称一致）
  - `user_permissions` の seed ユーザー（`admin@group`, `manager.a`, `therapist.a`, `manager.b`, `therapist.b`）

### sql/migrations/20250922_add_canonical_tables_and_migrate.sql
- 目的: 正規テーブル作成（IF NOT EXISTS）と旧スキーマからの安全な取り込み。
- 作成テーブル: `menu_categories`, `treatment_menus`, `treatments`（最小構成）, `treatment_menu_records`, `ai_comments`
- 付随: インデックス（IF NOT EXISTS）、`updated_at` 自動更新トリガー、基本的な CHECK 制約（例: `confidence_score` を 0–1 に制限、金額の非負、数量>0）。
- データ移行:
  - `master_treatment_menus` → `treatment_menus`（グローバル扱い、`clinic_id` は NULL）
  - `daily_ai_comments` → `ai_comments`（単一テキストを単一要素の TEXT[] に変換）
- 既存の `clinics`, `patients`, `staff`, `daily_reports` 等に依存（存在が前提）。

## 本番適用手順（推奨）
1) バックアップ取得
- Supabase のプロジェクトスナップショット/自動バックアップを確認し、手動で直前バックアップを取得。

2) ダミーデータの削除（必要に応じて）
- SQL Editor で `sql/cleanup/remove_dummy_data.sql` を実行。
- 運用で seed データを既に削除済みの場合はスキップ可。

3) 正規テーブル作成 + 最低限の移行
- SQL Editor で `sql/migrations/20250922_add_canonical_tables_and_migrate.sql` を実行。
- 結果確認（件数・制約・インデックス反映）:
  - `SELECT COUNT(*) FROM treatment_menus;`
  - `SELECT COUNT(*) FROM ai_comments;`

4) 接続テスト
- API もしくは Supabase クエリから新テーブルに対する基本 CRUD（読み取り）を確認。

5) 旧テーブルの扱い
- 旧 `master_*`/`daily_ai_comments` は現時点では残置。影響調査後に DROP を実行（DROP スクリプトは別途用意予定）。

## 実行上の注意
- `uuid_generate_v4()` を使うため、`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` を先行実行（マイグレーションSQL内で実施）。
- 既存データとのユニーク制約・FK 競合に注意（例: `treatment_menus (clinic_id, code)` の NULL 挙動）。
- `updated_at` はトリガーで自動更新されます（対象テーブルにトリガー付与済み）。
- 幾つかの DECIMAL は Supabase 経由で文字列になるため、API 層で数値変換の運用方針を統一。

## 確認チェックリスト（抜粋）
- [ ] `treatment_menus`/`treatment_menu_records`/`ai_comments` が作成済み
- [ ] インデックスが存在（`idx_treatment_menus_*`, `idx_treatment_menu_records_*`, `idx_ai_comments_*`）
- [ ] 既存アプリから新テーブルの読み取りが成功
- [ ] 不要な seed データが残っていない
- [ ] 旧 `master_*` テーブルは移行に使われていない（参照の切り替え完了）

## 今後やるべきこと（優先度順）
1) RLS の有効化とポリシー定義（必須）
- 例（雛形）:
```sql
ALTER TABLE public.treatment_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_treatment_menus_select ON public.treatment_menus
  FOR SELECT USING (
    clinic_id IS NULL OR clinic_id = auth.uid()::uuid -- 例: 実運用の組織/テナント判定に合わせて修正
  );
-- UPDATE/INSERT/DELETE も同様に作成
```
- 実際は組織/テナント判定用のテーブル/ビューを参照する条件に差し替える。

2) 旧スキーマの整理
- `master_*`, `daily_ai_comments` を「参照停止→バックアップ→DROP」の順で廃止。
- DROP 用 SQL を作成し、影響範囲レビューの上で適用。

3) アプリ側のダミー/モックの無効化
- 本番ビルドで `mock`/`demo` コンポーネントを読み込まないようにガード、または削除。
- 対象例: `src/components/revenue/menu-ranking.tsx`, `src/app/ai-insights/page.tsx` など。

4) 型とDTOの整理
- DB型（スネークケース）とDTO/フロント型（キャメルケース）を分離し、API 層で変換を統一。
- DECIMAL→文字列の取り扱い方針を確定（API 層で数値変換 or 型定義で string）。

5) 運用まわり
- マイグレーションを CI/CD に組み込み（実行順・冪等性を担保）。
- 監査ログ/変更監視（DDL/DML）・DBアラートの整備。
- バックアップ/ロールバック手順の Runbook 化。

## リスクとロールバック
- リスク:
  - 旧スキーマ参照が残っている場合のアプリ不整合
  - 外部キーの存在/順序に起因するマイグレーション失敗
- ロールバック:
  - 直前スナップショットへ復元
  - 新規作成テーブルのみを TRUNCATE/DROP で撤回（必要時）

## 付録: 実行手順（SQL Editor）
1. `sql/cleanup/remove_dummy_data.sql` を貼り付けて実行（必要時）
2. `sql/migrations/20250922_add_canonical_tables_and_migrate.sql` を貼り付けて実行
3. 動作確認のための簡易クエリ:
```sql
SELECT COUNT(*) AS menus FROM public.treatment_menus;
SELECT COUNT(*) AS ai_comments FROM public.ai_comments;
```

---
本ドキュメントは移行の下準備（リポジトリ整備と最低限のDDL/DML）をまとめたものです。RLS と旧スキーマの廃止は、影響確認のうえ別途実施してください。

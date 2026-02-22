# Spec: 20260218000100 Legacy Deprecation Compatibility Fix v0.1

## Purpose
- `supabase db push --local` が `public.master_treatment_menus` 不在環境で停止する問題を解消する。
- 既存環境（テーブル存在）では従来どおり COMMENT/RLS ポリシーを適用する。

## Scope
- 対象: `supabase/migrations/20260218000100_deprecate_legacy_tables.sql`
- 非対象: 他マイグレーションの機能変更、権限モデル変更

## Change Plan
1. `COMMENT ON TABLE public.master_treatment_menus` を存在チェック付き実行に変更する。
2. `master_treatment_menus` 向けの RLS/policy 作成処理を存在チェック付き実行に変更する。
3. テーブル不在時は `RAISE WARNING` でスキップを明示する。

## Risk
- 低: 既存テーブルに対する処理は維持し、非存在時の停止のみ回避する。

## Rollback Plan
1. 本修正を取り消し、`20260218000100_deprecate_legacy_tables.sql` を元に戻す。
2. 代替として、`public.master_treatment_menus` を事前作成した上で `supabase db push --local` を再実行する。


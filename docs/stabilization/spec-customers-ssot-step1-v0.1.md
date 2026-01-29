# Customers SSOT Step 1 Spec v0.1

## Goal
- 患者マスタの正（SSOT）を `public.customers` に統一する。
- `public.patients` への新規書き込みを停止し、分裂を防ぐ。
- 影響を最小化するため、Step 1 はサーバーAPIの書き込み制限のみとする。

## Scope
- `/api/patients` の **書き込み禁止**（POST/PATCH/DELETE は受け付けない）。
- `/api/customers` を **唯一の書き込み経路** とする。
- 既存の分析系は `patient_visit_summary` を継続利用（参照のみ）。
- スキーマ変更・データ移行は行わない（Step 1 はドキュメント＋API制御のみ）。

## Non-goals
- テーブル統合（patients → customers）やデータバックフィル。
- 既存ビューや関数の全面置換。
- RLSの大規模再設計（既存の `can_access_clinic` を維持）。

## Current State (Reference)
- 旧患者テーブル: `public.patients`（レガシー）  
  - `supabase/migrations/20250817000100_schema.sql`
- 新顧客テーブル: `public.customers`（予約系のSSOT）  
  - `supabase/migrations/20251104000100_reservation_system_schema.sql`
- `/api/patients` は非推奨だが POST で `patients` に書き込む  
  - `src/app/api/patients/route.ts` (POST)
- `/api/customers` は customers に書き込み済み  
  - `src/app/api/customers/route.ts` (POST/PATCH)
- 分析は `patient_visit_summary` を利用（新スキーマ対応済み）  
  - `src/lib/services/patient-analysis-service.ts`  
  - `supabase/migrations/20251224002000_recreate_ai_insights_views.sql`

## Decision (Step 1)
- `public.customers` を SSOT とする。
- `public.patients` は **読み取り専用のレガシー** とする。
- 新規作成・更新は **必ず `/api/customers`** から行う。

## Implementation Plan (Step 1)
1) `/api/patients` の書き込みを停止
   - POST は `405` を返す（元々 PATCH/DELETE は未実装）。
   - 防御的に PATCH/DELETE ハンドラーも `405` を返すよう追加。
   - 代替エンドポイントとして `/api/customers` を提示。
2) `/api/customers` の利用を強制
   - UI/クライアント側の作成・更新は `/api/customers` のみに限定。
3) 影響範囲の確認
   - API経路: `rg -n "/api/patients" src` で書き込みルートを洗い出し。
   - 直書き経路: `rg -n "from\(['\"]patients['\"]\).*\.(insert|update|delete|upsert)" src` で Supabase 直書きを検出。
   - 結果: 本番コードに直書き経路なし（テストファイルのみ）。

## Rollback Plan
- `/api/patients` の書き込みを一時復帰（旧実装に戻す）。
- 既存UIのAPI呼び出しを復元。

## DoD Mapping (Stabilization)
- DOD-08: 既存RLSの `can_access_clinic` を継続使用。
- DOD-09: クライアントが `patients` 直書きに戻らないことを確認。
  - 検証1: `/api/patients` POST → 405 を返す
  - 検証2: `api.patients.create()` → `/api/customers` にリダイレクト済み
  - 検証3: `from('patients')` 直書き → 本番コードに存在しないことを確認済み
- DOD-10: ビルドが通ること（API変更のみ）。

## Risks
- `patients` に依存する既存機能が更新されない（SSOTの分裂）。
- 書き込み停止により旧クライアントがエラーになる可能性。

## Acceptance Criteria
- `/api/patients` による新規作成・更新が不可能。
- `/api/customers` からのみ顧客データが作成・更新される。
- 既存の分析画面は引き続き表示できる（読み取りのみ）。

# Reservations SSOT Step 1 Spec v0.1

## Goal
- 予約の正（SSOT）を `public.reservations` に統一する。
- `public.appointments` への新規書き込みを停止し、二重管理を防ぐ。
- 影響を最小化するため、Step 1 は書き込み停止 + 既存導線の確認に限定する。

## Scope
- `public.appointments` を **読み取り専用** にする（INSERT/UPDATE/DELETE を禁止）。
- 予約の作成・更新は `/api/reservations` を **唯一の書き込み経路** とする。
- 既存の画面/ロジックは保持し、データ移行やテーブル統合は行わない。

## Non-goals
- `appointments` → `reservations` のデータ移行（バックフィル）。
- `appointments` テーブルの削除・リネーム。
- 予約ドメインの再設計（ステータスやリソースモデルの統合）。
- `public.user_role()` を `public.get_current_role()` に置換する全面改修。

## Current State (Reference)
- 旧予約テーブル: `public.appointments`
  - `supabase/migrations/20250817000400_appointments.sql`
- 新予約テーブル: `public.reservations`
  - `supabase/migrations/20251104000100_reservation_system_schema.sql`
- 予約系の clinic_id 追加
  - `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`
- 予約系のRLS
  - `supabase/migrations/20251104000200_reservation_system_rls.sql`
- 旧予約テーブルのRLS強化（現状のポリシー起点）
  - `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`
- 予約UIは `appointments` 名称だが `/api/reservations` を利用
  - `src/app/reservations/api.ts`
  - `src/app/reservations/hooks/useAppointments.ts`

## Decision (Step 1)
- SSOT は `public.reservations` に固定する。
- `public.appointments` は **読み取り専用のレガシー** とする。
- 書き込みは `/api/reservations` を唯一の導線とする。

## Implementation Plan (Step 1)
1) `public.appointments` の書き込みをDBレベルで遮断
   - 既存の INSERT/UPDATE/DELETE ポリシーを削除し、SELECT のみ許可する。
   - 既存のRLS基準に合わせて `public.get_current_role()` と
     `public.can_access_clinic(appointments.clinic_id)` を使用する。
   - 例外として必要なら `service_role` のみ INSERT を許可（バックフィル用）。
2) アプリ側の書き込み経路を再確認
   - `rg -n "from\\(['\"]appointments['\"]\\).*\\.(insert|update|delete|upsert)" src`
     で直接書き込みが無いことを確認。
   - `src/app/reservations/api.ts` が `/api/reservations` を使っていることを維持。
3) ドキュメント上のSSOT表記を統一
   - `src/database/README.md` の予約説明に
     「reservations がSSOT / appointments はレガシー」注記を追加。

## Status (Local)
- 実装済み: `supabase/migrations/20260126000200_appointments_read_only.sql`
- 実装済み: `supabase/migrations/20260126000300_appointments_read_only_role_alignment.sql`
- 実装済み: `src/database/README.md` のSSOT注記
- 検証結果: `docs/stabilization/spec-reservations-ssot-step1-rls-migration-v0.1.md`

## Rollback Plan
- `public.appointments` の旧ポリシーを復元し、書き込みを再許可する。
- `REVOKE` を行った場合は旧権限に戻す。

## DoD Mapping (Stabilization)
- DOD-08: `appointments` のRLSが `can_access_clinic` を使用し、役割判定を統一。
- DOD-09: `appointments` への直接書き込み導線がないことを `rg` で確認。
- DOD-02: 追加マイグレーションが再実行可能であることを確認。
- DOD-10: API変更のみでビルドが通ることを確認。

## Risks
- レガシー機能が `appointments` に書き込もうとして失敗する可能性。
- 二重テーブルの前提を持つバッチ/分析が想定外のエラーになる可能性。

## Acceptance Criteria
- 認証済みユーザーによる `appointments` の INSERT/UPDATE/DELETE が拒否される。
- `/api/reservations` 経由の予約作成・更新が維持される。
- `appointments` 直書きのクライアント経路が存在しない。

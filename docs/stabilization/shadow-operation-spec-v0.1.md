# シャドー運用仕様書 v0.1（予約 + 顧客データ）

## 目的
- MVP前の1ヶ月・手動シャドー運用の実現性を検証する。
- 予約が予約表に反映され、顧客データが保存され、予約起点の分析が使えることを確認する。
- 外部連携は使わず、手入力のみで運用する。
- LLMチャットはAPI未接続（ルールベース）で運用する。

## スコープ
### 対象
- 予約の作成/更新/キャンセルと予約表への反映。
- 予約と紐づく顧客データの登録/更新。
- 予約UIに必要なメニュー/リソースのマスタ管理。
- 予約ベースの分析:
  - AIインサイトのサマリ。
  - 患者分析（転換/セグメント）。
- 必要に応じて日報の手動入力。

### 対象外
- 外部予約連携/通知（LINE/Webウィジェット/DWH）。
- 自動の売上/来院データ連携。
- LLM API連携。

## 前提
### Supabaseスキーマ（本番）
`supabase/migrations` を順番に適用。特に以下は必須:
- 予約基盤: `supabase/migrations/20251104000100_reservation_system_schema.sql`
- 予約RLS + 権限: `supabase/migrations/20251104000200_reservation_system_rls.sql`
- clinic_id 付与 + `reservation_list_view`: `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`
- 予約ベース分析ビュー: `supabase/migrations/20251224002000_recreate_ai_insights_views.sql`
- 旧分析テーブル/関数: `supabase/migrations/20250817000100_schema.sql`,
  `supabase/migrations/20250817000200_functions.sql`

### RLS
- RLS本体は `src/api/database/rls-policies.sql`。
- APIは `src/lib/supabase/guards.ts` の `ensureClinicAccess` でテナント境界を強制。

### 本番環境変数
`DEPLOYMENT_CHECKLIST.md` と `.env.production.example` に従う。
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_DEFAULT_CLINIC_ID`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  （未設定なら `src/lib/rate-limiting/middleware.ts` でレート制限無効）
AIインサイトは `src/app/api/ai-insights/route.ts` の `GEMINI_API_KEY` を参照
（未設定時はフォールバック応答）。

## データモデル（Supabase）
### 予約ドメイン
- `public.clinics`（テナント基本）: `supabase/migrations/20250817000100_schema.sql`
- `public.customers`: `supabase/migrations/20251104000100_reservation_system_schema.sql`
- `public.menus`: `supabase/migrations/20251104000100_reservation_system_schema.sql`
- `public.resources`: `supabase/migrations/20251104000100_reservation_system_schema.sql`
- `public.reservations`: `supabase/migrations/20251104000100_reservation_system_schema.sql`
- `clinic_id` 付与とインデックス: `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`
- `public.reservation_list_view`:
  `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`

### 予約ベース分析ビュー
`supabase/migrations/20251224002000_recreate_ai_insights_views.sql`:
- `public.daily_revenue_summary`
- `public.staff_performance_summary`
- `public.patient_visit_summary`

### 旧分析テーブル/関数（予約データからは自動で埋まらない）
`supabase/migrations/20250817000100_schema.sql`,
`supabase/migrations/20250817000200_functions.sql`:
- テーブル: `public.patients`, `public.visits`, `public.revenues`,
  `public.ai_comments`, `public.daily_reports`
- 関数/RPC: `calculate_patient_ltv`, `calculate_churn_risk_score`,
  `get_hourly_visit_pattern`, `get_hourly_revenue_pattern`

## API（サーバー）
### 予約/マスタ
- `GET /api/reservations` -> `reservation_list_view`:
  `src/app/api/reservations/route.ts`
- `POST /api/reservations` -> `reservations`:
  `src/app/api/reservations/schema.ts:mapReservationInsertToRow`
- `PATCH /api/reservations` -> `reservations`:
  `src/app/api/reservations/schema.ts:mapReservationUpdateToRow`
- `GET/POST/PATCH/DELETE /api/customers` -> `customers`:
  `src/app/api/customers/route.ts`
- `GET/POST/PATCH/DELETE /api/menus` -> `menus`:
  `src/app/api/menus/route.ts`
- `GET/POST/PATCH/DELETE /api/resources` -> `resources`:
  `src/app/api/resources/route.ts`

### 分析
- `GET /api/ai-insights` -> `daily_revenue_summary`,
  `staff_performance_summary`, `patient_visit_summary`:
  `src/app/api/ai-insights/route.ts`
- `GET /api/customers/analysis` -> `patient_visit_summary` +
  `calculate_patient_ltv`/`calculate_churn_risk_score`:
  `src/app/api/customers/analysis/route.ts`,
  `src/lib/services/patient-analysis-service.ts`
- `GET /api/ai-comments` -> `daily_revenue_summary` + `ai_comments` upsert:
  `src/app/api/ai-comments/route.ts`

### 運用ダッシュボード
- `GET /api/dashboard` -> `daily_revenue_summary` + `visits` +
  `get_hourly_visit_pattern`:
  `src/app/api/dashboard/route.ts`
- `GET /api/revenue` -> `revenues` + `get_hourly_revenue_pattern`:
  `src/app/api/revenue/route.ts`
- `GET/POST/DELETE /api/daily-reports` -> `daily_reports`:
  `src/app/api/daily-reports/route.ts`
- `GET/POST /api/chat` -> `chat_sessions`, `chat_messages`:
  `src/app/api/chat/route.ts`

## UI（クライアント）
### 予約フロー
- 予約表/更新:
  - `src/app/reservations/page.tsx`
  - `src/app/reservations/hooks/useAppointments.ts`
  - `src/app/reservations/api.ts`
- 予約一覧/詳細:
  - `src/app/reservations/list/page.tsx`
  - `src/app/reservations/[id]/page.tsx`
- マスタ管理:
  - `src/app/reservations/settings/menus/page.tsx` -> `/api/menus`
  - `src/app/reservations/settings/resources/page.tsx` -> `/api/resources`

### 分析画面
- 患者分析: `src/app/patients/page.tsx`, `src/hooks/usePatientAnalysis.ts`
- AIインサイト: `src/app/ai-insights/page.tsx`

## 最小データ要件
予約起点の分析を表示するために必要:
- `clinics` が存在すること
  (`supabase/migrations/20250817000100_schema.sql`)。
- `menus`, `resources`, `customers` に `clinic_id` が入っていること
  (`supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`)。
- `resources.type = 'staff'` のスタッフが存在すること
  (`supabase/migrations/20251104000100_reservation_system_schema.sql`)。
- 予約の `status` を `arrived` / `completed` に更新すること
  (`supabase/migrations/20251224002000_recreate_ai_insights_views.sql` の条件)。
- `reservations.price` または `reservations.actual_price` が入っていること。
  ただし `/api/reservations` は price を設定しないため、
  `src/app/api/reservations/schema.ts` の
  `mapReservationInsertToRow`/`mapReservationUpdateToRow` 経由だけでは
  売上が 0 になる。

## 既知の制約
- ダッシュボードの患者数/ヒートマップは `visits` と
  `get_hourly_visit_pattern` 依存のため、予約だけでは空になりやすい
  (`src/app/api/dashboard/route.ts`,
   `supabase/migrations/20250817000200_functions.sql`)。
- 収益分析は `revenues` と `get_hourly_revenue_pattern` 依存で、
  予約だけでは反映されない
  (`src/app/api/revenue/route.ts`,
   `supabase/migrations/20250817000200_functions.sql`)。
- 患者LTV/離脱リスクは `calculate_patient_ltv`/
  `calculate_churn_risk_score` 依存のため、予約のみだと 0 に寄りやすい
  (`supabase/migrations/20250817000100_schema.sql`)。

## Stabilization DoD との紐付け
`docs/stabilization/DoD-v0.1.md`:
- DOD-01: Supabase起動確認（ローカル検証）。
- DOD-08: RLSテナント境界の一貫性。
- DOD-09: クライアントがサーバーAPI経由で clinic スコープを守る。
- DOD-10: ビルド再現性の確保。

## 受け入れ基準（シャドー運用）
- 同一クリニックの予約が予約表/一覧に反映される。
- 顧客を登録し、予約に紐づけられる。
- AIインサイトと患者分析が予約データで表示される。
- ダッシュボード/収益分析の制約が理解され、運用説明に含まれている。

# M0: KPI算出ロジック・データマッピング・初期投入計画

本書はM0成果物のうち「KPI算出ロジック・データマッピング表・初期投入データ計画書」に相当します。対象はDashboard/患者分析/日報機能で利用する主要指標であり、Supabase上のスキーマと整合した定義を記載します。

## 1. 対象KPI一覧と算出ロジック
| KPI名称 | 利用画面 | 算出ロジック | 対応テーブル/列 | 更新頻度 |
| --- | --- | --- | --- | --- |
| 月次売上合計 (`monthly_gross_revenue`) | ダッシュボード | `SUM(revenues.total_amount)` を `DATE_TRUNC('month', revenue_date)` で集計 | `revenues(total_amount, revenue_date, clinic_id)` | 日次夜間バッチ（22:00） |
| 施術件数 (`monthly_treatment_count`) | ダッシュボード | `COUNT(treatments.id)` を施術日で月次集計 | `treatments(treatment_date, clinic_id)` | 日次 |
| 新規患者数 (`monthly_new_patients`) | ダッシュボード/患者分析 | `COUNT(*) WHERE DATE_TRUNC('month', first_visit_date) = 対象月` | `patients(first_visit_date, clinic_id)` | 日次 |
| リピート率 (`monthly_repeat_rate`) | 患者分析 | `再来患者数 / 月内総患者数`。再来=当月来院が2回以上 | `visits_summary` ビュー（M1で作成） | 週次 |
| LTVトップ10 (`ltv_top_patients`) | 患者分析 | `patients.total_revenue` を降順ソート | `patients(total_revenue, clinic_id)` | 日次 |
| メニュー別売上構成比 (`menu_revenue_ratio`) | ダッシュボード | `SUM(treatment_menu_records.total_price)` をメニュー単位で集計し全体比率算出 | `treatment_menu_records(total_price, menu_id)` + `treatment_menus` | 日次 |
| 日報提出率 (`daily_report_completion_rate`) | 日報 | `submitted/営業予定医院数`。営業予定は `clinic_schedule` ビュー | `daily_reports(status, report_date)` / `clinics` | 毎営業日 22:30 |
| 施術者稼働率 (`staff_utilization_rate`) | ダッシュボード | `(施術対応件数 × 平均施術時間) / 勤務予定時間` | `treatments`, `staff_schedules` | 週次 |
| 離反リスク警告数 (`churn_risk_alerts`) | 患者分析 | `risk_score >= 70` の患者件数 | `patients(risk_score)` | 日次 |

※ `visits_summary`, `clinic_schedule`, `staff_schedules` はM1マイグレーションで作成するマテビュー/テーブル。

## 2. データマッピング表
| 業務データ | Supabaseテーブル | 主キー | 関連外部キー | メモ |
| --- | --- | --- | --- | --- |
| クリニック基本情報 | `public.clinics` | `id` | `profiles.clinic_id`, `revenues.clinic_id` | サービスプラン/営業時間を含む |
| ユーザープロファイル | `public.profiles` | `id` | `auth.users.id` | RLS用の `clinic_id` を保持 |
| 患者マスタ | `public.patients` | `id` | `revenues.patient_id`, `treatments.patient_id` | `total_revenue` と `risk_score` を集計で更新 |
| 施術記録 | `public.treatments` | `id` | `treatment_menu_records.treatment_id` | 予約と日報の中間データ |
| 施術メニュー実績 | `public.treatment_menu_records` | `id` | `treatment_menus.id` | 売上構成比算出に用いる |
| 売上明細 | `public.revenues` | `id` | `payments.revenue_id` | KPIの中心データ、`total_amount` は税込 |
| 日報 | `public.daily_reports` | `id` | `ai_comments.daily_report_id` | 提出率算出、CS連携 |
| 監査ログ | `audit_logs` (M2予定) | `id` | - | M3でモニタリング基盤に使用 |

## 3. KPI算出用マテリアライズドビュー
| View名 | 目的 | インデックス | リフレッシュ方法 |
| --- | --- | --- | --- |
| `mv_monthly_kpi_summary` | 月次売上・施術件数・日報提出率を1クエリで取得 | `(clinic_id, kpi_month)` にBTREE | `supabase-db` cron (平日 22:15) |
| `mv_patient_repeat_metrics` | 来院回数、平均間隔、離反リスクを含む患者指標 | `(clinic_id, patient_id)` | `supabase db refresh --schema public` (日次) |
| `mv_staff_productivity` | 施術者別稼働率・売上貢献 | `(clinic_id, staff_id, summary_date)` | 週次（日曜 23:00） |

※ M1で `sql/migrations/20251001_create_kpi_views.sql` を追加し、M2以降ダッシュボードから利用。

## 4. 初期投入データ計画
### 4.1 データソース
1. **本番稼働中の既存DWH**: BigQuery `prod_clinic_metrics` （最新12ヶ月）→ ステージングにサニタイズ転送
2. **マスタ情報**: `src/database/seed_data/01_initial_data.sql` を共通利用
3. **施術・売上ダミーデータ**: `sql/seeds/20251001_sample_transactions.sql`（本タスクで雛形を作成予定）

### 4.2 移行ステップ
1. DWHより `clinic_id`, `clinics.name`, `month`, KPI列を抽出 → CSV出力
2. Supabaseステージングで `COPY` コマンドを用い `stg_monthly_kpi_snapshot` テーブルへロード
3. `INSERT ... SELECT` で `revenues`, `treatments`, `treatment_menu_records`, `daily_reports` へ整形投入
4. ビューを `REFRESH MATERIALIZED VIEW` で更新しダッシュボード実データと突合
5. バリデーション: 既存BIと値差異±1%以内であることを確認

### 4.3 サンプルスキーマ（ステージング専用）
```sql
CREATE TABLE IF NOT EXISTS staging.stg_monthly_kpi_snapshot (
  clinic_external_id TEXT,
  clinic_name TEXT,
  kpi_month DATE,
  gross_revenue NUMERIC,
  treatment_count INTEGER,
  new_patients INTEGER,
  repeat_patients INTEGER,
  churn_alerts INTEGER,
  avg_ltv NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 検証項目
- `revenues` テーブルの `total_amount` 合計が `gross_revenue` と一致
- `daily_reports` の `status='submitted'` 件数が DWHの日報実績と一致
- `patients.total_revenue` の再計算結果がサンプリング10件で ±¥100 以内

## 5. タイムライン
| 週 | アクティビティ |
| --- | --- |
| W40 | DWH抽出手順確定、サンプルデータでロード検証 |
| W41 | 本番データサニタイズ、ステージングへの全量投入 |
| W42 | KPIビュー最終確定、ダッシュボードと数値突合 |

## 6. リスク・補足
- DWH側の `clinic_external_id` と Supabase `clinics.id` のマッピングに不整合がある場合、`clinic_mapping` テーブルを中継（M1マイグレーションで対応）
- KPI算出SQLは `sql/migrations` に管理してバージョン管理を徹底
- テストデータは `scripts/purge_staging_data.sql` で再投入可能にする（M1で作成）

---
この計画に基づき、M1ではマテビュー/マイグレーションの実装とステージング投入スクリプト化を進めます。

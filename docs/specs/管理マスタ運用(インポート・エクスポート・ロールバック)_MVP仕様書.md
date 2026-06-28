# 管理マスタ運用(インポート・エクスポート・ロールバック)_MVP仕様書（詳細版）

## 目的
- マスタ設定の輸入/輸出/ロールバックを提供する。

## 依存テーブル
- public.system_settings
- public.temporary_data
- public.audit_logs

## 仕様
### エクスポート
- system_settings を JSONで得る
- temporary_data に保存

### インポート
- JSONを一括反映
- 監査ログを記録

### ロールバック
- temporary_data のスナップショットを復元

## UI
- src/app/admin/(protected)/master/page.tsx

## 受け入れ基準
- 輸入/輸出/復元が動作する

## Implementation Notes
- Export API: GET /api/admin/master-data/export?clinic_id={global|uuid}
- Export response: { items: MasterDataDetail[], snapshot_key: string }
- Snapshot key: system_settings_snapshot:{global|uuid}
- Import API: POST /api/admin/master-data/import
- Import body: { items: MasterDataDetail[], clinic_id?: uuid|null }
- Import uses upsert on (clinic_id,key)
- Rollback API: POST /api/admin/master-data/rollback
- Rollback body: { clinic_id?: uuid|null }
- Rollback deletes target clinic data before restore

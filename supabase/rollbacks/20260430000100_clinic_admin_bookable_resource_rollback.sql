-- Rollback: clinic_admin を予約担当者候補へ補完したデータを戻す。

UPDATE public.resources
SET
  is_active = false,
  is_bookable = false,
  is_deleted = true,
  deleted_at = COALESCE(deleted_at, now()),
  updated_at = now()
WHERE staff_code LIKE 'clinic-admin-%';

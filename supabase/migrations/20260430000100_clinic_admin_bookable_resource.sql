-- clinic_admin は院長として予約担当者候補にも表示する。
-- 予約は resources(type = 'staff') を参照するため、既存 clinic_admin を bookable resource に補完する。

INSERT INTO public.resources (
  id,
  clinic_id,
  name,
  type,
  staff_code,
  email,
  max_concurrent,
  is_active,
  is_bookable,
  is_deleted,
  updated_at
)
SELECT
  staff.id,
  staff.clinic_id,
  staff.name,
  'staff',
  'clinic-admin-' || staff.id::text,
  staff.email,
  1,
  true,
  true,
  false,
  now()
FROM public.staff
WHERE staff.role IN ('clinic_admin', 'clinic_manager')
  AND staff.clinic_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  clinic_id = EXCLUDED.clinic_id,
  name = EXCLUDED.name,
  type = 'staff',
  email = EXCLUDED.email,
  max_concurrent = 1,
  is_active = true,
  is_bookable = true,
  is_deleted = false,
  updated_at = now()
WHERE public.resources.type = 'staff'
   OR public.resources.staff_code LIKE 'clinic-admin-%';

drop policy if exists "clinic_feature_flags_write_admin_only"
on public.clinic_feature_flags;

drop policy if exists "clinic_feature_flags_select_scoped"
on public.clinic_feature_flags;

drop trigger if exists update_clinic_feature_flags_updated_at
on public.clinic_feature_flags;

drop table if exists public.clinic_feature_flags;

-- ================================================================
-- MFA RLS role alignment (clinic_admin)
-- ================================================================

ALTER TABLE public.user_mfa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_usage_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view clinic MFA settings" ON public.user_mfa_settings;
CREATE POLICY "Admins can view clinic MFA settings" ON public.user_mfa_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.clinic_id = user_mfa_settings.clinic_id
        AND p.role IN ('admin', 'clinic_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can view MFA usage stats" ON public.mfa_usage_stats;
CREATE POLICY "Admins can view MFA usage stats" ON public.mfa_usage_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.clinic_id = mfa_usage_stats.clinic_id
        AND p.role IN ('admin', 'clinic_admin')
    )
  );

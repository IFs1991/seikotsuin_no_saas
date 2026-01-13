-- Admin clinics/user_permissions policies and indexes (Phase A)

CREATE INDEX IF NOT EXISTS idx_clinics_is_active ON public.clinics(is_active);

CREATE INDEX IF NOT EXISTS idx_user_permissions_staff_id
  ON public.user_permissions(staff_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_clinic_id
  ON public.user_permissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_role
  ON public.user_permissions(role);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Clinics: admin can manage all, non-admin can read own clinic only
CREATE POLICY "clinics_admin_select"
  ON public.clinics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

CREATE POLICY "clinics_own_select"
  ON public.clinics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND clinic_id = clinics.id
    )
  );

CREATE POLICY "clinics_admin_insert"
  ON public.clinics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

CREATE POLICY "clinics_admin_update"
  ON public.clinics
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- User permissions: admin manage, users can read own permissions
CREATE POLICY "user_permissions_admin_manage"
  ON public.user_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

CREATE POLICY "user_permissions_self_select"
  ON public.user_permissions
  FOR SELECT
  USING (staff_id = auth.uid());

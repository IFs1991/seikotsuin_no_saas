-- clinic_settings RLS alignment for profiles and user_permissions

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_settings_clinic_member_select" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_insert" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_update" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_delete" ON public.clinic_settings;

CREATE POLICY "clinic_settings_clinic_member_select"
    ON public.clinic_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
        )
    );

CREATE POLICY "clinic_settings_admin_insert"
    ON public.clinic_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

CREATE POLICY "clinic_settings_admin_update"
    ON public.clinic_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role IN ('admin', 'clinic_manager', 'manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

CREATE POLICY "clinic_settings_admin_delete"
    ON public.clinic_settings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role = 'admin'
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role = 'admin'
        )
    );

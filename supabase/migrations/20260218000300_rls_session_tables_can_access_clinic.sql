-- ================================================================
-- Phase 3: Session Tables RLS - can_access_clinic() 統一
-- ================================================================
-- 問題: セッション系テーブル（user_sessions, security_events,
--       session_policies, registered_devices）のRLSがパターンC
--       （auth.jwt() ->> 'clinic_id' 直書き）で、
--       can_access_clinic()を使用しておらず、親子クリニック構造で
--       siblingアクセスが不可能。
-- 対応: パターンB（get_current_role() + can_access_clinic()）に統一
-- リスク: 中（セッション管理に影響）
-- ロールバック: 各ポリシーDROP + 旧ポリシー再作成
-- ================================================================

BEGIN;

-- ================================================================
-- 1. user_sessions テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Clinic admins can view all clinic sessions" ON public.user_sessions;

-- ユーザー自身: 自テナント内の自分のセッション参照
CREATE POLICY "user_sessions_self_select"
ON public.user_sessions FOR SELECT
USING (
    auth.uid() = user_id
    AND public.can_access_clinic(clinic_id)
);

-- ユーザー自身: 自テナント内でセッション作成
CREATE POLICY "user_sessions_self_insert"
ON public.user_sessions FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    AND public.can_access_clinic(clinic_id)
);

-- ユーザー自身: 自テナント内の自分のセッション更新
CREATE POLICY "user_sessions_self_update"
ON public.user_sessions FOR UPDATE
USING (
    auth.uid() = user_id
    AND public.can_access_clinic(clinic_id)
);

-- クリニック管理者: 自テナントの全セッション参照
CREATE POLICY "user_sessions_admin_select"
ON public.user_sessions FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- クリニック管理者: 自テナントのセッション削除（強制ログアウト用）
CREATE POLICY "user_sessions_admin_delete"
ON public.user_sessions FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 2. security_events テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除（SELECT系のみ。INSERT は service_role 限定に修正済み）
DROP POLICY IF EXISTS "Users can view their own security events" ON public.security_events;
DROP POLICY IF EXISTS "Clinic admins can view all clinic security events" ON public.security_events;
DROP POLICY IF EXISTS "Clinic admins can update security events" ON public.security_events;

-- ユーザー自身: 自分のセキュリティイベント参照
-- clinic_id IS NULL のイベントは自分のものでも admin のみ閲覧可能
CREATE POLICY "security_events_self_select"
ON public.security_events FOR SELECT
USING (
    auth.uid() = user_id
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND public.jwt_is_admin())
    )
);

-- クリニック管理者: 自テナントの全セキュリティイベント参照
-- clinic_id IS NULL のグローバルイベントは admin のみ（audit_logs と一貫性を保つ）
CREATE POLICY "security_events_admin_select"
ON public.security_events FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND public.jwt_is_admin())
    )
);

-- クリニック管理者: 自テナントのセキュリティイベント更新（アクノレッジ等）
CREATE POLICY "security_events_admin_update"
ON public.security_events FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND public.jwt_is_admin())
    )
);

-- ================================================================
-- 3. session_policies テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "Clinic admins can manage session policies" ON public.session_policies;

-- クリニック管理者: 自テナントのセッションポリシー全操作
CREATE POLICY "session_policies_admin_all"
ON public.session_policies FOR ALL
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
)
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- スタッフ: 自テナントのセッションポリシー参照（自身のポリシー確認用）
CREATE POLICY "session_policies_staff_select"
ON public.session_policies FOR SELECT
USING (
    public.get_current_role() IN ('manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 4. registered_devices テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "Users can manage their own devices" ON public.registered_devices;
DROP POLICY IF EXISTS "Clinic admins can view all clinic devices" ON public.registered_devices;

-- ユーザー自身: 自テナント内の自分のデバイス全操作
CREATE POLICY "registered_devices_self_all"
ON public.registered_devices FOR ALL
USING (
    auth.uid() = user_id
    AND public.can_access_clinic(clinic_id)
)
WITH CHECK (
    auth.uid() = user_id
    AND public.can_access_clinic(clinic_id)
);

-- クリニック管理者: 自テナントの全デバイス参照
CREATE POLICY "registered_devices_admin_select"
ON public.registered_devices FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

COMMIT;

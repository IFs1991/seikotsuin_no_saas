-- ================================================================
-- 整骨院管理SaaS - オンボーディング機能
-- ================================================================
-- 作成日: 2025-12-25
-- 説明: オンボーディング機能のテーブル定義・RLSポリシー
-- 参照: docs/onboarding_spec.md
-- ================================================================

-- ================================================================
-- 1. onboarding_states テーブル（進捗管理）
-- ================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    current_step VARCHAR(20) NOT NULL DEFAULT 'profile'
        CHECK (current_step IN ('profile', 'clinic', 'invites', 'seed', 'completed')),
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_onboarding_states_user_id
    ON public.onboarding_states(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_states_current_step
    ON public.onboarding_states(current_step);
CREATE INDEX IF NOT EXISTS idx_onboarding_states_clinic_id
    ON public.onboarding_states(clinic_id);

-- コメント
COMMENT ON TABLE public.onboarding_states IS 'オンボーディング進捗管理テーブル';
COMMENT ON COLUMN public.onboarding_states.current_step IS 'profile/clinic/invites/seed/completed';

-- ================================================================
-- 2. staff_invites テーブル（招待管理）
-- ================================================================
CREATE TABLE IF NOT EXISTS public.staff_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'staff'
        CHECK (role IN ('admin', 'clinic_manager', 'therapist', 'staff', 'manager')),
    token UUID NOT NULL DEFAULT uuid_generate_v4(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES auth.users(id),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 同一クリニック・メール重複を防止
    UNIQUE(clinic_id, email)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_staff_invites_clinic_id
    ON public.staff_invites(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_invites_email
    ON public.staff_invites(email);
CREATE INDEX IF NOT EXISTS idx_staff_invites_token
    ON public.staff_invites(token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_expires_at
    ON public.staff_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_staff_invites_created_by
    ON public.staff_invites(created_by);

-- コメント
COMMENT ON TABLE public.staff_invites IS 'スタッフ招待管理テーブル';
COMMENT ON COLUMN public.staff_invites.token IS '招待トークン（7日間有効）';

-- ================================================================
-- 3. トリガー：updated_at の自動更新
-- ================================================================

-- onboarding_states用トリガー
DROP TRIGGER IF EXISTS update_onboarding_states_updated_at ON public.onboarding_states;
CREATE TRIGGER update_onboarding_states_updated_at
    BEFORE UPDATE ON public.onboarding_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- staff_invites用トリガー
DROP TRIGGER IF EXISTS update_staff_invites_updated_at ON public.staff_invites;
CREATE TRIGGER update_staff_invites_updated_at
    BEFORE UPDATE ON public.staff_invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- 4. RLS ポリシー
-- ================================================================

-- RLS有効化
ALTER TABLE public.onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- onboarding_states ポリシー
-- ----------------------------------------------------------------

-- ユーザーは自分のonboarding_stateのみ参照可能
CREATE POLICY "onboarding_states_self_select"
    ON public.onboarding_states
    FOR SELECT
    USING (user_id = auth.uid());

-- ユーザーは自分のonboarding_stateを作成可能
CREATE POLICY "onboarding_states_self_insert"
    ON public.onboarding_states
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ユーザーは自分のonboarding_stateを更新可能
CREATE POLICY "onboarding_states_self_update"
    ON public.onboarding_states
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ユーザーは自分のonboarding_stateを削除可能
CREATE POLICY "onboarding_states_self_delete"
    ON public.onboarding_states
    FOR DELETE
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- staff_invites ポリシー
-- ----------------------------------------------------------------

-- 招待者は自分が作成した招待を管理可能（CRUD）
CREATE POLICY "staff_invites_creator_select"
    ON public.staff_invites
    FOR SELECT
    USING (created_by = auth.uid());

CREATE POLICY "staff_invites_creator_insert"
    ON public.staff_invites
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "staff_invites_creator_update"
    ON public.staff_invites
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "staff_invites_creator_delete"
    ON public.staff_invites
    FOR DELETE
    USING (created_by = auth.uid());

-- 同一クリニックのadmin/managerも招待を閲覧可能
CREATE POLICY "staff_invites_clinic_admin_select"
    ON public.staff_invites
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

-- ================================================================
-- 5. クリニック作成用RPC関数（トランザクション）
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_clinic_with_admin(
    p_name TEXT,
    p_address TEXT DEFAULT NULL,
    p_phone_number TEXT DEFAULT NULL,
    p_opening_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_clinic_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
    END IF;

    -- ユーザーのメールアドレスを取得
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    -- 1. クリニック作成
    INSERT INTO public.clinics (name, address, phone_number, opening_date, is_active)
    VALUES (p_name, p_address, p_phone_number, p_opening_date, true)
    RETURNING id INTO v_clinic_id;

    -- 2. プロフィール更新
    UPDATE public.profiles
    SET clinic_id = v_clinic_id, role = 'admin', updated_at = NOW()
    WHERE user_id = v_user_id;

    -- 3. user_permissions作成/更新
    INSERT INTO public.user_permissions (staff_id, clinic_id, role, username, hashed_password)
    VALUES (v_user_id, v_clinic_id, 'admin', COALESCE(v_user_email, ''), 'managed_by_supabase')
    ON CONFLICT (staff_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role;

    -- 4. オンボーディング状態更新
    INSERT INTO public.onboarding_states (user_id, clinic_id, current_step)
    VALUES (v_user_id, v_clinic_id, 'invites')
    ON CONFLICT (user_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, current_step = 'invites', updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ================================================================
-- 6. 招待トークン検証用RPC関数
-- ================================================================

-- トークンで招待情報を取得（RLSバイパス）
CREATE OR REPLACE FUNCTION public.get_invite_by_token(invite_token UUID)
RETURNS TABLE (
    id UUID,
    clinic_id UUID,
    email VARCHAR(255),
    role VARCHAR(50),
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    clinic_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        si.id,
        si.clinic_id,
        si.email,
        si.role,
        si.expires_at,
        si.accepted_at,
        c.name AS clinic_name
    FROM public.staff_invites si
    LEFT JOIN public.clinics c ON c.id = si.clinic_id
    WHERE si.token = invite_token
    AND si.expires_at > NOW()
    AND si.accepted_at IS NULL;
END;
$$;

-- 招待を受諾
CREATE OR REPLACE FUNCTION public.accept_invite(invite_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
    END IF;

    -- 招待を取得
    SELECT * INTO v_invite
    FROM public.staff_invites
    WHERE token = invite_token
    AND expires_at > NOW()
    AND accepted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '有効な招待が見つかりません');
    END IF;

    -- 招待を受諾済みに更新
    UPDATE public.staff_invites
    SET accepted_at = NOW(), accepted_by = v_user_id, updated_at = NOW()
    WHERE id = v_invite.id;

    -- プロフィールを更新
    UPDATE public.profiles
    SET clinic_id = v_invite.clinic_id, role = v_invite.role, updated_at = NOW()
    WHERE user_id = v_user_id;

    -- user_permissionsを作成/更新
    INSERT INTO public.user_permissions (staff_id, clinic_id, role, username, hashed_password)
    VALUES (v_user_id, v_invite.clinic_id, v_invite.role, v_invite.email, 'managed_by_supabase')
    ON CONFLICT (staff_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role;

    RETURN jsonb_build_object('success', true, 'clinic_id', v_invite.clinic_id);
END;
$$;

-- ================================================================
-- 完了メッセージ
-- ================================================================
DO $$
BEGIN
    RAISE NOTICE 'オンボーディングテーブルの作成が完了しました。';
    RAISE NOTICE 'テーブル: onboarding_states, staff_invites';
    RAISE NOTICE 'RPC関数: get_invite_by_token, accept_invite';
    RAISE NOTICE 'RLSポリシー: 自己アクセス制限、クリニック管理者閲覧';
END $$;

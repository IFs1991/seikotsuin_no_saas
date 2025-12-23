-- ================================================================
-- Supabase Auth profiles table
-- ================================================================
-- 作成日: 2025-08-17
-- 説明: auth.users と紐づくユーザープロファイル

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone_number VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'staff',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    language_preference VARCHAR(10) DEFAULT 'ja',
    timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_clinic_id ON public.profiles(clinic_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_active ON public.profiles(is_active);
CREATE INDEX idx_profiles_email ON public.profiles(email);

COMMENT ON TABLE public.profiles IS 'auth.usersと対応するユーザープロファイル情報';

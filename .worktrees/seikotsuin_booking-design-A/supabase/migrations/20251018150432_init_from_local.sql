-- Canonical tables + safe data migration from legacy/alt schema
-- Intended for production use. Idempotent where possible.
BEGIN;

-- Ensure UUID function availability
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Create menu_categories (canonical)
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color_code VARCHAR(7) DEFAULT '#3B82F6',
  icon_name VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Create treatment_menus (canonical)
CREATE TABLE IF NOT EXISTS public.treatment_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE, -- NULL: global menu
  category_id UUID REFERENCES public.menu_categories(id),
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(8, 2) NOT NULL CHECK (price >= 0),
  duration_minutes INTEGER DEFAULT 30 CHECK (duration_minutes > 0),
  is_insurance_applicable BOOLEAN DEFAULT false,
  insurance_points INTEGER,
  max_sessions_per_day INTEGER,
  required_qualifications TEXT[],
  body_parts TEXT[],
  treatment_type VARCHAR(50),
  equipment_required TEXT[],
  contraindications TEXT[],
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT treatment_menus_code_clinic_unique UNIQUE (clinic_id, code)
);

-- 3) Create treatments (canonical minimal, to support FK from treatment_menu_records)
CREATE TABLE IF NOT EXISTS public.treatments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID UNIQUE REFERENCES public.appointments(id) ON DELETE SET NULL,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  primary_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  treatment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) Create treatment_menu_records (canonical)
CREATE TABLE IF NOT EXISTS public.treatment_menu_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_id UUID NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  menu_id UUID NOT NULL REFERENCES public.treatment_menus(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(8, 2) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(8, 2) NOT NULL CHECK (total_price >= 0),
  insurance_points INTEGER,
  insurance_coverage_amount DECIMAL(8, 2),
  patient_payment_amount DECIMAL(8, 2),
  duration_minutes INTEGER,
  performed_by UUID REFERENCES public.staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Create ai_comments (canonical)
CREATE TABLE IF NOT EXISTS public.ai_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  daily_report_id UUID REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  comment_date DATE NOT NULL,
  comment_type VARCHAR(50) DEFAULT 'daily_summary',
  summary TEXT NOT NULL,
  good_points TEXT[],
  improvement_points TEXT[],
  recommendations TEXT[],
  alerts TEXT[],
  insights TEXT[],
  ai_model_version VARCHAR(50),
  confidence_score DECIMAL(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  data_sources TEXT[],
  analysis_parameters JSONB,
  raw_ai_response JSONB,
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,
  is_helpful BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_comments_clinic_date_type_unique UNIQUE (clinic_id, comment_date, comment_type)
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_treatment_menus_clinic_id ON public.treatment_menus(clinic_id);
CREATE INDEX IF NOT EXISTS idx_treatment_menus_category ON public.treatment_menus(category_id);
CREATE INDEX IF NOT EXISTS idx_treatment_menus_active ON public.treatment_menus(is_active);
CREATE INDEX IF NOT EXISTS idx_treatment_menus_price ON public.treatment_menus(price);

CREATE INDEX IF NOT EXISTS idx_treatment_menu_records_treatment ON public.treatment_menu_records(treatment_id);
CREATE INDEX IF NOT EXISTS idx_treatment_menu_records_menu ON public.treatment_menu_records(menu_id);
CREATE INDEX IF NOT EXISTS idx_treatment_menu_records_staff ON public.treatment_menu_records(performed_by);

CREATE INDEX IF NOT EXISTS idx_ai_comments_clinic_date ON public.ai_comments(clinic_id, comment_date);
CREATE INDEX IF NOT EXISTS idx_ai_comments_type ON public.ai_comments(comment_type);
CREATE INDEX IF NOT EXISTS idx_ai_comments_confidence ON public.ai_comments(confidence_score);

-- updated_at auto-update trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_menu_categories'
  ) THEN
    CREATE TRIGGER set_updated_at_menu_categories
    BEFORE UPDATE ON public.menu_categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_treatment_menus'
  ) THEN
    CREATE TRIGGER set_updated_at_treatment_menus
    BEFORE UPDATE ON public.treatment_menus
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_treatments'
  ) THEN
    CREATE TRIGGER set_updated_at_treatments
    BEFORE UPDATE ON public.treatments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_ai_comments'
  ) THEN
    CREATE TRIGGER set_updated_at_ai_comments
    BEFORE UPDATE ON public.ai_comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Data migration from alternative schema (safe if source tables exist)

-- 6) Migrate master_treatment_menus -> treatment_menus (as global menus)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='master_treatment_menus'
  ) THEN
    INSERT INTO public.treatment_menus (
      id, clinic_id, category_id, code, name, description, price,
      duration_minutes, is_insurance_applicable, is_active, created_at, updated_at
    )
    SELECT
      m.id,
      NULL::uuid AS clinic_id,
      NULL::uuid AS category_id,
      NULL::varchar AS code,
      m.name,
      m.description,
      m.price::decimal(8,2),
      30,
      false,
      COALESCE(m.is_active, true),
      COALESCE(m.created_at, NOW()),
      COALESCE(m.updated_at, NOW())
    FROM public.master_treatment_menus m
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 7) Migrate daily_ai_comments -> ai_comments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='daily_ai_comments'
  ) THEN
    INSERT INTO public.ai_comments (
      id, clinic_id, daily_report_id, comment_date, comment_type, summary,
      good_points, improvement_points, recommendations, raw_ai_response,
      created_at, updated_at
    )
    SELECT
      d.id,
      d.clinic_id,
      NULL::uuid AS daily_report_id,
      d.comment_date,
      'daily_summary',
      d.summary,
      CASE WHEN d.good_points IS NULL OR d.good_points = '' THEN NULL ELSE ARRAY[d.good_points] END,
      CASE WHEN d.improvement_points IS NULL OR d.improvement_points = '' THEN NULL ELSE ARRAY[d.improvement_points] END,
      CASE WHEN d.suggestion_for_tomorrow IS NULL OR d.suggestion_for_tomorrow = '' THEN NULL ELSE ARRAY[d.suggestion_for_tomorrow] END,
      d.raw_ai_response,
      COALESCE(d.created_at, NOW()),
      COALESCE(d.updated_at, NOW())
    FROM public.daily_ai_comments d
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

COMMIT;


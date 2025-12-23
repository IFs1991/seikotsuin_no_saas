-- ================================================================
-- 予約（appointments）テーブル
-- ================================================================
-- 作成日: 2025-08-17
-- 目的: treatments から参照される予約の基礎テーブル

CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    appointment_number VARCHAR(50),
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    appointment_type VARCHAR(50) DEFAULT 'treatment',
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    symptoms TEXT,
    requested_menus UUID[],
    special_requests TEXT,
    reminder_sent_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT appointments_start_before_end CHECK (start_time < end_time),
    CONSTRAINT appointments_number_clinic_unique UNIQUE (clinic_id, appointment_number)
);

CREATE INDEX idx_appointments_clinic_date ON public.appointments(clinic_id, appointment_date);
CREATE INDEX idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX idx_appointments_staff_id ON public.appointments(staff_id);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_appointments_datetime ON public.appointments(appointment_date, start_time);

COMMENT ON TABLE public.appointments IS '患者の予約情報を管理';

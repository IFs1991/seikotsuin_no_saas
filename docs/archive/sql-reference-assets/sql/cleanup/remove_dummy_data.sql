-- Remove dummy/seed data safely (idempotent, conditional per-table)
-- Run in Supabase SQL editor or psql against production DB
BEGIN;

-- Delete AI comments inserted by seed (tagged JSON)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='daily_ai_comments'
  ) THEN
    EXECUTE $$
      DELETE FROM public.daily_ai_comments 
      WHERE raw_ai_response::text LIKE '%"source":"seed"%';
    $$;
  END IF;
END $$;

-- Delete seed clinics (A/B/HQ). Cascades will remove related visits/revenues/staff/patients if FK constraints permit
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='clinics'
  ) THEN
    EXECUTE $$
      DELETE FROM public.clinics 
      WHERE name IN ('グループ本部（HQ）', '整骨院A', '整骨院B');
    $$;
  END IF;
END $$;

-- Delete seeded user accounts by username (if they remain after clinic deletion)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='user_permissions'
  ) THEN
    EXECUTE $$
      DELETE FROM public.user_permissions 
      WHERE username IN ('admin@group', 'manager.a', 'therapist.a', 'manager.b', 'therapist.b');
    $$;
  END IF;
END $$;

COMMIT;


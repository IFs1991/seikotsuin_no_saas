-- ================================================================
-- Local development seed data
-- Purpose: bootstrap Supabase Auth + profiles for login testing
-- ================================================================
BEGIN;

-- Clinic
INSERT INTO public.clinics (
  id,
  name,
  address,
  phone_number,
  opening_date,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Demo Clinic',
  'Tokyo',
  '000-0000-0000',
  '2024-01-01',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = now();

-- Supabase Auth user (email/password)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
)
VALUES (
  'bbbbbbb1-0000-4000-8000-bbbbbbbb0001',
  'manager@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"role":"manager"}',
  '{"clinic_id":"11111111-1111-4111-8111-111111111111","role":"manager"}',
  now(),
  now(),
  'authenticated',
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- Auth identity for email provider
INSERT INTO auth.identities (
  id,
  user_id,
  provider,
  provider_id,
  identity_data,
  created_at,
  updated_at,
  last_sign_in_at
)
VALUES (
  'bbbbbbb1-0000-4000-8000-bbbbbbbb0001',
  'bbbbbbb1-0000-4000-8000-bbbbbbbb0001',
  'email',
  'manager@example.com',
  json_build_object(
    'sub', 'bbbbbbb1-0000-4000-8000-bbbbbbbb0001',
    'email', 'manager@example.com',
    'email_verified', true
  ),
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Profile linked to auth.users
INSERT INTO public.profiles (
  id,
  user_id,
  clinic_id,
  email,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'ccccccc1-0000-4000-8000-cccccccc0001',
  'bbbbbbb1-0000-4000-8000-bbbbbbbb0001',
  '11111111-1111-4111-8111-111111111111',
  'manager@example.com',
  'Demo Manager',
  'manager',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE
SET clinic_id = EXCLUDED.clinic_id,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = now();

COMMIT;

export const CLINIC_A_ID = '00000000-0000-0000-0000-0000000000a1';
export const CLINIC_B_ID = '00000000-0000-0000-0000-0000000000b1';

export const USER_ADMIN_ID = '00000000-0000-0000-0000-00000000a001';
export const USER_MANAGER_ID = '00000000-0000-0000-0000-00000000a002';
export const USER_STAFF_ID = '00000000-0000-0000-0000-00000000a003';
export const USER_CLINIC_B_ID = '00000000-0000-0000-0000-00000000b001';
export const USER_NO_CLINIC_ID = '00000000-0000-0000-0000-00000000ffff';

export const ADMIN_EMAIL = 'e2e-admin@clinic.local';
export const ADMIN_PASSWORD = 'Admin#12345';
export const MANAGER_EMAIL = 'e2e-manager@clinic.local';
export const MANAGER_PASSWORD = 'Manager#12345';
export const STAFF_EMAIL = 'e2e-staff@clinic.local';
export const STAFF_PASSWORD = 'Staff#12345';
export const CLINIC_B_EMAIL = 'e2e-clinic-b@clinic.local';
export const CLINIC_B_PASSWORD = 'Staff#12345';

// Parent-scope model:
// - CLINIC_A_ID: HQ for Parent A (parent_id IS NULL, acts as its own parent)
// - CLINIC_B_ID: HQ for Parent B (parent_id IS NULL, acts as its own parent)
// This enables cross-parent isolation testing: Admin of Parent A cannot access Parent B data
// @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
export const FIXTURE_CLINICS = [
  {
    id: CLINIC_A_ID,
    name: 'E2E Clinic A (HQ)',
    address: 'E2E Address A',
    phone_number: '03-0000-0001',
    opening_date: '2024-01-01',
    is_active: true,
    parent_id: null, // HQ - acts as its own parent for scope calculation
  },
  {
    id: CLINIC_B_ID,
    name: 'E2E Clinic B (HQ)',
    address: 'E2E Address B',
    phone_number: '03-0000-0002',
    opening_date: '2024-01-01',
    is_active: true,
    parent_id: null, // HQ - acts as its own parent for scope calculation
  },
];

// シフト関連の固定ID
export const STAFF_SHIFT_IDS = [
  '00000000-0000-0000-0000-00000000b701',
  '00000000-0000-0000-0000-00000000b702',
  '00000000-0000-0000-0000-00000000b703',
  '00000000-0000-0000-0000-00000000b704',
  '00000000-0000-0000-0000-00000000b705',
  '00000000-0000-0000-0000-00000000b706',
  '00000000-0000-0000-0000-00000000b707',
];

export const STAFF_PREFERENCE_IDS = [
  '00000000-0000-0000-0000-00000000b801',
  '00000000-0000-0000-0000-00000000b802',
];

// リソースID（シフトで使用）
export const RESOURCE_IDS = [
  '00000000-0000-0000-0000-00000000e001',
  '00000000-0000-0000-0000-00000000e002',
  '00000000-0000-0000-0000-00000000e003',
];

// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
// @spec docs/stabilization/spec-rls-tenant-boundary-v0.1.md (parent-scope model)
// Note: Admin is assigned to CLINIC_A_ID for parent-scope testing
// custom_access_token_hook will compute clinic_scope_ids based on permissions_clinic_id
export const FIXTURE_USERS = [
  {
    id: USER_ADMIN_ID,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
    full_name: 'E2E Admin',
    clinic_id: CLINIC_A_ID, // Admin belongs to Clinic A HQ for parent-scope
    permissions_clinic_id: CLINIC_A_ID, // Required for clinic_scope_ids JWT claim
  },
  {
    id: USER_MANAGER_ID,
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
    role: 'clinic_admin', // Changed from 'clinic_manager' (deprecated)
    full_name: 'E2E Manager',
    clinic_id: CLINIC_A_ID,
    permissions_clinic_id: CLINIC_A_ID,
  },
  {
    id: USER_STAFF_ID,
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    role: 'staff',
    full_name: 'E2E Staff',
    clinic_id: CLINIC_A_ID,
    permissions_clinic_id: CLINIC_A_ID,
  },
  {
    id: USER_NO_CLINIC_ID,
    email: 'e2e-no-clinic@clinic.local',
    password: 'NoClinic#12345',
    role: 'staff',
    full_name: 'E2E No Clinic',
    clinic_id: null,
    permissions_clinic_id: null,
  },
  {
    id: USER_CLINIC_B_ID,
    email: CLINIC_B_EMAIL,
    password: CLINIC_B_PASSWORD,
    role: 'staff',
    full_name: 'E2E Clinic B Staff',
    clinic_id: CLINIC_B_ID,
    permissions_clinic_id: CLINIC_B_ID,
  },
];

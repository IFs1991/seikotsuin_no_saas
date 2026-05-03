import type { Database } from '@/types/supabase';

type Tables = Database['public']['Tables'];

export type LegacyStaffCandidate = Pick<
  Tables['staff']['Row'],
  'id' | 'name' | 'email' | 'role' | 'is_therapist'
>;

export type PermissionStaffCandidate = Pick<
  Tables['user_permissions']['Row'],
  'staff_id' | 'role' | 'username'
>;

export type StaffProfileSummary = Pick<
  Tables['profiles']['Row'],
  'user_id' | 'email' | 'full_name' | 'is_active'
>;

export const LEGACY_STAFF_RESOURCE_ROLES = [
  'clinic_admin',
  'clinic_manager',
  'manager',
  'practitioner',
  'therapist',
] as const;

export const PERMISSION_STAFF_RESOURCE_ROLES = [
  'clinic_admin',
  'clinic_manager',
  'manager',
  'therapist',
] as const;

const legacyStaffResourceRoleSet = new Set<string>(LEGACY_STAFF_RESOURCE_ROLES);
const permissionStaffResourceRoleSet = new Set<string>(
  PERMISSION_STAFF_RESOURCE_ROLES
);

export function isLegacyBookableStaffCandidate(row: LegacyStaffCandidate) {
  return row.is_therapist === true || legacyStaffResourceRoleSet.has(row.role);
}

export function isPermissionBookableStaffCandidate(
  row: PermissionStaffCandidate
): row is PermissionStaffCandidate & { staff_id: string } {
  return (
    typeof row.staff_id === 'string' &&
    row.staff_id.length > 0 &&
    permissionStaffResourceRoleSet.has(row.role)
  );
}

export function isPermissionStaffResourceRole(role: string) {
  return permissionStaffResourceRoleSet.has(role);
}

export function getPermissionCandidateName(
  row: PermissionStaffCandidate,
  profile?: Pick<StaffProfileSummary, 'email' | 'full_name'> | null
) {
  return (
    profile?.full_name?.trim() || profile?.email || row.username || '名称未設定'
  );
}

import { normalizeRole } from '@/lib/constants/roles';

const RESERVATION_WRITE_ROLES = new Set([
  'admin',
  'clinic_admin',
  'therapist',
  'staff',
]);

interface ReservationClinicPermissionInput {
  selectedClinicId: string | null;
  profileClinicId: string | null;
  role: string | null;
}

export function isCrossClinicReservationView({
  selectedClinicId,
  profileClinicId,
}: Pick<
  ReservationClinicPermissionInput,
  'selectedClinicId' | 'profileClinicId'
>): boolean {
  return Boolean(
    selectedClinicId && profileClinicId && selectedClinicId !== profileClinicId
  );
}

export function canWriteReservationsForClinic({
  selectedClinicId,
  profileClinicId,
  role,
}: ReservationClinicPermissionInput): boolean {
  const normalizedRole = normalizeRole(role);

  if (!selectedClinicId || !profileClinicId || !normalizedRole) {
    return false;
  }

  return (
    selectedClinicId === profileClinicId &&
    RESERVATION_WRITE_ROLES.has(normalizedRole)
  );
}

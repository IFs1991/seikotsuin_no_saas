const RESERVATION_WRITE_ROLES = new Set([
  'admin',
  'clinic_admin',
  'manager',
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
  if (!selectedClinicId || !profileClinicId || !role) {
    return false;
  }

  return (
    selectedClinicId === profileClinicId && RESERVATION_WRITE_ROLES.has(role)
  );
}

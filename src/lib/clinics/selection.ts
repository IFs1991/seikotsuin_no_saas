interface ClinicSelectionOption {
  id: string;
}

interface ResolveInitialSelectedClinicIdParams {
  profileClinicId: string | null;
  currentClinicId: string | null;
  clinics: readonly ClinicSelectionOption[];
}

export function resolveInitialSelectedClinicId({
  profileClinicId,
  currentClinicId,
  clinics,
}: ResolveInitialSelectedClinicIdParams): string | null {
  const explicitClinicId = profileClinicId ?? currentClinicId;
  if (explicitClinicId) {
    return explicitClinicId;
  }

  if (clinics.length === 1) {
    return clinics[0]?.id ?? null;
  }

  return null;
}

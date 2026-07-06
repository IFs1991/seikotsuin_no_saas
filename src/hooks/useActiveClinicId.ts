'use client';

import { useOptionalSelectedClinic } from '@/providers/selected-clinic-context';

export function useActiveClinicId(
  profileClinicId?: string | null,
  options: { enabled?: boolean } = {}
): {
  activeClinicId: string | null;
  activeClinicLoading: boolean;
} {
  const selectedClinic = useOptionalSelectedClinic();

  if (options.enabled === false) {
    return {
      activeClinicId: profileClinicId ?? null,
      activeClinicLoading: false,
    };
  }

  if (!selectedClinic) {
    return {
      activeClinicId: profileClinicId ?? null,
      activeClinicLoading: false,
    };
  }

  if (selectedClinic.clinicsLoading) {
    return {
      activeClinicId: null,
      activeClinicLoading: true,
    };
  }

  if (selectedClinic.selectedClinicId) {
    return {
      activeClinicId: selectedClinic.selectedClinicId,
      activeClinicLoading: false,
    };
  }

  if (selectedClinic.clinics.length === 1) {
    return {
      activeClinicId: selectedClinic.clinics[0]?.id ?? null,
      activeClinicLoading: false,
    };
  }

  return {
    activeClinicId: null,
    activeClinicLoading: false,
  };
}

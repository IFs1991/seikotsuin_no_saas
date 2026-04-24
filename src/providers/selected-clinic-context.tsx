'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { AccessibleClinic } from '@/hooks/useAccessibleClinics';

interface SelectedClinicContextValue {
  selectedClinicId: string | null;
  setSelectedClinicId: Dispatch<SetStateAction<string | null>>;
  clinics: readonly AccessibleClinic[];
  currentClinicId: string | null;
  clinicsLoading: boolean;
  clinicsError: string | null;
}

const EMPTY_ACCESSIBLE_CLINICS: readonly AccessibleClinic[] = [];

const SelectedClinicContext = createContext<
  SelectedClinicContextValue | undefined
>(undefined);

export function SelectedClinicProvider({
  initialClinicId,
  clinics = EMPTY_ACCESSIBLE_CLINICS,
  currentClinicId = null,
  clinicsLoading = false,
  clinicsError = null,
  children,
}: {
  initialClinicId: string | null;
  clinics?: readonly AccessibleClinic[];
  currentClinicId?: string | null;
  clinicsLoading?: boolean;
  clinicsError?: string | null;
  children: ReactNode;
}) {
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(
    initialClinicId
  );

  useEffect(() => {
    if (!initialClinicId) {
      return;
    }

    setSelectedClinicId(currentClinicId => currentClinicId ?? initialClinicId);
  }, [initialClinicId]);

  const value = useMemo(
    () => ({
      selectedClinicId,
      setSelectedClinicId,
      clinics,
      currentClinicId,
      clinicsLoading,
      clinicsError,
    }),
    [clinics, clinicsError, clinicsLoading, currentClinicId, selectedClinicId]
  );

  return (
    <SelectedClinicContext.Provider value={value}>
      {children}
    </SelectedClinicContext.Provider>
  );
}

export function useSelectedClinic(): SelectedClinicContextValue {
  const ctx = useContext(SelectedClinicContext);
  if (!ctx)
    throw new Error(
      'useSelectedClinic must be used within SelectedClinicProvider'
    );
  return ctx;
}

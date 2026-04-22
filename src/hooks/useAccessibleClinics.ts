'use client';

import { useEffect, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';

export interface AccessibleClinic {
  id: string;
  name: string;
}

export interface UseAccessibleClinicsResult {
  clinics: readonly AccessibleClinic[];
  currentClinicId: string | null;
  loading: boolean;
  error: string | null;
}

const ACCESSIBLE_CLINICS_ERROR_MESSAGE = 'クリニック一覧の取得に失敗しました';
const EMPTY_ACCESSIBLE_CLINICS: readonly AccessibleClinic[] = [];

const INITIAL_ACCESSIBLE_CLINICS_STATE: UseAccessibleClinicsResult = {
  clinics: EMPTY_ACCESSIBLE_CLINICS,
  currentClinicId: null,
  loading: true,
  error: null,
};

function buildAccessibleClinicsSuccessState(
  clinics: readonly AccessibleClinic[],
  currentClinicId: string | null
): UseAccessibleClinicsResult {
  return {
    clinics,
    currentClinicId,
    loading: false,
    error: null,
  };
}

function buildAccessibleClinicsErrorState(
  error: string
): UseAccessibleClinicsResult {
  return {
    clinics: EMPTY_ACCESSIBLE_CLINICS,
    currentClinicId: null,
    loading: false,
    error,
  };
}

function getAccessibleClinicsErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : ACCESSIBLE_CLINICS_ERROR_MESSAGE;
}

export function useAccessibleClinics(): UseAccessibleClinicsResult {
  const [state, setState] = useState<UseAccessibleClinicsResult>(
    INITIAL_ACCESSIBLE_CLINICS_STATE
  );

  useEffect(() => {
    let isMounted = true;

    async function loadClinics() {
      setState(INITIAL_ACCESSIBLE_CLINICS_STATE);

      try {
        const response = await api.clinics.getAccessible();
        if (!isMounted) {
          return;
        }

        if (isSuccessResponse(response)) {
          setState(
            buildAccessibleClinicsSuccessState(
              response.data.clinics,
              response.data.currentClinicId
            )
          );
          return;
        }

        if (isErrorResponse(response)) {
          setState(
            buildAccessibleClinicsErrorState(
              handleApiError(response.error, ACCESSIBLE_CLINICS_ERROR_MESSAGE)
            )
          );
          return;
        }

        setState(
          buildAccessibleClinicsErrorState(ACCESSIBLE_CLINICS_ERROR_MESSAGE)
        );
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        setState(
          buildAccessibleClinicsErrorState(
            getAccessibleClinicsErrorMessage(fetchError)
          )
        );
      }
    }

    void loadClinics();

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}

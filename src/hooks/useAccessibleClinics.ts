'use client';

import { useEffect, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';

interface AccessibleClinic {
  id: string;
  name: string;
}

interface UseAccessibleClinicsResult {
  clinics: AccessibleClinic[];
  currentClinicId: string | null;
  loading: boolean;
  error: string | null;
}

export function useAccessibleClinics(): UseAccessibleClinicsResult {
  const [clinics, setClinics] = useState<AccessibleClinic[]>([]);
  const [currentClinicId, setCurrentClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadClinics() {
      setLoading(true);
      setError(null);

      try {
        const response = await api.clinics.getAccessible();
        if (!isMounted) {
          return;
        }

        if (isSuccessResponse(response)) {
          setClinics(response.data.clinics);
          setCurrentClinicId(response.data.currentClinicId);
          return;
        }

        if (isErrorResponse(response)) {
          setClinics([]);
          setCurrentClinicId(null);
          setError(
            handleApiError(response.error, 'クリニック一覧の取得に失敗しました')
          );
          return;
        }

        setClinics([]);
        setCurrentClinicId(null);
        setError('クリニック一覧の取得に失敗しました');
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        setClinics([]);
        setCurrentClinicId(null);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'クリニック一覧の取得に失敗しました'
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadClinics();

    return () => {
      isMounted = false;
    };
  }, []);

  return { clinics, currentClinicId, loading, error };
}

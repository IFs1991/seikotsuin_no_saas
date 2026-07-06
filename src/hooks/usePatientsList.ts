'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { useActiveClinicId } from '@/hooks/useActiveClinicId';
import { logger } from '@/lib/logger';

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  customAttributes?: Record<string, unknown>;
}

interface PatientInsertDTO {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  customAttributes?: Record<string, unknown>;
}

interface PatientUpdateDTO {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  customAttributes?: Record<string, unknown>;
}

interface UsePatientsListResult {
  patients: Patient[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  createPatient: (data: PatientInsertDTO) => Promise<Patient>;
  updatePatient: (data: PatientUpdateDTO) => Promise<Patient>;
  refetch: () => Promise<void>;
}

const DEBOUNCE_MS = 300;
const MAX_PATIENTS = 50;

type CustomerApiRow = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  customAttributes?: Record<string, unknown> | null;
  custom_attributes?: Record<string, unknown> | null;
};

type ApiSuccess<T> = {
  data: T;
};

type ApiErrorBody = {
  message?: string;
  error?: string;
};

function mapCustomerApiRow(row: CustomerApiRow): Patient {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    notes: row.notes ?? undefined,
    customAttributes:
      row.customAttributes ?? row.custom_attributes ?? undefined,
  };
}

async function readApiError(
  response: Response,
  fallback: string
): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  return new Error(body.message || body.error || fallback);
}

export function usePatientsList(): UsePatientsListResult {
  const { profile, loading: profileLoading } = useUserProfileContext();
  const { activeClinicId, activeClinicLoading } = useActiveClinicId(
    profile?.clinicId
  );
  const clinicId = activeClinicId;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQueryInternal] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // デバウンス処理
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryInternal(query);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      fetchAbortRef.current?.abort();
    };
  }, []);

  // 患者一覧を取得
  const fetchPatients = useCallback(async () => {
    if (!clinicId) return;

    fetchAbortRef.current?.abort();
    const abortController = new AbortController();
    fetchAbortRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ clinic_id: clinicId });
      if (debouncedQuery) {
        params.append('q', debouncedQuery);
      }

      const response = await fetch(`/api/customers?${params.toString()}`, {
        credentials: 'include',
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || '患者一覧の取得に失敗しました');
      }

      const json = (await response.json()) as ApiSuccess<CustomerApiRow[]>;
      const incoming = (json.data ?? [])
        .slice(0, MAX_PATIENTS)
        .map(mapCustomerApiRow);
      setPatients(incoming);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('fetchPatients error', err);
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      if (fetchAbortRef.current === abortController) {
        fetchAbortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [clinicId, debouncedQuery]);

  useEffect(() => {
    if (profileLoading || activeClinicLoading) {
      setIsLoading(true);
      return;
    }

    if (!clinicId) {
      setIsLoading(false);
      setError(
        '\u30af\u30ea\u30cb\u30c3\u30af\u60c5\u5831\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093'
      );
      setPatients([]);
      return;
    }

    fetchPatients();
  }, [profileLoading, activeClinicLoading, clinicId, fetchPatients]);

  // 新規患者を作成
  const createPatient = useCallback(
    async (data: PatientInsertDTO): Promise<Patient> => {
      if (!clinicId) {
        throw new Error('クリニックIDがありません');
      }

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clinic_id: clinicId,
          name: data.name,
          phone: data.phone,
          email: data.email,
          notes: data.notes,
          customAttributes: data.customAttributes,
        }),
      });

      if (!response.ok) {
        throw await readApiError(response, '患者の登録に失敗しました');
      }

      const json = (await response.json()) as ApiSuccess<CustomerApiRow>;
      const newPatient = mapCustomerApiRow(json.data);

      // 一覧を更新（先頭に追加）
      setPatients(prev => [newPatient, ...prev].slice(0, MAX_PATIENTS));

      return newPatient;
    },
    [clinicId]
  );

  // 患者を更新
  const updatePatient = useCallback(
    async (data: PatientUpdateDTO): Promise<Patient> => {
      if (!clinicId) {
        throw new Error('クリニックIDがありません');
      }

      const response = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clinic_id: clinicId,
          id: data.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          notes: data.notes,
          customAttributes: data.customAttributes,
        }),
      });

      if (!response.ok) {
        throw await readApiError(response, '患者の更新に失敗しました');
      }

      const json = (await response.json()) as ApiSuccess<CustomerApiRow>;
      const updatedPatient = mapCustomerApiRow(json.data);

      // 一覧を更新
      setPatients(prev =>
        prev.map(p => (p.id === updatedPatient.id ? updatedPatient : p))
      );

      return updatedPatient;
    },
    [clinicId]
  );

  return {
    patients,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    createPatient,
    updatePatient,
    refetch: fetchPatients,
  };
}

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
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  createPatient: (data: PatientInsertDTO) => Promise<Patient>;
  updatePatient: (data: PatientUpdateDTO) => Promise<Patient>;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

type CustomerApiRow = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  customAttributes?: Record<string, unknown> | null;
  custom_attributes?: Record<string, unknown> | null;
};

type CustomerListApiData = {
  items: CustomerApiRow[];
  nextCursor: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNullableString(
  record: Record<string, unknown>,
  key: string
): string | null | undefined {
  const value = record[key];
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

function parseCustomerApiRow(value: unknown): CustomerApiRow {
  if (!isRecord(value)) {
    throw new Error('患者データの形式が不正です');
  }

  const { id, name, phone } = value;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof phone !== 'string'
  ) {
    throw new Error('患者データの形式が不正です');
  }

  const email = readNullableString(value, 'email');
  const notes = readNullableString(value, 'notes');
  const attributesValue = value.customAttributes ?? value.custom_attributes;
  const customAttributes = isRecord(attributesValue)
    ? attributesValue
    : attributesValue === null || attributesValue === undefined
      ? undefined
      : null;

  if (customAttributes === null) {
    throw new Error('患者データの形式が不正です');
  }

  return {
    id,
    name,
    phone,
    ...(email !== undefined ? { email } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(customAttributes !== undefined ? { customAttributes } : {}),
  };
}

function parseCustomerListPayload(value: unknown): CustomerListApiData {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error('患者一覧のレスポンス形式が不正です');
  }

  const { items, nextCursor } = value.data;
  if (!Array.isArray(items)) {
    throw new Error('患者一覧のレスポンス形式が不正です');
  }

  let parsedNextCursor: string | null;
  if (nextCursor === null) {
    parsedNextCursor = null;
  } else if (typeof nextCursor === 'string') {
    parsedNextCursor = nextCursor;
  } else {
    throw new Error('患者一覧のレスポンス形式が不正です');
  }

  return {
    items: items.map(parseCustomerApiRow),
    nextCursor: parsedNextCursor,
  };
}

function parseCustomerMutationPayload(value: unknown): CustomerApiRow {
  if (!isRecord(value) || !('data' in value)) {
    throw new Error('患者データのレスポンス形式が不正です');
  }
  return parseCustomerApiRow(value.data);
}

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
  const body: unknown = await response.json().catch(() => null);
  if (isRecord(body)) {
    const message = body.message;
    if (typeof message === 'string' && message.length > 0) {
      return new Error(message);
    }
    const error = body.error;
    if (typeof error === 'string' && error.length > 0) {
      return new Error(error);
    }
  }
  return new Error(fallback);
}

export function usePatientsList(): UsePatientsListResult {
  const { profile, loading: profileLoading } = useUserProfileContext();
  const { activeClinicId, activeClinicLoading } = useActiveClinicId(
    profile?.clinicId
  );
  const clinicId = activeClinicId;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQueryInternal] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<string | null>(null);

  const updateNextCursor = useCallback((cursor: string | null) => {
    nextCursorRef.current = cursor;
    setNextCursor(cursor);
  }, []);

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
  const fetchPatients = useCallback(
    async (mode: 'replace' | 'append' = 'replace') => {
      if (!clinicId) return;

      const cursor = mode === 'append' ? nextCursorRef.current : null;
      if (mode === 'append' && !cursor) return;

      fetchAbortRef.current?.abort();
      const abortController = new AbortController();
      fetchAbortRef.current = abortController;

      if (mode === 'replace') {
        setIsLoading(true);
        setIsLoadingMore(false);
        setPatients([]);
        updateNextCursor(null);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          clinic_id: clinicId,
          limit: String(PAGE_SIZE),
        });
        if (debouncedQuery) {
          params.append('q', debouncedQuery);
        }
        if (cursor) {
          params.append('cursor', cursor);
        }

        const response = await fetch(`/api/customers?${params.toString()}`, {
          credentials: 'include',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw await readApiError(response, '患者一覧の取得に失敗しました');
        }

        const payload: unknown = await response.json();
        const data = parseCustomerListPayload(payload);
        const incoming = data.items.map(mapCustomerApiRow);
        setPatients(previous => {
          if (mode === 'replace') return incoming;

          const knownIds = new Set(previous.map(patient => patient.id));
          return [
            ...previous,
            ...incoming.filter(patient => !knownIds.has(patient.id)),
          ];
        });
        updateNextCursor(data.nextCursor);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.error('fetchPatients error', err);
        setError(err instanceof Error ? err.message : '不明なエラー');
      } finally {
        if (fetchAbortRef.current === abortController) {
          fetchAbortRef.current = null;
          if (mode === 'replace') {
            setIsLoading(false);
          } else {
            setIsLoadingMore(false);
          }
        }
      }
    },
    [clinicId, debouncedQuery, updateNextCursor]
  );

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
      updateNextCursor(null);
      setIsLoadingMore(false);
      return;
    }

    void fetchPatients('replace');
  }, [
    profileLoading,
    activeClinicLoading,
    clinicId,
    fetchPatients,
    updateNextCursor,
  ]);

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

      const payload: unknown = await response.json();
      const newPatient = mapCustomerApiRow(
        parseCustomerMutationPayload(payload)
      );

      setPatients(prev => [newPatient, ...prev]);
      await fetchPatients('replace');

      return newPatient;
    },
    [clinicId, fetchPatients]
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

      const payload: unknown = await response.json();
      const updatedPatient = mapCustomerApiRow(
        parseCustomerMutationPayload(payload)
      );

      // 一覧を更新
      setPatients(prev =>
        prev.map(p => (p.id === updatedPatient.id ? updatedPatient : p))
      );
      await fetchPatients('replace');

      return updatedPatient;
    },
    [clinicId, fetchPatients]
  );

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !nextCursorRef.current) return;
    await fetchPatients('append');
  }, [fetchPatients, isLoading, isLoadingMore]);

  return {
    patients,
    isLoading,
    isLoadingMore,
    hasMore: nextCursor !== null,
    error,
    searchQuery,
    setSearchQuery,
    createPatient,
    updatePatient,
    loadMore,
    refetch: () => fetchPatients('replace'),
  };
}

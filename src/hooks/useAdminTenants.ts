import { useCallback, useState } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';
import { logger } from '@/lib/logger';

const TENANTS_ENDPOINT = API_ENDPOINTS.ADMIN.TENANTS;
const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

type TenantApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

type TenantApiErrorResponse = {
  success: false;
  error?: string | { message?: string };
  details?: unknown;
  code?: string;
};

type TenantApiResponse<T> =
  | TenantApiSuccessResponse<T>
  | TenantApiErrorResponse;

export interface ClinicSummary {
  id: string;
  name: string;
  address?: string | null;
  phone_number?: string | null;
  is_active: boolean;
  created_at?: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
  clinic_type?: 'hq' | 'child';
  child_count?: number;
  admin_account?: {
    email: string;
    role: string;
  } | null;
}

export interface ClinicFilters {
  search?: string;
  isActive?: boolean | null;
}

export interface CreateClinicPayload {
  name: string;
  address?: string;
  phone_number?: string;
  is_active?: boolean;
  parent_id?: string | null;
  login_email?: string;
  login_password?: string;
}

export interface UpdateClinicPayload {
  name?: string;
  address?: string | null;
  phone_number?: string | null;
  is_active?: boolean;
  parent_id?: string | null;
}

interface ClinicsListResponse {
  items: ClinicSummary[];
}

function extractApiErrorMessage(response: TenantApiErrorResponse): string {
  if (typeof response.error === 'string' && response.error.trim()) {
    return response.error;
  }

  if (
    response.error &&
    typeof response.error === 'object' &&
    'message' in response.error &&
    typeof response.error.message === 'string' &&
    response.error.message.trim()
  ) {
    return response.error.message;
  }

  return ERROR_MESSAGES.SERVER_ERROR;
}

function buildTenantsUrl(filters: ClinicFilters = {}) {
  const params = new URLSearchParams();
  const normalizedSearch = filters.search?.trim();

  if (normalizedSearch) {
    params.set('search', normalizedSearch);
  }

  if (filters.isActive !== undefined && filters.isActive !== null) {
    params.set('is_active', String(filters.isActive));
  }

  const queryString = params.toString();
  return queryString ? `${TENANTS_ENDPOINT}?${queryString}` : TENANTS_ENDPOINT;
}

function buildJsonRequestInit(
  method: 'POST' | 'PATCH',
  body: unknown
): RequestInit {
  return {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

async function parseTenantResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as TenantApiResponse<T>;

  if (result.success === false) {
    throw new Error(extractApiErrorMessage(result));
  }

  return result.data;
}

async function fetchTenantList(filters: ClinicFilters = {}) {
  const response = await fetch(buildTenantsUrl(filters));
  return await parseTenantResponse<ClinicsListResponse>(response);
}

export function useAdminTenants() {
  const [clinics, setClinics] = useState<ClinicSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertClinic = useCallback((clinic: ClinicSummary) => {
    setClinics(prev => {
      const existingIndex = prev.findIndex(item => item.id === clinic.id);

      if (existingIndex === -1) {
        return [clinic, ...prev];
      }

      return prev.map(item => (item.id === clinic.id ? clinic : item));
    });
  }, []);

  const runTenantRequest = useCallback(
    async <T>(
      logMessage: string,
      request: () => Promise<T>
    ): Promise<T | null> => {
      try {
        setLoading(true);
        setError(null);
        return await request();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        logger.error(logMessage, err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchClinics = useCallback(
    async (filters: ClinicFilters = {}) => {
      const data = await runTenantRequest(
        'クリニック一覧取得エラー:',
        async () => await fetchTenantList(filters)
      );

      if (data) {
        setClinics(data.items ?? []);
      }
    },
    [runTenantRequest]
  );

  const listClinics = useCallback(async (filters: ClinicFilters = {}) => {
    try {
      setError(null);
      const data = await fetchTenantList(filters);
      return data.items ?? [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      logger.error('クリニック選択肢取得エラー:', err);
      return null;
    }
  }, []);

  const createClinic = useCallback(
    async (payload: CreateClinicPayload) => {
      const createdClinic = await runTenantRequest(
        'クリニック作成エラー:',
        async () => {
          const response = await fetch(
            TENANTS_ENDPOINT,
            buildJsonRequestInit('POST', payload)
          );

          return await parseTenantResponse<ClinicSummary>(response);
        }
      );

      if (createdClinic) {
        upsertClinic(createdClinic);
      }

      return createdClinic;
    },
    [runTenantRequest, upsertClinic]
  );

  const updateClinic = useCallback(
    async (clinicId: string, payload: UpdateClinicPayload) => {
      const updatedClinic = await runTenantRequest(
        'クリニック更新エラー:',
        async () => {
          const response = await fetch(
            `${TENANTS_ENDPOINT}/${clinicId}`,
            buildJsonRequestInit('PATCH', payload)
          );

          return await parseTenantResponse<ClinicSummary>(response);
        }
      );

      if (updatedClinic) {
        upsertClinic(updatedClinic);
      }

      return updatedClinic;
    },
    [runTenantRequest, upsertClinic]
  );

  return {
    clinics,
    loading,
    error,
    fetchClinics,
    listClinics,
    createClinic,
    updateClinic,
    setClinics,
  };
}

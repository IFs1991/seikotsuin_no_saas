import { useCallback, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api-error-message';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';
import { logger } from '@/lib/logger';
import {
  mergeAssignmentsIntoManager,
  type ManagerAssignmentsResponse,
  type ManagerListItem,
  type ManagerListResponse,
  type ReplaceManagerAssignmentsPayload,
} from '@/lib/admin/manager-assignments';

export type {
  ManagerAssignedClinic,
  ManagerAssignmentFormState,
  ManagerListItem,
  ReplaceManagerAssignmentsPayload,
} from '@/lib/admin/manager-assignments';

type ManagerApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

type ManagerApiErrorResponse = {
  success: false;
  error?: string | { message?: string | null } | null;
  details?: unknown;
  code?: string;
};

type ManagerApiResponse<T> =
  | ManagerApiSuccessResponse<T>
  | ManagerApiErrorResponse;

type FetchManagersOptions = {
  signal?: AbortSignal;
};

export type UseManagerAssignmentsResult = {
  managers: ManagerListItem[];
  loading: boolean;
  savingManagerUserId: string | null;
  error: string | null;
  fetchManagers: (
    options?: FetchManagersOptions
  ) => Promise<ManagerListItem[] | null>;
  replaceManagerAssignments: (
    managerUserId: string,
    payload: ReplaceManagerAssignmentsPayload
  ) => Promise<ManagerAssignmentsResponse | null>;
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

function buildManagerClinicsUrl(managerUserId: string): string {
  return `${API_ENDPOINTS.ADMIN.MANAGERS}/${encodeURIComponent(
    managerUserId
  )}/clinics`;
}

function isAbortError(error: unknown): boolean {
  return typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

async function parseManagerResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ManagerApiResponse<T>;

  if (result.success === false) {
    throw new Error(getApiErrorMessage(result, ERROR_MESSAGES.SERVER_ERROR));
  }

  return result.data;
}

export function useManagerAssignments(): UseManagerAssignmentsResult {
  const [managers, setManagers] = useState<ManagerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingManagerUserId, setSavingManagerUserId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const latestListRequestId = useRef(0);

  const fetchManagers = useCallback(
    async (options: FetchManagersOptions = {}) => {
      const requestId = latestListRequestId.current + 1;
      latestListRequestId.current = requestId;

      try {
        setLoading(true);
        setError(null);

        const data = await parseManagerResponse<ManagerListResponse>(
          await fetch(API_ENDPOINTS.ADMIN.MANAGERS, {
            signal: options.signal,
          })
        );

        if (latestListRequestId.current === requestId) {
          setManagers(data.managers);
        }

        return data.managers;
      } catch (err) {
        if (isAbortError(err)) {
          return null;
        }

        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;

        if (latestListRequestId.current === requestId) {
          setError(message);
        }

        logger.error('マネージャー一覧取得エラー:', err);
        return null;
      } finally {
        if (latestListRequestId.current === requestId) {
          setLoading(false);
        }
      }
    },
    []
  );

  const replaceManagerAssignments = useCallback(
    async (
      managerUserId: string,
      payload: ReplaceManagerAssignmentsPayload
    ) => {
      try {
        setSavingManagerUserId(managerUserId);
        setError(null);

        const data = await parseManagerResponse<ManagerAssignmentsResponse>(
          await fetch(buildManagerClinicsUrl(managerUserId), {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
          })
        );

        setManagers(currentManagers =>
          currentManagers.map(manager =>
            manager.user_id === managerUserId
              ? mergeAssignmentsIntoManager(manager, data.assignments, {
                  primary_clinic_id: data.primary_clinic_id,
                  primary_clinic_name: data.primary_clinic_name,
                })
              : manager
          )
        );

        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        logger.error('マネージャー担当店舗更新エラー:', err);
        return null;
      } finally {
        setSavingManagerUserId(null);
      }
    },
    []
  );

  return {
    managers,
    loading,
    savingManagerUserId,
    error,
    fetchManagers,
    replaceManagerAssignments,
  };
}

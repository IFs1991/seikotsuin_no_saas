import { useCallback, useState } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';
import type {
  AssignPermissionPayload,
  PermissionEntry,
  PermissionFilters,
  UpdatePermissionPayload,
} from '@/lib/admin/users';

export type { PermissionEntry, PermissionFilters } from '@/lib/admin/users';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type PermissionListPayload = {
  items: PermissionEntry[];
  total: number;
};

const buildPermissionListUrl = (filters: PermissionFilters): string => {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  if (filters.clinicId) params.set('clinic_id', filters.clinicId);
  if (filters.search) params.set('search', filters.search);

  const query = params.toString();
  return query
    ? `${API_ENDPOINTS.ADMIN.USERS}?${query}`
    : API_ENDPOINTS.ADMIN.USERS;
};

const readApiResponse = async <T>(response: Response): Promise<T> => {
  const result = (await response.json()) as ApiResponse<T>;
  if (!result.success) {
    throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
  }
  return result.data as T;
};

export function useAdminUsers() {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(
    async (filters: PermissionFilters = {}) => {
      try {
        setLoading(true);
        setError(null);

        const data = await readApiResponse<PermissionListPayload>(
          await fetch(buildPermissionListUrl(filters))
        );

        setPermissions(data.items);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const assignPermission = useCallback(
    async (payload: AssignPermissionPayload) => {
      try {
        setLoading(true);
        setError(null);

        return await readApiResponse<PermissionEntry>(
          await fetch(API_ENDPOINTS.ADMIN.USERS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updatePermission = useCallback(
    async (permissionId: string, payload: UpdatePermissionPayload) => {
      try {
        setLoading(true);
        setError(null);

        return await readApiResponse<PermissionEntry>(
          await fetch(`${API_ENDPOINTS.ADMIN.USERS}/${permissionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const revokePermission = useCallback(async (permissionId: string) => {
    try {
      setLoading(true);
      setError(null);

      await readApiResponse<{ id: string; revoked: true }>(
        await fetch(`${API_ENDPOINTS.ADMIN.USERS}/${permissionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revoke: true }),
        })
      );

      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permissions,
    loading,
    error,
    fetchPermissions,
    assignPermission,
    updatePermission,
    revokePermission,
  };
}

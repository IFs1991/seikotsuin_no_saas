import { useCallback, useState } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';

export interface PermissionEntry {
  id: string;
  user_id: string | null;
  role: string;
  clinic_id: string | null;
  clinic_name?: string | null;
  username: string;
  profile_email?: string | null;
  profile_name?: string | null;
  created_at?: string | null;
}

export interface PermissionFilters {
  role?: string;
  clinicId?: string;
  search?: string;
}

export function useAdminUsers() {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(
    async (filters: PermissionFilters = {}) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (filters.role) params.set('role', filters.role);
        if (filters.clinicId) params.set('clinic_id', filters.clinicId);
        if (filters.search) params.set('search', filters.search);

        const response = await fetch(
          `${API_ENDPOINTS.ADMIN.USERS}?${params.toString()}`
        );
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
        }

        setPermissions(result.data?.items ?? []);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        console.error('Failed to fetch permissions', err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const assignPermission = useCallback(
    async (payload: {
      user_id: string;
      clinic_id?: string | null;
      role: string;
    }) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(API_ENDPOINTS.ADMIN.USERS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
        }

        return result.data as PermissionEntry;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        console.error('Failed to assign permission', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updatePermission = useCallback(
    async (
      permissionId: string,
      payload: { role?: string; clinic_id?: string | null }
    ) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_ENDPOINTS.ADMIN.USERS}/${permissionId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
        }

        return result.data as PermissionEntry;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(message);
        console.error('Failed to update permission', err);
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

      const response = await fetch(
        `${API_ENDPOINTS.ADMIN.USERS}/${permissionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revoke: true }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      console.error('Failed to revoke permission', err);
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
    setPermissions,
  };
}

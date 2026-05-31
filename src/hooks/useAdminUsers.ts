import { useCallback, useRef, useState } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';
import { getApiErrorMessage } from '@/lib/api-error-message';
import type {
  AccountOnlyCreatePayload,
  AssignPermissionPayload,
  CreateAccountPayload,
  PermissionEntry,
  PermissionFilters,
  UpdatePermissionPayload,
  UserPermissionCandidate,
} from '@/lib/admin/users';

export type { PermissionEntry, PermissionFilters } from '@/lib/admin/users';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
};

type PermissionListPayload = {
  items: PermissionEntry[];
  total: number;
};

type UserCandidateListPayload = {
  items: UserPermissionCandidate[];
  total: number;
};

type AccountOnlyCreateResult = {
  id: string;
  email: string;
  full_name: string;
  permission_status: 'assigned' | 'unassigned';
  permission_id: string | null;
  role: string | null;
  clinic_id: string | null;
};

type FetchPermissionsOptions = {
  signal?: AbortSignal;
};

type FetchUserCandidatesOptions = FetchPermissionsOptions & {
  includeUnassigned?: boolean;
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

const buildUserCandidateListUrl = (
  search: string,
  includeUnassigned: boolean
): string => {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set('search', trimmedSearch);
  if (includeUnassigned) params.set('include_unassigned', 'true');

  const query = params.toString();
  return query
    ? `${API_ENDPOINTS.ADMIN.USER_CANDIDATES}?${query}`
    : API_ENDPOINTS.ADMIN.USER_CANDIDATES;
};

const readApiResponse = async <T>(response: Response): Promise<T> => {
  const result = (await response.json()) as ApiResponse<T>;
  if (!result.success) {
    throw new Error(getApiErrorMessage(result, ERROR_MESSAGES.SERVER_ERROR));
  }
  return result.data as T;
};

const isAbortError = (error: unknown): boolean =>
  typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';

export function useAdminUsers() {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permissionListRequestIdRef = useRef(0);

  const fetchPermissions = useCallback(
    async (
      filters: PermissionFilters = {},
      options: FetchPermissionsOptions = {}
    ) => {
      const requestId = permissionListRequestIdRef.current + 1;
      permissionListRequestIdRef.current = requestId;

      try {
        setLoading(true);
        setError(null);

        const data = await readApiResponse<PermissionListPayload>(
          await fetch(buildPermissionListUrl(filters), {
            signal: options.signal,
          })
        );

        if (permissionListRequestIdRef.current === requestId) {
          setPermissions(data.items);
        }

        return data.items;
      } catch (err) {
        if (isAbortError(err)) {
          return null;
        }

        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;

        if (permissionListRequestIdRef.current === requestId) {
          setError(message);
        }

        return null;
      } finally {
        if (permissionListRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    []
  );

  const assignPermission = useCallback(
    async (payload: AssignPermissionPayload | CreateAccountPayload) => {
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

  const createAccountOnlyUser = useCallback(
    async (payload: AccountOnlyCreatePayload) => {
      try {
        setLoading(true);
        setError(null);

        return await readApiResponse<AccountOnlyCreateResult>(
          await fetch(API_ENDPOINTS.ADMIN.USER_ACCOUNTS, {
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

  const applyPermissionToList = useCallback(
    (permission: PermissionEntry, keepInList = true) => {
      permissionListRequestIdRef.current += 1;

      setPermissions(current => {
        const existing = current.find(item => item.id === permission.id);

        if (!keepInList) {
          return existing
            ? current.filter(item => item.id !== permission.id)
            : current;
        }

        if (!existing) {
          return [permission, ...current];
        }

        const mergedPermission: PermissionEntry = {
          ...existing,
          ...permission,
          profile_email: permission.profile_email ?? existing.profile_email,
          profile_name: permission.profile_name ?? existing.profile_name,
          clinic_name: permission.clinic_name ?? existing.clinic_name,
        };

        return current.map(item =>
          item.id === permission.id ? mergedPermission : item
        );
      });
    },
    []
  );

  const removePermissionFromList = useCallback((permissionId: string) => {
    permissionListRequestIdRef.current += 1;
    setPermissions(current => {
      const exists = current.some(item => item.id === permissionId);
      return exists
        ? current.filter(item => item.id !== permissionId)
        : current;
    });
  }, []);

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
    createAccountOnlyUser,
    updatePermission,
    applyPermissionToList,
    removePermissionFromList,
    revokePermission,
  };
}

export function useAdminUserCandidates() {
  const [candidates, setCandidates] = useState<UserPermissionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const clearCandidates = useCallback(() => {
    requestIdRef.current += 1;
    setCandidates(current => (current.length === 0 ? current : []));
    setLoading(current => (current ? false : current));
    setError(current => (current === null ? current : null));
  }, []);

  const fetchUserCandidates = useCallback(
    async (search: string, options: FetchUserCandidatesOptions = {}) => {
      const trimmedSearch = search.trim();
      if (!trimmedSearch) {
        clearCandidates();
        return [];
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        setLoading(true);
        setError(null);

        const data = await readApiResponse<UserCandidateListPayload>(
          await fetch(
            buildUserCandidateListUrl(
              trimmedSearch,
              options.includeUnassigned === true
            ),
            {
              signal: options.signal,
            }
          )
        );

        if (requestIdRef.current === requestId) {
          setCandidates(data.items);
        }

        return data.items;
      } catch (err) {
        if (isAbortError(err)) {
          return null;
        }

        const message =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;

        if (requestIdRef.current === requestId) {
          setError(message);
        }

        return null;
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [clearCandidates]
  );

  return {
    candidates,
    loading,
    error,
    clearCandidates,
    fetchUserCandidates,
  };
}

import { useCallback, useState } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';

export interface ClinicSummary {
  id: string;
  name: string;
  address?: string | null;
  phone_number?: string | null;
  is_active: boolean;
  created_at?: string | null;
}

export interface ClinicFilters {
  search?: string;
  isActive?: boolean | null;
}

export function useAdminTenants() {
  const [clinics, setClinics] = useState<ClinicSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClinics = useCallback(async (filters: ClinicFilters = {}) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.isActive !== undefined && filters.isActive !== null) {
        params.set('is_active', String(filters.isActive));
      }

      const response = await fetch(
        `${API_ENDPOINTS.ADMIN.TENANTS}?${params.toString()}`
      );
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      setClinics(result.data?.items ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      console.error('Failed to fetch clinics', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createClinic = useCallback(async (payload: {
    name: string;
    address?: string;
    phone_number?: string;
    is_active?: boolean;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_ENDPOINTS.ADMIN.TENANTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      return result.data as ClinicSummary;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      console.error('Failed to create clinic', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateClinic = useCallback(async (
    clinicId: string,
    payload: {
      name?: string;
      address?: string | null;
      phone_number?: string | null;
      is_active?: boolean;
    }
  ) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_ENDPOINTS.ADMIN.TENANTS}/${clinicId}`,
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

      return result.data as ClinicSummary;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      console.error('Failed to update clinic', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    clinics,
    loading,
    error,
    fetchClinics,
    createClinic,
    updateClinic,
    setClinics,
  };
}

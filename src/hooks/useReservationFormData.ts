'use client';

import { useEffect, useState } from 'react';
import type { Customer, Menu, Resource } from '@/types/reservation';

interface UseReservationFormDataOptions {
  includeCustomers?: boolean;
}

interface ApiObjectResponse {
  success?: unknown;
  error?: unknown;
  data?: unknown;
}

const RESERVATION_FORM_DATA_ERROR_MESSAGE =
  '予約フォームデータの取得に失敗しました';
const RESERVATION_FORM_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface ReservationFormDataCacheEntry {
  customers: Customer[];
  menus: Menu[];
  resources: Resource[];
  fetchedAt: number;
}

const reservationFormDataCache = new Map<
  string,
  ReservationFormDataCacheEntry
>();

const isReservationFormDataCacheEnabled = () => process.env.NODE_ENV !== 'test';

const getReservationFormDataCacheKey = (
  clinicId: string,
  includeCustomers: boolean
) => `${clinicId}:${includeCustomers ? 'with-customers' : 'masters-only'}`;

function isApiObjectResponse(value: unknown): value is ApiObjectResponse {
  return typeof value === 'object' && value !== null;
}

function getApiErrorMessage(
  json: ApiObjectResponse | unknown,
  fallbackErrorMessage: string
) {
  return isApiObjectResponse(json) && typeof json.error === 'string'
    ? json.error
    : fallbackErrorMessage;
}

async function parseArrayResponse<T>(
  response: Response,
  fallbackErrorMessage: string
): Promise<T[]> {
  const json: unknown = await response.json();

  if (!isApiObjectResponse(json) || !response.ok || json.success !== true) {
    throw new Error(getApiErrorMessage(json, fallbackErrorMessage));
  }

  return Array.isArray(json.data) ? (json.data as T[]) : [];
}

export function useReservationFormData(
  clinicId: string | null,
  options: UseReservationFormDataOptions = {}
) {
  const { includeCustomers = true } = options;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId) {
      setCustomers([]);
      setMenus([]);
      setResources([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const cacheKey = getReservationFormDataCacheKey(clinicId, includeCustomers);
    const cached = isReservationFormDataCacheEnabled()
      ? reservationFormDataCache.get(cacheKey)
      : undefined;
    const cacheIsFresh =
      cached !== undefined &&
      Date.now() - cached.fetchedAt < RESERVATION_FORM_DATA_CACHE_TTL_MS;

    if (cached) {
      setCustomers(cached.customers);
      setMenus(cached.menus);
      setResources(cached.resources);
      setError(null);
      setLoading(false);

      if (cacheIsFresh) {
        return () => controller.abort();
      }
    }

    const load = async () => {
      if (!cached) {
        setLoading(true);
      }
      setError(null);
      try {
        const requestInit = { signal: controller.signal };
        const customersPromise = includeCustomers
          ? fetch(`/api/customers?clinic_id=${clinicId}`, requestInit).then(
              response =>
                parseArrayResponse<Customer>(
                  response,
                  '顧客データの取得に失敗しました'
                )
            )
          : Promise.resolve<Customer[]>([]);

        const [nextCustomers, menuRes, resRes] = await Promise.all([
          customersPromise,
          fetch(`/api/menus?clinic_id=${clinicId}`, requestInit),
          fetch(`/api/resources?clinic_id=${clinicId}`, requestInit),
        ]);
        const [nextMenus, nextResources] = await Promise.all([
          parseArrayResponse<Menu>(
            menuRes,
            'メニューデータの取得に失敗しました'
          ),
          parseArrayResponse<Resource>(
            resRes,
            'リソースデータの取得に失敗しました'
          ),
        ]);

        setCustomers(nextCustomers);
        setMenus(nextMenus);
        setResources(nextResources);
        if (isReservationFormDataCacheEnabled()) {
          reservationFormDataCache.set(cacheKey, {
            customers: nextCustomers,
            menus: nextMenus,
            resources: nextResources,
            fetchedAt: Date.now(),
          });
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }

        if (!cached) {
          setCustomers([]);
          setMenus([]);
          setResources([]);
          setError(
            e instanceof Error ? e.message : RESERVATION_FORM_DATA_ERROR_MESSAGE
          );
        }
      } finally {
        if (!controller.signal.aborted && !cached) {
          setLoading(false);
        }
      }
    };
    load();

    return () => controller.abort();
  }, [clinicId, includeCustomers]);

  return { customers, menus, resources, loading, error };
}

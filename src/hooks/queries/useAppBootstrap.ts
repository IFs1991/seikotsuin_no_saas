'use client';

import { useQuery } from '@tanstack/react-query';

import type { AppBootstrapData } from '@/lib/app-bootstrap/types';
import { queryKeys } from '@/providers/query-provider';

export const APP_BOOTSTRAP_STALE_TIME_MS = 5 * 60 * 1000;
export const APP_BOOTSTRAP_GC_TIME_MS = 10 * 60 * 1000;

const APP_BOOTSTRAP_ENDPOINT = '/api/app/bootstrap';
const APP_BOOTSTRAP_ERROR_MESSAGE = 'アプリ初期情報の取得に失敗しました';

export class AppBootstrapRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AppBootstrapRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isBootstrapClinic(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

function isBootstrapProfile(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isNullableString(value.email) &&
    isNullableString(value.role) &&
    isNullableString(value.clinicId) &&
    isNullableString(value.clinicName) &&
    typeof value.isActive === 'boolean' &&
    typeof value.isAdmin === 'boolean'
  );
}

function isBootstrapErrors(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableString(value.profile) &&
    isNullableString(value.clinics)
  );
}

function isAppBootstrapData(value: unknown): value is AppBootstrapData {
  return (
    isRecord(value) &&
    isBootstrapProfile(value.profile) &&
    Array.isArray(value.clinics) &&
    value.clinics.every(isBootstrapClinic) &&
    isNullableString(value.currentClinicId) &&
    isBootstrapErrors(value.errors) &&
    typeof value.generatedAt === 'string' &&
    Number.isFinite(Date.parse(value.generatedAt))
  );
}

function readErrorMessage(payload: unknown): string {
  if (
    isRecord(payload) &&
    payload.success === false &&
    typeof payload.error === 'string' &&
    payload.error.trim().length > 0
  ) {
    return payload.error;
  }

  return APP_BOOTSTRAP_ERROR_MESSAGE;
}

async function fetchAppBootstrap(): Promise<AppBootstrapData> {
  const response = await fetch(APP_BOOTSTRAP_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppBootstrapRequestError(
      APP_BOOTSTRAP_ERROR_MESSAGE,
      response.status
    );
  }

  if (
    !response.ok ||
    !isRecord(payload) ||
    payload.success !== true ||
    !isAppBootstrapData(payload.data)
  ) {
    throw new AppBootstrapRequestError(
      readErrorMessage(payload),
      response.status
    );
  }

  return payload.data;
}

function resolveInitialDataUpdatedAt(initialBootstrap: AppBootstrapData) {
  const generatedAt = Date.parse(initialBootstrap.generatedAt);
  return Number.isFinite(generatedAt) ? generatedAt : 0;
}

export function useAppBootstrap(initialBootstrap: AppBootstrapData) {
  const query = useQuery({
    queryKey: queryKeys.appBootstrap.all,
    queryFn: fetchAppBootstrap,
    initialData: initialBootstrap,
    initialDataUpdatedAt: resolveInitialDataUpdatedAt(initialBootstrap),
    staleTime: APP_BOOTSTRAP_STALE_TIME_MS,
    gcTime: APP_BOOTSTRAP_GC_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const requestError =
    query.error instanceof Error ? query.error.message : null;

  return {
    data: query.data ?? initialBootstrap,
    loading: query.isPending,
    profileError: query.data?.errors.profile ?? requestError,
    clinicsError: query.data?.errors.clinics ?? requestError,
  };
}

import type { ApiResponse } from '@/types/api';
import type {
  AggregatedClinicData,
  AdminDashboardPayload,
} from '@/lib/admin/dashboard';

export type { AggregatedClinicData, AdminDashboardPayload };

export class AdminDashboardRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AdminDashboardRequestError';
  }
}

function buildUrl(base: string, params?: Record<string, unknown>) {
  if (!params) return base;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.append(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${base}?${query}` : base;
}

export async function fetchAdminDashboard(
  params?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<AdminDashboardPayload> {
  const url = buildUrl('/api/admin/dashboard', params);
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<AdminDashboardPayload> | null;

  if (!payload) {
    throw new AdminDashboardRequestError(
      response.statusText || 'ダッシュボードデータの取得に失敗しました',
      response.status
    );
  }

  if (!response.ok || payload.success === false || payload.data === undefined) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message || response.statusText;
    throw new AdminDashboardRequestError(
      message || 'ダッシュボードデータの取得に失敗しました',
      response.status
    );
  }

  return payload.data;
}

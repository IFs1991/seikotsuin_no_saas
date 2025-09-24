import type { ApiResponse } from '@/types/api';

export interface AggregatedClinicData {
  id: string;
  name: string;
  totalRevenue: number;
  totalPatientCount: number;
  averagePerformanceScore: number;
}

export interface AdminDashboardPayload {
  clinicsData: AggregatedClinicData[];
  overallKpis: {
    totalGroupRevenue: number;
    totalGroupPatientCount: number;
    averageGroupPerformance: number;
  };
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
  params?: Record<string, unknown>
): Promise<AdminDashboardPayload> {
  const url = buildUrl('/api/admin/dashboard', params);
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  const payload = (await response.json()) as ApiResponse<AdminDashboardPayload>;

  if (!response.ok || payload.success === false || !('data' in payload)) {
    const message = (payload as { error?: string }).error || response.statusText;
    throw new Error(message || 'ダッシュボードデータの取得に失敗しました');
  }

  return payload.data as AdminDashboardPayload;
}

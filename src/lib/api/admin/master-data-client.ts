import {
  createMasterDataDeprecationError,
  MASTER_DATA_DEPRECATION_MESSAGE,
} from '@/lib/admin/master-data-deprecation';

export interface MasterDataItem {
  id: string;
  clinic_id: string | null;
  name: string;
  category: string;
  value: unknown;
  data_type: string;
  description?: string | null;
  is_editable: boolean;
  is_public: boolean;
  updated_at: string;
  updated_by?: string | null;
}

export interface MasterDataListResponse {
  items: MasterDataItem[];
  total: number;
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

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  void input;
  void init;
  throw createMasterDataDeprecationError();
}

export async function listMasterData(params?: {
  category?: string;
  clinic_id?: string | null;
  is_public?: boolean;
}): Promise<MasterDataListResponse> {
  const url = buildUrl('/api/admin/master-data', params);
  return request<MasterDataListResponse>(url, { method: 'GET' });
}

export async function createMasterData(
  payload: Omit<MasterDataItem, 'id' | 'updated_at' | 'updated_by'>
): Promise<MasterDataItem> {
  return request<MasterDataItem>('/api/admin/master-data', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMasterData(
  id: string,
  payload: Partial<Omit<MasterDataItem, 'id'>>
): Promise<MasterDataItem> {
  return request<MasterDataItem>('/api/admin/master-data', {
    method: 'PUT',
    body: JSON.stringify({ id, ...payload }),
  });
}

export async function deleteMasterData(id: string): Promise<void> {
  await request<null>(`/api/admin/master-data?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export { MASTER_DATA_DEPRECATION_MESSAGE };

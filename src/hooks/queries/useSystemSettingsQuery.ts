// =================================================================
// System Settings React Query Hooks - システム設定データ管理
// =================================================================

import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions
} from '@tanstack/react-query';
import { queryKeys } from '@/providers/query-provider';
import type { 
  MasterDataDetail, 
  FilterState, 
  ApiResponse 
} from '@/types/admin';

// APIクライアント関数
const systemSettingsApi = {
  // 一覧取得
  async getAll(filters: FilterState): Promise<{
    items: MasterDataDetail[];
    total: number;
  }> {
    const params = new URLSearchParams();
    
    if (filters.search) params.append('search', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.clinicId) params.append('clinic_id', filters.clinicId);
    if (filters.isPublic !== undefined) params.append('is_public', String(filters.isPublic));

    const response = await fetch(`/api/admin/master-data?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: ApiResponse<{
      items: MasterDataDetail[];
      total: number;
    }> = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'データの取得に失敗しました');
    }
    
    return data.data;
  },

  // 新規作成
  async create(data: Partial<MasterDataDetail>): Promise<MasterDataDetail> {
    const response = await fetch('/api/admin/master-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result: ApiResponse<MasterDataDetail> = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'データの作成に失敗しました');
    }
    
    return result.data;
  },

  // 更新
  async update(id: string, data: Partial<MasterDataDetail>): Promise<MasterDataDetail> {
    const response = await fetch('/api/admin/master-data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, ...data }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result: ApiResponse<MasterDataDetail> = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'データの更新に失敗しました');
    }
    
    return result.data;
  },

  // 削除
  async delete(id: string): Promise<void> {
    const response = await fetch(`/api/admin/master-data?id=${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result: ApiResponse<null> = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'データの削除に失敗しました');
    }
  },
};

// React Query フック

/**
 * システム設定一覧取得フック
 */
export function useSystemSettingsQuery(
  filters: FilterState,
  options?: Omit<UseQueryOptions<{
    items: MasterDataDetail[];
    total: number;
  }>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.systemSettings.list(filters),
    queryFn: () => systemSettingsApi.getAll(filters),
    ...options,
  });
}

/**
 * システム設定作成ミューテーション
 */
export function useCreateSystemSettingMutation(
  options?: UseMutationOptions<
    MasterDataDetail,
    Error,
    Partial<MasterDataDetail>
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: systemSettingsApi.create,
    onSuccess: (newData) => {
      // 一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: queryKeys.systemSettings.lists()
      });

      // 楽観的更新: 新しいデータをキャッシュに追加
      queryClient.setQueriesData(
        { queryKey: queryKeys.systemSettings.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: [newData, ...oldData.items],
            total: oldData.total + 1,
          };
        }
      );
    },
    ...options,
  });
}

/**
 * システム設定更新ミューテーション
 */
export function useUpdateSystemSettingMutation(
  options?: UseMutationOptions<
    MasterDataDetail,
    Error,
    { id: string; data: Partial<MasterDataDetail> }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => systemSettingsApi.update(id, data),
    onSuccess: (updatedData) => {
      // 詳細キャッシュを更新
      queryClient.setQueryData(
        queryKeys.systemSettings.detail(updatedData.id),
        updatedData
      );

      // 一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: queryKeys.systemSettings.lists()
      });

      // 楽観的更新: 一覧内の該当データを更新
      queryClient.setQueriesData(
        { queryKey: queryKeys.systemSettings.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item: MasterDataDetail) =>
              item.id === updatedData.id ? updatedData : item
            ),
          };
        }
      );
    },
    ...options,
  });
}

/**
 * システム設定削除ミューテーション
 */
export function useDeleteSystemSettingMutation(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: systemSettingsApi.delete,
    onSuccess: (_, deletedId) => {
      // 詳細キャッシュを削除
      queryClient.removeQueries({
        queryKey: queryKeys.systemSettings.detail(deletedId)
      });

      // 一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: queryKeys.systemSettings.lists()
      });

      // 楽観的更新: 一覧から該当データを削除
      queryClient.setQueriesData(
        { queryKey: queryKeys.systemSettings.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.filter((item: MasterDataDetail) => 
              item.id !== deletedId
            ),
            total: oldData.total - 1,
          };
        }
      );
    },
    ...options,
  });
}

/**
 * システム設定一覧の手動リフレッシュ
 */
export function useRefreshSystemSettings() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.systemSettings.all
    });
  };
}
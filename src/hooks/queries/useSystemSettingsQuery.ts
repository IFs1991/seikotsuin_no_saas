// =================================================================
// System Settings React Query Hooks - システム設定データ管理
// =================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { queryKeys } from '@/providers/query-provider';
import type { MasterDataDetail, FilterState } from '@/types/admin';
import { createMasterDataDeprecationError } from '@/lib/admin/master-data-deprecation';

// APIクライアント関数
const systemSettingsApi = {
  // 一覧取得
  async getAll(filters: FilterState): Promise<{
    items: MasterDataDetail[];
    total: number;
  }> {
    void filters;
    throw createMasterDataDeprecationError();
  },

  // 新規作成
  async create(data: Partial<MasterDataDetail>): Promise<MasterDataDetail> {
    void data;
    throw createMasterDataDeprecationError();
  },

  // 更新
  async update(
    id: string,
    data: Partial<MasterDataDetail>
  ): Promise<MasterDataDetail> {
    void id;
    void data;
    throw createMasterDataDeprecationError();
  },

  // 削除
  async delete(id: string): Promise<void> {
    void id;
    throw createMasterDataDeprecationError();
  },
};

// React Query フック

/**
 * システム設定一覧取得フック
 */
export function useSystemSettingsQuery(
  filters: FilterState,
  options?: Omit<
    UseQueryOptions<{
      items: MasterDataDetail[];
      total: number;
    }>,
    'queryKey' | 'queryFn'
  >
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
    onSuccess: newData => {
      // 一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: queryKeys.systemSettings.lists(),
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
    onSuccess: updatedData => {
      // 詳細キャッシュを更新
      queryClient.setQueryData(
        queryKeys.systemSettings.detail(updatedData.id),
        updatedData
      );

      // 一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: queryKeys.systemSettings.lists(),
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
        queryKey: queryKeys.systemSettings.detail(deletedId),
      });

      // 一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: queryKeys.systemSettings.lists(),
      });

      // 楽観的更新: 一覧から該当データを削除
      queryClient.setQueriesData(
        { queryKey: queryKeys.systemSettings.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.filter(
              (item: MasterDataDetail) => item.id !== deletedId
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
      queryKey: queryKeys.systemSettings.all,
    });
  };
}

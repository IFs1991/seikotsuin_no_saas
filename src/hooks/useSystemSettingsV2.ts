// =================================================================
// システム設定フック v2 - React Query版
// =================================================================

import { useState, useCallback } from 'react';
import { 
  useSystemSettingsQuery,
  useCreateSystemSettingMutation,
  useUpdateSystemSettingMutation,
  useDeleteSystemSettingMutation,
  useRefreshSystemSettings
} from './queries/useSystemSettingsQuery';
import type { 
  MasterDataDetail, 
  FilterState, 
  UseSystemSettingsReturn 
} from '@/types/admin';

/**
 * システム設定管理フック v2 (React Query版)
 * 
 * 旧版(useSystemSettings)との違い:
 * - React Queryによる自動キャッシング
 * - 楽観的更新でUX向上
 * - 自動的なエラーハンドリング・再試行
 * - バックグラウンドでのデータ更新
 */
export function useSystemSettingsV2(): UseSystemSettingsReturn {
  // フィルター状態管理
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    category: '',
    clinicId: '',
    isPublic: false,
  });

  // React Query フック
  const {
    data,
    isLoading,
    error,
    isFetching,
    isRefetching
  } = useSystemSettingsQuery(filters, {
    // フィルターが空の場合は自動実行しない
    enabled: Object.values(filters).some(value => 
      value !== '' && value !== undefined
    ) || true // 開発時は常に有効
  });

  const createMutation = useCreateSystemSettingMutation({
    onSuccess: () => {
      // 成功時の追加処理があれば記述
    },
    onError: (error) => {
      console.error('作成エラー:', error.message);
    }
  });

  const updateMutation = useUpdateSystemSettingMutation({
    onSuccess: () => {
      // 成功時の追加処理があれば記述
    },
    onError: (error) => {
      console.error('更新エラー:', error.message);
    }
  });

  const deleteMutation = useDeleteSystemSettingMutation({
    onSuccess: () => {
      // 成功時の追加処理があれば記述
    },
    onError: (error) => {
      console.error('削除エラー:', error.message);
    }
  });

  const refreshData = useRefreshSystemSettings();

  // コールバック関数
  const updateFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      search: '',
      category: '',
      clinicId: '',
      isPublic: false,
    });
  }, []);

  const createMasterData = useCallback(async (
    data: Partial<MasterDataDetail>
  ): Promise<Partial<MasterDataDetail>> => {
    try {
      const result = await createMutation.mutateAsync(data);
      return result;
    } catch (error) {
      throw error;
    }
  }, [createMutation]);

  const updateMasterData = useCallback(async (
    id: string, 
    updates: Partial<MasterDataDetail>
  ): Promise<void> => {
    try {
      await updateMutation.mutateAsync({ id, data: updates });
    } catch (error) {
      throw error;
    }
  }, [updateMutation]);

  const deleteMasterData = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      throw error;
    }
  }, [deleteMutation]);

  // エラーメッセージのフォーマット
  const formatErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'エラーが発生しました';
  }, []);

  // レスポンス型に合わせてデータを返す
  return {
    // データ
    masterData: data?.items || [],
    
    // 状態
    loading: isLoading,
    error: error ? formatErrorMessage(error) : null,
    
    // フィルター
    filters,
    
    // アクション
    fetchMasterData: refreshData,
    createMasterData,
    updateMasterData,
    deleteMasterData,
    updateFilters,
    resetFilters,
    
    // 追加状態（React Query特有）
    isFetching, // バックグラウンドフェッチ中
    isRefetching, // 手動リフレッシュ中
    
    // ミューテーション状態
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    
    // データ統計
    total: data?.total || 0,
  };
}

// 後方互換性のため、旧フック名でもエクスポート
export { useSystemSettingsV2 as useSystemSettings };
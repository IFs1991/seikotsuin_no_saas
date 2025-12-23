import { useState, useCallback } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';
import {
  MasterDataDetail,
  FilterState,
  UseSystemSettingsReturn,
  ApiResponse,
} from '@/types/admin';

export const useSystemSettings = (): UseSystemSettingsReturn => {
  const [masterData, setMasterData] = useState<MasterDataDetail[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<FilterState>({
    search: '',
    category: '',
    clinicId: '',
    isPublic: false,
  });

  // エラーメッセージのフォーマット
  const formatErrorMessage = (error: any): string => {
    if (error.details && Array.isArray(error.details)) {
      return error.details
        .map((detail: any) => `${detail.path?.join('.')}: ${detail.message}`)
        .join(', ');
    }
    return error.message || ERROR_MESSAGES.SERVER_ERROR;
  };

  // マスターデータの取得
  const fetchMasterData = useCallback(
    async (filters?: Partial<FilterState>) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        const currentFilters = { ...filterState, ...filters };

        if (currentFilters.category)
          params.append('category', currentFilters.category);
        if (currentFilters.clinicId)
          params.append('clinic_id', currentFilters.clinicId);
        if (currentFilters.isPublic !== undefined) {
          params.append('is_public', currentFilters.isPublic.toString());
        }

        const response = await fetch(
          `${API_ENDPOINTS.ADMIN.MASTER_DATA}?${params.toString()}`
        );
        const result: ApiResponse<MasterDataDetail[]> = await response.json();

        if (!result.success) {
          throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
        }

        const data = result.data || [];
        setMasterData(data);

        // カテゴリを抽出
        const uniqueCategories = Array.from(
          new Set(data.map(item => item.category))
        ).sort();
        setCategories(uniqueCategories);

        if (filters) {
          setFilterState(prev => ({ ...prev, ...filters }));
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(errorMessage);
        console.error('マスターデータ取得エラー:', err);
      } finally {
        setLoading(false);
      }
    },
    [filterState]
  );

  // マスターデータの作成
  const createMasterData = useCallback(
    async (data: Partial<MasterDataDetail>): Promise<boolean> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(API_ENDPOINTS.ADMIN.MASTER_DATA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result: ApiResponse<MasterDataDetail> = await response.json();

        if (!result.success) {
          throw { message: result.error, details: result.details };
        }

        if (result.data) {
          setMasterData(prev => [...prev, result.data!]);

          // カテゴリ更新
          if (
            result.data.category &&
            !categories.includes(result.data.category)
          ) {
            setCategories(prev => [...prev, result.data!.category].sort());
          }
        }

        return true;
      } catch (err: any) {
        const errorMessage = formatErrorMessage(err);
        setError(errorMessage);
        console.error('マスターデータ作成エラー:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [categories]
  );

  // マスターデータの更新
  const updateMasterData = useCallback(
    async (
      id: string,
      updates: Partial<MasterDataDetail>
    ): Promise<boolean> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(API_ENDPOINTS.ADMIN.MASTER_DATA, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...updates }),
        });

        const result: ApiResponse<MasterDataDetail> = await response.json();

        if (!result.success) {
          throw { message: result.error, details: result.details };
        }

        if (result.data) {
          setMasterData(prev =>
            prev.map(item => (item.id === id ? result.data! : item))
          );

          // カテゴリ更新
          if (
            result.data.category &&
            !categories.includes(result.data.category)
          ) {
            setCategories(prev => [...prev, result.data!.category].sort());
          }
        }

        return true;
      } catch (err: any) {
        const errorMessage = formatErrorMessage(err);
        setError(errorMessage);
        console.error('マスターデータ更新エラー:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [categories]
  );

  // マスターデータの削除
  const deleteMasterData = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_ENDPOINTS.ADMIN.MASTER_DATA}?id=${id}`,
        {
          method: 'DELETE',
        }
      );

      const result: ApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      setMasterData(prev => prev.filter(item => item.id !== id));
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      console.error('マスターデータ削除エラー:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // フィルター設定
  const setFilter = useCallback((filter: Partial<FilterState>) => {
    setFilterState(prev => ({ ...prev, ...filter }));
  }, []);

  // フィルターリセット
  const resetFilter = useCallback(() => {
    setFilterState({
      search: '',
      category: '',
      clinicId: '',
      isPublic: false,
    });
  }, []);

  return {
    // データ状態
    masterData,
    categories,

    // UI状態
    loading,
    error,
    filters: filterState,

    // アクション
    fetchMasterData,
    createMasterData,
    updateMasterData,
    deleteMasterData,

    // フィルター
    updateFilters: setFilter,
    resetFilters: resetFilter,
  };
};

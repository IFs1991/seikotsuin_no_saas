import { useState, useCallback } from 'react';
import { ERROR_MESSAGES } from '@/lib/constants';
import { createMasterDataDeprecationError } from '@/lib/admin/master-data-deprecation';
import {
  MasterDataDetail,
  FilterState,
  UseSystemSettingsReturn,
} from '@/types/admin';
import { logger } from '@/lib/logger';

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
        const currentFilters = { ...filterState, ...filters };
        setError(createMasterDataDeprecationError().message);
        setMasterData([]);
        setCategories([]);

        if (filters) {
          setFilterState(currentFilters);
        }
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
        void data;
        throw createMasterDataDeprecationError();
      } catch (err: any) {
        const errorMessage = formatErrorMessage(err);
        setError(errorMessage);
        logger.error('マスターデータ作成エラー:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // マスターデータの更新
  const updateMasterData = useCallback(
    async (
      id: string,
      updates: Partial<MasterDataDetail>
    ): Promise<boolean> => {
      try {
        setLoading(true);
        void id;
        void updates;
        throw createMasterDataDeprecationError();
      } catch (err: any) {
        const errorMessage = formatErrorMessage(err);
        setError(errorMessage);
        logger.error('マスターデータ更新エラー:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // マスターデータの削除
  const deleteMasterData = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      void id;
      throw createMasterDataDeprecationError();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      logger.error('マスターデータ削除エラー:', err);
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

  const exportMasterData = useCallback(
    async (filters?: Partial<FilterState>) => {
      try {
        setLoading(true);
        void filters;
        throw createMasterDataDeprecationError();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(errorMessage);
        logger.error('マスターデータエクスポートエラー:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const importMasterData = useCallback(
    async (items: MasterDataDetail[], clinicId?: string | null) => {
      try {
        setLoading(true);
        void items;
        void clinicId;
        throw createMasterDataDeprecationError();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
        setError(errorMessage);
        logger.error('マスターデータインポートエラー:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const rollbackMasterData = useCallback(async (clinicId?: string | null) => {
    try {
      setLoading(true);
      void clinicId;
      throw createMasterDataDeprecationError();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      logger.error('マスターデータロールバックエラー:', err);
      return false;
    } finally {
      setLoading(false);
    }
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
    exportMasterData,
    importMasterData,
    rollbackMasterData,

    // フィルター
    updateFilters: setFilter,
    resetFilters: resetFilter,
  };
};

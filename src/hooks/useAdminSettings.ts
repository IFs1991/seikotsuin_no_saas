'use client';

import { useState, useCallback, useEffect } from 'react';
import { LoadingState, SaveResult } from '@/types/admin';

// 設定カテゴリの型定義
export type SettingsCategory =
  | 'clinic_basic'
  | 'clinic_hours'
  | 'booking_calendar'
  | 'communication'
  | 'system_security'
  | 'system_backup'
  | 'services_pricing'
  | 'insurance_billing'
  | 'data_management';

// 永続化設定オプション
export interface PersistOptions {
  clinicId: string;
  category: SettingsCategory;
  autoLoad?: boolean;
}

/**
 * 管理設定フック（API永続化対応版）
 *
 * @param initialData - 初期データ（ロード前のデフォルト値）
 * @param persistOptions - 永続化オプション（指定時はAPIを使用）
 */
export function useAdminSettings<T>(
  initialData: T,
  persistOptions?: PersistOptions
) {
  const clinicId = persistOptions?.clinicId ?? null;
  const category = persistOptions?.category ?? null;
  const autoLoad = persistOptions?.autoLoad;
  const hasPersist = Boolean(clinicId && category);
  const [data, setData] = useState<T>(initialData);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    savedMessage: '',
  });

  // API経由で設定を取得
  const fetchSettings = useCallback(async () => {
    if (!hasPersist) {
      setIsInitialized(true);
      return;
    }

    setIsInitialized(false);

    setLoadingState(prev => ({
      ...prev,
      error: null,
      savedMessage: '',
    }));

    try {
      const response = await fetch(
        `/api/admin/settings?clinic_id=${clinicId}&category=${category}`
      );

      if (!response.ok) {
        throw new Error('設定の取得に失敗しました');
      }

      const result = await response.json();

      if (result.success && result.data?.settings) {
        setData(prev => ({ ...prev, ...result.data.settings }));
      }

      setIsInitialized(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '設定の取得に失敗しました';
      setLoadingState(prev => ({
        ...prev,
        error: errorMessage,
        savedMessage: '',
      }));
      setIsInitialized(true);
    }
  }, [clinicId, category, hasPersist]);

  // 初回ロード
  useEffect(() => {
    if (!hasPersist) {
      setIsInitialized(true);
      return;
    }

    if (autoLoad === false) {
      setIsInitialized(true);
      return;
    }

    fetchSettings();
  }, [autoLoad, fetchSettings, hasPersist]);

  const updateData = useCallback((updater: Partial<T> | ((prev: T) => T)) => {
    if (typeof updater === 'function') {
      setData(updater);
    } else {
      setData(prev => ({ ...prev, ...updater }));
    }
  }, []);

  // API経由で設定を保存
  const saveToApi = useCallback(
    async (settingsData: T): Promise<SaveResult> => {
      if (!hasPersist) {
        return { success: false, message: '永続化オプションが設定されていません' };
      }

      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clinic_id: clinicId,
          category,
          settings: settingsData,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '設定の保存に失敗しました');
      }

      return {
        success: result.success,
        message: result.data?.message || '設定を保存しました',
      };
    },
    [clinicId, category, hasPersist]
  );

  const handleSave = useCallback(
    async (
      saveFunction?: (data: T) => Promise<SaveResult>
    ): Promise<SaveResult> => {
      setLoadingState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        savedMessage: '',
      }));

      try {
        let result: SaveResult;

        if (saveFunction) {
          // カスタム保存関数が指定された場合
          result = await saveFunction(data);
        } else if (hasPersist) {
          // 永続化オプションがある場合はAPIに保存
          result = await saveToApi(data);
        } else {
          // 互換性のため：何も指定されない場合は擬似保存
          await new Promise(resolve => setTimeout(resolve, 500));
          result = { success: true, message: '設定を保存しました' };
        }

        setLoadingState({
          isLoading: false,
          error: result.success ? null : result.message,
          savedMessage: result.message,
        });

        // 3秒後にメッセージをクリア
        setTimeout(() => {
          setLoadingState(prev => ({ ...prev, savedMessage: '' }));
        }, 3000);

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : '保存に失敗しました';
        setLoadingState({
          isLoading: false,
          error: errorMessage,
          savedMessage: errorMessage,
        });
        return { success: false, message: errorMessage };
      }
    },
    [data, hasPersist, saveToApi]
  );

  const handleAction = useCallback(
    async (
      actionFunction: () => Promise<SaveResult>,
      successMessage: string = 'アクションが完了しました'
    ): Promise<SaveResult> => {
      setLoadingState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        savedMessage: '',
      }));

      try {
        const result = await actionFunction();

        setLoadingState({
          isLoading: false,
          error: result.success ? null : result.message,
          savedMessage: result.success ? successMessage : result.message,
        });

        setTimeout(() => {
          setLoadingState(prev => ({ ...prev, savedMessage: '' }));
        }, 3000);

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'アクションに失敗しました';
        setLoadingState({
          isLoading: false,
          error: errorMessage,
          savedMessage: errorMessage,
        });
        return { success: false, message: errorMessage };
      }
    },
    []
  );

  const clearMessages = useCallback(() => {
    setLoadingState(prev => ({ ...prev, error: null, savedMessage: '' }));
  }, []);

  // 設定を再読み込み
  const reload = useCallback(async () => {
    await fetchSettings();
  }, [fetchSettings]);

  return {
    data,
    setData,
    updateData,
    loadingState,
    handleSave,
    handleAction,
    clearMessages,
    reload,
    isInitialized,
  };
}

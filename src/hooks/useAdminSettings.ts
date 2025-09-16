"use client";

import { useState, useCallback } from 'react';
import { LoadingState, SaveResult } from '@/types/admin';

export function useAdminSettings<T>(initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    savedMessage: ''
  });

  const updateData = useCallback((updater: Partial<T> | ((prev: T) => T)) => {
    if (typeof updater === 'function') {
      setData(updater);
    } else {
      setData(prev => ({ ...prev, ...updater }));
    }
  }, []);

  const handleSave = useCallback(async (
    saveFunction?: (data: T) => Promise<SaveResult>
  ): Promise<SaveResult> => {
    setLoadingState(prev => ({ ...prev, isLoading: true, error: null, savedMessage: '' }));
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 模擬的な保存処理
      
      const result: SaveResult = saveFunction 
        ? await saveFunction(data)
        : { success: true, message: '設定を保存しました' };

      setLoadingState({
        isLoading: false,
        error: null,
        savedMessage: result.message
      });

      // 3秒後にメッセージをクリア
      setTimeout(() => {
        setLoadingState(prev => ({ ...prev, savedMessage: '' }));
      }, 3000);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存に失敗しました';
      setLoadingState({
        isLoading: false,
        error: errorMessage,
        savedMessage: errorMessage
      });
      return { success: false, message: errorMessage };
    }
  }, [data]);

  const handleAction = useCallback(async (
    actionFunction: () => Promise<SaveResult>,
    successMessage: string = 'アクションが完了しました'
  ): Promise<SaveResult> => {
    setLoadingState(prev => ({ ...prev, isLoading: true, error: null, savedMessage: '' }));
    
    try {
      const result = await actionFunction();
      
      setLoadingState({
        isLoading: false,
        error: null,
        savedMessage: result.success ? successMessage : result.message
      });

      setTimeout(() => {
        setLoadingState(prev => ({ ...prev, savedMessage: '' }));
      }, 3000);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'アクションに失敗しました';
      setLoadingState({
        isLoading: false,
        error: errorMessage,
        savedMessage: errorMessage
      });
      return { success: false, message: errorMessage };
    }
  }, []);

  const clearMessages = useCallback(() => {
    setLoadingState(prev => ({ ...prev, error: null, savedMessage: '' }));
  }, []);

  return {
    data,
    setData,
    updateData,
    loadingState,
    handleSave,
    handleAction,
    clearMessages
  };
}
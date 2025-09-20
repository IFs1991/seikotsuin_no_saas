'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/database/supabase-client';
import { generateAnalysisReport } from '../api/gemini/ai-analysis-service';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  storeIds?: string[];
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  selectedStores: string[];
  visualizationEnabled: boolean;
  exportChat?: () => void;
  searchHistory?: () => void;
}

export const useAdminChat = () => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    selectedStores: [],
    visualizationEnabled: false,
  });

  // supabaseは既にインポート済み

  const connectWebSocket = useCallback(() => {
    const channel = supabase
      .channel('admin-chat')
      .on('presence', { event: 'sync' }, () => {
        console.log('Presence sync');
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [supabase]);

  const loadChatHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) throw error;

      setState(prev => ({
        ...prev,
        messages: data,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'チャット履歴の読み込みに失敗しました',
      }));
    }
  }, [supabase]);

  const sendMessage = useCallback(
    async (content: string) => {
      setState(prev => ({ ...prev, isLoading: true }));

      try {
        const message: Message = {
          id: crypto.randomUUID(),
          content,
          role: 'user',
          timestamp: new Date(),
          storeIds: state.selectedStores,
        };

        await supabase.from('chat_sessions').insert([message]);

        const aiResponse = await gemini.generateResponse(
          content,
          state.selectedStores
        );

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          content: aiResponse,
          role: 'assistant',
          timestamp: new Date(),
          storeIds: state.selectedStores,
        };

        await supabase.from('chat_sessions').insert([assistantMessage]);

        setState(prev => ({
          ...prev,
          messages: [...prev.messages, message, assistantMessage],
          isLoading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: 'メッセージの送信に失敗しました',
          isLoading: false,
        }));
      }
    },
    [state.selectedStores, supabase, gemini]
  );

  const setSelectedStores = useCallback((storeIds: string[]) => {
    setState(prev => ({
      ...prev,
      selectedStores: storeIds,
    }));
  }, []);

  const toggleVisualization = useCallback(() => {
    setState(prev => ({
      ...prev,
      visualizationEnabled: !prev.visualizationEnabled,
    }));
  }, []);

  const exportChat = useCallback(() => {
    // チャット履歴をエクスポートする機能（スタブ）
    console.log('Chat export functionality');
  }, []);

  const searchHistory = useCallback(() => {
    // チャット履歴を検索する機能（スタブ）
    console.log('Search history functionality');
  }, []);

  useEffect(() => {
    loadChatHistory();
    const cleanup = connectWebSocket();
    return cleanup;
  }, [loadChatHistory, connectWebSocket]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    selectedStores: state.selectedStores,
    visualizationEnabled: state.visualizationEnabled,
    sendMessage,
    setSelectedStores,
    toggleVisualization,
    exportChat,
    searchHistory,
  };
};

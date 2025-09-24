'use client';

import { useCallback, useEffect, useState } from 'react';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: string;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

interface ChatApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const useAdminChat = () => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
  });

  const fetchMessages = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch('/api/chat', {
        method: 'GET',
        credentials: 'include',
      });

      const payload = (await response.json()) as ChatApiResponse<
        Array<{
          id: string;
          chat_messages?: Array<{
            id: string;
            sender: 'user' | 'ai';
            message_text: string;
            created_at: string;
          }>;
        }>
      >;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'チャット履歴の取得に失敗しました');
      }

      const messages = payload.data
        .flatMap(session => session.chat_messages ?? [])
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map<Message>(message => ({
          id: message.id,
          content: message.message_text,
          role: message.sender === 'ai' ? 'assistant' : 'user',
          createdAt: message.created_at,
        }));

      setState({ messages, isLoading: false, error: null });
    } catch (error) {
      console.error(error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'チャット履歴の読み込みに失敗しました',
      }));
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: content }),
        });

        const payload = (await response.json()) as ChatApiResponse<{
          session_id: string;
          user_message: {
            id: string;
            message_text: string;
            created_at: string;
          };
          ai_message: {
            id: string;
            message_text: string;
            created_at: string;
          };
        }>;

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || 'メッセージ送信に失敗しました');
        }

        setState(prev => ({
          ...prev,
          isLoading: false,
          messages: [
            ...prev.messages,
            {
              id: payload.data.user_message.id,
              content: payload.data.user_message.message_text,
              role: 'user',
              createdAt: payload.data.user_message.created_at,
            },
            {
              id: payload.data.ai_message.id,
              content: payload.data.ai_message.message_text,
              role: 'assistant',
              createdAt: payload.data.ai_message.created_at,
            },
          ],
        }));
      } catch (error) {
        console.error(error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'メッセージの送信に失敗しました',
        }));
      }
    },
    []
  );

  const exportChat = useCallback(() => {
    const blob = new Blob([JSON.stringify(state.messages, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `admin-chat_${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [state.messages]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    sendMessage,
    exportChat,
  };
};

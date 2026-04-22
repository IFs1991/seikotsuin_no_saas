'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AdminChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: string;
}

interface ChatState {
  messages: AdminChatMessage[];
  isLoading: boolean;
  error: string | null;
  currentSessionId: string | null;
}

interface ChatApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AdminChatSessionMessage {
  id: string;
  sender: 'user' | 'ai';
  message_text: string;
  created_at: string;
}

interface AdminChatSession {
  id: string;
  chat_messages?: AdminChatSessionMessage[];
}

interface AdminChatPostResponse {
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
    response_data?: unknown;
  };
}

interface UseAdminChatOptions {
  selectedClinicId?: string | null;
  sessionId?: string | null;
  periodDays?: number;
  enabled?: boolean;
}

const buildAdminChatUrl = (options: UseAdminChatOptions) => {
  const params = new URLSearchParams();

  if (options.selectedClinicId) {
    params.set('clinic_id', options.selectedClinicId);
  }

  if (options.sessionId) {
    params.set('session_id', options.sessionId);
  }

  const query = params.toString();
  return query ? `/api/admin/chat?${query}` : '/api/admin/chat';
};

export const useAdminChat = (options: UseAdminChatOptions = {}) => {
  const {
    selectedClinicId = null,
    sessionId = null,
    periodDays,
    enabled = true,
  } = options;
  const currentSessionIdRef = useRef<string | null>(sessionId);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    currentSessionId: sessionId,
  });

  const fetchMessages = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    currentSessionIdRef.current = sessionId;
    setState({
      messages: [],
      isLoading: true,
      error: null,
      currentSessionId: sessionId,
    });
    try {
      const response = await fetch(
        buildAdminChatUrl({ selectedClinicId, sessionId }),
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      const payload = (await response.json()) as ChatApiResponse<
        AdminChatSession[]
      >;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'チャット履歴の取得に失敗しました');
      }

      const sessions = payload.data;
      const messages = sessions
        .flatMap(session => session.chat_messages ?? [])
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map<AdminChatMessage>(message => ({
          id: message.id,
          content: message.message_text,
          role: message.sender === 'ai' ? 'assistant' : 'user',
          createdAt: message.created_at,
        }));

      const nextSessionId = sessionId ?? sessions[0]?.id ?? null;
      if (requestIdRef.current !== requestId) {
        return;
      }
      currentSessionIdRef.current = nextSessionId;
      setState({
        messages,
        isLoading: false,
        error: null,
        currentSessionId: nextSessionId,
      });
    } catch {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'チャット履歴の読み込みに失敗しました',
      }));
    }
  }, [selectedClinicId, sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      if (!enabled) {
        setState(prev => ({
          ...prev,
          error: '分析対象スコープを確定してください',
        }));
        return;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetch('/api/admin/chat', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: content,
            clinic_id: selectedClinicId,
            session_id: currentSessionIdRef.current,
            period_days: periodDays,
          }),
        });

        const payload =
          (await response.json()) as ChatApiResponse<AdminChatPostResponse>;

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || 'メッセージ送信に失敗しました');
        }

        const data = payload.data;
        currentSessionIdRef.current = data.session_id;

        setState(prev => ({
          ...prev,
          isLoading: false,
          currentSessionId: data.session_id,
          messages: [
            ...prev.messages,
            {
              id: data.user_message.id,
              content: data.user_message.message_text,
              role: 'user',
              createdAt: data.user_message.created_at,
            },
            {
              id: data.ai_message.id,
              content: data.ai_message.message_text,
              role: 'assistant',
              createdAt: data.ai_message.created_at,
            },
          ],
        }));
      } catch {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'メッセージの送信に失敗しました',
        }));
      }
    },
    [enabled, periodDays, selectedClinicId]
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
    if (!enabled) {
      requestIdRef.current += 1;
      currentSessionIdRef.current = sessionId;
      setState({
        messages: [],
        isLoading: false,
        error: null,
        currentSessionId: sessionId,
      });
      return;
    }

    void fetchMessages();
  }, [enabled, fetchMessages, sessionId]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    sendMessage,
    exportChat,
  };
};

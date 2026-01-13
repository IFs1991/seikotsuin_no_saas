import { useState, useEffect, useCallback } from 'react';
import { api, isSuccessResponse, handleApiError } from '@/lib/api-client';

/**
 * チャットメッセージの型定義
 */
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  session_id?: string;
  response_data?: Record<string, unknown>;
}

/**
 * チャットセッションの型定義
 */
interface ChatSession {
  id: string;
  user_id: string;
  clinic_id?: string;
  created_at: string;
  chat_messages: {
    id: string;
    sender: 'user' | 'ai';
    message_text: string;
    response_data?: Record<string, unknown>;
    created_at: string;
  }[];
}

/**
 * チャット状態の型定義
 */
interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  isEnabled: boolean;
  currentSessionId: string | null;
  sessions: ChatSession[];
}

/**
 * API応答から内部メッセージ形式に変換
 */
function convertToMessages(sessions: ChatSession[]): Message[] {
  const messages: Message[] = [];

  for (const session of sessions) {
    for (const msg of session.chat_messages || []) {
      messages.push({
        id: msg.id,
        content: msg.message_text,
        role: msg.sender === 'user' ? 'user' : 'assistant',
        timestamp: new Date(msg.created_at).getTime(),
        session_id: session.id,
        response_data: msg.response_data,
      });
    }
  }

  // 時間順でソート
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * useChat Hook - API連携版
 *
 * MVPチャット機能のフック
 * - ローカル保存は廃止
 * - API経由で送信/履歴取得
 */
export const useChat = (clinicId: string | null) => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: true,
    error: null,
    isEnabled: true,
    currentSessionId: null,
    sessions: [],
  });

  /**
   * チャット履歴を取得
   */
  const fetchHistory = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await api.chat.getHistory(clinicId ?? undefined);

      if (isSuccessResponse(response)) {
        const sessions = response.data as ChatSession[];
        const messages = convertToMessages(sessions);
        const currentSessionId = sessions.length > 0 ? sessions[0].id : null;

        setState(prev => ({
          ...prev,
          sessions,
          messages,
          currentSessionId,
          isLoading: false,
          error: null,
        }));
      } else {
        const errorMessage = response.error
          ? handleApiError(response.error, '履歴の取得に失敗しました')
          : '履歴の取得に失敗しました';

        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: '履歴の取得に失敗しました',
      }));
    }
  }, [clinicId]);

  /**
   * 初回ロード時に履歴を取得
   */
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /**
   * メッセージを送信
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        return;
      }

      if (!state.isEnabled) {
        return;
      }

      // 楽観的更新: ユーザーメッセージを即座に追加
      const tempUserMessageId = `temp-user-${Date.now()}`;
      const userMessage: Message = {
        id: tempUserMessageId,
        content,
        role: 'user',
        timestamp: Date.now(),
        session_id: state.currentSessionId || undefined,
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
      }));

      try {
        const response = await api.chat.sendMessage({
          message: content,
          clinic_id: clinicId,
          session_id: state.currentSessionId,
        });

        if (isSuccessResponse(response)) {
          const data = response.data as {
            session_id: string;
            user_message: {
              id: string;
              sender: string;
              message_text: string;
            };
            ai_message: {
              id: string;
              sender: string;
              message_text: string;
              response_data?: Record<string, unknown>;
            };
          };

          // ユーザーメッセージを正式なIDで更新し、AI応答を追加
          const updatedUserMessage: Message = {
            id: data.user_message.id,
            content: data.user_message.message_text,
            role: 'user',
            timestamp: Date.now(),
            session_id: data.session_id,
          };

          const aiMessage: Message = {
            id: data.ai_message.id,
            content: data.ai_message.message_text,
            role: 'assistant',
            timestamp: Date.now() + 1,
            session_id: data.session_id,
            response_data: data.ai_message.response_data,
          };

          setState(prev => ({
            ...prev,
            messages: [
              ...prev.messages.filter(m => m.id !== tempUserMessageId),
              updatedUserMessage,
              aiMessage,
            ],
            currentSessionId: data.session_id,
            isLoading: false,
            error: null,
          }));
        } else {
          const errorMessage = response.error
            ? handleApiError(response.error, 'メッセージの送信に失敗しました')
            : 'メッセージの送信に失敗しました';

          setState(prev => ({
            ...prev,
            isLoading: false,
            error: errorMessage,
          }));
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'メッセージの送信に失敗しました',
        }));
      }
    },
    [clinicId, state.currentSessionId, state.isEnabled]
  );

  /**
   * チャットの有効/無効を切り替え
   */
  const toggleChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      isEnabled: !prev.isEnabled,
    }));
  }, []);

  /**
   * 新しいセッションを開始
   */
  const startNewSession = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentSessionId: null,
      messages: [],
      error: null,
    }));
  }, []);

  /**
   * メッセージをクリア（現在のセッションのみ）
   */
  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      error: null,
    }));
  }, []);

  /**
   * 履歴を再取得
   */
  const refetch = useCallback(async () => {
    await fetchHistory();
  }, [fetchHistory]);

  /**
   * 特定のセッションを選択
   */
  const selectSession = useCallback((sessionId: string) => {
    setState(prev => {
      const session = prev.sessions.find(s => s.id === sessionId);
      if (!session) return prev;

      const messages = convertToMessages([session]);
      return {
        ...prev,
        currentSessionId: sessionId,
        messages,
      };
    });
  }, []);

  /**
   * 音声入力を開始（ブラウザ互換性チェック）
   */
  const startVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') {
      setState(prev => ({
        ...prev,
        error: '音声入力はこの環境でサポートされていません。',
      }));
      return;
    }

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setState(prev => ({
        ...prev,
        error: '音声入力はこのブラウザでサポートされていません。',
      }));
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      sendMessage(transcript);
    };

    recognition.onerror = () => {
      setState(prev => ({
        ...prev,
        error: '音声入力に失敗しました。',
      }));
    };

    recognition.start();
  }, [sendMessage]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    isEnabled: state.isEnabled,
    currentSessionId: state.currentSessionId,
    sessions: state.sessions,
    sendMessage,
    toggleChat,
    startNewSession,
    clearMessages,
    refetch,
    selectSession,
    startVoiceInput,
  };
};

export type { ChatSession };

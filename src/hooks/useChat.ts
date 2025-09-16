import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { generateAnalysisReport } from '../api/gemini/ai-analysis-service';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  isEnabled: boolean;
}

const RATE_LIMIT_INTERVAL = 1000;
const MAX_MESSAGES_PER_INTERVAL = 5;

export const useChat = (storeId: string) => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    isEnabled: true
  });

  const [messageCount, setMessageCount] = useState(0);
  const [lastMessageTime, setLastMessageTime] = useState(Date.now());

  useEffect(() => {
    const savedMessages = localStorage.getItem(`chat_messages_${storeId}`);
    if (savedMessages) {
      setState(prev => ({
        ...prev,
        messages: JSON.parse(savedMessages)
      }));
    }
  }, [storeId]);

  const saveToLocalStorage = useCallback((messages: Message[]) => {
    localStorage.setItem(`chat_messages_${storeId}`, JSON.stringify(messages));
  }, [storeId]);

  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    if (now - lastMessageTime > RATE_LIMIT_INTERVAL) {
      setMessageCount(1);
      setLastMessageTime(now);
      return true;
    }
    if (messageCount >= MAX_MESSAGES_PER_INTERVAL) {
      return false;
    }
    setMessageCount(prev => prev + 1);
    return true;
  }, [lastMessageTime, messageCount]);

  const sendMessage = useCallback(async (content: string) => {
    if (!state.isEnabled) return;
    if (!checkRateLimit()) {
      setState(prev => ({
        ...prev,
        error: 'メッセージの送信頻度が高すぎます。しばらくお待ちください。'
      }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const newMessage: Message = {
        id: Date.now().toString(),
        content,
        role: 'user',
        timestamp: Date.now()
      };

      const updatedMessages = [...state.messages, newMessage];
      setState(prev => ({
        ...prev,
        messages: updatedMessages
      }));
      saveToLocalStorage(updatedMessages);

      const response = await analyzeMessage(content, storeId);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        role: 'assistant',
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setState(prev => ({
        ...prev,
        messages: finalMessages,
        isLoading: false
      }));
      saveToLocalStorage(finalMessages);

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: '申し訳ありません。メッセージの送信に失敗しました。'
      }));
    }
  }, [state.isEnabled, state.messages, checkRateLimit, saveToLocalStorage, storeId]);

  const toggleChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      isEnabled: !prev.isEnabled
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      error: null
    }));
    localStorage.removeItem(`chat_messages_${storeId}`);
  }, [storeId]);

  const startVoiceInput = useCallback(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      setState(prev => ({
        ...prev,
        error: '音声入力はこのブラウザでサポートされていません。'
      }));
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      sendMessage(transcript);
    };

    recognition.onerror = () => {
      setState(prev => ({
        ...prev,
        error: '音声入力に失敗しました。'
      }));
    };

    recognition.start();
  }, [sendMessage]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    isEnabled: state.isEnabled,
    sendMessage,
    toggleChat,
    clearMessages,
    startVoiceInput
  };
};

export type { Message };
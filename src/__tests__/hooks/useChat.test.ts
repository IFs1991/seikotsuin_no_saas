/** @jest-environment jsdom */

/**
 * useChat Hook Tests - TDD for AIチャット MVP
 *
 * 仕様:
 * - ローカル保存は廃止
 * - API経由で送信/履歴取得
 *
 * 受け入れ基準:
 * - 送信でAI応答が返る
 * - 履歴が再取得できる
 */

import { renderHook, waitFor, act } from '@testing-library/react';

// APIクライアントのモック
const mockGetHistory = jest.fn();
const mockSendMessage = jest.fn();

jest.mock('@/lib/api-client', () => ({
  api: {
    chat: {
      getHistory: (...args: unknown[]) => mockGetHistory(...args),
      sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    },
  },
  isSuccessResponse: (response: any) => Boolean(response?.success),
  isErrorResponse: (response: any) => response?.success === false,
  handleApiError: (error: any) => error?.message || 'エラーが発生しました',
}));

// 新しいuseChatフックをインポート（API連携版）
import { useChat } from '@/hooks/useChat';

describe('useChat Hook (API Integration)', () => {
  const mockClinicId = 'clinic-123';

  const mockMessages = [
    {
      id: 'msg-1',
      sender: 'user',
      message_text: '売上を教えて',
      created_at: '2025-01-01T10:00:00Z',
    },
    {
      id: 'msg-2',
      sender: 'ai',
      message_text: '今月の売上は100万円です。',
      created_at: '2025-01-01T10:00:01Z',
    },
  ];

  const mockSessions = [
    {
      id: 'session-1',
      user_id: 'user-123',
      clinic_id: mockClinicId,
      created_at: '2025-01-01T10:00:00Z',
      chat_messages: mockMessages,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // localStorageをモック
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  describe('初期状態', () => {
    it('初期状態でloadingがtrueになる', () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      expect(result.current.isLoading).toBe(true);
    });

    it('初期状態でメッセージが空配列', () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      expect(result.current.messages).toEqual([]);
    });
  });

  describe('履歴取得', () => {
    it('API経由でチャット履歴を取得できる', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: mockSessions,
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetHistory).toHaveBeenCalledWith(mockClinicId);
      expect(result.current.messages.length).toBe(2);
    });

    it('履歴取得エラー時にエラーメッセージを設定', async () => {
      mockGetHistory.mockResolvedValue({
        success: false,
        error: { message: '履歴の取得に失敗しました' },
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });

    it('localStorageを使用しない', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: mockSessions,
      });

      renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(window.localStorage.getItem).not.toHaveBeenCalled();
      });
    });

    it('clinicIdがnullの場合はAPIを呼び出さない', async () => {
      const { result } = renderHook(() => useChat(null));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetHistory).not.toHaveBeenCalled();
    });
  });

  describe('メッセージ送信', () => {
    it('sendMessageでAPI経由でメッセージを送信できる', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          session_id: 'session-1',
          user_message: {
            id: 'msg-new-1',
            sender: 'user',
            message_text: 'テストメッセージ',
          },
          ai_message: {
            id: 'msg-new-2',
            sender: 'ai',
            message_text: 'AI応答です',
          },
        },
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage('テストメッセージ');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'テストメッセージ',
          clinic_id: mockClinicId,
        })
      );
    });

    it('送信成功後にメッセージリストが更新される', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          session_id: 'session-1',
          user_message: {
            id: 'msg-new-1',
            sender: 'user',
            message_text: 'テストメッセージ',
          },
          ai_message: {
            id: 'msg-new-2',
            sender: 'ai',
            message_text: 'AI応答です',
          },
        },
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage('テストメッセージ');
      });

      // ユーザーメッセージとAI応答の2つが追加される
      expect(result.current.messages.length).toBe(2);
    });

    it('送信エラー時にエラーメッセージを設定', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      mockSendMessage.mockResolvedValue({
        success: false,
        error: { message: '送信に失敗しました' },
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage('テストメッセージ');
      });

      expect(result.current.error).toBeTruthy();
    });

    it('空のメッセージは送信されない', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage('');
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('空白のみのメッセージは送信されない', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage('   ');
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('送信中はisLoadingがtrueになる', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      let resolvePromise: (value: any) => void;
      mockSendMessage.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.sendMessage('テストメッセージ');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolvePromise!({
          success: true,
          data: {
            session_id: 'session-1',
            user_message: { id: 'msg-1', sender: 'user', message_text: 'テスト' },
            ai_message: { id: 'msg-2', sender: 'ai', message_text: '応答' },
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('セッション管理', () => {
    it('現在のセッションIDを保持する', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: mockSessions,
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currentSessionId).toBe('session-1');
    });

    it('新しいセッションを開始できる', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: mockSessions,
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.startNewSession();
      });

      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.messages).toEqual([]);
    });
  });

  describe('refetch機能', () => {
    it('refetchで履歴を再取得できる', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: mockSessions,
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetHistory).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetHistory).toHaveBeenCalledTimes(2);
    });
  });

  describe('チャット有効/無効', () => {
    it('toggleChatでチャットの有効/無効を切り替えられる', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEnabled).toBe(true);

      act(() => {
        result.current.toggleChat();
      });

      expect(result.current.isEnabled).toBe(false);

      act(() => {
        result.current.toggleChat();
      });

      expect(result.current.isEnabled).toBe(true);
    });

    it('チャットが無効の場合はメッセージを送信できない', async () => {
      mockGetHistory.mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useChat(mockClinicId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.toggleChat();
      });

      expect(result.current.isEnabled).toBe(false);

      await act(async () => {
        await result.current.sendMessage('テストメッセージ');
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });
});

/** @jest-environment jsdom */

/**
 * Chat Page Component Tests - TDD for AIチャット MVP
 *
 * 仕様:
 * - src/app/chat/page.tsx を動的チャットUIに変更
 * - 送信/履歴/編集状態を連動
 * - 認証コンテキストから clinicId を取得する（認証コンテキスト連携 MVP）
 *
 * 受け入れ基準:
 * - 送信でAI応答が返る（UIに反映）
 * - 履歴が再取得できる（表示される）
 * - demo-clinic-id がハードコードされていない
 * - clinicId が無い場合は送信ボタンが disabled
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// scrollIntoViewのモック
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

// useChatフックをモック
const mockSendMessage = jest.fn();
const mockRefetch = jest.fn();
const mockStartNewSession = jest.fn();
const mockToggleChat = jest.fn();
const mockClearMessages = jest.fn();
const mockStartVoiceInput = jest.fn();

const mockUseChatReturn = {
  messages: [],
  isLoading: false,
  error: null,
  currentSessionId: null,
  sessions: [],
  sendMessage: mockSendMessage,
  refetch: mockRefetch,
  startNewSession: mockStartNewSession,
  isEnabled: true,
  toggleChat: mockToggleChat,
  clearMessages: mockClearMessages,
  startVoiceInput: mockStartVoiceInput,
  selectSession: jest.fn(),
};

jest.mock('@/hooks/useChat', () => ({
  useChat: jest.fn(() => mockUseChatReturn),
  Message: {},
}));

// useUserProfileContextをモック
const mockProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'admin',
  clinicId: 'test-clinic-id',
  isActive: true,
  isAdmin: true,
};

const mockUseUserProfileContext = jest.fn(() => ({
  profile: mockProfile,
  loading: false,
  error: null,
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => mockUseUserProfileContext(),
}));

import ChatPage from '@/app/chat/page';
import { useChat } from '@/hooks/useChat';

const mockUseChat = useChat as jest.MockedFunction<typeof useChat>;

describe('ChatPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChat.mockReturnValue({ ...mockUseChatReturn });
  });

  describe('基本レンダリング', () => {
    it('チャットページがレンダリングされる', () => {
      render(<ChatPage />);

      expect(screen.getByText(/AIチャット/i)).toBeInTheDocument();
    });

    it('メッセージ入力フィールドが表示される', () => {
      render(<ChatPage />);

      expect(
        screen.getByPlaceholderText(/メッセージを入力/i)
      ).toBeInTheDocument();
    });

    it('送信ボタンが表示される', () => {
      render(<ChatPage />);

      expect(screen.getByRole('button', { name: /送信/i })).toBeInTheDocument();
    });

    it('新規チャットボタンが表示される', () => {
      render(<ChatPage />);

      expect(
        screen.getByRole('button', { name: /新規チャット/i })
      ).toBeInTheDocument();
    });
  });

  describe('メッセージ送信', () => {
    it('メッセージを入力して送信できる', async () => {
      const user = userEvent.setup();
      mockSendMessage.mockResolvedValue(undefined);

      render(<ChatPage />);

      const input = screen.getByPlaceholderText(/メッセージを入力/i);
      const sendButton = screen.getByRole('button', { name: /送信/i });

      await user.type(input, '売上を教えて');
      await user.click(sendButton);

      expect(mockSendMessage).toHaveBeenCalledWith('売上を教えて');
    });

    it('Enterキーでメッセージを送信できる', async () => {
      const user = userEvent.setup();
      mockSendMessage.mockResolvedValue(undefined);

      render(<ChatPage />);

      const input = screen.getByPlaceholderText(/メッセージを入力/i);

      await user.type(input, '患者動向について{Enter}');

      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('空のメッセージは送信されない', async () => {
      const user = userEvent.setup();
      render(<ChatPage />);

      const sendButton = screen.getByRole('button', { name: /送信/i });
      await user.click(sendButton);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('メッセージ表示', () => {
    it('ユーザーメッセージが表示される', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        messages: [
          {
            id: 'msg-1',
            content: 'こんにちは',
            role: 'user',
            timestamp: Date.now(),
          },
        ],
        currentSessionId: 'session-1',
      });

      render(<ChatPage />);

      expect(screen.getByText('こんにちは')).toBeInTheDocument();
    });

    it('AI応答が表示される', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        messages: [
          {
            id: 'msg-1',
            content: 'こんにちは',
            role: 'user',
            timestamp: Date.now(),
          },
          {
            id: 'msg-2',
            content: '何かお手伝いできますか？',
            role: 'assistant',
            timestamp: Date.now() + 1,
          },
        ],
        currentSessionId: 'session-1',
      });

      render(<ChatPage />);

      expect(screen.getByText('こんにちは')).toBeInTheDocument();
      expect(screen.getByText('何かお手伝いできますか？')).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はインジケータを表示', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        isLoading: true,
      });

      render(<ChatPage />);

      expect(screen.getByText(/応答.*生成中/i)).toBeInTheDocument();
    });

    it('ローディング中は送信ボタンが無効', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        isLoading: true,
      });

      render(<ChatPage />);

      const sendButton = screen.getByRole('button', { name: /送信/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('エラー状態', () => {
    it('エラーメッセージを表示', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        error: 'ネットワークエラーが発生しました',
      });

      render(<ChatPage />);

      expect(screen.getByText(/エラー.*ネットワーク/i)).toBeInTheDocument();
    });
  });

  describe('クイックアクション', () => {
    it('クイック質問ボタンが表示される', () => {
      render(<ChatPage />);

      expect(
        screen.getByRole('button', { name: /売上分析/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /患者動向/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /スタッフ評価/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /経営アドバイス/i })
      ).toBeInTheDocument();
    });

    it('クイック質問をクリックするとメッセージが送信される', async () => {
      const user = userEvent.setup();
      mockSendMessage.mockResolvedValue(undefined);

      render(<ChatPage />);

      const quickButton = screen.getByRole('button', { name: /売上分析/i });
      await user.click(quickButton);

      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('セッション管理', () => {
    it('新規チャットボタンをクリックすると新しいセッションが開始される', async () => {
      const user = userEvent.setup();
      render(<ChatPage />);

      const newChatButton = screen.getByRole('button', {
        name: /新規チャット/i,
      });
      await user.click(newChatButton);

      expect(mockStartNewSession).toHaveBeenCalled();
    });
  });

  describe('チャット有効/無効', () => {
    it('チャットが無効の場合はメッセージエリアに案内を表示', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        isEnabled: false,
      });

      render(<ChatPage />);

      expect(
        screen.getByText(/チャットを有効にしてください/i)
      ).toBeInTheDocument();
    });

    it('チャットが無効の場合は入力フィールドが無効', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        isEnabled: false,
      });

      render(<ChatPage />);

      const input = screen.getByPlaceholderText(/メッセージを入力/i);
      expect(input).toBeDisabled();
    });

    it('有効/無効ボタンをクリックするとtoggleChatが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ChatPage />);

      const toggleButton = screen.getByRole('button', { name: /有効/i });
      await user.click(toggleButton);

      expect(mockToggleChat).toHaveBeenCalled();
    });
  });

  describe('空の状態', () => {
    it('メッセージがない場合は案内テキストを表示', () => {
      mockUseChat.mockReturnValue({
        ...mockUseChatReturn,
        messages: [],
        isLoading: false,
      });

      render(<ChatPage />);

      expect(
        screen.getByText(/メッセージを入力して会話を開始/i)
      ).toBeInTheDocument();
    });
  });

  /**
   * 認証コンテキスト連携テスト（認証コンテキスト連携 MVP）
   * - clinicIdあり: useChat が正しい clinicId を受け取る
   * - clinicIdなし: 送信ボタンが disabled
   * - demo-clinic-id がハードコードされていないことを検証
   */
  describe('認証コンテキスト連携', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('demo-clinic-id がハードコードされていない（profile.clinicIdを使用）', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: 'real-clinic-id-from-auth' },
        loading: false,
        error: null,
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      // useChat が profile.clinicId で呼ばれることを確認
      expect(mockUseChat).toHaveBeenCalledWith('real-clinic-id-from-auth');
      // demo-clinic-id ではないことを確認
      expect(mockUseChat).not.toHaveBeenCalledWith('demo-clinic-id');
    });

    it('clinicId がある場合、正しい clinicId が useChat に渡される', () => {
      const testClinicId = 'test-clinic-12345';
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: testClinicId },
        loading: false,
        error: null,
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      expect(mockUseChat).toHaveBeenCalledWith(testClinicId);
    });

    it('clinicId が null の場合、送信ボタンが disabled になる', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      const sendButton = screen.getByRole('button', { name: /送信/i });
      expect(sendButton).toBeDisabled();
    });

    it('clinicId が null の場合、入力フィールドが disabled になる', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      const input = screen.getByPlaceholderText(/メッセージを入力/i);
      expect(input).toBeDisabled();
    });

    it('clinicId が null の場合、権限割当の案内メッセージが表示される', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      expect(
        screen.getByText(/管理者に権限割当を依頼してください/i)
      ).toBeInTheDocument();
    });

    it('プロフィール読み込み中はローディング表示', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: true,
        error: null,
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });

    it('プロフィール取得エラー時はエラー表示', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: false,
        error: 'プロフィール取得に失敗しました',
      });
      mockUseChat.mockReturnValue({ ...mockUseChatReturn });

      render(<ChatPage />);

      expect(
        screen.getByText(/プロフィール取得に失敗しました/i)
      ).toBeInTheDocument();
    });
  });
});

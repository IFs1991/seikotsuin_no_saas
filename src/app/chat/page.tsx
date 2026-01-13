'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChat, Message } from '@/hooks/useChat';
import { useUserProfileContext } from '@/providers/user-profile-context';

/**
 * クイック質問の定義
 */
const QUICK_QUESTIONS = [
  { label: '売上分析について', question: '今月の売上傾向を分析してください' },
  { label: '患者動向', question: '最近の患者動向について教えてください' },
  { label: 'スタッフ評価', question: 'スタッフのパフォーマンスを確認したい' },
  { label: '経営アドバイス', question: '経営改善のアドバイスをください' },
];

/**
 * メッセージコンポーネント
 */
const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-lg p-3 max-w-[80%] ${
          isUser
            ? 'bg-[#1e3a8a] text-white'
            : 'bg-white dark:bg-[#4b5563] text-[#111827] dark:text-[#e5e7eb]'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
};

/**
 * ローディングインジケータ
 */
const LoadingIndicator: React.FC = () => (
  <div className='flex justify-start'>
    <div className='bg-white dark:bg-[#4b5563] rounded-lg p-3 max-w-[80%] animate-pulse'>
      <span className='text-[#6b7280]'>応答を生成中...</span>
    </div>
  </div>
);

/**
 * エラー表示コンポーネント
 */
const ErrorMessage: React.FC<{ error: string }> = ({ error }) => (
  <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4'>
    <p className='text-red-600 dark:text-red-400 text-sm'>エラー: {error}</p>
  </div>
);

/**
 * チャットページコンポーネント
 */
const ChatPage: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 認証コンテキストからプロフィールを取得
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();

  // clinicIdを認証コンテキストから取得
  const clinicId = profile?.clinicId ?? null;

  // clinicId未割当フラグ
  const isClinicAssigned = Boolean(clinicId);

  const {
    messages,
    isLoading,
    error,
    isEnabled,
    sendMessage,
    toggleChat,
    startNewSession,
  } = useChat(clinicId);

  /**
   * メッセージリストの自動スクロール
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * メッセージ送信ハンドラ
   */
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !isClinicAssigned) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage(message);
  };

  /**
   * Enterキーでの送信
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * クイック質問の送信
   */
  const handleQuickQuestion = async (question: string) => {
    if (isLoading || !isClinicAssigned) return;
    await sendMessage(question);
  };

  // プロフィール読み込み中
  if (profileLoading) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen bg-[#f9fafb] dark:bg-[#1a1a1a] p-6'>
        <div className='text-[#6b7280]'>読み込み中...</div>
      </div>
    );
  }

  // プロフィール取得エラー
  if (profileError) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen bg-[#f9fafb] dark:bg-[#1a1a1a] p-6'>
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
          <p className='text-red-600 dark:text-red-400'>{profileError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center min-h-screen bg-[#f9fafb] dark:bg-[#1a1a1a] p-6'>
      <div className='w-full max-w-3xl'>
        {/* clinicId未割当時の案内メッセージ */}
        {!isClinicAssigned && (
          <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4'>
            <p className='text-yellow-700 dark:text-yellow-400'>
              クリニックが割り当てられていません。
            </p>
          </div>
        )}

        <Card className='bg-[#ffffff] dark:bg-[#2d2d2d]'>
          <CardHeader>
            <div className='flex justify-between items-center'>
              <CardTitle className='text-[#111827] dark:text-[#e5e7eb]'>
                AIチャット
              </CardTitle>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={startNewSession}
                  className='text-sm'
                  disabled={!isClinicAssigned}
                >
                  新規チャット
                </Button>
                <span className='text-sm text-[#4b5563] dark:text-[#9ca3af]'>
                  {isEnabled ? 'オン' : 'オフ'}
                </span>
                <Button
                  variant={isEnabled ? 'default' : 'outline'}
                  onClick={toggleChat}
                  size='sm'
                  disabled={!isClinicAssigned}
                  className={`${
                    isEnabled ? 'bg-[#1e3a8a]' : 'bg-[#e5e7eb]'
                  } transition-colors`}
                >
                  {isEnabled ? '有効' : '無効'}
                </Button>
              </div>
            </div>
            <CardDescription className='text-[#4b5563] dark:text-[#9ca3af]'>
              AIを活用した経営相談・データ分析が可能です
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className='space-y-4'>
              {/* クイック質問ボタン */}
              <div className='flex gap-2 overflow-x-auto pb-2'>
                {QUICK_QUESTIONS.map((q, index) => (
                  <Button
                    key={index}
                    variant='outline'
                    className='whitespace-nowrap'
                    onClick={() => handleQuickQuestion(q.question)}
                    disabled={!isClinicAssigned || !isEnabled || isLoading}
                  >
                    {q.label}
                  </Button>
                ))}
              </div>

              {/* エラー表示 */}
              {error && <ErrorMessage error={error} />}

              {/* メッセージエリア */}
              <div className='h-[500px] bg-[#f3f4f6] dark:bg-[#374151] rounded-lg p-4 overflow-y-auto'>
                {!isClinicAssigned ? (
                  <div className='flex items-center justify-center h-full text-[#6b7280]'>
                    管理者に権限割当を依頼してください
                  </div>
                ) : !isEnabled ? (
                  <div className='flex items-center justify-center h-full text-[#6b7280]'>
                    チャットを有効にしてください
                  </div>
                ) : messages.length === 0 && !isLoading ? (
                  <div className='flex items-center justify-center h-full text-[#6b7280]'>
                    メッセージを入力して会話を開始してください
                  </div>
                ) : (
                  <div className='space-y-4'>
                    {messages.map(message => (
                      <ChatMessage key={message.id} message={message} />
                    ))}
                    {isLoading && <LoadingIndicator />}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* 入力エリア */}
              <div className='flex gap-2'>
                <Input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder='メッセージを入力...'
                  disabled={!isClinicAssigned || !isEnabled || isLoading}
                  className='bg-white dark:bg-[#374151]'
                />
                <Button
                  onClick={handleSend}
                  disabled={
                    !isClinicAssigned ||
                    !isEnabled ||
                    isLoading ||
                    !inputValue.trim()
                  }
                  className='bg-[#1e3a8a]'
                >
                  送信
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className='flex justify-between'>
            <Button variant='outline' className='bg-white dark:bg-[#374151]'>
              履歴を検索
            </Button>
            <Button variant='outline' className='bg-white dark:bg-[#374151]'>
              エクスポート
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ChatPage;

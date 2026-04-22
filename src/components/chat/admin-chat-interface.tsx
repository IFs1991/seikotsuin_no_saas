'use client';

import React, { useState } from 'react';
import type { AdminChatMessage } from '@/hooks/useAdminChat';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ADMIN_CHAT_SUGGESTIONS = [
  '横断スコープの売上傾向を分析して',
  '対象範囲内で業績が良い店舗の特徴を教えて',
  '患者満足度が高い施術者の共通点は？',
  '収益改善のための提案をください',
] as const;

interface AdminChatInterfaceProps {
  messages: AdminChatMessage[];
  onSendMessage: (content: string) => Promise<void> | void;
  onExport: () => void;
  isLoading: boolean;
  error?: string | null;
  disabled?: boolean;
  emptyMessage?: string;
}

const AdminChatInterface: React.FC<AdminChatInterfaceProps> = ({
  messages,
  onSendMessage,
  onExport,
  isLoading,
  error,
  disabled = false,
  emptyMessage = 'メッセージを入力して、現在の分析対象スコープで会話を開始してください。',
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <div className='flex flex-col h-[800px] bg-white dark:bg-gray-800 p-6'>
      <Card className='flex-1 bg-[#F8F9FA]'>
        <CardHeader className='bg-[#7C3AED] text-white'>
          <CardTitle>管理者用AIアシスタント</CardTitle>
          <CardDescription className='text-gray-100'>
            現在選択されている分析対象スコープに基づいて分析・提案を行います
          </CardDescription>
        </CardHeader>

        <CardContent className='flex flex-col h-full'>
          <div className='flex-1 overflow-y-auto p-4 space-y-4'>
            {messages.length === 0 && !isLoading && !error && (
              <div className='flex justify-center'>
                <div className='bg-white border border-gray-200 text-gray-600 rounded-lg p-4 text-sm'>
                  {emptyMessage}
                </div>
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className='flex justify-start'>
                <div className='bg-white border border-gray-200 rounded-lg p-3'>
                  分析中...
                </div>
              </div>
            )}
            {error && (
              <div className='flex justify-start'>
                <div className='bg-red-50 border border-red-200 text-red-700 rounded-lg p-3'>
                  {error}
                </div>
              </div>
            )}
          </div>

          <div className='p-4 bg-white border-t'>
            <div className='flex flex-wrap gap-2 mb-4'>
              {ADMIN_CHAT_SUGGESTIONS.map(suggestion => (
                <Button
                  key={suggestion}
                  variant='outline'
                  className='text-[#7C3AED] border-[#7C3AED]'
                  onClick={() => setMessage(suggestion)}
                  disabled={disabled}
                >
                  {suggestion}
                </Button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className='flex gap-2'>
              <Input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder='分析したい内容を入力してください'
                className='flex-1'
                disabled={disabled}
              />
              <Button
                type='submit'
                className='bg-[#7C3AED] hover:bg-[#6D28D9] text-white'
                disabled={isLoading || disabled}
              >
                送信
              </Button>
              <Button
                type='button'
                variant='outline'
                className='border-[#7C3AED] text-[#7C3AED]'
                onClick={onExport}
              >
                JSONエクスポート
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminChatInterface;

'use client';

import React, { useMemo, useState } from 'react';
import AdminChatInterface from '@/components/chat/admin-chat-interface';
import { useAdminChat } from '@/hooks/useAdminChat';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type StoreFilter = 'all' | 'area';

const AdminChatPage: React.FC = () => {
  const {
    messages,
    sendMessage,
    isLoading,
    exportChat,
    error,
  } = useAdminChat();
  const [selectedStore, setSelectedStore] = useState<StoreFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) {
      return messages;
    }

    const normalizedTerm = searchTerm.trim().toLowerCase();
    return messages.filter(message =>
      message.content.toLowerCase().includes(normalizedTerm)
    );
  }, [messages, searchTerm]);

  const handleSelectStore = (store: StoreFilter) => {
    setSelectedStore(store);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const storeButtons: Array<{ label: string; value: StoreFilter }> = [
    { label: '全店舗', value: 'all' },
    { label: 'エリア別', value: 'area' },
  ];

  return (
    <div className='min-h-screen p-6' style={{ backgroundColor: '#F3F4F6' }}>
      <div className='max-w-4xl mx-auto'>
        <Card style={{ backgroundColor: '#ffffff' }}>
          <CardHeader>
            <CardTitle style={{ color: '#4C1D95' }}>
              管理者AIアシスタント
            </CardTitle>
            <CardDescription>
              46店舗の統合データに基づく経営支援システム
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className='mb-4'>
              <Label>分析対象店舗</Label>
              <div className='flex flex-wrap gap-2 mt-2'>
                {storeButtons.map(button => {
                  const isActive = selectedStore === button.value;
                  return (
                    <Button
                      key={button.value}
                      variant='outline'
                      onClick={() => handleSelectStore(button.value)}
                      style={{
                        backgroundColor: isActive ? '#4C1D95' : '#ffffff',
                        color: isActive ? '#ffffff' : '#4C1D95',
                      }}
                      aria-pressed={isActive}
                    >
                      {button.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator className='my-4' />

            <AdminChatInterface
              messages={filteredMessages}
              onSendMessage={sendMessage}
              isLoading={isLoading}
              onExport={exportChat}
              error={error}
            />

            <div className='flex justify-between mt-4'>
              <div className='flex gap-2'>
                <Button
                  onClick={exportChat}
                  style={{ backgroundColor: '#4C1D95', color: '#ffffff' }}
                >
                  PDFエクスポート
                </Button>
                <Button
                  onClick={exportChat}
                  style={{ backgroundColor: '#4C1D95', color: '#ffffff' }}
                >
                  Excelエクスポート
                </Button>
              </div>
              <Input
                placeholder='チャット履歴を検索'
                value={searchTerm}
                onChange={handleSearchChange}
                className='w-64'
                style={{ borderColor: '#4C1D95' }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminChatPage;

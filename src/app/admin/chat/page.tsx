import React from 'react';
import AdminChatInterface from '@/components/chat/admin-chat-interface';
import { useAdminChat } from '@/hooks/useAdminChat';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const AdminChatPage: React.FC = () => {
  const {
    messages,
    sendMessage,
    isLoading,
    exportChat,
    searchHistory,
    selectedStores,
    setSelectedStores
  } = useAdminChat();

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#F3F4F6' }}>
      <div className="max-w-4xl mx-auto">
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
            <div className="mb-4">
              <Label>分析対象店舗</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button 
                  variant="outline"
                  onClick={() => setSelectedStores(['all'])}
                  style={{ 
                    backgroundColor: selectedStores.includes('all') ? '#4C1D95' : '#ffffff',
                    color: selectedStores.includes('all') ? '#ffffff' : '#4C1D95'
                  }}
                >
                  全店舗
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setSelectedStores(['area'])}
                  style={{ 
                    backgroundColor: selectedStores.includes('area') ? '#4C1D95' : '#ffffff',
                    color: selectedStores.includes('area') ? '#ffffff' : '#4C1D95'
                  }}
                >
                  エリア別
                </Button>
              </div>
            </div>

            <Separator className="my-4" />

            <AdminChatInterface
              messages={messages}
              onSendMessage={sendMessage}
              isLoading={isLoading}
            />

            <div className="flex justify-between mt-4">
              <div className="flex gap-2">
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
                placeholder="チャット履歴を検索"
                onChange={() => searchHistory()}
                className="w-64"
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
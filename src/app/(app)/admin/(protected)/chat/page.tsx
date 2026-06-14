'use client';

import {
  type ChangeEvent,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import AdminChatInterface from '@/components/chat/admin-chat-interface';
import { useAdminChat } from '@/hooks/useAdminChat';
import type { AccessibleClinic } from '@/hooks/useAccessibleClinics';
import { AdminClinicScopeSelector } from '@/components/chat/admin-clinic-scope-selector';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
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

type AnalysisScope = 'cross' | 'selected';

const SCOPE_BUTTONS: Array<{ label: string; value: AnalysisScope }> = [
  { label: '横断スコープ', value: 'cross' },
  { label: '選択店舗スコープ', value: 'selected' },
];

export default function AdminChatPage() {
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope>('cross');
  const [appliedClinic, setAppliedClinic] = useState<AccessibleClinic | null>(
    null
  );
  const { clinics, clinicsLoading, clinicsError } = useSelectedClinic();
  const selectedClinicId =
    analysisScope === 'selected' ? (appliedClinic?.id ?? null) : null;
  const isChatEnabled = analysisScope === 'cross' || Boolean(selectedClinicId);
  const { messages, sendMessage, isLoading, exportChat, error } = useAdminChat({
    selectedClinicId,
    enabled: isChatEnabled,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredMessages = useMemo(() => {
    const normalizedTerm = deferredSearchTerm.trim().toLowerCase();
    if (!normalizedTerm) {
      return messages;
    }

    return messages.filter(message =>
      message.content.toLowerCase().includes(normalizedTerm)
    );
  }, [deferredSearchTerm, messages]);

  const handleSelectScope = useCallback((scope: AnalysisScope) => {
    setAnalysisScope(scope);
  }, []);

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(event.target.value);
    },
    []
  );

  const handleApplyClinic = useCallback((clinic: AccessibleClinic) => {
    setAppliedClinic(clinic);
  }, []);

  const handleExportChat = useCallback(() => {
    exportChat();
  }, [exportChat]);

  const currentScopeLabel =
    analysisScope === 'selected' && selectedClinicId
      ? `現在の対象範囲: 選択店舗（${appliedClinic?.name ?? '店舗名を確認中'}）`
      : analysisScope === 'selected'
        ? '現在の対象範囲: 選択店舗を未確定'
        : '現在の対象範囲: 管理者が参照可能な店舗を横断';

  const emptyMessage =
    analysisScope === 'selected' && !selectedClinicId
      ? '選択店舗スコープを使うには、店舗名で検索して対象店舗を選択してください。'
      : 'メッセージを入力して、現在の分析対象スコープで会話を開始してください。';

  return (
    <div className='min-h-screen bg-gray-100 p-6'>
      <div className='max-w-4xl mx-auto'>
        <Card className='bg-white'>
          <CardHeader>
            <CardTitle className='text-admin-950'>
              管理者AIアシスタント
            </CardTitle>
            <CardDescription>
              管理者権限の参照範囲に基づく横断分析・店舗別分析チャット
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className='mb-4'>
              <Label>分析対象スコープ</Label>
              <div className='flex flex-wrap gap-2 mt-2'>
                {SCOPE_BUTTONS.map(button => {
                  const isActive = analysisScope === button.value;
                  return (
                    <Button
                      key={button.value}
                      variant='outline'
                      onClick={() => handleSelectScope(button.value)}
                      className={
                        isActive
                          ? 'bg-admin-950 text-white hover:bg-admin-950/90'
                          : 'bg-white text-admin-950 hover:bg-admin-50'
                      }
                      aria-pressed={isActive}
                    >
                      {button.label}
                    </Button>
                  );
                })}
              </div>
              <p className='mt-2 text-sm text-gray-600'>{currentScopeLabel}</p>
              {analysisScope === 'selected' && (
                <AdminClinicScopeSelector
                  clinics={clinics}
                  loading={clinicsLoading}
                  error={clinicsError}
                  onApplyClinic={handleApplyClinic}
                />
              )}
            </div>

            <Separator className='my-4' />

            <AdminChatInterface
              messages={filteredMessages}
              onSendMessage={sendMessage}
              isLoading={isLoading}
              onExport={handleExportChat}
              error={error}
              disabled={!isChatEnabled}
              emptyMessage={emptyMessage}
            />

            <div className='flex justify-between mt-4'>
              <div className='flex gap-2'>
                <Button
                  onClick={handleExportChat}
                  className='bg-admin-950 text-white hover:bg-admin-950/90'
                >
                  JSONエクスポート
                </Button>
              </div>
              <Input
                placeholder='チャット履歴を検索'
                value={searchTerm}
                onChange={handleSearchChange}
                className='w-64 border-admin-950'
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

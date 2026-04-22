'use client';

import React, { useDeferredValue, useMemo, useState } from 'react';
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

type AnalysisScope = 'cross' | 'selected';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SCOPE_BUTTONS: Array<{ label: string; value: AnalysisScope }> = [
  { label: '横断スコープ', value: 'cross' },
  { label: '選択店舗スコープ', value: 'selected' },
];

const AdminChatPage: React.FC = () => {
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope>('cross');
  const [selectedClinicIdInput, setSelectedClinicIdInput] = useState('');
  const [appliedClinicId, setAppliedClinicId] = useState<string | null>(null);
  const selectedClinicId =
    analysisScope === 'selected' ? appliedClinicId : null;
  const isChatEnabled = analysisScope === 'cross' || Boolean(selectedClinicId);
  const { messages, sendMessage, isLoading, exportChat, error } = useAdminChat({
    selectedClinicId,
    enabled: isChatEnabled,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const trimmedClinicIdInput = selectedClinicIdInput.trim();
  const isClinicIdInputValid =
    trimmedClinicIdInput.length > 0 && UUID_PATTERN.test(trimmedClinicIdInput);

  const filteredMessages = useMemo(() => {
    const normalizedTerm = deferredSearchTerm.trim().toLowerCase();
    if (!normalizedTerm) {
      return messages;
    }

    return messages.filter(message =>
      message.content.toLowerCase().includes(normalizedTerm)
    );
  }, [deferredSearchTerm, messages]);

  const handleSelectScope = (scope: AnalysisScope) => {
    setAnalysisScope(scope);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleApplySelectedClinic = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isClinicIdInputValid) return;
    setAppliedClinicId(trimmedClinicIdInput);
  };

  const currentScopeLabel =
    analysisScope === 'selected' && selectedClinicId
      ? `現在の対象範囲: 選択店舗（clinic_id: ${selectedClinicId}）`
      : analysisScope === 'selected'
        ? '現在の対象範囲: 選択店舗を未確定'
        : '現在の対象範囲: 管理者が参照可能な店舗を横断';

  const emptyMessage =
    analysisScope === 'selected' && !selectedClinicId
      ? '選択店舗スコープを使うには、clinic_idを入力して「この店舗で開始」を押してください。'
      : 'メッセージを入力して、現在の分析対象スコープで会話を開始してください。';

  return (
    <div className='min-h-screen p-6' style={{ backgroundColor: '#F3F4F6' }}>
      <div className='max-w-4xl mx-auto'>
        <Card style={{ backgroundColor: '#ffffff' }}>
          <CardHeader>
            <CardTitle style={{ color: '#4C1D95' }}>
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
              <p className='mt-2 text-sm text-gray-600'>{currentScopeLabel}</p>
              {analysisScope === 'selected' && (
                <form
                  className='mt-3 max-w-xl'
                  onSubmit={handleApplySelectedClinic}
                >
                  <Label htmlFor='selected-clinic-id'>
                    選択店舗のclinic_id
                  </Label>
                  <div className='mt-1 flex flex-col gap-2 sm:flex-row'>
                    <Input
                      id='selected-clinic-id'
                      value={selectedClinicIdInput}
                      onChange={event =>
                        setSelectedClinicIdInput(event.target.value)
                      }
                      placeholder='例: 11111111-1111-4111-8111-111111111111'
                      className='flex-1'
                      aria-invalid={
                        trimmedClinicIdInput.length > 0 && !isClinicIdInputValid
                      }
                      style={{ borderColor: '#4C1D95' }}
                    />
                    <Button
                      type='submit'
                      disabled={!isClinicIdInputValid}
                      style={{
                        backgroundColor: isClinicIdInputValid
                          ? '#4C1D95'
                          : '#E5E7EB',
                        color: isClinicIdInputValid ? '#ffffff' : '#6B7280',
                      }}
                    >
                      この店舗で開始
                    </Button>
                  </div>
                  <p className='mt-1 text-xs text-gray-500'>
                    店舗一覧のDB取得は未接続です。店舗を絞る場合はclinic_idを指定してください。
                  </p>
                  {trimmedClinicIdInput.length > 0 && !isClinicIdInputValid && (
                    <p role='alert' className='mt-1 text-xs text-red-600'>
                      UUID形式のclinic_idを入力してください。
                    </p>
                  )}
                </form>
              )}
            </div>

            <Separator className='my-4' />

            <AdminChatInterface
              messages={filteredMessages}
              onSendMessage={sendMessage}
              isLoading={isLoading}
              onExport={exportChat}
              error={error}
              disabled={!isChatEnabled}
              emptyMessage={emptyMessage}
            />

            <div className='flex justify-between mt-4'>
              <div className='flex gap-2'>
                <Button
                  onClick={exportChat}
                  style={{ backgroundColor: '#4C1D95', color: '#ffffff' }}
                >
                  JSONエクスポート
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

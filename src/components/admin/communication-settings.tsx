'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, Mail, MessageCircle, Bell, Edit2, Loader2 } from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: 'booking_confirmation' | 'reminder' | 'cancellation' | 'followup';
}

interface NotificationChannels {
  emailEnabled: boolean;
  smsEnabled: boolean;
  lineEnabled: boolean;
  pushEnabled: boolean;
}

interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
}

interface CommunicationData {
  channels: NotificationChannels;
  smtpSettings: SmtpSettings;
  templates: EmailTemplate[];
}

const initialData: CommunicationData = {
  channels: {
    emailEnabled: true,
    smsEnabled: false,
    lineEnabled: true,
    pushEnabled: true,
  },
  smtpSettings: {
    host: 'smtp.gmail.com',
    port: 587,
    username: 'noreply@seikotsuin.com',
    password: '',
    secure: true,
  },
  templates: [
    {
      id: '1',
      name: '予約確認メール',
      subject: '【整骨院グループ】ご予約確認のお知らせ',
      body: '{{patientName}}様\n\nいつもありがとうございます。\n以下の内容でご予約を承りました。\n\n予約日時：{{appointmentDate}} {{appointmentTime}}\n担当者：{{staffName}}\n施術内容：{{serviceName}}\n\nご質問等ございましたら、お気軽にお問い合わせください。',
      type: 'booking_confirmation',
    },
    {
      id: '2',
      name: 'リマインダーメール',
      subject: '【整骨院グループ】明日のご予約について',
      body: '{{patientName}}様\n\n明日のご予約についてご連絡いたします。\n\n予約日時：{{appointmentDate}} {{appointmentTime}}\n担当者：{{staffName}}\n\n変更・キャンセルの場合はお早めにご連絡ください。\nお待ちしております。',
      type: 'reminder',
    },
  ],
};

export function CommunicationSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = profile?.clinicId;

  const {
    data: formData,
    updateData,
    loadingState,
    handleSave,
    isInitialized,
  } = useAdminSettings(initialData, clinicId ? {
    clinicId,
    category: 'communication',
    autoLoad: true,
  } : undefined);

  if (profileLoading || !isInitialized) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">設定を読み込み中...</span>
      </div>
    );
  }

  const notifications = formData.channels;
  const smtpSettings = formData.smtpSettings;
  const templates = formData.templates;

  const updateChannels = (updates: Partial<NotificationChannels>) => {
    updateData({ channels: { ...notifications, ...updates } });
  };

  const updateSmtp = (updates: Partial<SmtpSettings>) => {
    updateData({ smtpSettings: { ...smtpSettings, ...updates } });
  };

  const onSave = async () => {
    await handleSave();
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type="error" />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type="success" />
      )}

      {/* 通知チャンネル設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Bell className='w-5 h-5 mr-2' />
          通知チャンネル設定
        </h3>

        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={notifications.emailEnabled}
              onChange={e =>
                updateChannels({ emailEnabled: e.target.checked })
              }
              className='rounded border-gray-300'
            />
            <Mail className='w-4 h-4' />
            <span className='text-sm text-gray-700'>メール</span>
          </label>

          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={notifications.smsEnabled}
              onChange={e =>
                updateChannels({ smsEnabled: e.target.checked })
              }
              className='rounded border-gray-300'
            />
            <MessageCircle className='w-4 h-4' />
            <span className='text-sm text-gray-700'>SMS</span>
          </label>

          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={notifications.lineEnabled}
              onChange={e =>
                updateChannels({ lineEnabled: e.target.checked })
              }
              className='rounded border-gray-300'
            />
            <span className='text-sm text-gray-700'>LINE</span>
          </label>

          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={notifications.pushEnabled}
              onChange={e =>
                updateChannels({ pushEnabled: e.target.checked })
              }
              className='rounded border-gray-300'
            />
            <span className='text-sm text-gray-700'>プッシュ通知</span>
          </label>
        </div>
      </Card>

      {/* メールテンプレート */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Edit2 className='w-5 h-5 mr-2' />
          メールテンプレート
        </h3>

        <div className='space-y-6'>
          {templates.map(template => (
            <div key={template.id} className='p-4 bg-gray-50 rounded-lg'>
              <div className='flex items-center justify-between mb-3'>
                <h4 className='font-medium text-gray-900'>{template.name}</h4>
                <Button variant='outline' size='sm'>
                  <Edit2 className='w-4 h-4 mr-1' />
                  編集
                </Button>
              </div>

              <div className='space-y-3'>
                <div>
                  <Label className='block text-sm text-gray-700 mb-1'>
                    件名
                  </Label>
                  <Input
                    value={template.subject}
                    readOnly
                    className='bg-white'
                  />
                </div>

                <div>
                  <Label className='block text-sm text-gray-700 mb-1'>
                    本文
                  </Label>
                  <textarea
                    value={template.body}
                    readOnly
                    rows={6}
                    className='w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm'
                  />
                </div>
              </div>

              <div className='mt-3 text-xs text-gray-500'>
                利用可能な変数: {'{{ patientName }}'}, {'{{ appointmentDate }}'},{' '}
                {'{{ appointmentTime }}'}, {'{{ staffName }}'}, {'{{ serviceName }}'}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* SMTP設定 */}
      {notifications.emailEnabled && (
        <Card className='p-6'>
          <h3 className='text-lg font-semibold text-gray-900 mb-4'>SMTP設定</h3>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div>
              <Label className='block text-sm font-medium text-gray-700 mb-1'>
                SMTPホスト
              </Label>
              <Input
                value={smtpSettings.host}
                onChange={e =>
                  updateSmtp({ host: e.target.value })
                }
                placeholder='smtp.gmail.com'
              />
            </div>

            <div>
              <Label className='block text-sm font-medium text-gray-700 mb-1'>
                ポート番号
              </Label>
              <Input
                type='number'
                value={smtpSettings.port}
                onChange={e =>
                  updateSmtp({ port: parseInt(e.target.value) })
                }
                placeholder='587'
              />
            </div>

            <div>
              <Label className='block text-sm font-medium text-gray-700 mb-1'>
                ユーザー名
              </Label>
              <Input
                value={smtpSettings.username}
                onChange={e =>
                  updateSmtp({ username: e.target.value })
                }
                placeholder='noreply@seikotsuin.com'
              />
            </div>

            <div>
              <Label className='block text-sm font-medium text-gray-700 mb-1'>
                パスワード
              </Label>
              <Input
                type='password'
                value={smtpSettings.password}
                onChange={e =>
                  updateSmtp({ password: e.target.value })
                }
                placeholder='••••••••'
              />
            </div>
          </div>

          <div className='mt-4'>
            <label className='flex items-center space-x-2'>
              <input
                type='checkbox'
                checked={smtpSettings.secure}
                onChange={e =>
                  updateSmtp({ secure: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm text-gray-700'>SSL/TLS暗号化を使用</span>
            </label>
          </div>
        </Card>
      )}

      {/* 保存ボタン */}
      <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
        <Button variant='outline'>キャンセル</Button>
        <Button
          data-testid="save-settings-button"
          onClick={onSave}
          disabled={loadingState.isLoading}
          className='flex items-center space-x-2'
        >
          {loadingState.isLoading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <Save className='w-4 h-4' />
          )}
          <span>{loadingState.isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}

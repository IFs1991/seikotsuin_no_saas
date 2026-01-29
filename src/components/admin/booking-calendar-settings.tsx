'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, Calendar, Clock, Globe, Settings, Loader2 } from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';

interface BookingSettings {
  slotMinutes: number;
  maxAdvanceBookingDays: number;
  minAdvanceBookingHours: number;
  maxConcurrent: number;
  allowCancellation: boolean;
  cancellationDeadlineHours: number;
  weekStartDay: 0 | 1;
  defaultCalendarView: 'day' | 'week' | 'month';
  allowOnlineBooking: boolean;
}

interface OnlineBookingSettings {
  publicUrl: string;
  allowGuestBooking: boolean;
  requirePhone: boolean;
  requireNote: boolean;
  autoConfirm: boolean;
  showStaffSelection: boolean;
  showServiceSelection: boolean;
  customMessage: string;
}

interface NotificationSettings {
  confirmationEmail: boolean;
  reminderEmail: boolean;
  reminderTime: number;
  staffNotification: boolean;
  cancelNotification: boolean;
}

const initialBookingData: BookingSettings = {
  slotMinutes: 30,
  maxAdvanceBookingDays: 30,
  minAdvanceBookingHours: 2,
  maxConcurrent: 3,
  allowCancellation: true,
  cancellationDeadlineHours: 24,
  weekStartDay: 1,
  defaultCalendarView: 'week',
  allowOnlineBooking: false,
};

const initialOnlineData: OnlineBookingSettings = {
  publicUrl: 'https://booking.seikotsuin.com/honten',
  allowGuestBooking: false,
  requirePhone: true,
  requireNote: false,
  autoConfirm: false,
  showStaffSelection: true,
  showServiceSelection: true,
  customMessage: '予約確認後、確定メールをお送りします。',
};

const initialNotificationData: NotificationSettings = {
  confirmationEmail: true,
  reminderEmail: true,
  reminderTime: 24,
  staffNotification: true,
  cancelNotification: true,
};

export function BookingCalendarSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = profile?.clinicId;

  const {
    data: bookingSettings,
    updateData,
    loadingState,
    handleSave,
    isInitialized,
  } = useAdminSettings(
    initialBookingData,
    clinicId
      ? {
          clinicId,
          category: 'booking_calendar',
          autoLoad: true,
        }
      : undefined
  );

  // Online/notification settings remain local until API support is added.
  const [onlineSettings, setOnlineSettings] =
    React.useState<OnlineBookingSettings>(initialOnlineData);
  const [notifications, setNotifications] =
    React.useState<NotificationSettings>(initialNotificationData);

  if (profileLoading || !isInitialized) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  const updateBooking = (updates: Partial<BookingSettings>) => {
    updateData(updates);
  };

  const updateOnline = (updates: Partial<OnlineBookingSettings>) => {
    setOnlineSettings(prev => ({ ...prev, ...updates }));
  };

  const updateNotifications = (updates: Partial<NotificationSettings>) => {
    setNotifications(prev => ({ ...prev, ...updates }));
  };

  const onSave = async () => {
    await handleSave();
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type='error' />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type='success' />
      )}

      {/* 基本予約設定 */}
      <Card className='p-6' data-testid='booking-calendar-settings-card'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Clock className='w-5 h-5 mr-2' />
          基本予約設定
        </h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              予約時間間隔（分）
            </Label>
            <select
              data-testid='booking-calendar-slot-minutes-select'
              value={bookingSettings.slotMinutes}
              onChange={e =>
                updateBooking({ slotMinutes: parseInt(e.target.value) })
              }
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value={15}>15分</option>
              <option value={30}>30分</option>
              <option value={45}>45分</option>
              <option value={60}>60分</option>
            </select>
            <p className='text-xs text-gray-500 mt-1'>
              カレンダー上での最小時間単位
            </p>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              同時予約可能数
            </Label>
            <Input
              data-testid='booking-calendar-max-concurrent-input'
              type='number'
              value={bookingSettings.maxConcurrent}
              onChange={e =>
                updateBooking({ maxConcurrent: parseInt(e.target.value) })
              }
              min='1'
              max='10'
            />
            <p className='text-xs text-gray-500 mt-1'>
              同じ時間帯に受け入れ可能な予約数
            </p>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              最大事前予約日数
            </Label>
            <Input
              data-testid='booking-calendar-max-advance-days-input'
              type='number'
              value={bookingSettings.maxAdvanceBookingDays}
              onChange={e =>
                updateBooking({
                  maxAdvanceBookingDays: parseInt(e.target.value),
                })
              }
              min='1'
              max='365'
            />
            <p className='text-xs text-gray-500 mt-1'>
              何日先まで予約を受け付けるか
            </p>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              最小事前予約時間
            </Label>
            <Input
              data-testid='booking-calendar-min-advance-hours-input'
              type='number'
              value={bookingSettings.minAdvanceBookingHours}
              onChange={e =>
                updateBooking({
                  minAdvanceBookingHours: parseInt(e.target.value),
                })
              }
              min='0'
              max='48'
            />
            <p className='text-xs text-gray-500 mt-1'>
              予約に必要な最低限の事前時間（時間）
            </p>
          </div>
        </div>

        <div className='mt-6 space-y-4'>
          <div>
            <label className='flex items-center space-x-2'>
              <input
                data-testid='booking-calendar-cancellation-allowed-checkbox'
                type='checkbox'
                checked={bookingSettings.allowCancellation}
                onChange={e =>
                  updateBooking({ allowCancellation: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm text-gray-700'>
                患者による予約キャンセルを許可
              </span>
            </label>
            {bookingSettings.allowCancellation && (
              <div className='mt-2 ml-6'>
                <Label className='block text-sm text-gray-700 mb-1'>
                  キャンセル締切時間（予約の何時間前まで）
                </Label>
                <Input
                  data-testid='booking-calendar-cancellation-deadline-input'
                  type='number'
                  value={bookingSettings.cancellationDeadlineHours}
                  onChange={e =>
                    updateBooking({
                      cancellationDeadlineHours: parseInt(e.target.value),
                    })
                  }
                  className='w-32'
                  min='0'
                  max='168'
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* カレンダー表示設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Calendar className='w-5 h-5 mr-2' />
          カレンダー表示設定
        </h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              週の開始曜日
            </Label>
            <select
              data-testid='booking-calendar-week-start-select'
              value={bookingSettings.weekStartDay}
              onChange={e =>
                updateBooking({
                  weekStartDay: parseInt(e.target.value) as 0 | 1,
                })
              }
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value={1}>月曜日</option>
              <option value={0}>日曜日</option>
            </select>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              デフォルト表示
            </Label>
            <select
              data-testid='booking-calendar-default-view-select'
              value={bookingSettings.defaultCalendarView}
              onChange={e =>
                updateBooking({
                  defaultCalendarView: e.target.value as
                    | 'day'
                    | 'week'
                    | 'month',
                })
              }
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value='day'>日表示</option>
              <option value='week'>週表示</option>
              <option value='month'>月表示</option>
            </select>
          </div>
        </div>
      </Card>

      {/* オンライン予約設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Globe className='w-5 h-5 mr-2' />
          オンライン予約設定
        </h3>

        <div className='space-y-6'>
          <div>
            <label className='flex items-center space-x-2'>
              <input
                data-testid='booking-calendar-online-booking-checkbox'
                type='checkbox'
                checked={bookingSettings.allowOnlineBooking}
                onChange={e =>
                  updateBooking({ allowOnlineBooking: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm font-medium text-gray-700'>
                オンライン予約を有効にする
              </span>
            </label>
          </div>

          {bookingSettings.allowOnlineBooking && (
            <>
              <div>
                <Label className='block text-sm font-medium text-gray-700 mb-1'>
                  予約サイトURL
                </Label>
                <Input
                  value={onlineSettings.publicUrl}
                  onChange={e => updateOnline({ publicUrl: e.target.value })}
                  placeholder='https://booking.seikotsuin.com/honten'
                />
                <p className='text-xs text-gray-500 mt-1'>
                  患者が予約を行うためのURL
                </p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={onlineSettings.allowGuestBooking}
                    onChange={e =>
                      updateOnline({ allowGuestBooking: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>
                    ゲスト予約を許可
                  </span>
                </label>

                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={onlineSettings.requirePhone}
                    onChange={e =>
                      updateOnline({ requirePhone: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>
                    電話番号を必須にする
                  </span>
                </label>

                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={onlineSettings.requireNote}
                    onChange={e =>
                      updateOnline({ requireNote: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>
                    備考欄を必須にする
                  </span>
                </label>

                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={onlineSettings.autoConfirm}
                    onChange={e =>
                      updateOnline({ autoConfirm: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>
                    予約を自動確定する
                  </span>
                </label>

                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={onlineSettings.showStaffSelection}
                    onChange={e =>
                      updateOnline({ showStaffSelection: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>
                    スタッフ選択を表示
                  </span>
                </label>

                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={onlineSettings.showServiceSelection}
                    onChange={e =>
                      updateOnline({ showServiceSelection: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>
                    サービス選択を表示
                  </span>
                </label>
              </div>

              <div>
                <Label className='block text-sm font-medium text-gray-700 mb-1'>
                  カスタムメッセージ
                </Label>
                <textarea
                  value={onlineSettings.customMessage}
                  onChange={e =>
                    updateOnline({ customMessage: e.target.value })
                  }
                  rows={3}
                  className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  placeholder='予約完了後に表示されるメッセージを入力してください'
                />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* 通知設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Settings className='w-5 h-5 mr-2' />
          通知設定
        </h3>

        <div className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <label className='flex items-center space-x-2'>
              <input
                type='checkbox'
                checked={notifications.confirmationEmail}
                onChange={e =>
                  updateNotifications({ confirmationEmail: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm text-gray-700'>予約確認メール送信</span>
            </label>

            <label className='flex items-center space-x-2'>
              <input
                type='checkbox'
                checked={notifications.staffNotification}
                onChange={e =>
                  updateNotifications({ staffNotification: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm text-gray-700'>
                スタッフへの新規予約通知
              </span>
            </label>

            <label className='flex items-center space-x-2'>
              <input
                type='checkbox'
                checked={notifications.cancelNotification}
                onChange={e =>
                  updateNotifications({ cancelNotification: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm text-gray-700'>キャンセル通知</span>
            </label>

            <div className='flex items-center space-x-2'>
              <input
                type='checkbox'
                checked={notifications.reminderEmail}
                onChange={e =>
                  updateNotifications({ reminderEmail: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm text-gray-700'>リマインダーメール</span>
            </div>
          </div>

          {notifications.reminderEmail && (
            <div className='ml-6'>
              <Label className='block text-sm text-gray-700 mb-1'>
                リマインダー送信時間（予約の何時間前）
              </Label>
              <Input
                type='number'
                value={notifications.reminderTime}
                onChange={e =>
                  updateNotifications({
                    reminderTime: parseInt(e.target.value),
                  })
                }
                className='w-32'
                min='1'
                max='168'
              />
            </div>
          )}
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
        <Button variant='outline'>キャンセル</Button>
        <Button
          data-testid='save-settings-button'
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

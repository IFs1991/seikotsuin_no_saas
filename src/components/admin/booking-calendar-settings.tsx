"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, Calendar, Clock, Users, Globe, Settings } from 'lucide-react';

interface BookingSettings {
  slotDuration: number; // 分
  maxAdvanceBooking: number; // 日
  minAdvanceBooking: number; // 時間
  maxSimultaneousBookings: number;
  allowCancellation: boolean;
  cancellationDeadline: number; // 時間
  weekStartsOn: 0 | 1; // 0: 日曜, 1: 月曜
  defaultView: 'day' | 'week' | 'month';
}

interface OnlineBookingSettings {
  isEnabled: boolean;
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
  reminderTime: number; // 時間
  staffNotification: boolean;
  cancelNotification: boolean;
}

export function BookingCalendarSettings() {
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>({
    slotDuration: 30,
    maxAdvanceBooking: 30,
    minAdvanceBooking: 2,
    maxSimultaneousBookings: 3,
    allowCancellation: true,
    cancellationDeadline: 24,
    weekStartsOn: 1,
    defaultView: 'week'
  });

  const [onlineSettings, setOnlineSettings] = useState<OnlineBookingSettings>({
    isEnabled: true,
    publicUrl: 'https://booking.seikotsuin.com/honten',
    allowGuestBooking: false,
    requirePhone: true,
    requireNote: false,
    autoConfirm: false,
    showStaffSelection: true,
    showServiceSelection: true,
    customMessage: '予約確認後、確定メールをお送りします。'
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    confirmationEmail: true,
    reminderEmail: true,
    reminderTime: 24,
    staffNotification: true,
    cancelNotification: true
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const handleSave = async () => {
    setIsLoading(true);
    setSavedMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSavedMessage('予約・カレンダー設定を保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('保存に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {savedMessage && (
        <div className={`p-4 rounded-md ${
          savedMessage.includes('失敗') 
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {savedMessage}
        </div>
      )}

      {/* 基本予約設定 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Clock className="w-5 h-5 mr-2" />
          基本予約設定
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">予約時間間隔（分）</Label>
            <select
              value={bookingSettings.slotDuration}
              onChange={(e) => setBookingSettings(prev => ({...prev, slotDuration: parseInt(e.target.value)}))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={15}>15分</option>
              <option value={30}>30分</option>
              <option value={45}>45分</option>
              <option value={60}>60分</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">カレンダー上での最小時間単位</p>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">同時予約可能数</Label>
            <Input
              type="number"
              value={bookingSettings.maxSimultaneousBookings}
              onChange={(e) => setBookingSettings(prev => ({...prev, maxSimultaneousBookings: parseInt(e.target.value)}))}
              min="1"
              max="10"
            />
            <p className="text-xs text-gray-500 mt-1">同じ時間帯に受け入れ可能な予約数</p>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">最大事前予約日数</Label>
            <Input
              type="number"
              value={bookingSettings.maxAdvanceBooking}
              onChange={(e) => setBookingSettings(prev => ({...prev, maxAdvanceBooking: parseInt(e.target.value)}))}
              min="1"
              max="365"
            />
            <p className="text-xs text-gray-500 mt-1">何日先まで予約を受け付けるか</p>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">最小事前予約時間</Label>
            <Input
              type="number"
              value={bookingSettings.minAdvanceBooking}
              onChange={(e) => setBookingSettings(prev => ({...prev, minAdvanceBooking: parseInt(e.target.value)}))}
              min="0"
              max="48"
            />
            <p className="text-xs text-gray-500 mt-1">予約に必要な最低限の事前時間（時間）</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={bookingSettings.allowCancellation}
                onChange={(e) => setBookingSettings(prev => ({...prev, allowCancellation: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">患者による予約キャンセルを許可</span>
            </label>
            {bookingSettings.allowCancellation && (
              <div className="mt-2 ml-6">
                <Label className="block text-sm text-gray-700 mb-1">キャンセル締切時間（予約の何時間前まで）</Label>
                <Input
                  type="number"
                  value={bookingSettings.cancellationDeadline}
                  onChange={(e) => setBookingSettings(prev => ({...prev, cancellationDeadline: parseInt(e.target.value)}))}
                  className="w-32"
                  min="0"
                  max="168"
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* カレンダー表示設定 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2" />
          カレンダー表示設定
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">週の開始曜日</Label>
            <select
              value={bookingSettings.weekStartsOn}
              onChange={(e) => setBookingSettings(prev => ({...prev, weekStartsOn: parseInt(e.target.value) as 0 | 1}))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>月曜日</option>
              <option value={0}>日曜日</option>
            </select>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">デフォルト表示</Label>
            <select
              value={bookingSettings.defaultView}
              onChange={(e) => setBookingSettings(prev => ({...prev, defaultView: e.target.value as 'day' | 'week' | 'month'}))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="day">日表示</option>
              <option value="week">週表示</option>
              <option value="month">月表示</option>
            </select>
          </div>
        </div>
      </Card>

      {/* オンライン予約設定 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Globe className="w-5 h-5 mr-2" />
          オンライン予約設定
        </h3>

        <div className="space-y-6">
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={onlineSettings.isEnabled}
                onChange={(e) => setOnlineSettings(prev => ({...prev, isEnabled: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">オンライン予約を有効にする</span>
            </label>
          </div>

          {onlineSettings.isEnabled && (
            <>
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">予約サイトURL</Label>
                <Input
                  value={onlineSettings.publicUrl}
                  onChange={(e) => setOnlineSettings(prev => ({...prev, publicUrl: e.target.value}))}
                  placeholder="https://booking.seikotsuin.com/honten"
                />
                <p className="text-xs text-gray-500 mt-1">患者が予約を行うためのURL</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={onlineSettings.allowGuestBooking}
                    onChange={(e) => setOnlineSettings(prev => ({...prev, allowGuestBooking: e.target.checked}))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">ゲスト予約を許可</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={onlineSettings.requirePhone}
                    onChange={(e) => setOnlineSettings(prev => ({...prev, requirePhone: e.target.checked}))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">電話番号を必須にする</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={onlineSettings.requireNote}
                    onChange={(e) => setOnlineSettings(prev => ({...prev, requireNote: e.target.checked}))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">備考欄を必須にする</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={onlineSettings.autoConfirm}
                    onChange={(e) => setOnlineSettings(prev => ({...prev, autoConfirm: e.target.checked}))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">予約を自動確定する</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={onlineSettings.showStaffSelection}
                    onChange={(e) => setOnlineSettings(prev => ({...prev, showStaffSelection: e.target.checked}))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">スタッフ選択を表示</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={onlineSettings.showServiceSelection}
                    onChange={(e) => setOnlineSettings(prev => ({...prev, showServiceSelection: e.target.checked}))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">サービス選択を表示</span>
                </label>
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">カスタムメッセージ</Label>
                <textarea
                  value={onlineSettings.customMessage}
                  onChange={(e) => setOnlineSettings(prev => ({...prev, customMessage: e.target.value}))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="予約完了後に表示されるメッセージを入力してください"
                />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* 通知設定 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Settings className="w-5 h-5 mr-2" />
          通知設定
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={notifications.confirmationEmail}
                onChange={(e) => setNotifications(prev => ({...prev, confirmationEmail: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">予約確認メール送信</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={notifications.staffNotification}
                onChange={(e) => setNotifications(prev => ({...prev, staffNotification: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">スタッフへの新規予約通知</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={notifications.cancelNotification}
                onChange={(e) => setNotifications(prev => ({...prev, cancelNotification: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">キャンセル通知</span>
            </label>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={notifications.reminderEmail}
                onChange={(e) => setNotifications(prev => ({...prev, reminderEmail: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">リマインダーメール</span>
            </div>
          </div>

          {notifications.reminderEmail && (
            <div className="ml-6">
              <Label className="block text-sm text-gray-700 mb-1">リマインダー送信時間（予約の何時間前）</Label>
              <Input
                type="number"
                value={notifications.reminderTime}
                onChange={(e) => setNotifications(prev => ({...prev, reminderTime: parseInt(e.target.value)}))}
                className="w-32"
                min="1"
                max="168"
              />
            </div>
          )}
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
        <Button variant="outline">
          キャンセル
        </Button>
        <Button 
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>{isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import type { AdminNotification } from '@/lib/notifications/admin-notifications';

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'degraded';

interface AdminNotificationsMenuProps {
  notifications: readonly AdminNotification[];
  unreadCount: number;
  loading: boolean;
  updating: boolean;
  error: string | null;
  realtimeStatus: RealtimeStatus;
  onRefresh: () => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  className?: string;
}

const REALTIME_STATUS_LABELS: Record<RealtimeStatus, string> = {
  idle: '待機中',
  connecting: '接続中',
  connected: 'リアルタイム接続中',
  degraded: '定期更新で同期中',
};

const TYPE_LABELS: Record<string, string> = {
  security: 'セキュリティ',
  info: 'お知らせ',
  warning: '注意',
  error: 'エラー',
  appointment_reminder: '予約',
};

const NOTIFICATION_TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return NOTIFICATION_TIME_FORMATTER.format(date);
}

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export const AdminNotificationsMenu = React.memo(
  function AdminNotificationsMenu({
    notifications,
    unreadCount,
    loading,
    updating,
    error,
    realtimeStatus,
    onRefresh,
    onMarkAsRead,
    onMarkAllAsRead,
    className = '',
  }: AdminNotificationsMenuProps) {
    const hasNotifications = notifications.length > 0;
    const canMarkAllRead = unreadCount > 0 && !updating;

    return (
      <section
        className={`w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl ${className}`}
        aria-label='通知一覧'
      >
        <div className='border-b border-slate-100 bg-slate-50 px-4 py-3'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <p className='text-sm font-semibold text-slate-900'>通知</p>
              <p className='mt-1 text-xs text-slate-500'>
                未読 {unreadCount}件 / {REALTIME_STATUS_LABELS[realtimeStatus]}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={onRefresh}
                className='rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50'
                disabled={loading}
              >
                更新
              </button>
              <button
                type='button'
                onClick={onMarkAllAsRead}
                className='rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                disabled={!canMarkAllRead}
              >
                全て既読
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className='border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700'>
            {error}
          </div>
        )}

        <div className='max-h-[28rem] overflow-y-auto'>
          {loading && !hasNotifications ? (
            <div className='px-4 py-8 text-center text-sm text-slate-500'>
              通知を読み込んでいます...
            </div>
          ) : null}

          {!loading && !hasNotifications ? (
            <div className='px-4 py-8 text-center'>
              <p className='text-sm font-medium text-slate-700'>
                新しい通知はありません
              </p>
              <p className='mt-1 text-xs text-slate-500'>
                重要な操作やセキュリティイベントが発生するとここに表示されます。
              </p>
            </div>
          ) : null}

          {notifications.map(notification => (
            <article
              key={notification.id}
              className={`border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                notification.is_read ? 'bg-white' : 'bg-blue-50/70'
              }`}
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    {!notification.is_read && (
                      <span
                        className='h-2 w-2 rounded-full bg-blue-600'
                        aria-label='未読'
                      />
                    )}
                    <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600'>
                      {getTypeLabel(notification.type)}
                    </span>
                    <time className='text-[11px] text-slate-500'>
                      {formatNotificationTime(notification.created_at)}
                    </time>
                  </div>
                  <h3 className='mt-2 line-clamp-2 text-sm font-semibold text-slate-900'>
                    {notification.title}
                  </h3>
                  <p className='mt-1 line-clamp-3 text-xs leading-5 text-slate-600'>
                    {notification.message}
                  </p>
                </div>

                {!notification.is_read && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-8 shrink-0 px-2 text-xs text-blue-700 hover:bg-blue-100'
                    onClick={() => onMarkAsRead(notification.id)}
                    disabled={updating}
                  >
                    既読
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
);

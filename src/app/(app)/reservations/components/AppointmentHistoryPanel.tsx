import React, { memo, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { ReservationApiItem } from '../api';
import {
  getAppointmentStatusLabel,
  getAppointmentStatusTone,
} from '../utils/view';

const formatHistoryDateTime = (item: ReservationApiItem) => {
  const start = new Date(item.startTime);
  const end = new Date(item.endTime);
  const date = start.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const startTime = start.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endTime = end.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${date} ${startTime}-${endTime}`;
};

interface AppointmentHistoryPanelProps {
  items: ReservationApiItem[];
  loading: boolean;
  error: string | null;
  currentAppointmentId: string;
}

export const AppointmentHistoryPanel = memo(function AppointmentHistoryPanel({
  items,
  loading,
  error,
  currentAppointmentId,
}: AppointmentHistoryPanelProps) {
  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      ),
    [items]
  );

  return (
    <div className='mt-5 border-t border-gray-100 pt-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <div className='text-xs font-bold text-gray-500'>予約履歴</div>
          <div className='text-xs text-gray-400'>同じ患者に紐づく過去予約</div>
        </div>
        {!loading && !error && (
          <span className='text-xs font-bold text-gray-500'>
            {sortedItems.length}件
          </span>
        )}
      </div>

      {loading && (
        <div className='flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600'>
          <Loader2 className='h-4 w-4 animate-spin text-sky-600' />
          読み込み中
        </div>
      )}

      {error && (
        <div className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
          {error}
        </div>
      )}

      {!loading && !error && sortedItems.length === 0 && (
        <div className='rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500'>
          予約履歴はまだありません。
        </div>
      )}

      {!loading && !error && sortedItems.length > 0 && (
        <div className='space-y-2'>
          {sortedItems.map(item => {
            const status = item.status ?? 'unconfirmed';
            const isCurrent = item.id === currentAppointmentId;
            return (
              <div
                key={item.id}
                className={`rounded-md border bg-white p-3 ${
                  isCurrent
                    ? 'border-sky-200 ring-1 ring-sky-100'
                    : 'border-gray-200'
                }`}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='text-sm font-bold text-gray-800'>
                      {item.menuName ?? 'メニュー未設定'}
                    </div>
                    <div className='mt-1 text-xs text-gray-500'>
                      {formatHistoryDateTime(item)}
                    </div>
                    <div className='mt-1 text-xs text-gray-500'>
                      {item.staffName ?? '担当未設定'}
                      {item.isStaffRequested ? ' / 指名' : ''}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold ${getAppointmentStatusTone(
                      { status }
                    )}`}
                  >
                    {getAppointmentStatusLabel({
                      status,
                      type: 'normal',
                    })}
                  </span>
                </div>
                {item.notes && (
                  <div className='mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-600'>
                    {item.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

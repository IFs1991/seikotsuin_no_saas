import React from 'react';
import { Calendar, Bell } from 'lucide-react';

interface Props {
  pendingCount?: number;
  notificationCount?: number;
  onOpenReservations?: () => void;
  onOpenNotifications?: () => void;
}

const HeaderComponent: React.FC<Props> = ({
  pendingCount = 0,
  notificationCount = 0,
  onOpenReservations,
  onOpenNotifications,
}) => {
  return (
    <header className='bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between shadow-sm sticky top-0 z-50'>
      <div aria-hidden='true' className='h-8 min-w-0 flex-1' />

      <div className='flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar'>
        {pendingCount > 0 ? (
          <button
            onClick={onOpenReservations}
            className='bg-rose-400 hover:bg-rose-500 text-white px-2 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 sm:gap-2 shadow-sm transition-colors whitespace-nowrap'
            title='未確認の予約'
          >
            <span>未確認 {pendingCount}件</span>
            <Calendar className='w-4 h-4' />
          </button>
        ) : (
          <button
            onClick={onOpenReservations}
            className='bg-gray-200 hover:bg-gray-300 text-gray-600 px-2 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 sm:gap-2 shadow-sm transition-colors whitespace-nowrap'
            title='予約確認済み'
          >
            <span>確認済み</span>
            <Calendar className='w-4 h-4' />
          </button>
        )}

        {notificationCount > 0 ? (
          <button
            onClick={onOpenNotifications}
            className='bg-rose-400 hover:bg-rose-500 text-white px-2 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 sm:gap-2 shadow-sm transition-colors whitespace-nowrap'
            title='未読のお知らせ'
          >
            <span>未読 {notificationCount}件</span>
            <Bell className='w-4 h-4' />
          </button>
        ) : (
          <button
            onClick={onOpenNotifications}
            className='bg-gray-200 hover:bg-gray-300 text-gray-600 px-2 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 sm:gap-2 shadow-sm transition-colors whitespace-nowrap'
            title='お知らせなし'
          >
            <span>お知らせなし</span>
            <Bell className='w-4 h-4' />
          </button>
        )}
      </div>
    </header>
  );
};

export const Header = React.memo(HeaderComponent);

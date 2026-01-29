import React from 'react';
import { Calendar, AlignJustify } from 'lucide-react';

interface Props {
  onOpenReservations?: () => void;
  onOpenNotifications?: () => void;
}

export const Header: React.FC<Props> = ({
  onOpenReservations,
  onOpenNotifications,
}) => {
  return (
    <header className='bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between shadow-sm sticky top-0 z-50'>
      <div className='flex items-center gap-2 text-sky-600 font-bold text-lg shrink-0'>
        <AlignJustify className='w-6 h-6' />
        <span className='hidden sm:inline'>トップ</span>
      </div>

      <div className='flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar'>
        <button
          onClick={onOpenReservations}
          className='bg-rose-400 hover:bg-rose-500 text-white px-2 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 sm:gap-2 shadow-sm transition-colors whitespace-nowrap'
          title='未確認の予約'
        >
          <span className='hidden sm:inline'>未確認の予約があります</span>
          <span className='sm:hidden'>予約確認</span>
          <Calendar className='w-4 h-4' />
        </button>
        <button
          onClick={onOpenNotifications}
          className='bg-rose-400 hover:bg-rose-500 text-white px-2 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 sm:gap-2 shadow-sm transition-colors whitespace-nowrap'
          title='未確認のお知らせ'
        >
          <span className='hidden sm:inline'>未確認のお知らせがあります</span>
          <span className='sm:hidden'>お知らせ</span>
          <Calendar className='w-4 h-4' />
        </button>
        <div className='bg-white border border-gray-300 px-2 sm:px-3 py-1.5 rounded text-xs font-bold text-gray-700 shadow-sm hidden md:block whitespace-nowrap'>
          ティラミス体験版
        </div>
      </div>
    </header>
  );
};

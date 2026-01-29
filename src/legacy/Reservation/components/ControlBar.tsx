import React, { useState, useRef, useEffect } from 'react';
import {
  RefreshCw,
  Calendar as CalendarIcon,
  LayoutList,
  CalendarDays,
  PlusCircle,
} from 'lucide-react';
import { ViewMode } from '../types';
import { CalendarPopup } from './CalendarPopup';

interface Props {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
}

export const ControlBar: React.FC<Props> = ({
  currentView,
  onViewChange,
  currentDate,
  onDateChange,
  onRefresh,
}) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendar]);

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日 (月)`;
  };

  const handlePrevDay = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    onDateChange(prev);
  };

  const handleNextDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    onDateChange(next);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const activeTabClass = 'bg-sky-600 text-white shadow-inner';
  const inactiveTabClass = 'bg-white text-gray-600 hover:bg-gray-50';

  return (
    <div className='bg-white flex flex-col border-b border-gray-200 relative z-40'>
      {/* Top Row: Date & Actions */}
      <div className='p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 justify-between'>
        {/* Date Navigation */}
        <div className='flex items-center w-full sm:w-auto justify-center'>
          <button
            onClick={handlePrevDay}
            className='bg-gray-500 hover:bg-gray-600 text-white px-3 sm:px-4 py-1.5 rounded-l text-sm font-bold transition-colors'
          >
            前日
          </button>

          {/* Date Display & Popover Trigger */}
          <div className='relative flex-grow sm:flex-grow-0' ref={calendarRef}>
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className='bg-white border-y border-gray-300 px-2 sm:px-4 py-1.5 text-sm font-bold flex items-center justify-center gap-2 w-full sm:min-w-[180px] text-gray-800 hover:bg-gray-50 transition-colors'
            >
              <span className='truncate'>{formatDate(currentDate)}</span>
              <CalendarIcon className='w-4 h-4 text-gray-500 shrink-0' />
            </button>

            {/* Calendar Popup */}
            {showCalendar && (
              <div className='absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50'>
                <CalendarPopup
                  selectedDate={currentDate}
                  onSelectDate={date => {
                    onDateChange(date);
                    setShowCalendar(false);
                  }}
                  onClose={() => setShowCalendar(false)}
                />
              </div>
            )}
          </div>

          <button
            onClick={handleToday}
            className='bg-gray-500 hover:bg-gray-600 text-white px-3 sm:px-4 py-1.5 text-sm font-bold transition-colors border-r border-gray-400'
          >
            本日
          </button>
          <button
            onClick={handleNextDay}
            className='bg-gray-500 hover:bg-gray-600 text-white px-3 sm:px-4 py-1.5 rounded-r text-sm font-bold transition-colors'
          >
            翌日
          </button>
        </div>

        {/* Action Buttons */}
        <div className='flex items-center gap-2 w-full sm:w-auto justify-end'>
          <button
            onClick={onRefresh}
            className='bg-teal-400 hover:bg-teal-500 text-white px-4 py-1.5 rounded text-sm font-bold flex items-center gap-1 shadow-sm transition-colors w-full sm:w-auto justify-center'
          >
            <RefreshCw className='w-4 h-4' />
            更新
          </button>
        </div>
      </div>

      {/* Bottom Row: View Segments (Tabs) */}
      <div className='flex px-2 sm:px-4 gap-1 bg-gray-100 border-t border-gray-200 pt-2 overflow-x-auto no-scrollbar'>
        <button
          onClick={() => onViewChange('timeline')}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-t-lg border-t border-x border-gray-300 transition-colors flex items-center gap-2 whitespace-nowrap ${currentView === 'timeline' ? activeTabClass : inactiveTabClass}`}
        >
          <CalendarDays className='w-4 h-4' />
          タイムライン
        </button>
        <button
          onClick={() => onViewChange('list')}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-t-lg border-t border-x border-gray-300 transition-colors flex items-center gap-2 whitespace-nowrap ${currentView === 'list' ? activeTabClass : inactiveTabClass}`}
        >
          <LayoutList className='w-4 h-4' />
          予約一覧
        </button>
        <button
          onClick={() => onViewChange('register')}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-t-lg border-t border-x border-gray-300 transition-colors flex items-center gap-2 whitespace-nowrap ${currentView === 'register' ? activeTabClass : inactiveTabClass}`}
        >
          <PlusCircle className='w-4 h-4' />
          新規登録
        </button>
      </div>
    </div>
  );
};

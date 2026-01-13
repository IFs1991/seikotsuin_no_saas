import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
}

export const CalendarPopup: React.FC<Props> = ({ selectedDate, onSelectDate, onClose }) => {
  // State to track which month is currently being viewed (independent of selected date)
  const [viewDate, setViewDate] = useState(new Date(selectedDate));

  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];

  // Get calendar details
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // First day of the month (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // Number of days in the current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const newDate = new Date(year, month, day);
    onSelectDate(newDate);
    onClose();
  };

  const renderDays = () => {
    const days = [];
    
    // Empty cells for days before the 1st
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month, day);
      const isSelected = 
        currentDate.getDate() === selectedDate.getDate() &&
        currentDate.getMonth() === selectedDate.getMonth() &&
        currentDate.getFullYear() === selectedDate.getFullYear();
      
      const isToday = 
        new Date().getDate() === day &&
        new Date().getMonth() === month &&
        new Date().getFullYear() === year;

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(day)}
          className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors
            ${isSelected 
              ? 'bg-sky-600 text-white' 
              : isToday 
                ? 'bg-gray-100 text-sky-600 font-bold hover:bg-gray-200'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-xl border border-gray-200 w-72 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button 
          onClick={handlePrevMonth}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-bold text-gray-800">
          {year}年 {month + 1}月
        </span>
        <button 
          onClick={handleNextMonth}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Days of Week */}
      <div className="grid grid-cols-7 mb-2">
        {daysOfWeek.map((day, index) => (
          <div 
            key={day} 
            className={`text-center text-xs font-bold ${index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-gray-500'}`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-y-1 justify-items-center">
        {renderDays()}
      </div>
    </div>
  );
};
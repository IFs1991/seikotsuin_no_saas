import React from 'react';
import { Appointment } from '../types';
import { RESOURCES, COLORS, MENUS, OPTIONS } from '../constants';
import { Calendar, User, Scissors, Edit, MessageCircle } from 'lucide-react';

interface Props {
  appointment: Appointment;
  onEdit?: () => void;
  className?: string;
}

export const AppointmentSummary: React.FC<Props> = ({
  appointment,
  onEdit,
  className = '',
}) => {
  const resourceName =
    RESOURCES.find(r => r.id === appointment.resourceId)?.name || '不明';
  const menuName =
    MENUS.find(m => m.id === appointment.menuId)?.name || '未選択';
  const optionName = OPTIONS.find(o => o.id === appointment.optionId)?.name;

  const colorClass = COLORS[appointment.color].replace(
    'border-',
    'border-l-4 border-'
  );

  const fullName =
    appointment.lastName && appointment.firstName
      ? `${appointment.lastName} ${appointment.firstName}`
      : appointment.title;

  const formatDateJP = (dateStr?: string) => {
    if (!dateStr) return '日付未設定';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Main Info Card */}
      <div
        className={`p-5 rounded-lg bg-gray-50 border border-gray-200 ${colorClass} relative group transition-all hover:shadow-sm`}
      >
        {onEdit && (
          <button
            onClick={onEdit}
            className='absolute top-4 right-4 p-2 bg-white/80 hover:bg-white text-gray-500 hover:text-sky-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all'
            title='編集する'
          >
            <Edit className='w-4 h-4' />
          </button>
        )}

        <div className='flex justify-between items-start mb-3'>
          <div>
            <span className='text-xs font-bold text-gray-500 uppercase tracking-wide'>
              予約ID: {appointment.id}
            </span>
            <h1 className='text-xl sm:text-2xl font-bold text-gray-900 mt-1 leading-tight flex items-center gap-2 flex-wrap'>
              {fullName}
              {appointment.lastName && (
                <span className='text-sm font-normal text-gray-500 ml-1'>
                  様
                </span>
              )}
            </h1>
          </div>
          {appointment.subTitle && (
            <span className='bg-white/80 border border-gray-200 text-gray-700 text-xs px-2 py-1 rounded font-medium whitespace-nowrap'>
              {appointment.subTitle}
            </span>
          )}
        </div>

        <div className='space-y-4 mt-5'>
          <div className='flex items-start gap-3'>
            <div className='w-6 mt-0.5 text-gray-400'>
              <Calendar className='w-5 h-5' />
            </div>
            <div>
              <div className='text-xs font-bold text-gray-500 uppercase'>
                来店日時
              </div>
              <div className='font-mono text-base sm:text-lg font-medium text-gray-800 flex items-center gap-2 flex-wrap'>
                {formatDateJP(appointment.date)}
                <span className='text-gray-300 hidden sm:inline'>|</span>
                <span className='block sm:inline'>
                  {String(appointment.startHour).padStart(2, '0')}:
                  {String(appointment.startMinute).padStart(2, '0')}
                  <span className='text-gray-400 mx-1'>→</span>
                  {String(appointment.endHour).padStart(2, '0')}:
                  {String(appointment.endMinute).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>

          <div className='flex items-start gap-3'>
            <div className='w-6 mt-0.5 text-gray-400'>
              <User className='w-5 h-5' />
            </div>
            <div>
              <div className='text-xs font-bold text-gray-500 uppercase'>
                担当スタッフ
              </div>
              <div className='text-gray-900 font-medium'>{resourceName}</div>
            </div>
          </div>

          <div className='flex items-start gap-3'>
            <div className='w-6 mt-0.5 text-gray-400'>
              <Scissors className='w-5 h-5' />
            </div>
            <div>
              <div className='text-xs font-bold text-gray-500 uppercase'>
                メニュー内容
              </div>
              <div className='text-gray-900 font-medium'>{menuName}</div>
              {optionName && optionName !== 'なし' && (
                <div className='text-sm text-gray-600 mt-1 bg-white inline-block px-2 py-0.5 rounded border border-gray-200'>
                  + {optionName}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Memo Section */}
      <div>
        <div className='flex items-center justify-between mb-2'>
          <h3 className='text-sm font-bold text-gray-700 flex items-center gap-2'>
            <MessageCircle className='w-4 h-4 text-gray-400' />
            顧客メモ・備考
          </h3>
        </div>

        <div
          onClick={onEdit}
          className={`bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-sm text-gray-700 min-h-[100px] whitespace-pre-wrap transition-colors ${onEdit ? 'cursor-pointer hover:bg-yellow-100/50 group relative' : ''}`}
        >
          {appointment.memo || (
            <span className='text-gray-400 italic'>メモはありません。</span>
          )}
          {onEdit && (
            <div className='absolute bottom-2 right-2 text-yellow-600/50 text-xs opacity-0 group-hover:opacity-100'>
              クリックして編集
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

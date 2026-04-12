import React from 'react';
import {
  Appointment,
  MenuItem,
  MenuOptionItem,
  SchedulerResource,
} from '../types';

import { calculateEndTime, calculateDuration } from '../utils/time';

interface Props {
  formData: Appointment;
  resources: SchedulerResource[];
  menus: MenuItem[];
  options: MenuOptionItem[];
  onChange: (field: keyof Appointment, value: any) => void;
  onDurationChange?: (minutes: number) => void;
}

export const AppointmentEditForm: React.FC<Props> = ({
  formData,
  resources,
  menus,
  options,
  onChange,
  onDurationChange,
}) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const durationOptions = Array.from({ length: 13 }, (_, i) => i * 15);

  const currentDuration = calculateDuration(
    formData.startHour,
    formData.startMinute,
    formData.endHour,
    formData.endMinute
  );

  const handleDurationChangeLocal = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newDuration = parseInt(e.target.value, 10);
    if (onDurationChange) {
      onDurationChange(newDuration);
    } else {
      // Fallback internal calculation if handler not provided
      const { endHour, endMinute } = calculateEndTime(
        formData.startHour,
        formData.startMinute,
        newDuration
      );
      onChange('endHour', endHour);
      onChange('endMinute', endMinute);
    }
  };

  return (
    <div className='space-y-4 sm:space-y-5'>
      {/* Name */}
      <div>
        <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
          お名前
        </label>
        <div className='grid grid-cols-2 gap-3'>
          <input
            type='text'
            value={formData.lastName || ''}
            onChange={e => onChange('lastName', e.target.value)}
            disabled
            className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
            placeholder='姓'
          />
          <input
            type='text'
            value={formData.firstName || ''}
            onChange={e => onChange('firstName', e.target.value)}
            disabled
            className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
            placeholder='名'
          />
        </div>
      </div>

      {/* Date & Time */}
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        <div>
          <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
            来店日
          </label>
          <input
            type='date'
            value={formData.date}
            onChange={e => onChange('date', e.target.value)}
            className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
          />
        </div>
        <div>
          <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
            開始時間
          </label>
          <div className='flex items-center gap-1'>
            <select
              value={formData.startHour}
              onChange={e => onChange('startHour', parseInt(e.target.value))}
              className='w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
            >
              {hours.map(h => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>
            <span className='text-gray-400 font-bold'>:</span>
            <select
              value={formData.startMinute}
              onChange={e => onChange('startMinute', parseInt(e.target.value))}
              className='w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
            >
              {minutes.map(m => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Resource */}
      <div>
        <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
          担当スタッフ
        </label>
        <select
          value={formData.resourceId}
          onChange={e => onChange('resourceId', e.target.value)}
          className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
        >
          {resources
            .filter(r => r.id !== 'separator')
            .map(r => (
              <option key={r.id} value={r.id}>
                {r.name} {r.capacity ? `(${r.capacity})` : ''}
              </option>
            ))}
        </select>
      </div>

      {/* Menu & Options */}
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        <div>
          <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
            メニュー
          </label>
          <select
            value={formData.menuId || ''}
            onChange={e => onChange('menuId', e.target.value)}
            disabled
            className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
          >
            {menus.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
            オプション
          </label>
          <select
            value={formData.optionId || ''}
            onChange={e => onChange('optionId', e.target.value)}
            disabled
            className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none'
          >
            {options.map(o => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Duration & End Time Display */}
      <div className='bg-gray-50 p-3 rounded-md border border-gray-200 flex flex-col gap-2'>
        <div className='flex justify-between items-center'>
          <div className='flex items-center gap-3'>
            <label className='text-xs font-bold text-gray-500 uppercase'>
              所要時間
            </label>
            <div className='relative'>
              <select
                value={currentDuration}
                onChange={handleDurationChangeLocal}
                className='appearance-none pl-3 pr-8 py-1.5 text-sm border-gray-300 rounded border bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none font-medium'
              >
                {durationOptions.map(d => (
                  <option key={d} value={d}>
                    {d}分
                  </option>
                ))}
              </select>
              <div className='pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700'>
                <svg
                  className='fill-current h-4 w-4'
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 20 20'
                >
                  <path d='M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z' />
                </svg>
              </div>
            </div>
          </div>

          <div className='text-gray-700 flex items-center gap-2'>
            <span className='text-xs font-bold text-gray-500 uppercase'>
              終了時間
            </span>
            <span className='font-mono font-bold text-xl text-gray-800 bg-white px-2 py-0.5 rounded border border-gray-300'>
              {String(formData.endHour).padStart(2, '0')}:
              {String(formData.endMinute).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* Memo */}
      <div>
        <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
          メモ
        </label>
        <textarea
          value={formData.memo || ''}
          onChange={e => onChange('memo', e.target.value)}
          className='block w-full text-sm border-gray-300 rounded-md border p-2 focus:ring-2 focus:ring-sky-500 focus:outline-none h-24'
        />
      </div>

      {/* Color */}
      <div>
        <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
          カラー
        </label>
        <div className='flex gap-2'>
          {(['red', 'pink', 'blue', 'orange', 'purple'] as const).map(color => (
            <button
              key={color}
              type='button'
              onClick={() => onChange('color', color)}
              className={`w-6 h-6 rounded-full transition-transform ${formData.color === color ? 'ring-2 ring-offset-2 ring-sky-500 scale-110' : 'hover:scale-110'}`}
              style={{
                backgroundColor:
                  color === 'red'
                    ? '#fb7185'
                    : color === 'pink'
                      ? '#f9a8d4'
                      : color === 'blue'
                        ? '#38bdf8'
                        : color === 'orange'
                          ? '#fb923c'
                          : '#4f46e5',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

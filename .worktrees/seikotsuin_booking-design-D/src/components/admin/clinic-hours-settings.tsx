'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, Plus, Trash2 } from 'lucide-react';

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  isOpen: boolean;
  timeSlots: TimeSlot[];
}

interface WeekSchedule {
  [key: string]: DaySchedule;
}

interface SpecialDate {
  date: string;
  type: 'holiday' | 'specialHours';
  label: string;
  timeSlots?: TimeSlot[];
}

export function ClinicHoursSettings() {
  const [schedule, setSchedule] = useState<WeekSchedule>({
    monday: {
      isOpen: true,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '19:00' },
      ],
    },
    tuesday: {
      isOpen: true,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '19:00' },
      ],
    },
    wednesday: {
      isOpen: true,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '19:00' },
      ],
    },
    thursday: {
      isOpen: true,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '19:00' },
      ],
    },
    friday: {
      isOpen: true,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '19:00' },
      ],
    },
    saturday: { isOpen: true, timeSlots: [{ start: '09:00', end: '13:00' }] },
    sunday: { isOpen: false, timeSlots: [] },
  });

  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([
    { date: '2025-01-01', type: 'holiday', label: '元旦' },
    {
      date: '2025-12-31',
      type: 'specialHours',
      label: '年末営業',
      timeSlots: [{ start: '09:00', end: '15:00' }],
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const dayNames = {
    monday: '月曜日',
    tuesday: '火曜日',
    wednesday: '水曜日',
    thursday: '木曜日',
    friday: '金曜日',
    saturday: '土曜日',
    sunday: '日曜日',
  };

  const toggleDayOpen = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        isOpen: !prev[day].isOpen,
        timeSlots: !prev[day].isOpen ? [{ start: '09:00', end: '17:00' }] : [],
      },
    }));
  };

  const addTimeSlot = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeSlots: [...prev[day].timeSlots, { start: '09:00', end: '17:00' }],
      },
    }));
  };

  const removeTimeSlot = (day: string, index: number) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeSlots: prev[day].timeSlots.filter((_, i) => i !== index),
      },
    }));
  };

  const updateTimeSlot = (
    day: string,
    index: number,
    field: 'start' | 'end',
    value: string
  ) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeSlots: prev[day].timeSlots.map((slot, i) =>
          i === index ? { ...slot, [field]: value } : slot
        ),
      },
    }));
  };

  const addSpecialDate = () => {
    setSpecialDates(prev => [
      ...prev,
      {
        date: '',
        type: 'holiday',
        label: '',
        timeSlots: [],
      },
    ]);
  };

  const removeSpecialDate = (index: number) => {
    setSpecialDates(prev => prev.filter((_, i) => i !== index));
  };

  const updateSpecialDate = (
    index: number,
    field: keyof SpecialDate,
    value: any
  ) => {
    setSpecialDates(prev =>
      prev.map((date, i) => (i === index ? { ...date, [field]: value } : date))
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    setSavedMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSavedMessage('診療時間設定を保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('保存に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {savedMessage && (
        <div
          className={`p-4 rounded-md ${
            savedMessage.includes('失敗')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {savedMessage}
        </div>
      )}

      {/* 通常営業時間 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          通常営業時間
        </h3>

        <div className='space-y-4'>
          {Object.entries(schedule).map(([day, daySchedule]) => (
            <div
              key={day}
              className='flex items-start space-x-4 p-4 bg-gray-50 rounded-lg'
            >
              <div className='w-20'>
                <Label className='font-medium text-gray-700'>
                  {dayNames[day as keyof typeof dayNames]}
                </Label>
              </div>

              <div className='flex-1'>
                <div className='flex items-center space-x-4 mb-3'>
                  <label className='flex items-center space-x-2'>
                    <input
                      type='checkbox'
                      checked={daySchedule.isOpen}
                      onChange={() => toggleDayOpen(day)}
                      className='rounded border-gray-300'
                    />
                    <span className='text-sm text-gray-700'>営業日</span>
                  </label>
                </div>

                {daySchedule.isOpen && (
                  <div className='space-y-2'>
                    {daySchedule.timeSlots.map((slot, index) => (
                      <div key={index} className='flex items-center space-x-2'>
                        <Input
                          type='time'
                          value={slot.start}
                          onChange={e =>
                            updateTimeSlot(day, index, 'start', e.target.value)
                          }
                          className='w-32'
                        />
                        <span className='text-gray-500'>〜</span>
                        <Input
                          type='time'
                          value={slot.end}
                          onChange={e =>
                            updateTimeSlot(day, index, 'end', e.target.value)
                          }
                          className='w-32'
                        />
                        {daySchedule.timeSlots.length > 1 && (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => removeTimeSlot(day, index)}
                            className='text-red-600 hover:text-red-700'
                          >
                            <Trash2 className='w-4 h-4' />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => addTimeSlot(day)}
                      className='flex items-center space-x-1'
                    >
                      <Plus className='w-4 h-4' />
                      <span>時間帯を追加</span>
                    </Button>
                  </div>
                )}

                {!daySchedule.isOpen && (
                  <div className='text-sm text-gray-500'>定休日</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 特別営業日・休診日 */}
      <Card className='p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-semibold text-gray-900'>
            特別営業日・休診日
          </h3>
          <Button
            type='button'
            variant='outline'
            onClick={addSpecialDate}
            className='flex items-center space-x-1'
          >
            <Plus className='w-4 h-4' />
            <span>追加</span>
          </Button>
        </div>

        <div className='space-y-4'>
          {specialDates.map((specialDate, index) => (
            <div key={index} className='p-4 bg-gray-50 rounded-lg'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
                <div>
                  <Label className='block text-sm font-medium text-gray-700 mb-1'>
                    日付
                  </Label>
                  <Input
                    type='date'
                    value={specialDate.date}
                    onChange={e =>
                      updateSpecialDate(index, 'date', e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label className='block text-sm font-medium text-gray-700 mb-1'>
                    種類
                  </Label>
                  <select
                    value={specialDate.type}
                    onChange={e =>
                      updateSpecialDate(
                        index,
                        'type',
                        e.target.value as 'holiday' | 'specialHours'
                      )
                    }
                    className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  >
                    <option value='holiday'>休診日</option>
                    <option value='specialHours'>特別営業時間</option>
                  </select>
                </div>

                <div>
                  <Label className='block text-sm font-medium text-gray-700 mb-1'>
                    名称
                  </Label>
                  <Input
                    type='text'
                    value={specialDate.label}
                    onChange={e =>
                      updateSpecialDate(index, 'label', e.target.value)
                    }
                    placeholder='例: 年末年始、お盆休み'
                  />
                </div>
              </div>

              {specialDate.type === 'specialHours' && (
                <div>
                  <Label className='block text-sm font-medium text-gray-700 mb-2'>
                    営業時間
                  </Label>
                  <div className='flex items-center space-x-2'>
                    <Input
                      type='time'
                      value={specialDate.timeSlots?.[0]?.start || '09:00'}
                      onChange={e =>
                        updateSpecialDate(index, 'timeSlots', [
                          {
                            start: e.target.value,
                            end: specialDate.timeSlots?.[0]?.end || '17:00',
                          },
                        ])
                      }
                      className='w-32'
                    />
                    <span className='text-gray-500'>〜</span>
                    <Input
                      type='time'
                      value={specialDate.timeSlots?.[0]?.end || '17:00'}
                      onChange={e =>
                        updateSpecialDate(index, 'timeSlots', [
                          {
                            start: specialDate.timeSlots?.[0]?.start || '09:00',
                            end: e.target.value,
                          },
                        ])
                      }
                      className='w-32'
                    />
                  </div>
                </div>
              )}

              <div className='flex justify-end mt-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => removeSpecialDate(index)}
                  className='text-red-600 hover:text-red-700'
                >
                  <Trash2 className='w-4 h-4 mr-1' />
                  削除
                </Button>
              </div>
            </div>
          ))}

          {specialDates.length === 0 && (
            <div className='text-center py-8 text-gray-500'>
              特別営業日・休診日は設定されていません
            </div>
          )}
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
        <Button variant='outline'>キャンセル</Button>
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className='flex items-center space-x-2'
        >
          <Save className='w-4 h-4' />
          <span>{isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}

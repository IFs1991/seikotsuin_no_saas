'use client';

import { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type SpecialDate,
  type UpdateSpecialDate,
} from './clinic-hours-settings.types';

interface ClinicHoursSpecialDateRowProps {
  index: number;
  specialDate: SpecialDate;
  onRemoveSpecialDate: (index: number) => void;
  onUpdateSpecialDate: UpdateSpecialDate;
}

export const ClinicHoursSpecialDateRow = memo(
  function ClinicHoursSpecialDateRow({
    index,
    specialDate,
    onRemoveSpecialDate,
    onUpdateSpecialDate,
  }: ClinicHoursSpecialDateRowProps) {
    const firstSlot = specialDate.timeSlots?.[0];

    return (
      <div className='p-4 bg-gray-50 rounded-lg'>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              日付
            </Label>
            <Input
              type='date'
              value={specialDate.date}
              onChange={event =>
                onUpdateSpecialDate(index, 'date', event.target.value)
              }
            />
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              種類
            </Label>
            <select
              value={specialDate.type}
              onChange={event =>
                onUpdateSpecialDate(
                  index,
                  'type',
                  event.target.value === 'specialHours'
                    ? 'specialHours'
                    : 'holiday'
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
              onChange={event =>
                onUpdateSpecialDate(index, 'label', event.target.value)
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
                value={firstSlot?.start || '09:00'}
                onChange={event =>
                  onUpdateSpecialDate(index, 'timeSlots', [
                    {
                      start: event.target.value,
                      end: firstSlot?.end || '17:00',
                    },
                  ])
                }
                className='w-32'
              />
              <span className='text-gray-500'>〜</span>
              <Input
                type='time'
                value={firstSlot?.end || '17:00'}
                onChange={event =>
                  onUpdateSpecialDate(index, 'timeSlots', [
                    {
                      start: firstSlot?.start || '09:00',
                      end: event.target.value,
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
            onClick={() => onRemoveSpecialDate(index)}
            className='text-red-600 hover:text-red-700'
          >
            <Trash2 className='w-4 h-4 mr-1' />
            削除
          </Button>
        </div>
      </div>
    );
  }
);

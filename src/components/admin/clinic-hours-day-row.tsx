'use client';

import { memo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  dayNames,
  type DaySchedule,
  type TimeSlotField,
  type WeekDay,
} from './clinic-hours-settings.types';

interface ClinicHoursDayRowProps {
  weekDay: WeekDay;
  daySchedule: DaySchedule;
  onToggleDayOpen: (day: WeekDay) => void;
  onAddTimeSlot: (day: WeekDay) => void;
  onRemoveTimeSlot: (day: WeekDay, index: number) => void;
  onUpdateTimeSlot: (
    day: WeekDay,
    index: number,
    field: TimeSlotField,
    value: string
  ) => void;
}

export const ClinicHoursDayRow = memo(function ClinicHoursDayRow({
  weekDay,
  daySchedule,
  onToggleDayOpen,
  onAddTimeSlot,
  onRemoveTimeSlot,
  onUpdateTimeSlot,
}: ClinicHoursDayRowProps) {
  return (
    <div className='flex items-start space-x-4 p-4 bg-gray-50 rounded-lg'>
      <div className='w-20'>
        <Label className='font-medium text-gray-700'>{dayNames[weekDay]}</Label>
      </div>

      <div className='flex-1'>
        <div className='flex items-center space-x-4 mb-3'>
          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={daySchedule.isOpen}
              onChange={() => onToggleDayOpen(weekDay)}
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
                  onChange={event =>
                    onUpdateTimeSlot(
                      weekDay,
                      index,
                      'start',
                      event.target.value
                    )
                  }
                  className='w-32'
                />
                <span className='text-gray-500'>〜</span>
                <Input
                  type='time'
                  value={slot.end}
                  onChange={event =>
                    onUpdateTimeSlot(weekDay, index, 'end', event.target.value)
                  }
                  className='w-32'
                />
                {daySchedule.timeSlots.length > 1 && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => onRemoveTimeSlot(weekDay, index)}
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
              onClick={() => onAddTimeSlot(weekDay)}
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
  );
});

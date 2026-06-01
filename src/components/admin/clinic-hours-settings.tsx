'use client';

import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Plus, Loader2 } from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';
import { ClinicHoursDayRow } from './clinic-hours-day-row';
import { ClinicHoursSpecialDateRow } from './clinic-hours-special-date-row';
import {
  weekDays,
  type ClinicHoursData,
  type DaySchedule,
  type TimeSlot,
  type TimeSlotField,
  type UpdateSpecialDate,
  type WeekDay,
  type WeekSchedule,
} from './clinic-hours-settings.types';

const initialData: ClinicHoursData = {
  hoursByDay: {
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
  },
  holidays: [],
  specialClosures: [],
};

const createDefaultTimeSlot = (): TimeSlot => ({
  start: '09:00',
  end: '17:00',
});

function normalizeDaySchedule(
  day: WeekDay,
  sourceDaySchedule?: Partial<DaySchedule>
): DaySchedule {
  const fallback = initialData.hoursByDay[day];
  const hasValidTimeSlots = Array.isArray(sourceDaySchedule?.timeSlots);

  if (typeof sourceDaySchedule?.isOpen === 'boolean' && hasValidTimeSlots) {
    return {
      isOpen: sourceDaySchedule.isOpen,
      timeSlots: sourceDaySchedule.timeSlots,
    };
  }

  return {
    ...fallback,
    ...sourceDaySchedule,
    isOpen:
      typeof sourceDaySchedule?.isOpen === 'boolean'
        ? sourceDaySchedule.isOpen
        : fallback.isOpen,
    timeSlots:
      hasValidTimeSlots && sourceDaySchedule
        ? sourceDaySchedule.timeSlots
        : fallback.timeSlots,
  };
}

function normalizeClinicHoursData(data: ClinicHoursData): ClinicHoursData {
  const sourceHoursByDay = data.hoursByDay ?? initialData.hoursByDay;
  const hoursByDay = weekDays.reduce<WeekSchedule>((normalized, day) => {
    normalized[day] = normalizeDaySchedule(day, sourceHoursByDay[day]);

    return normalized;
  }, {} as WeekSchedule);

  return {
    ...data,
    hoursByDay,
    holidays: Array.isArray(data.holidays) ? data.holidays : [],
    specialClosures: Array.isArray(data.specialClosures)
      ? data.specialClosures
      : [],
  };
}

export function ClinicHoursSettings({
  clinicId: selectedClinicId,
}: {
  clinicId?: string | null;
}) {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = selectedClinicId ?? profile?.clinicId;

  const {
    data: formData,
    updateData,
    loadingState,
    handleSaveData,
    isInitialized,
  } = useAdminSettings(
    initialData,
    clinicId
      ? {
          clinicId,
          category: 'clinic_hours',
          autoLoad: true,
        }
      : undefined
  );

  const normalizedFormData = useMemo(
    () => normalizeClinicHoursData(formData),
    [formData]
  );
  const schedule = normalizedFormData.hoursByDay;
  const specialDates = normalizedFormData.specialClosures;

  const toggleDayOpen = useCallback(
    (day: WeekDay) => {
      updateData(previousData => {
        const normalized = normalizeClinicHoursData(previousData);
        const daySchedule = normalized.hoursByDay[day];

        return {
          ...normalized,
          hoursByDay: {
            ...normalized.hoursByDay,
            [day]: {
              ...daySchedule,
              isOpen: !daySchedule.isOpen,
              timeSlots: !daySchedule.isOpen ? [createDefaultTimeSlot()] : [],
            },
          },
        };
      });
    },
    [updateData]
  );

  const addTimeSlot = useCallback(
    (day: WeekDay) => {
      updateData(previousData => {
        const normalized = normalizeClinicHoursData(previousData);
        const daySchedule = normalized.hoursByDay[day];

        return {
          ...normalized,
          hoursByDay: {
            ...normalized.hoursByDay,
            [day]: {
              ...daySchedule,
              timeSlots: [...daySchedule.timeSlots, createDefaultTimeSlot()],
            },
          },
        };
      });
    },
    [updateData]
  );

  const removeTimeSlot = useCallback(
    (day: WeekDay, index: number) => {
      updateData(previousData => {
        const normalized = normalizeClinicHoursData(previousData);
        const daySchedule = normalized.hoursByDay[day];

        return {
          ...normalized,
          hoursByDay: {
            ...normalized.hoursByDay,
            [day]: {
              ...daySchedule,
              timeSlots: daySchedule.timeSlots.filter((_, i) => i !== index),
            },
          },
        };
      });
    },
    [updateData]
  );

  const updateTimeSlot = useCallback(
    (day: WeekDay, index: number, field: TimeSlotField, value: string) => {
      updateData(previousData => {
        const normalized = normalizeClinicHoursData(previousData);
        const daySchedule = normalized.hoursByDay[day];

        return {
          ...normalized,
          hoursByDay: {
            ...normalized.hoursByDay,
            [day]: {
              ...daySchedule,
              timeSlots: daySchedule.timeSlots.map((slot, i) =>
                i === index ? { ...slot, [field]: value } : slot
              ),
            },
          },
        };
      });
    },
    [updateData]
  );

  const addSpecialDate = useCallback(() => {
    updateData(previousData => {
      const normalized = normalizeClinicHoursData(previousData);

      return {
        ...normalized,
        specialClosures: [
          ...normalized.specialClosures,
          {
            date: '',
            type: 'holiday',
            label: '',
            timeSlots: [],
          },
        ],
      };
    });
  }, [updateData]);

  const removeSpecialDate = useCallback(
    (index: number) => {
      updateData(previousData => {
        const normalized = normalizeClinicHoursData(previousData);

        return {
          ...normalized,
          specialClosures: normalized.specialClosures.filter(
            (_, i) => i !== index
          ),
        };
      });
    },
    [updateData]
  );

  const updateSpecialDate = useCallback<UpdateSpecialDate>(
    (index, field, value) => {
      updateData(previousData => {
        const normalized = normalizeClinicHoursData(previousData);

        return {
          ...normalized,
          specialClosures: normalized.specialClosures.map((date, i) =>
            i === index ? { ...date, [field]: value } : date
          ),
        };
      });
    },
    [updateData]
  );

  const onSave = useCallback(async () => {
    await handleSaveData(normalizedFormData);
  }, [handleSaveData, normalizedFormData]);

  // ローディング中
  if (profileLoading || !isInitialized) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type='error' />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type='success' />
      )}

      {/* 通常営業時間 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          通常営業時間
        </h3>

        <div className='space-y-4'>
          {weekDays.map(weekDay => (
            <ClinicHoursDayRow
              key={weekDay}
              weekDay={weekDay}
              daySchedule={schedule[weekDay]}
              onToggleDayOpen={toggleDayOpen}
              onAddTimeSlot={addTimeSlot}
              onRemoveTimeSlot={removeTimeSlot}
              onUpdateTimeSlot={updateTimeSlot}
            />
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
            <ClinicHoursSpecialDateRow
              key={index}
              index={index}
              specialDate={specialDate}
              onRemoveSpecialDate={removeSpecialDate}
              onUpdateSpecialDate={updateSpecialDate}
            />
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
          onClick={onSave}
          disabled={loadingState.isLoading}
          className='flex items-center space-x-2'
        >
          {loadingState.isLoading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <Save className='w-4 h-4' />
          )}
          <span>{loadingState.isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}

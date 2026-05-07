import React, { useMemo } from 'react';
import { Calendar, Clock, Scissors, User, X } from 'lucide-react';
import type { Appointment, MenuItem, SchedulerResource } from '../types';
import {
  formatAppointmentTime,
  getAppointmentStatusLabel,
  getAppointmentStatusTone,
} from '../utils/view';

interface Props {
  appointments: Appointment[];
  resources: SchedulerResource[];
  menus: MenuItem[];
  onClose: () => void;
  onSelect: (appointment: Appointment) => void;
}

interface CancelledReservationViewItem {
  appointment: Appointment;
  date: string;
  menuName: string;
  resourceName: string;
  statusLabel: string;
  statusTone: string;
  time: string;
}

const buildCancelledReservationViewItems = ({
  appointments,
  menus,
  resources,
}: Pick<Props, 'appointments' | 'menus' | 'resources'>) => {
  const resourceNameById = new Map(
    resources.map(resource => [resource.id, resource.name])
  );
  const menuNameById = new Map(menus.map(menu => [menu.id, menu.name]));

  return [...appointments]
    .sort((a, b) => {
      const timeA = a.startHour * 60 + a.startMinute;
      const timeB = b.startHour * 60 + b.startMinute;
      return timeA - timeB;
    })
    .map<CancelledReservationViewItem>(appointment => {
      const status = appointment.status ?? 'confirmed';
      const menuName = appointment.menuId
        ? (menuNameById.get(appointment.menuId) ??
          appointment.menuName ??
          'メニュー未設定')
        : (appointment.menuName ?? 'メニュー未設定');

      return {
        appointment,
        date: appointment.date,
        menuName,
        resourceName: resourceNameById.get(appointment.resourceId) ?? '未定',
        statusLabel: getAppointmentStatusLabel({
          status,
          type: 'normal',
        }),
        statusTone: getAppointmentStatusTone({ status }),
        time: formatAppointmentTime(appointment),
      };
    });
};

const CancelledReservationsModalComponent: React.FC<Props> = ({
  appointments,
  resources,
  menus,
  onClose,
  onSelect,
}) => {
  const viewItems = useMemo(
    () =>
      buildCancelledReservationViewItems({
        appointments,
        menus,
        resources,
      }),
    [appointments, menus, resources]
  );

  const handleSelect = (appointment: Appointment) => {
    onSelect(appointment);
    onClose();
  };

  return (
    <div className='fixed inset-0 z-[60] flex items-center justify-center p-4'>
      <button
        type='button'
        aria-label='取消・不来院予約一覧を閉じる'
        className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
        onClick={onClose}
      />

      <div className='relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200'>
        <div className='flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4'>
          <h2 className='flex items-center gap-2 text-lg font-bold text-gray-800'>
            <Calendar className='h-5 w-5 text-gray-500' />
            取消・不来院予約 ({viewItems.length}件)
          </h2>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600'
          >
            <X className='h-6 w-6' />
          </button>
        </div>

        <div className='overflow-y-auto bg-gray-50'>
          {viewItems.length === 0 ? (
            <div className='p-10 text-center text-gray-500'>
              取消・不来院の予約はありません。
            </div>
          ) : (
            <div className='divide-y divide-gray-200'>
              {viewItems.map(item => {
                return (
                  <div
                    key={item.appointment.id}
                    className='bg-white p-4 transition-colors hover:bg-gray-50 sm:p-5'
                  >
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                      <div className='min-w-0 space-y-2'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${item.statusTone}`}
                          >
                            {item.statusLabel}
                          </span>
                          <span className='text-sm text-gray-500'>
                            {item.date}
                          </span>
                        </div>
                        <button
                          type='button'
                          onClick={() => handleSelect(item.appointment)}
                          className='block max-w-full truncate text-left text-lg font-bold text-sky-700 hover:text-sky-800 hover:underline'
                        >
                          {item.appointment.title}
                        </button>
                        <div className='grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-gray-600 sm:grid-cols-2'>
                          <div className='flex items-center gap-2'>
                            <Clock className='h-4 w-4 text-gray-400' />
                            <span className='font-mono font-bold'>
                              {item.time}
                            </span>
                          </div>
                          <div className='flex items-center gap-2'>
                            <User className='h-4 w-4 text-gray-400' />
                            <span>担当: {item.resourceName}</span>
                          </div>
                          <div className='flex items-center gap-2 sm:col-span-2'>
                            <Scissors className='h-4 w-4 text-gray-400' />
                            <span>{item.menuName}</span>
                          </div>
                        </div>
                        {item.appointment.memo && (
                          <div className='rounded border border-yellow-100 bg-yellow-50 p-2 text-xs text-gray-600'>
                            {item.appointment.memo}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className='flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-md border border-transparent bg-gray-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-gray-700'
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const CancelledReservationsModal = React.memo(
  CancelledReservationsModalComponent
);

import React from 'react';
import { X } from 'lucide-react';
import type { Appointment, MenuItem, SchedulerResource } from '../types';
import { AppointmentForm } from './AppointmentForm';

interface Props {
  clinicId: string;
  resources: SchedulerResource[];
  menus: MenuItem[];
  appointments: Appointment[];
  onSuccess: (newAppointment: Appointment) => void | Promise<void>;
  onClose: () => void;
  initialData?: {
    resourceId?: string;
    startHour?: number;
    startMinute?: number;
    date?: string;
  };
}

export const AppointmentFormModal: React.FC<Props> = ({
  clinicId,
  resources,
  menus,
  appointments,
  onSuccess,
  onClose,
  initialData,
}) => {
  return (
    <div
      className='fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-3 sm:p-6'
      role='presentation'
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className='relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl'
        role='dialog'
        aria-modal='true'
        aria-labelledby='appointment-form-modal-title'
      >
        <div className='flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5'>
          <h2
            id='appointment-form-modal-title'
            className='text-base font-bold text-gray-900 sm:text-lg'
          >
            新規予約登録
          </h2>
          <button
            type='button'
            onClick={onClose}
            className='rounded p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700'
            aria-label='新規予約登録を閉じる'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='overflow-y-auto bg-gray-50'>
          <AppointmentForm
            clinicId={clinicId}
            resources={resources}
            menus={menus}
            onSuccess={onSuccess}
            onCancel={onClose}
            initialData={initialData}
            appointments={appointments}
            embedded
          />
        </div>
      </div>
    </div>
  );
};

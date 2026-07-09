import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Appointment,
  AppointmentUpdateResult,
  MenuItem,
  MenuOptionItem,
  SchedulerResource,
} from '../types';
import { calculateEndTime, calculateDuration } from '../utils/time';
import { X, Trash2, Edit, Check, Undo, History } from 'lucide-react';
import { AppointmentSummary } from './AppointmentSummary';
import { AppointmentEditForm } from './AppointmentEditForm';
import { AppointmentHistoryPanel } from './AppointmentHistoryPanel';
import { statusToColor } from '../hooks/statusToColor';
import { fetchCustomerReservations, type ReservationApiItem } from '../api';
import type { BookingFormResponseValue } from '@/lib/booking-form/settings';

const VISIT_STATUS_ACTIONS: {
  status: NonNullable<Appointment['status']>;
  label: string;
  className: string;
}[] = [
  {
    status: 'arrived',
    label: '来院済み',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  {
    status: 'no_show',
    label: '来院なし',
    className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  },
  {
    status: 'cancelled',
    label: 'キャンセル',
    className: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  },
];

const formatIntakeValue = (value: BookingFormResponseValue) => {
  if (typeof value === 'boolean') {
    return value ? 'はい' : 'いいえ';
  }
  if (Array.isArray(value)) {
    return value.join('、');
  }
  return value;
};

interface Props {
  clinicId?: string;
  appointment: Appointment;
  resources: SchedulerResource[];
  menus: MenuItem[];
  options: MenuOptionItem[];
  onClose: () => void;
  onUpdate: (
    updatedAppointment: Appointment
  ) => Promise<AppointmentUpdateResult>;
  onCancelAppointment?: (id: string) => Promise<AppointmentUpdateResult>;
  readOnly?: boolean;
  readOnlyMessage?: string;
}

export const AppointmentDetail: React.FC<Props> = ({
  clinicId,
  appointment,
  resources,
  menus,
  options,
  onClose,
  onUpdate,
  onCancelAppointment,
  readOnly = false,
  readOnlyMessage = '他院の予約は閲覧専用です。',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Appointment>(appointment);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<
    Appointment['status'] | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ReservationApiItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoadedForCustomerId, setHistoryLoadedForCustomerId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setFormData(appointment);
    setErrorMessage(null);
    setUpdatingStatus(null);
  }, [appointment]);

  useEffect(() => {
    setHistoryOpen(false);
    setHistoryItems([]);
    setHistoryError(null);
    setHistoryLoadedForCustomerId(null);
  }, [appointment.id, appointment.customerId]);

  const handleInputChange = (
    field: keyof Appointment,
    value: Appointment[keyof Appointment]
  ) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      let newEndHour = updated.endHour;
      let newEndMinute = updated.endMinute;

      if (field === 'startHour' || field === 'startMinute') {
        // Keep duration constant
        const currentDuration = calculateDuration(
          prev.startHour,
          prev.startMinute,
          prev.endHour,
          prev.endMinute
        );
        const res = calculateEndTime(
          updated.startHour,
          updated.startMinute,
          currentDuration
        );
        newEndHour = res.endHour;
        newEndMinute = res.endMinute;
      } else if (field === 'menuId' || field === 'optionId') {
        // Reset duration based on master data
        const menuId = field === 'menuId' ? value : prev.menuId;
        const optionId = field === 'optionId' ? value : prev.optionId;

        const menu = menus.find(m => m.id === menuId);
        const option = options.find(o => o.id === optionId);
        const newDuration =
          (menu?.durationMinutes || 0) + (option?.durationDeltaMinutes || 0);

        const res = calculateEndTime(
          updated.startHour,
          updated.startMinute,
          newDuration
        );
        newEndHour = res.endHour;
        newEndMinute = res.endMinute;
      }

      return {
        ...updated,
        endHour: newEndHour,
        endMinute: newEndMinute,
      };
    });
  };

  const handleDurationChange = (newDuration: number) => {
    setFormData(prev => {
      const { endHour, endMinute } = calculateEndTime(
        prev.startHour,
        prev.startMinute,
        newDuration
      );
      return { ...prev, endHour, endMinute };
    });
  };

  const handleSave = async () => {
    if (readOnly) {
      setErrorMessage(readOnlyMessage);
      return;
    }

    setErrorMessage(null);
    const title =
      formData.lastName && formData.firstName
        ? `${formData.lastName} ${formData.firstName}`
        : formData.title;

    try {
      const result = await onUpdate({ ...formData, title });
      if (result.ok) {
        setIsEditing(false);
      } else {
        setErrorMessage(result.error ?? 'Failed to update reservation.');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to update reservation.'
      );
    }
  };

  const handleCancelEdit = () => {
    setFormData(appointment);
    setIsEditing(false);
    setErrorMessage(null);
  };

  const isAlreadyCancelled =
    appointment.status === 'cancelled' || appointment.status === 'no_show';

  const handleCancelReservation = async () => {
    if (readOnly || !onCancelAppointment || isAlreadyCancelled) return;

    const confirmed = window.confirm('この予約を取消しますか？');
    if (!confirmed) return;

    setErrorMessage(null);
    const result = await onCancelAppointment(appointment.id);
    if (result.ok) {
      onClose();
      return;
    }
    setErrorMessage(result.error ?? 'Failed to cancel reservation.');
  };

  const handleStatusUpdate = async (
    nextStatus: NonNullable<Appointment['status']>
  ) => {
    if (readOnly || appointment.status === nextStatus || updatingStatus) return;

    setErrorMessage(null);
    setUpdatingStatus(nextStatus);

    try {
      const result = await onUpdate({
        ...appointment,
        status: nextStatus,
        color: statusToColor(nextStatus),
      });

      if (!result.ok) {
        setErrorMessage(result.error ?? 'Failed to update reservation status.');
      } else {
        setHistoryItems(prev =>
          prev.map(item =>
            item.id === appointment.id ? { ...item, status: nextStatus } : item
          )
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to update reservation status.'
      );
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleToggleHistory = async () => {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }

    setHistoryOpen(true);
    if (!clinicId || !appointment.customerId) {
      setHistoryError('患者に紐づく予約履歴を取得できません。');
      return;
    }

    if (historyLoadedForCustomerId === appointment.customerId) {
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const rows = await fetchCustomerReservations(
        clinicId,
        appointment.customerId
      );
      setHistoryItems(rows);
      setHistoryLoadedForCustomerId(appointment.customerId);
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : '予約履歴の取得に失敗しました'
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-[60] flex items-center justify-center p-4'>
      <button
        type='button'
        aria-label='予約詳細を閉じる'
        className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
        onClick={onClose}
      />

      <div className='relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50'>
          <h2 className='text-lg font-bold text-gray-800'>
            {isEditing ? '予約を編集' : '予約詳細'}
          </h2>
          <div className='flex items-center gap-2'>
            {!isEditing && onCancelAppointment && (
              <button
                onClick={handleCancelReservation}
                disabled={isAlreadyCancelled}
                className='p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-400'
                title={isAlreadyCancelled ? '取消済み' : '取消'}
              >
                <Trash2 className='w-5 h-5' />
              </button>
            )}
            <button
              onClick={onClose}
              className='p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors'
            >
              <X className='w-6 h-6' />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className='p-4 sm:p-6 overflow-y-auto'>
          {errorMessage && (
            <div className='mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
              {errorMessage}
            </div>
          )}
          {readOnly && (
            <div className='mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700'>
              {readOnlyMessage}
            </div>
          )}
          {isEditing ? (
            <AppointmentEditForm
              formData={formData}
              resources={resources}
              menus={menus}
              options={options}
              onChange={handleInputChange}
              onDurationChange={handleDurationChange}
            />
          ) : (
            <AppointmentSummary
              appointment={appointment}
              resources={resources}
              menus={menus}
              options={options}
              onEdit={readOnly ? undefined : () => setIsEditing(true)}
            />
          )}
          {!isEditing && !readOnly && (
            <div className='mt-5 border-t border-gray-100 pt-4'>
              <div className='mb-2 text-xs font-bold text-gray-500'>
                来院ステータス
              </div>
              <div className='grid grid-cols-3 gap-2'>
                {VISIT_STATUS_ACTIONS.map(action => {
                  const isCurrent = appointment.status === action.status;
                  const isUpdating = updatingStatus === action.status;
                  return (
                    <button
                      key={action.status}
                      type='button'
                      onClick={() => handleStatusUpdate(action.status)}
                      disabled={isCurrent || updatingStatus !== null}
                      className={`rounded-md border px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${action.className}`}
                      aria-pressed={isCurrent}
                    >
                      {isUpdating ? '更新中...' : action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!isEditing && appointment.intakeResponses?.length ? (
            <div className='mt-5 border-t border-gray-100 pt-4'>
              <div className='mb-2 text-xs font-bold text-gray-500'>
                予約フォーム回答
              </div>
              <dl className='space-y-2 rounded-md bg-gray-50 p-3 text-sm'>
                {appointment.intakeResponses.map(response => (
                  <div
                    key={response.id}
                    className='grid grid-cols-[7rem_1fr] gap-3'
                  >
                    <dt className='text-gray-500'>{response.label}</dt>
                    <dd className='font-medium text-gray-800'>
                      {formatIntakeValue(response.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {!isEditing && historyOpen && (
            <AppointmentHistoryPanel
              items={historyItems}
              loading={historyLoading}
              error={historyError}
              currentAppointmentId={appointment.id}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className='bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center'>
          {isEditing ? (
            <div className='flex justify-end gap-3 w-full'>
              <button
                onClick={handleCancelEdit}
                className='px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-bold text-gray-600 shadow-sm hover:bg-gray-100 flex items-center gap-1'
              >
                <Undo className='w-4 h-4' />{' '}
                <span className='hidden sm:inline'>キャンセル</span>
              </button>
              <button
                onClick={handleSave}
                className='px-4 py-2 bg-sky-600 border border-transparent rounded-md text-sm font-bold text-white shadow-sm hover:bg-sky-700 flex items-center gap-1'
              >
                <Check className='w-4 h-4' /> 保存する
              </button>
            </div>
          ) : (
            <>
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  onClick={handleToggleHistory}
                  disabled={readOnly || !appointment.customerId || !clinicId}
                  className='inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:text-gray-400'
                >
                  <History className='h-4 w-4' />
                  予約履歴
                </button>
                {appointment.customerId && !readOnly ? (
                  <Link
                    href={`/patients/${appointment.customerId}`}
                    className='text-xs font-bold text-gray-600 hover:text-sky-700 hover:underline'
                  >
                    患者詳細
                  </Link>
                ) : (
                  <span className='text-xs font-bold text-gray-400'>
                    患者詳細
                  </span>
                )}
              </div>
              <div className='flex gap-2'>
                {!readOnly && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className='px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 flex items-center gap-1'
                  >
                    <Edit className='w-4 h-4' /> 編集
                  </button>
                )}
                <button
                  onClick={onClose}
                  className='px-4 py-2 bg-gray-600 border border-transparent rounded-md text-sm font-bold text-white shadow-sm hover:bg-gray-700'
                >
                  閉じる
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

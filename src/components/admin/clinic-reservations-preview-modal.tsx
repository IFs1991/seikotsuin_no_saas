'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { Scheduler } from '@/app/(app)/reservations/components/Scheduler';
import { useAppointments } from '@/app/(app)/reservations/hooks/useAppointments';
import { useReservationFormData } from '@/hooks/useReservationFormData';
import { buildTimeSlots } from '@/app/(app)/reservations/constants';
import { buildSchedulerResources } from '@/app/(app)/reservations/utils/scheduler-resources';
import { buildMenuOptions } from '@/app/(app)/reservations/utils/menu-options';
import { isCancelledOrNoShowAppointment } from '@/app/(app)/reservations/utils/view';
import type {
  Appointment,
  AppointmentUpdateResult,
} from '@/app/(app)/reservations/types';

const AppointmentDetail = dynamic(
  () =>
    import('@/app/(app)/reservations/components/AppointmentDetail').then(
      module => module.AppointmentDetail
    ),
  { ssr: false }
);

const READ_ONLY_UPDATE_RESULT: AppointmentUpdateResult = {
  ok: false,
  error: '閲覧専用です。',
};

const dayLabels = ['日', '月', '火', '水', '木', '金', '土'] as const;

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}年${m}月${d}日 (${dayLabels[date.getDay()]})`;
};

interface Props {
  clinicId: string;
  clinicName?: string;
  onClose: () => void;
}

export const ClinicReservationsPreviewModal: React.FC<Props> = ({
  clinicId,
  clinicName,
  onClose,
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const {
    menus: rawMenus,
    resources: rawResources,
    loading: masterLoading,
    error: masterError,
  } = useReservationFormData(clinicId, { includeCustomers: false });

  const {
    appointments,
    loading,
    error,
    loadAppointments,
  } = useAppointments(clinicId);

  const menus = useMemo(
    () => (rawMenus ?? []).filter(menu => menu.isActive),
    [rawMenus]
  );

  const resources = useMemo(
    () => buildSchedulerResources(rawResources),
    [rawResources]
  );

  const options = useMemo(() => buildMenuOptions(menus), [menus]);

  const timeSlots = useMemo(() => buildTimeSlots(), []);

  const visibleAppointments = useMemo(
    () =>
      appointments.filter(
        appointment => !isCancelledOrNoShowAppointment(appointment)
      ),
    [appointments]
  );

  useEffect(() => {
    if (clinicId) {
      void loadAppointments(currentDate);
    }
  }, [clinicId, currentDate, loadAppointments]);

  // Esc キーで閉じる
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // AppointmentDetail が開いているときはそちらを先に閉じる
        if (selectedAppointment) {
          setSelectedAppointment(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, selectedAppointment]);

  const handlePrevDay = useCallback(() => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  }, []);

  const handleNextDay = useCallback(() => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  }, []);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleRefresh = useCallback(() => {
    void loadAppointments(currentDate, { force: true });
  }, [currentDate, loadAppointments]);

  const handleAppointmentClick = useCallback((appointment: Appointment) => {
    setSelectedAppointment(appointment);
  }, []);

  const handleCloseAppointmentDetail = useCallback(() => {
    setSelectedAppointment(null);
  }, []);

  // readOnly 用の no-op ハンドラ
  const noopTimeSlotClick = useCallback(() => {
    /* readOnly */
  }, []);

  const noopAppointmentMove =
    useCallback(async (): Promise<AppointmentUpdateResult> => {
      return READ_ONLY_UPDATE_RESULT;
    }, []);

  const noopAppointmentUpdate =
    useCallback(async (): Promise<AppointmentUpdateResult> => {
      return READ_ONLY_UPDATE_RESULT;
    }, []);

  const isLoading = loading || masterLoading;
  const combinedError = error ?? masterError;

  return (
    <div className='fixed inset-0 z-[55] flex items-center justify-center p-4'>
      <button
        type='button'
        aria-label='プレビューを閉じる'
        className='absolute inset-0 bg-black/40 backdrop-blur-[1px]'
        onClick={onClose}
      />

      <div
        role='dialog'
        aria-modal='true'
        aria-label={`${clinicName ?? '店舗'}の予約タイムライン`}
        className='relative bg-gray-100 rounded-xl shadow-2xl w-[95vw] max-w-6xl h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200'
      >
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white'>
          <div className='flex flex-col'>
            <span className='text-xs text-gray-500'>予約タイムライン（閲覧専用）</span>
            <span className='text-lg font-bold text-gray-800'>
              {clinicName ?? '店舗'}
            </span>
          </div>
          <button
            type='button'
            onClick={onClose}
            aria-label='閉じる'
            className='p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* 軽量バー: 日付ナビ + 更新 */}
        <div className='flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 bg-white'>
          <div className='flex items-center'>
            <button
              type='button'
              onClick={handlePrevDay}
              className='bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-l text-sm font-bold transition-colors'
            >
              前日
            </button>
            <div className='bg-white border-y border-gray-300 px-4 py-1.5 text-sm font-bold min-w-[180px] text-center text-gray-800'>
              {formatDate(currentDate)}
            </div>
            <button
              type='button'
              onClick={handleToday}
              className='bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 text-sm font-bold transition-colors border-r border-gray-400'
            >
              本日
            </button>
            <button
              type='button'
              onClick={handleNextDay}
              className='bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-r text-sm font-bold transition-colors'
            >
              翌日
            </button>
          </div>

          <button
            type='button'
            onClick={handleRefresh}
            className='bg-teal-400 hover:bg-teal-500 text-white px-4 py-1.5 rounded text-sm font-bold flex items-center gap-1 shadow-sm transition-colors'
          >
            <RefreshCw className='w-4 h-4' />
            更新
          </button>
        </div>

        {/* Body */}
        <div className='relative flex-grow min-h-0 overflow-hidden'>
          {combinedError && (
            <div className='mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
              {combinedError}
            </div>
          )}
          <div className='h-full min-h-0 overflow-hidden'>
            <Scheduler
              appointments={visibleAppointments}
              resources={resources}
              timeSlots={timeSlots}
              onAppointmentClick={handleAppointmentClick}
              onTimeSlotClick={noopTimeSlotClick}
              onAppointmentMove={noopAppointmentMove}
              density='comfortable'
              readOnly
            />
          </div>

          {isLoading && (
            <div className='absolute inset-0 bg-white/60 backdrop-blur-[1px] z-40 flex items-center justify-center'>
              <div className='bg-white p-3 rounded-full shadow-lg'>
                <Loader2 className='w-7 h-7 text-sky-600 animate-spin' />
              </div>
            </div>
          )}
        </div>

        {selectedAppointment && (
          <AppointmentDetail
            clinicId={clinicId}
            appointment={selectedAppointment}
            resources={resources}
            menus={menus}
            options={options}
            onClose={handleCloseAppointmentDetail}
            onUpdate={noopAppointmentUpdate}
            readOnly
          />
        )}
      </div>
    </div>
  );
};

export default ClinicReservationsPreviewModal;

'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from './components/Header';
import { ControlBar } from './components/ControlBar';
import { Scheduler } from './components/Scheduler';
import { AppointmentList } from './components/AppointmentList';
import { DaySummary } from './components/DaySummary';
import {
  Appointment,
  AppointmentDensity,
  AppointmentUpdateResult,
  Notification,
  SchedulerResource,
  ViewMode,
} from './types';
import { buildTimeSlots } from './constants';
import { useAppointments } from './hooks/useAppointments';
import { useReservationFormData } from '@/hooks/useReservationFormData';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { Loader2 } from 'lucide-react';
import {
  canWriteReservationsForClinic,
  isCrossClinicReservationView,
} from './permissions';
import { isCancelledOrNoShowAppointment } from './utils/view';
import {
  buildAppointmentResourceIds,
  buildSchedulerResources,
} from './utils/scheduler-resources';
import { buildMenuOptions } from './utils/menu-options';

const READ_ONLY_RESERVATION_MESSAGE = '他院の予約は閲覧専用です。';

interface StaffShiftApiItem {
  staff_id: string;
  status: string;
}

interface StaffShiftApiResponse {
  success?: unknown;
  data?: {
    shifts?: StaffShiftApiItem[];
  };
}

function isStaffShiftApiResponse(
  value: unknown
): value is StaffShiftApiResponse {
  return typeof value === 'object' && value !== null;
}

const AppointmentDetail = dynamic(
  () =>
    import('./components/AppointmentDetail').then(
      module => module.AppointmentDetail
    ),
  { ssr: false }
);

const AppointmentFormModal = dynamic(
  () =>
    import('./components/AppointmentFormModal').then(
      module => module.AppointmentFormModal
    ),
  { ssr: false }
);

const UnconfirmedReservationsModal = dynamic(
  () =>
    import('./components/UnconfirmedReservationsModal').then(
      module => module.UnconfirmedReservationsModal
    ),
  { ssr: false }
);

const CancelledReservationsModal = dynamic(
  () =>
    import('./components/CancelledReservationsModal').then(
      module => module.CancelledReservationsModal
    ),
  { ssr: false }
);

const NotificationsModal = dynamic(
  () =>
    import('./components/NotificationsModal').then(
      module => module.NotificationsModal
    ),
  { ssr: false }
);

function ReservationsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading } = useUserProfileContext();
  // Task C: profile.clinicId の代わりに Context の selectedClinicId を使用
  const { selectedClinicId } = useSelectedClinic();
  const clinicId = selectedClinicId;
  const role = profile?.role ?? null;
  const profileClinicId = profile?.clinicId ?? null;
  const canWriteReservations = useMemo(
    () =>
      canWriteReservationsForClinic({
        selectedClinicId: clinicId,
        profileClinicId,
        role,
      }),
    [clinicId, profileClinicId, role]
  );
  const isCrossClinicView = useMemo(
    () =>
      isCrossClinicReservationView({
        selectedClinicId: clinicId,
        profileClinicId,
      }),
    [clinicId, profileClinicId]
  );

  const {
    menus: rawMenus,
    resources: rawResources,
    loading: masterLoading,
    error: masterError,
  } = useReservationFormData(clinicId, { includeCustomers: false });

  const menus = useMemo(
    () => (rawMenus ?? []).filter(menu => menu.isActive),
    [rawMenus]
  );

  const options = useMemo(() => buildMenuOptions(menus), [menus]);

  const [currentView, setCurrentView] = useState<ViewMode>('timeline');
  const [appointmentDensity, setAppointmentDensity] =
    useState<AppointmentDensity>('comfortable');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [shiftStaffIds, setShiftStaffIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);

  const {
    appointments,
    pendingAppointments,
    loading,
    error,
    loadAppointments,
    addAppointment,
    updateAppointment,
    moveAppointment,
    cancelAppointment,
  } = useAppointments(clinicId);

  const timeSlots = useMemo(() => buildTimeSlots(), []);
  const currentDateString = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [currentDate]);

  const { cancelledAppointments, visibleTimelineAppointments } = useMemo(() => {
    const cancelled: Appointment[] = [];
    const visible: Appointment[] = [];

    for (const appointment of appointments) {
      if (isCancelledOrNoShowAppointment(appointment)) {
        cancelled.push(appointment);
      } else {
        visible.push(appointment);
      }
    }

    return {
      cancelledAppointments: cancelled,
      visibleTimelineAppointments: visible,
    };
  }, [appointments]);

  const resources = useMemo<SchedulerResource[]>(() => {
    return buildSchedulerResources(rawResources, {
      scheduledStaffIds: shiftStaffIds,
      appointmentResourceIds: buildAppointmentResourceIds(
        visibleTimelineAppointments
      ),
    });
  }, [rawResources, shiftStaffIds, visibleTimelineAppointments]);

  const [formInitialValues, setFormInitialValues] = useState<
    | {
        resourceId?: string;
        startHour?: number;
        startMinute?: number;
        date?: string;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (
      viewParam === 'list' ||
      viewParam === 'register' ||
      viewParam === 'timeline'
    ) {
      if (viewParam === 'register') {
        if (!canWriteReservations) {
          setCurrentView('timeline');
          setShowAppointmentForm(false);
          setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
          return;
        }

        setCurrentView('timeline');
        setShowAppointmentForm(true);
        return;
      }

      setCurrentView(viewParam as ViewMode);
    }
  }, [canWriteReservations, searchParams]);

  useEffect(() => {
    if (!canWriteReservations) {
      setShowAppointmentForm(false);
      setFormInitialValues(undefined);
    }
  }, [canWriteReservations]);

  useEffect(() => {
    if (clinicId) {
      loadAppointments(currentDate);
    }
  }, [clinicId, currentDate, loadAppointments]);

  useEffect(() => {
    if (!clinicId) {
      setShiftStaffIds(new Set());
      return;
    }

    const controller = new AbortController();

    const loadShifts = async () => {
      try {
        const response = await fetch(
          `/api/staff/shifts?clinic_id=${clinicId}&start=${currentDateString}&end=${currentDateString}&status=confirmed`,
          { signal: controller.signal }
        );
        const json: unknown = await response.json();

        if (!response.ok || !isStaffShiftApiResponse(json)) {
          throw new Error('シフトデータの取得に失敗しました');
        }

        const confirmedStaffIds = new Set(
          (json.data?.shifts ?? []).map(shift => shift.staff_id)
        );
        setShiftStaffIds(confirmedStaffIds);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setShiftStaffIds(new Set());
        setUpdateError(
          error instanceof Error
            ? error.message
            : 'シフトデータの取得に失敗しました'
        );
      }
    };

    void loadShifts();

    return () => controller.abort();
  }, [clinicId, currentDateString]);

  const handleTimeSlotClick = useCallback(
    (resourceId: string, hour: number, minute: number) => {
      if (!canWriteReservations) {
        setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
        return;
      }

      setFormInitialValues({
        resourceId,
        startHour: hour,
        startMinute: minute,
        date: currentDateString,
      });
      setShowAppointmentForm(true);
    },
    [canWriteReservations, currentDateString]
  );

  const handleViewChange = useCallback(
    (view: ViewMode) => {
      if (view === 'register') {
        if (!canWriteReservations) {
          setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
          return;
        }

        setFormInitialValues(undefined);
        setShowAppointmentForm(true);
        return;
      }

      setCurrentView(view);
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', view);
      router.replace(`/reservations?${params.toString()}`);
    },
    [canWriteReservations, router, searchParams]
  );

  const handleRegistrationSuccess = useCallback(
    (newAppointment: Appointment) => {
      if (!canWriteReservations) {
        setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
        return;
      }

      addAppointment(newAppointment);
      setSelectedAppointment(newAppointment);
      setFormInitialValues(undefined);
      setShowAppointmentForm(false);
      setCurrentView('timeline');
      setUpdateError(null);

      // 画面反映は即時に行い、サーバ真値との再同期は裏で走らせる。
      void loadAppointments(currentDate, { force: true, silent: true });
    },
    [addAppointment, canWriteReservations, currentDate, loadAppointments]
  );

  const handleCloseAppointmentForm = useCallback(() => {
    setShowAppointmentForm(false);
    setFormInitialValues(undefined);
  }, []);

  const handleUpdateAppointment = useCallback(
    async (
      updatedAppointment: Appointment
    ): Promise<AppointmentUpdateResult> => {
      if (!canWriteReservations) {
        setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
        return { ok: false, error: READ_ONLY_RESERVATION_MESSAGE };
      }

      setUpdateError(null);
      const result = await updateAppointment(updatedAppointment);
      if (result.ok) {
        setSelectedAppointment(updatedAppointment);
      } else {
        setUpdateError(result.error ?? 'Failed to update reservation.');
      }
      return result;
    },
    [canWriteReservations, updateAppointment]
  );

  const handleMoveAppointment = useCallback(
    async (
      id: string,
      newResourceId: string,
      newStartHour: number,
      newStartMinute: number
    ): Promise<AppointmentUpdateResult> => {
      if (!canWriteReservations) {
        setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
        return { ok: false, error: READ_ONLY_RESERVATION_MESSAGE };
      }

      setUpdateError(null);
      const result = await moveAppointment(
        id,
        newResourceId,
        newStartHour,
        newStartMinute
      );
      if (!result.ok) {
        setUpdateError(result.error ?? 'Failed to move reservation.');
      }
      return result;
    },
    [canWriteReservations, moveAppointment]
  );

  const canCancelReservation = canWriteReservations;

  const handleCancelAppointment = useCallback(
    async (id: string): Promise<AppointmentUpdateResult> => {
      if (!canWriteReservations) {
        setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
        return { ok: false, error: READ_ONLY_RESERVATION_MESSAGE };
      }

      setUpdateError(null);
      const result = await cancelAppointment(id);
      if (!result.ok) {
        setUpdateError(result.error ?? 'Failed to cancel reservation.');
      }
      return result;
    },
    [canWriteReservations, cancelAppointment]
  );

  const handleConfirmPending = useCallback(
    async (appt: Appointment) => {
      if (!canWriteReservations) {
        setUpdateError(READ_ONLY_RESERVATION_MESSAGE);
        return { ok: false, error: READ_ONLY_RESERVATION_MESSAGE };
      }

      return handleUpdateAppointment({
        ...appt,
        status: 'confirmed',
        color: 'blue',
      });
    },
    [canWriteReservations, handleUpdateAppointment]
  );

  const notifications = useMemo<Notification[]>(() => [], []);
  const openPendingModal = useCallback(() => setShowPendingModal(true), []);
  const closePendingModal = useCallback(() => setShowPendingModal(false), []);
  const openCancelledModal = useCallback(() => setShowCancelledModal(true), []);
  const closeCancelledModal = useCallback(
    () => setShowCancelledModal(false),
    []
  );
  const handleSelectCancelledAppointment = useCallback(
    (appointment: Appointment) => {
      setSelectedAppointment(appointment);
    },
    []
  );
  const openNotificationsModal = useCallback(
    () => setShowNotificationsModal(true),
    []
  );
  const closeNotificationsModal = useCallback(
    () => setShowNotificationsModal(false),
    []
  );
  const refreshAppointments = useCallback(
    () => loadAppointments(currentDate, { force: true }),
    [currentDate, loadAppointments]
  );
  const showMoveError = useCallback((msg: string) => setUpdateError(msg), []);
  const closeAppointmentDetail = useCallback(
    () => setSelectedAppointment(null),
    []
  );

  const content = useMemo(() => {
    if (error) {
      return (
        <div className='flex justify-center items-center h-full text-red-500'>
          Error: {error}
        </div>
      );
    }

    switch (currentView) {
      case 'timeline':
        return (
          <Scheduler
            appointments={visibleTimelineAppointments}
            resources={resources}
            timeSlots={timeSlots}
            onAppointmentClick={setSelectedAppointment}
            onTimeSlotClick={handleTimeSlotClick}
            onAppointmentMove={handleMoveAppointment}
            onMoveError={showMoveError}
            density={appointmentDensity}
            readOnly={!canWriteReservations}
          />
        );
      case 'list':
        return (
          <AppointmentList
            appointments={appointments}
            resources={resources}
            onSelect={setSelectedAppointment}
          />
        );
      case 'register':
        return null;
      default:
        return null;
    }
  }, [
    appointmentDensity,
    canWriteReservations,
    currentView,
    error,
    handleMoveAppointment,
    handleTimeSlotClick,
    resources,
    showMoveError,
    timeSlots,
    visibleTimelineAppointments,
  ]);

  if (profileLoading) {
    return <div className='p-6'>Loading profile...</div>;
  }

  if (!clinicId) {
    return <div className='p-6'>Clinic is not assigned.</div>;
  }

  if (masterError) {
    return <div className='p-6 text-red-600'>{masterError}</div>;
  }

  return (
    <div className='min-h-screen bg-gray-100 flex flex-col'>
      <Header
        pendingCount={pendingAppointments.length}
        notificationCount={notifications.length}
        onOpenReservations={openPendingModal}
        onOpenNotifications={openNotificationsModal}
      />
      <div className='flex-grow flex flex-col h-[calc(100vh-64px)]'>
        <ControlBar
          currentView={currentView}
          onViewChange={handleViewChange}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onRefresh={refreshAppointments}
          density={appointmentDensity}
          onDensityChange={setAppointmentDensity}
          canCreateReservation={canWriteReservations}
        />
        <main className='flex flex-grow flex-col overflow-hidden bg-gray-100 relative'>
          <DaySummary
            appointments={appointments}
            resourceCount={resources.length}
            onOpenCancelledAppointments={openCancelledModal}
          />
          {updateError && (
            <div className='mx-4 mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
              {updateError}
            </div>
          )}
          {isCrossClinicView && (
            <div className='mx-4 mt-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700'>
              他院の予約状況を閲覧中です。新規登録・編集・キャンセルは所属院でのみ行えます。
            </div>
          )}
          <div className='min-h-0 flex-grow overflow-hidden'>{content}</div>

          {(loading || masterLoading) && (
            <div className='absolute inset-0 bg-white/60 backdrop-blur-[1px] z-50 flex items-center justify-center animate-in fade-in duration-200'>
              <div className='bg-white p-4 rounded-full shadow-lg'>
                <Loader2 className='w-8 h-8 text-sky-600 animate-spin' />
              </div>
            </div>
          )}

          {selectedAppointment && (
            <AppointmentDetail
              clinicId={clinicId}
              appointment={selectedAppointment}
              resources={resources}
              menus={menus}
              options={options}
              onClose={closeAppointmentDetail}
              onUpdate={handleUpdateAppointment}
              onCancelAppointment={
                canCancelReservation ? handleCancelAppointment : undefined
              }
              readOnly={!canWriteReservations}
            />
          )}

          {showAppointmentForm && canWriteReservations && (
            <AppointmentFormModal
              clinicId={clinicId}
              resources={resources}
              menus={menus}
              appointments={appointments}
              onSuccess={handleRegistrationSuccess}
              onClose={handleCloseAppointmentForm}
              initialData={formInitialValues}
            />
          )}

          {showPendingModal && (
            <UnconfirmedReservationsModal
              appointments={pendingAppointments}
              resources={resources}
              menus={menus}
              onClose={closePendingModal}
              onConfirm={handleConfirmPending}
              canConfirm={canWriteReservations}
            />
          )}

          {showCancelledModal && (
            <CancelledReservationsModal
              appointments={cancelledAppointments}
              resources={resources}
              menus={menus}
              onClose={closeCancelledModal}
              onSelect={handleSelectCancelledAppointment}
            />
          )}

          {showNotificationsModal && (
            <NotificationsModal
              notifications={notifications}
              onClose={closeNotificationsModal}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gray-100 flex items-center justify-center'>
          <Loader2 className='w-8 h-8 text-sky-600 animate-spin' />
        </div>
      }
    >
      <ReservationsPageContent />
    </Suspense>
  );
}

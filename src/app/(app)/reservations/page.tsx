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
import { isAreaManagerRole } from '@/lib/constants/roles';
import { isCancelledOrNoShowAppointment } from './utils/view';
import {
  buildAppointmentResourceIds,
  buildSchedulerResources,
} from './utils/scheduler-resources';
import { buildMenuOptions } from './utils/menu-options';

const CROSS_CLINIC_READ_ONLY_RESERVATION_MESSAGE = '他院の予約は閲覧専用です。';
const MANAGER_READ_ONLY_RESERVATION_MESSAGE =
  'マネージャーは予約タイムラインの閲覧のみ可能です。';

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
  const {
    selectedClinicId,
    clinics: accessibleClinics,
    clinicsLoading,
    clinicsError,
  } = useSelectedClinic();
  const clinicId = selectedClinicId;
  const role = profile?.role ?? null;
  const isManager = isAreaManagerRole(role);
  const profileClinicId = profile?.clinicId ?? null;
  const readOnlyReservationMessage = isManager
    ? MANAGER_READ_ONLY_RESERVATION_MESSAGE
    : CROSS_CLINIC_READ_ONLY_RESERVATION_MESSAGE;
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
  const effectiveCurrentView: ViewMode = isManager ? 'timeline' : currentView;
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

    if (isManager) {
      setCurrentView('timeline');
      setShowAppointmentForm(false);
      setFormInitialValues(undefined);

      if (viewParam === 'register' || viewParam === 'list') {
        const params = new URLSearchParams(searchParams.toString());
        params.set('view', 'timeline');
        router.replace(`/reservations?${params.toString()}`);
      }
      return;
    }

    if (
      viewParam === 'list' ||
      viewParam === 'register' ||
      viewParam === 'timeline'
    ) {
      if (viewParam === 'register') {
        if (!canWriteReservations) {
          setCurrentView('timeline');
          setShowAppointmentForm(false);
          setUpdateError(readOnlyReservationMessage);
          return;
        }

        setCurrentView('timeline');
        setShowAppointmentForm(true);
        return;
      }

      setCurrentView(viewParam as ViewMode);
    }
  }, [
    canWriteReservations,
    isManager,
    readOnlyReservationMessage,
    router,
    searchParams,
  ]);

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
        setUpdateError(readOnlyReservationMessage);
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
    [canWriteReservations, currentDateString, readOnlyReservationMessage]
  );

  const handleViewChange = useCallback(
    (view: ViewMode) => {
      if (isManager) {
        setCurrentView('timeline');
        if (view !== 'timeline') {
          setUpdateError(readOnlyReservationMessage);
          router.replace('/reservations?view=timeline');
        }
        return;
      }

      if (view === 'register') {
        if (!canWriteReservations) {
          setUpdateError(readOnlyReservationMessage);
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
    [
      canWriteReservations,
      isManager,
      readOnlyReservationMessage,
      router,
      searchParams,
    ]
  );

  const handleRegistrationSuccess = useCallback(
    (newAppointment: Appointment) => {
      if (!canWriteReservations) {
        setUpdateError(readOnlyReservationMessage);
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
    [
      addAppointment,
      canWriteReservations,
      currentDate,
      loadAppointments,
      readOnlyReservationMessage,
    ]
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
        setUpdateError(readOnlyReservationMessage);
        return { ok: false, error: readOnlyReservationMessage };
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
    [canWriteReservations, readOnlyReservationMessage, updateAppointment]
  );

  const handleMoveAppointment = useCallback(
    async (
      id: string,
      newResourceId: string,
      newStartHour: number,
      newStartMinute: number
    ): Promise<AppointmentUpdateResult> => {
      if (!canWriteReservations) {
        setUpdateError(readOnlyReservationMessage);
        return { ok: false, error: readOnlyReservationMessage };
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
    [canWriteReservations, moveAppointment, readOnlyReservationMessage]
  );

  const canCancelReservation = canWriteReservations;

  const handleCancelAppointment = useCallback(
    async (id: string): Promise<AppointmentUpdateResult> => {
      if (!canWriteReservations) {
        setUpdateError(readOnlyReservationMessage);
        return { ok: false, error: readOnlyReservationMessage };
      }

      setUpdateError(null);
      const result = await cancelAppointment(id);
      if (!result.ok) {
        setUpdateError(result.error ?? 'Failed to cancel reservation.');
      }
      return result;
    },
    [canWriteReservations, cancelAppointment, readOnlyReservationMessage]
  );

  const handleConfirmPending = useCallback(
    async (appt: Appointment) => {
      if (!canWriteReservations) {
        setUpdateError(readOnlyReservationMessage);
        return { ok: false, error: readOnlyReservationMessage };
      }

      return handleUpdateAppointment({
        ...appt,
        status: 'confirmed',
        color: 'blue',
      });
    },
    [canWriteReservations, handleUpdateAppointment, readOnlyReservationMessage]
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

    switch (effectiveCurrentView) {
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
    effectiveCurrentView,
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
    if (isManager) {
      if (clinicsLoading) {
        return <div className='p-6'>担当院を読み込んでいます...</div>;
      }

      if (clinicsError) {
        return <div className='p-6 text-red-600'>{clinicsError}</div>;
      }

      if (accessibleClinics.length > 0) {
        return (
          <div className='p-6'>
            <p className='font-bold text-gray-800'>
              担当院を選択してください。
            </p>
            <p className='mt-2 text-sm text-gray-600'>
              画面上部の店舗選択から予約タイムラインを表示する担当院を選んでください。
            </p>
          </div>
        );
      }

      return (
        <div className='p-6'>
          <p className='font-bold text-gray-800'>
            担当院がまだ設定されていません。
          </p>
          <p className='mt-2 text-sm text-gray-600'>
            管理者に担当店舗の設定を依頼してください。
          </p>
        </div>
      );
    }

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
          currentView={effectiveCurrentView}
          onViewChange={handleViewChange}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onRefresh={refreshAppointments}
          density={appointmentDensity}
          onDensityChange={setAppointmentDensity}
          canCreateReservation={canWriteReservations}
          timelineOnly={isManager}
          readOnlyMessage={readOnlyReservationMessage}
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
          {isCrossClinicView && !isManager && (
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
              readOnlyMessage={readOnlyReservationMessage}
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
              readOnlyMessage={readOnlyReservationMessage}
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

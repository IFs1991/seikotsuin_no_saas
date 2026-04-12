'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from './components/Header';
import { ControlBar } from './components/ControlBar';
import { Scheduler } from './components/Scheduler';
import { AppointmentList } from './components/AppointmentList';
import { AppointmentDetail } from './components/AppointmentDetail';
import { AppointmentForm } from './components/AppointmentForm';
import { UnconfirmedReservationsModal } from './components/UnconfirmedReservationsModal';
import { NotificationsModal } from './components/NotificationsModal';
import {
  Appointment,
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

function ReservationsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading } = useUserProfileContext();
  // Task C: profile.clinicId の代わりに Context の selectedClinicId を使用
  const { selectedClinicId } = useSelectedClinic();
  const clinicId = selectedClinicId;
  const role = profile?.role ?? null;

  const {
    menus: rawMenus,
    resources: rawResources,
    loading: masterLoading,
    error: masterError,
  } = useReservationFormData(clinicId);

  const menus = useMemo(
    () => (rawMenus ?? []).filter(menu => menu.isActive),
    [rawMenus]
  );

  const resources = useMemo<SchedulerResource[]>(
    () =>
      (rawResources ?? [])
        .filter(resource => resource.isActive)
        .map(resource => ({
          id: resource.id,
          name: resource.name,
          capacity: resource.maxConcurrent,
          subLabel: resource.type !== 'staff' ? resource.type : undefined,
          type: resource.type === 'staff' ? 'staff' : 'facility',
        })),
    [rawResources]
  );

  const options = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        priceDelta: number;
        durationDeltaMinutes: number;
      }
    >();
    for (const menu of menus) {
      for (const option of (menu.options ?? []).filter(item => item.isActive)) {
        if (!map.has(option.id)) {
          map.set(option.id, {
            id: option.id,
            name: option.name,
            priceDelta: option.priceDelta,
            durationDeltaMinutes: option.durationDeltaMinutes,
          });
        }
      }
    }
    return [
      {
        id: 'none',
        name: '\u306a\u3057',
        priceDelta: 0,
        durationDeltaMinutes: 0,
      },
      ...Array.from(map.values()),
    ];
  }, [menus]);

  const [currentView, setCurrentView] = useState<ViewMode>('timeline');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

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
      setCurrentView(viewParam as ViewMode);
    }
  }, [searchParams]);

  useEffect(() => {
    if (clinicId) {
      loadAppointments(currentDate);
    }
  }, [clinicId, currentDate, loadAppointments]);

  const handleTimeSlotClick = (
    resourceId: string,
    hour: number,
    minute: number
  ) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setFormInitialValues({
      resourceId,
      startHour: hour,
      startMinute: minute,
      date: dateStr,
    });
    setCurrentView('register');
  };

  const handleViewChange = (view: ViewMode) => {
    setCurrentView(view);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', view);
    router.replace(`/reservations?${params.toString()}`);
  };

  const handleRegistrationSuccess = (newAppointment: Appointment) => {
    addAppointment(newAppointment);
    setSelectedAppointment(newAppointment);
    setFormInitialValues(undefined);
    setCurrentView('timeline');
    setUpdateError(null);
  };

  const handleUpdateAppointment = async (
    updatedAppointment: Appointment
  ): Promise<AppointmentUpdateResult> => {
    setUpdateError(null);
    const result = await updateAppointment(updatedAppointment);
    if (result.ok) {
      setSelectedAppointment(updatedAppointment);
    } else {
      setUpdateError(result.error ?? 'Failed to update reservation.');
    }
    return result;
  };

  const handleMoveAppointment = async (
    id: string,
    newResourceId: string,
    newStartHour: number,
    newStartMinute: number
  ): Promise<AppointmentUpdateResult> => {
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
  };

  const canCancelReservation =
    role !== null &&
    ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'].includes(role);

  const handleCancelAppointment = async (
    id: string
  ): Promise<AppointmentUpdateResult> => {
    setUpdateError(null);
    const result = await cancelAppointment(id);
    if (!result.ok) {
      setUpdateError(result.error ?? 'Failed to cancel reservation.');
    }
    return result;
  };

  const handleConfirmPending = async (appt: Appointment) => {
    return handleUpdateAppointment({
      ...appt,
      status: 'confirmed',
      color: 'blue',
    });
  };

  const notifications = [] as Notification[];

  const renderContent = () => {
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
            appointments={appointments}
            resources={resources}
            timeSlots={timeSlots}
            onAppointmentClick={setSelectedAppointment}
            onTimeSlotClick={handleTimeSlotClick}
            onAppointmentMove={handleMoveAppointment}
            onMoveError={msg => setUpdateError(msg)}
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
        return (
          <AppointmentForm
            clinicId={clinicId ?? ''}
            resources={resources}
            menus={menus}
            onSuccess={handleRegistrationSuccess}
            onCancel={() => {
              setCurrentView('timeline');
              setFormInitialValues(undefined);
            }}
            initialData={formInitialValues}
            appointments={appointments}
          />
        );
      default:
        return null;
    }
  };

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
        onOpenReservations={() => setShowPendingModal(true)}
        onOpenNotifications={() => setShowNotificationsModal(true)}
      />
      <div className='flex-grow flex flex-col h-[calc(100vh-64px)]'>
        <ControlBar
          currentView={currentView}
          onViewChange={handleViewChange}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onRefresh={() => loadAppointments(currentDate)}
        />
        <main className='flex-grow overflow-hidden bg-gray-100 relative'>
          {updateError && (
            <div className='mx-4 mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
              {updateError}
            </div>
          )}
          {renderContent()}

          {(loading || masterLoading) && (
            <div className='absolute inset-0 bg-white/60 backdrop-blur-[1px] z-50 flex items-center justify-center animate-in fade-in duration-200'>
              <div className='bg-white p-4 rounded-full shadow-lg'>
                <Loader2 className='w-8 h-8 text-sky-600 animate-spin' />
              </div>
            </div>
          )}

          {selectedAppointment && (
            <AppointmentDetail
              appointment={selectedAppointment}
              resources={resources}
              menus={menus}
              options={options}
              onClose={() => setSelectedAppointment(null)}
              onUpdate={handleUpdateAppointment}
              onCancelAppointment={
                canCancelReservation ? handleCancelAppointment : undefined
              }
            />
          )}

          {showPendingModal && (
            <UnconfirmedReservationsModal
              appointments={pendingAppointments}
              resources={resources}
              menus={menus}
              onClose={() => setShowPendingModal(false)}
              onConfirm={handleConfirmPending}
            />
          )}

          {showNotificationsModal && (
            <NotificationsModal
              notifications={notifications}
              onClose={() => setShowNotificationsModal(false)}
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

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ControlBar } from './components/ControlBar';
import { Scheduler } from './components/Scheduler';
import { AppointmentList } from './components/AppointmentList';
import { AppointmentDetail } from './components/AppointmentDetail';
import { AppointmentForm } from './components/AppointmentForm';
import { UnconfirmedReservationsModal } from './components/UnconfirmedReservationsModal';
import { NotificationsModal } from './components/NotificationsModal';
import { ViewMode, Appointment } from './types';
import { APPOINTMENTS as MOCK_APPOINTMENTS, PENDING_APPOINTMENTS, NOTIFICATIONS } from './constants';
import { useAppointments } from './hooks/useAppointments';
import { Loader2 } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('timeline');
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2020, 3, 20)); // April 20, 2020
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  
  // Modal States
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  
  // Custom hook to manage appointment data and operations
  const { 
    appointments, 
    loading, 
    error, 
    loadAppointments, 
    addAppointment, 
    updateAppointment, 
    moveAppointment 
  } = useAppointments(MOCK_APPOINTMENTS);

  const [formInitialValues, setFormInitialValues] = useState<{
    resourceId?: string;
    startHour?: number;
    startMinute?: number;
    date?: string;
  } | undefined>(undefined);

  // Load data when date changes
  useEffect(() => {
    loadAppointments(currentDate);
  }, [currentDate, loadAppointments]);

  const handleTimeSlotClick = (resourceId: string, hour: number, minute: number) => {
     const year = currentDate.getFullYear();
     const month = String(currentDate.getMonth() + 1).padStart(2, '0');
     const day = String(currentDate.getDate()).padStart(2, '0');
     const dateStr = `${year}-${month}-${day}`;

     setFormInitialValues({
       resourceId,
       startHour: hour,
       startMinute: minute,
       date: dateStr
     });
     setCurrentView('register');
  };

  const handleRegistrationSuccess = (newAppointment: Appointment) => {
    addAppointment(newAppointment);
    setSelectedAppointment(newAppointment);
    setFormInitialValues(undefined);
    setCurrentView('timeline');
  };

  const handleUpdateAppointment = (updatedAppointment: Appointment) => {
    updateAppointment(updatedAppointment);
    setSelectedAppointment(updatedAppointment);
  };
  
  const handleConfirmPending = (appt: Appointment) => {
      // Add the pending appointment to the main list
      addAppointment({
          ...appt,
          // You might want to override color or type here to indicate it's now confirmed
          color: 'red' // Example: Default to red upon confirmation
      });
  };

  const renderContent = () => {
    if (error) {
      return <div className="flex justify-center items-center h-full text-red-500">エラー: {error}</div>;
    }

    switch (currentView) {
      case 'timeline':
        return (
          <Scheduler 
            appointments={appointments} 
            onAppointmentClick={setSelectedAppointment} 
            onTimeSlotClick={handleTimeSlotClick}
            onAppointmentMove={moveAppointment}
          />
        );
      case 'list':
        return (
          <AppointmentList 
            appointments={appointments} 
            onSelect={setSelectedAppointment} 
          />
        );
      case 'register':
        return (
          <AppointmentForm 
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header 
        onOpenReservations={() => setShowPendingModal(true)}
        onOpenNotifications={() => setShowNotificationsModal(true)}
      />
      <div className="flex-grow flex flex-col h-[calc(100vh-64px)]">
        <ControlBar 
          currentView={currentView} 
          onViewChange={setCurrentView}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onRefresh={() => loadAppointments(currentDate)}
        />
        <main className="flex-grow overflow-hidden bg-gray-100 relative">
          
          {/* Main Content */}
          {renderContent()}

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-50 flex items-center justify-center animate-in fade-in duration-200">
              <div className="bg-white p-4 rounded-full shadow-lg">
                <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
              </div>
            </div>
          )}
          
          {/* Appointment Detail Modal */}
          {selectedAppointment && (
            <AppointmentDetail 
              appointment={selectedAppointment} 
              onClose={() => setSelectedAppointment(null)}
              onUpdate={handleUpdateAppointment}
            />
          )}

          {/* Pending Reservations Modal */}
          {showPendingModal && (
              <UnconfirmedReservationsModal 
                appointments={PENDING_APPOINTMENTS}
                onClose={() => setShowPendingModal(false)}
                onConfirm={handleConfirmPending}
              />
          )}

          {/* Notifications Modal */}
          {showNotificationsModal && (
              <NotificationsModal 
                notifications={NOTIFICATIONS}
                onClose={() => setShowNotificationsModal(false)}
              />
          )}

        </main>
      </div>
    </div>
  );
}

export default App;
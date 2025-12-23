import { useState, useCallback } from 'react';
import { Appointment } from '../types';
import { fetchReservations } from '../api';
import { calculateEndTime, calculateDuration } from '../utils/time';

export const useAppointments = (initialAppointments: Appointment[]) => {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAppointments = useCallback(async (currentDate: Date) => {
    setLoading(true);
    setError(null);
    try {
      const startDate = new Date(currentDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(currentDate);
      endDate.setHours(23, 59, 59, 999);

      // In a real app, we would use the result of fetchReservations
      // For this mock, we just simulate the API call delay
      await fetchReservations(startDate, endDate);
      
      // Note: We're not replacing 'appointments' with the fetch result here 
      // because our mock API returns static data, but our local state might have 
      // added/moved items. In a real app, this would merge or replace state.
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const addAppointment = useCallback((newAppointment: Appointment) => {
    setAppointments(prev => [...prev, newAppointment]);
  }, []);

  const updateAppointment = useCallback((updatedAppointment: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === updatedAppointment.id ? updatedAppointment : a));
  }, []);

  const moveAppointment = useCallback((id: string, newResourceId: string, newStartHour: number, newStartMinute: number) => {
    setAppointments(prev => prev.map(appt => {
        if (appt.id !== id) return appt;

        const duration = calculateDuration(appt.startHour, appt.startMinute, appt.endHour, appt.endMinute);
        const { endHour, endMinute } = calculateEndTime(newStartHour, newStartMinute, duration);

        // Simple midnight check/clamp
        if (endHour >= 24) {
            // Logic to handle next day wrap-around could go here
        }

        return {
            ...appt,
            resourceId: newResourceId,
            startHour: newStartHour,
            startMinute: newStartMinute,
            endHour,
            endMinute
        };
    }));
  }, []);

  return {
    appointments,
    loading,
    error,
    loadAppointments,
    addAppointment,
    updateAppointment,
    moveAppointment
  };
};
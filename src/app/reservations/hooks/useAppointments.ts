import { useCallback, useMemo, useState } from 'react';
import { Appointment, AppointmentUpdateResult } from '../types';
import { fetchReservations, updateReservation, cancelReservation } from '../api';
import { calculateDuration, calculateEndTime } from '../utils/time';
import { statusToColor } from './statusToColor';

const pad = (value: number) => String(value).padStart(2, '0');

const toDateString = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
};

const splitName = (name?: string) => {
  if (!name) return { lastName: undefined, firstName: undefined };
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
  }
  return { lastName: name, firstName: undefined };
};

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export const useAppointments = (clinicId: string | null) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAppointments = useCallback(
    async (currentDate: Date) => {
      if (!clinicId) return;
      setLoading(true);
      setError(null);
      try {
        const startDate = new Date(currentDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(currentDate);
        endDate.setHours(23, 59, 59, 999);

        const rows = await fetchReservations(clinicId, startDate, endDate);
        const mapped = rows.map(row => {
          const start = new Date(row.startTime);
          const end = new Date(row.endTime);
          const date = toDateString(start);
          const { lastName, firstName } = splitName(row.customerName);

          return {
            id: row.id,
            resourceId: row.staffId,
            date,
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            endHour: end.getHours(),
            endMinute: end.getMinutes(),
            title: row.customerName ?? row.customerId,
            lastName,
            firstName,
            menuId: row.menuId,
            optionId: row.selectedOptions?.[0]?.optionId,
            subTitle: row.menuName,
            type: 'normal',
            color: statusToColor(row.status),
            memo: row.notes,
            status: row.status,
            customerId: row.customerId,
            staffId: row.staffId,
            menuName: row.menuName,
            staffName: row.staffName,
            selectedOptions: row.selectedOptions ?? [],
          } as Appointment;
        });

        setAppointments(mapped);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load appointments'
        );
      } finally {
        setLoading(false);
      }
    },
    [clinicId]
  );

  const addAppointment = useCallback((newAppointment: Appointment) => {
    setAppointments(prev => [...prev, newAppointment]);
  }, []);

  const updateAppointment = useCallback(
    async (
      updatedAppointment: Appointment,
      clinicIdOverride?: string
    ): Promise<AppointmentUpdateResult> => {
      const clinic = clinicIdOverride ?? clinicId;
      if (!clinic) {
        return { ok: false, error: 'Clinic is not assigned.' };
      }

      setLoading(true);
      try {
        const start = new Date(updatedAppointment.date);
        start.setHours(
          updatedAppointment.startHour,
          updatedAppointment.startMinute,
          0,
          0
        );
        const end = new Date(updatedAppointment.date);
        end.setHours(
          updatedAppointment.endHour,
          updatedAppointment.endMinute,
          0,
          0
        );

        await updateReservation({
          clinicId: clinic,
          id: updatedAppointment.id,
          staffId: updatedAppointment.resourceId,
          startTime: start,
          endTime: end,
          notes: updatedAppointment.memo,
          selectedOptions: updatedAppointment.selectedOptions,
          status: updatedAppointment.status,
        });

        setAppointments(prev =>
          prev.map(appt =>
            appt.id === updatedAppointment.id ? updatedAppointment : appt
          )
        );
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: getErrorMessage(err, 'Failed to update appointment'),
        };
      } finally {
        setLoading(false);
      }
    },
    [clinicId]
  );

  const moveAppointment = useCallback(
    async (
      id: string,
      newResourceId: string,
      newStartHour: number,
      newStartMinute: number
    ): Promise<AppointmentUpdateResult> => {
      if (!clinicId) {
        return { ok: false, error: 'Clinic is not assigned.' };
      }
      const current = appointments.find(appt => appt.id === id);
      if (!current) {
        return { ok: false, error: 'Appointment not found.' };
      }

      const duration = calculateDuration(
        current.startHour,
        current.startMinute,
        current.endHour,
        current.endMinute
      );
      const { endHour, endMinute } = calculateEndTime(
        newStartHour,
        newStartMinute,
        duration
      );

      const start = new Date(current.date);
      start.setHours(newStartHour, newStartMinute, 0, 0);
      const end = new Date(current.date);
      end.setHours(endHour, endMinute, 0, 0);

      const nextAppointment: Appointment = {
        ...current,
        resourceId: newResourceId,
        startHour: newStartHour,
        startMinute: newStartMinute,
        endHour,
        endMinute,
      };

      setLoading(true);
      try {
        await updateReservation({
          clinicId,
          id,
          staffId: newResourceId,
          startTime: start,
          endTime: end,
        });
        setAppointments(prev =>
          prev.map(appt => (appt.id === id ? nextAppointment : appt))
        );
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: getErrorMessage(err, 'Failed to move appointment'),
        };
      } finally {
        setLoading(false);
      }
    },
    [appointments, clinicId]
  );

  const cancelAppointment = useCallback(
    async (id: string): Promise<AppointmentUpdateResult> => {
      if (!clinicId) {
        return { ok: false, error: 'Clinic is not assigned.' };
      }

      const target = appointments.find(appt => appt.id === id);
      if (!target) {
        return { ok: false, error: 'Appointment not found.' };
      }

      if (target.status === 'cancelled') {
        return { ok: true };
      }

      setLoading(true);
      try {
        await updateReservation({
          clinicId,
          id,
          status: 'cancelled',
        });

        setAppointments(prev =>
          prev.map(appt =>
            appt.id === id
              ? { ...appt, status: 'cancelled', color: 'grey' }
              : appt
          )
        );
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: getErrorMessage(err, 'Failed to cancel appointment'),
        };
      } finally {
        setLoading(false);
      }
    },
    [appointments, clinicId]
  );

  const pendingAppointments = useMemo(
    () => appointments.filter(appt => appt.status === 'unconfirmed'),
    [appointments]
  );

  return {
    appointments,
    pendingAppointments,
    loading,
    error,
    loadAppointments,
    addAppointment,
    updateAppointment,
    moveAppointment,
    cancelAppointment,
  };
};

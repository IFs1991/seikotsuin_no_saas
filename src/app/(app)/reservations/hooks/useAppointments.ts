import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Appointment, AppointmentUpdateResult } from '../types';
import {
  fetchReservations,
  updateReservation,
  cancelReservation,
  type ReservationApiItem,
} from '../api';
import { calculateDuration, calculateEndTime } from '../utils/time';
import { statusToColor } from './statusToColor';
import {
  toJSTDateString,
  parseJSTDateStart,
  addJSTCalendarDays,
  getJSTMinutesOfDay,
  jstDateTimeToDate,
  differenceInJSTCalendarDays,
} from '@/lib/jst';

const toDateString = toJSTDateString;

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

const APPOINTMENTS_CACHE_TTL_MS = 30_000;

interface AppointmentsCacheEntry {
  appointments: Appointment[];
  fetchedAt: number;
}

interface LoadAppointmentsOptions {
  silent?: boolean;
  force?: boolean;
}

const appointmentsCache = new Map<string, AppointmentsCacheEntry>();

const isAppointmentsCacheEnabled = () => process.env.NODE_ENV !== 'test';

const getAppointmentsCacheKey = (clinicId: string, date: string) =>
  `${clinicId}:${date}`;

const isAbortError = (err: unknown) =>
  err instanceof Error && err.name === 'AbortError';

const mapReservationRowsToAppointments = (
  rows: ReservationApiItem[]
): Appointment[] =>
  rows.map(row => {
    const start = new Date(row.startTime);
    const end = new Date(row.endTime);
    const date = toDateString(start);
    const { lastName, firstName } = splitName(row.customerName);

    return {
      id: row.id,
      resourceId: row.staffId,
      date,
      startHour: Math.floor(getJSTMinutesOfDay(start) / 60),
      startMinute: getJSTMinutesOfDay(start) % 60,
      endHour:
        differenceInJSTCalendarDays(date, toDateString(end)) * 24 +
        Math.floor(getJSTMinutesOfDay(end) / 60),
      endMinute: getJSTMinutesOfDay(end) % 60,
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
      intakeResponses: row.intakeResponses ?? [],
      isStaffRequested: row.isStaffRequested ?? false,
      staffNominationFee: row.staffNominationFee ?? 0,
    };
  });

const cacheAppointments = (
  clinicId: string,
  date: string,
  appointments: Appointment[]
) => {
  if (!isAppointmentsCacheEnabled()) {
    return;
  }

  appointmentsCache.set(getAppointmentsCacheKey(clinicId, date), {
    appointments,
    fetchedAt: Date.now(),
  });
};

const upsertCachedAppointment = (
  clinicId: string,
  appointment: Appointment
) => {
  if (!isAppointmentsCacheEnabled()) {
    return;
  }

  const key = getAppointmentsCacheKey(clinicId, appointment.date);
  const cached = appointmentsCache.get(key);
  if (!cached) {
    return;
  }

  const exists = cached.appointments.some(appt => appt.id === appointment.id);
  const appointments = exists
    ? cached.appointments.map(appt =>
        appt.id === appointment.id ? appointment : appt
      )
    : [...cached.appointments, appointment];

  cacheAppointments(clinicId, appointment.date, appointments);
};

const replaceCachedAppointment = (
  clinicId: string,
  appointment: Appointment
) => {
  if (!isAppointmentsCacheEnabled()) {
    return;
  }

  const targetKey = getAppointmentsCacheKey(clinicId, appointment.date);

  for (const [key, cached] of appointmentsCache.entries()) {
    if (!key.startsWith(`${clinicId}:`)) {
      continue;
    }

    const withoutAppointment = cached.appointments.filter(
      appt => appt.id !== appointment.id
    );
    const appointments =
      key === targetKey
        ? [...withoutAppointment, appointment]
        : withoutAppointment;
    appointmentsCache.set(key, {
      appointments,
      fetchedAt: Date.now(),
    });
  }
};

export const useAppointments = (clinicId: string | null) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSeqRef.current += 1;
    loadAbortControllerRef.current?.abort();
    setAppointments([]);
    setError(null);
    setLoading(false);
    return () => {
      loadSeqRef.current += 1;
      loadAbortControllerRef.current?.abort();
    };
  }, [clinicId]);

  const loadAppointments = useCallback(
    async (
      currentDate: Date,
      options: LoadAppointmentsOptions = {}
    ): Promise<void> => {
      if (!clinicId) return;
      const seq = ++loadSeqRef.current;
      const dateString = toDateString(currentDate);
      const cacheKey = getAppointmentsCacheKey(clinicId, dateString);
      const cached = isAppointmentsCacheEnabled()
        ? appointmentsCache.get(cacheKey)
        : undefined;
      const cacheIsFresh =
        cached !== undefined &&
        Date.now() - cached.fetchedAt < APPOINTMENTS_CACHE_TTL_MS;

      if (cached && !options.force) {
        setAppointments(cached.appointments);
        setError(null);

        if (cacheIsFresh) {
          setLoading(false);
          return;
        }
      }

      const shouldShowLoading = !options.silent && !cached;
      if (shouldShowLoading) {
        setLoading(true);
      }
      setError(null);
      loadAbortControllerRef.current?.abort();
      const controller = new AbortController();
      loadAbortControllerRef.current = controller;
      try {
        const startDate = parseJSTDateStart(dateString);
        const endDate = new Date(
          parseJSTDateStart(addJSTCalendarDays(dateString, 1)).getTime() - 1
        );

        const rows = await fetchReservations(
          clinicId,
          startDate,
          endDate,
          undefined,
          { signal: controller.signal }
        );
        if (seq !== loadSeqRef.current) {
          return;
        }
        const mapped = mapReservationRowsToAppointments(rows);

        setAppointments(mapped);
        cacheAppointments(clinicId, dateString, mapped);
      } catch (err) {
        if (seq !== loadSeqRef.current) {
          return;
        }
        if (isAbortError(err)) {
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : '予約一覧の取得が完了しませんでした。再試行してください'
        );
      } finally {
        if (loadAbortControllerRef.current === controller) {
          loadAbortControllerRef.current = null;
        }
        if (seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [clinicId]
  );

  const addAppointment = useCallback(
    (newAppointment: Appointment) => {
      setAppointments(prev => {
        const exists = prev.some(appt => appt.id === newAppointment.id);
        return exists
          ? prev.map(appt =>
              appt.id === newAppointment.id ? newAppointment : appt
            )
          : [...prev, newAppointment];
      });

      if (clinicId) {
        upsertCachedAppointment(clinicId, newAppointment);
      }
    },
    [clinicId]
  );

  const updateAppointment = useCallback(
    async (
      updatedAppointment: Appointment,
      clinicIdOverride?: string
    ): Promise<AppointmentUpdateResult> => {
      const clinic = clinicIdOverride ?? clinicId;
      if (!clinic) {
        return { ok: false, error: 'Clinic is not assigned.' };
      }

      const previousAppointment = appointments.find(
        appt => appt.id === updatedAppointment.id
      );
      setAppointments(prev =>
        prev.map(appt =>
          appt.id === updatedAppointment.id ? updatedAppointment : appt
        )
      );
      replaceCachedAppointment(clinic, updatedAppointment);

      try {
        const start = jstDateTimeToDate(
          updatedAppointment.date,
          updatedAppointment.startHour + ':' + updatedAppointment.startMinute
        );
        const end = jstDateTimeToDate(
          updatedAppointment.date,
          updatedAppointment.endHour + ':' + updatedAppointment.endMinute
        );

        await updateReservation({
          clinicId: clinic,
          id: updatedAppointment.id,
          staffId: updatedAppointment.resourceId,
          startTime: start,
          endTime: end,
          notes: updatedAppointment.memo,
          selectedOptions: updatedAppointment.selectedOptions,
          isStaffRequested: updatedAppointment.isStaffRequested ?? false,
          status: updatedAppointment.status,
        });
        return { ok: true };
      } catch (err) {
        if (previousAppointment) {
          setAppointments(prev =>
            prev.map(appt =>
              appt.id === previousAppointment.id ? previousAppointment : appt
            )
          );
          replaceCachedAppointment(clinic, previousAppointment);
        }

        return {
          ok: false,
          error: getErrorMessage(err, 'Failed to update appointment'),
        };
      }
    },
    [appointments, clinicId]
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

      const start = jstDateTimeToDate(
        current.date,
        newStartHour + ':' + newStartMinute
      );
      const end = jstDateTimeToDate(current.date, endHour + ':' + endMinute);

      const nextAppointment: Appointment = {
        ...current,
        resourceId: newResourceId,
        startHour: newStartHour,
        startMinute: newStartMinute,
        endHour,
        endMinute,
      };

      setAppointments(prev =>
        prev.map(appt => (appt.id === id ? nextAppointment : appt))
      );
      replaceCachedAppointment(clinicId, nextAppointment);

      try {
        await updateReservation({
          clinicId,
          id,
          staffId: newResourceId,
          startTime: start,
          endTime: end,
          notes: current.memo,
          selectedOptions: current.selectedOptions,
          isStaffRequested: current.isStaffRequested ?? false,
        });
        return { ok: true };
      } catch (err) {
        setAppointments(prev =>
          prev.map(appt => (appt.id === id ? current : appt))
        );
        replaceCachedAppointment(clinicId, current);

        return {
          ok: false,
          error: getErrorMessage(err, 'Failed to move appointment'),
        };
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

      if (target.status === 'cancelled' || target.status === 'no_show') {
        return { ok: true };
      }

      const cancelledAppointment: Appointment = {
        ...target,
        status: 'cancelled',
        color: 'grey',
      };
      setAppointments(prev =>
        prev.map(appt => (appt.id === id ? cancelledAppointment : appt))
      );
      replaceCachedAppointment(clinicId, cancelledAppointment);

      try {
        await cancelReservation({ clinicId, id });
        return { ok: true };
      } catch (err) {
        setAppointments(prev =>
          prev.map(appt => (appt.id === id ? target : appt))
        );
        replaceCachedAppointment(clinicId, target);

        return {
          ok: false,
          error: getErrorMessage(err, 'Failed to cancel appointment'),
        };
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

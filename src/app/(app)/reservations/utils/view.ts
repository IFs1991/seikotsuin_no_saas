import type { Appointment } from '../types';
import { hasTimeConflict, timeToMinutes } from './time';

export const APPOINTMENT_STATUS_LABELS: Record<
  NonNullable<Appointment['status']>,
  string
> = {
  tentative: '仮予約',
  confirmed: '確定',
  arrived: '来院済み',
  completed: '完了',
  cancelled: 'キャンセル',
  no_show: '来院なし',
  unconfirmed: '未確定',
  trial: '体験',
};

export const APPOINTMENT_STATUS_TONE: Record<
  NonNullable<Appointment['status']>,
  string
> = {
  tentative: 'bg-pink-50 text-pink-700 border-pink-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  arrived: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  no_show: 'bg-gray-100 text-gray-600 border-gray-200',
  unconfirmed: 'bg-orange-50 text-orange-700 border-orange-200',
  trial: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const getAppointmentStatusLabel = (
  appointment: Pick<Appointment, 'status' | 'type'>
) => {
  if (appointment.status) {
    return APPOINTMENT_STATUS_LABELS[appointment.status];
  }

  switch (appointment.type) {
    case 'holiday':
      return '休み';
    case 'blocked':
      return 'ブロック';
    default:
      return '予約';
  }
};

export const getAppointmentStatusTone = (
  appointment: Pick<Appointment, 'status'>
) => {
  if (!appointment.status) {
    return 'bg-gray-50 text-gray-700 border-gray-200';
  }

  return APPOINTMENT_STATUS_TONE[appointment.status];
};

export const formatAppointmentTime = (
  appointment: Pick<
    Appointment,
    'startHour' | 'startMinute' | 'endHour' | 'endMinute'
  >
) => {
  return `${String(appointment.startHour).padStart(2, '0')}:${String(
    appointment.startMinute
  ).padStart(2, '0')}-${String(appointment.endHour).padStart(2, '0')}:${String(
    appointment.endMinute
  ).padStart(2, '0')}`;
};

export const groupAppointmentsByResource = (appointments: Appointment[]) => {
  const grouped = new Map<string, Appointment[]>();

  for (const appointment of appointments) {
    const current = grouped.get(appointment.resourceId);
    if (current) {
      current.push(appointment);
    } else {
      grouped.set(appointment.resourceId, [appointment]);
    }
  }

  return grouped;
};

export interface PositionedAppointment {
  appointment: Appointment;
  laneIndex: 0 | 1;
  laneCount: 1 | 2;
}

const getAppointmentStartMinutes = (appointment: Appointment) =>
  timeToMinutes(appointment.startHour, appointment.startMinute);

const getAppointmentEndMinutes = (appointment: Appointment) =>
  timeToMinutes(appointment.endHour, appointment.endMinute);

const appointmentHasOverlap = (
  appointment: Appointment,
  appointments: Appointment[]
) => {
  const start = getAppointmentStartMinutes(appointment);
  const end = getAppointmentEndMinutes(appointment);

  return appointments.some(otherAppointment => {
    if (otherAppointment.id === appointment.id) {
      return false;
    }

    return hasTimeConflict(
      start,
      end,
      getAppointmentStartMinutes(otherAppointment),
      getAppointmentEndMinutes(otherAppointment)
    );
  });
};

export const positionAppointmentsInTwoLanes = (
  appointments: Appointment[]
): PositionedAppointment[] => {
  const sortedAppointments = [...appointments].sort((a, b) => {
    const startDiff =
      getAppointmentStartMinutes(a) - getAppointmentStartMinutes(b);

    if (startDiff !== 0) {
      return startDiff;
    }

    return getAppointmentEndMinutes(a) - getAppointmentEndMinutes(b);
  });
  const laneEndMinutes: [number, number] = [0, 0];

  return sortedAppointments.map(appointment => {
    const start = getAppointmentStartMinutes(appointment);
    const end = getAppointmentEndMinutes(appointment);
    const laneCount = appointmentHasOverlap(appointment, appointments) ? 2 : 1;
    let laneIndex: 0 | 1 = 0;

    if (laneCount === 2) {
      if (laneEndMinutes[0] <= start) {
        laneIndex = 0;
      } else if (laneEndMinutes[1] <= start) {
        laneIndex = 1;
      } else {
        laneIndex = laneEndMinutes[0] <= laneEndMinutes[1] ? 0 : 1;
      }
    }

    laneEndMinutes[laneIndex] = Math.max(laneEndMinutes[laneIndex], end);

    return {
      appointment,
      laneIndex,
      laneCount,
    };
  });
};

export const summarizeAppointments = (appointments: Appointment[]) => {
  let active = 0;
  let unconfirmed = 0;
  let arrived = 0;
  let completed = 0;
  let cancelled = 0;
  const resourceIds = new Set<string>();

  for (const appointment of appointments) {
    resourceIds.add(appointment.resourceId);

    if (
      appointment.status === 'cancelled' ||
      appointment.status === 'no_show'
    ) {
      cancelled += 1;
      continue;
    }

    active += 1;

    if (
      appointment.status === 'unconfirmed' ||
      appointment.status === 'tentative'
    ) {
      unconfirmed += 1;
    }

    if (appointment.status === 'arrived') {
      arrived += 1;
    }

    if (appointment.status === 'completed') {
      completed += 1;
    }
  }

  return {
    total: appointments.length,
    active,
    unconfirmed,
    arrived,
    completed,
    cancelled,
    assignedResources: resourceIds.size,
  };
};

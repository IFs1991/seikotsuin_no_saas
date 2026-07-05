import {
  addJSTCalendarDays,
  jstDateTimeToDate,
  toJSTDateString,
} from '@/lib/jst';
import { normalizeBookingCalendarReminders } from '@/lib/booking-calendar/settings';
import {
  enqueuePatientReservationNotification,
  type PatientReservationEmailInput,
  type ReservationNotificationType,
} from '@/lib/notifications/reservation-notifications';
import { logger } from '@/lib/logger';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

type ReminderSupabaseClient = Pick<SupabaseServerClient, 'from'>;
type BookingCalendarReminders = ReturnType<
  typeof normalizeBookingCalendarReminders
>;

type ActiveClinic = Pick<
  Database['public']['Tables']['clinics']['Row'],
  'id' | 'name'
>;

type ReminderReservationRow = Pick<
  Database['public']['Tables']['reservations']['Row'],
  | 'id'
  | 'clinic_id'
  | 'customer_id'
  | 'menu_id'
  | 'staff_id'
  | 'start_time'
  | 'end_time'
>;

type ReminderCustomer = Pick<
  Database['public']['Tables']['customers']['Row'],
  'email' | 'line_user_id' | 'name' | 'consent_reminder'
>;

type ReminderContext = {
  customer: ReminderCustomer | null;
  staffName: string;
  menuName: string;
};

export type ReminderWindow = {
  from: Date;
  to: Date;
};

export type DueReminder = {
  notificationType: Extract<
    ReservationNotificationType,
    'reminder_day_before' | 'reminder_same_day'
  >;
  scheduledFor: string;
};

export type ProcessReservationRemindersOptions = {
  now?: Date;
  intervalMinutes?: number;
};

export type ProcessReservationRemindersResult = {
  scanned: number;
  enqueued: number;
  skipped: number;
  duplicates: number;
};

function padHour(hour: number): string {
  return hour.toString().padStart(2, '0');
}

export function createReminderWindow(
  now: Date,
  intervalMinutes = 15
): ReminderWindow {
  return {
    from: new Date(now.getTime() - intervalMinutes * 60 * 1000),
    to: now,
  };
}

function isWithinReminderWindow(date: Date, window: ReminderWindow): boolean {
  return (
    date.getTime() > window.from.getTime() &&
    date.getTime() <= window.to.getTime()
  );
}

export function getDueReservationReminders(
  reservationStartIso: string,
  reminders: BookingCalendarReminders,
  window: ReminderWindow
): DueReminder[] {
  const start = new Date(reservationStartIso);
  if (Number.isNaN(start.getTime())) {
    return [];
  }

  const due: DueReminder[] = [];

  if (reminders.dayBefore.enabled) {
    const reservationDate = toJSTDateString(start);
    const sendDate = addJSTCalendarDays(reservationDate, -1);
    const scheduled = jstDateTimeToDate(
      sendDate,
      `${padHour(reminders.dayBefore.sendAtHour)}:00`
    );
    if (isWithinReminderWindow(scheduled, window)) {
      due.push({
        notificationType: 'reminder_day_before',
        scheduledFor: scheduled.toISOString(),
      });
    }
  }

  if (reminders.sameDay.enabled) {
    const scheduled = new Date(
      start.getTime() - reminders.sameDay.hoursBefore * 60 * 60 * 1000
    );
    if (isWithinReminderWindow(scheduled, window)) {
      due.push({
        notificationType: 'reminder_same_day',
        scheduledFor: scheduled.toISOString(),
      });
    }
  }

  return due;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetchBookingCalendarReminders(
  supabase: ReminderSupabaseClient,
  clinicId: string
): Promise<BookingCalendarReminders> {
  const { data, error } = await supabase
    .from('clinic_settings')
    .select('settings')
    .eq('clinic_id', clinicId)
    .eq('category', 'booking_calendar')
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load booking_calendar reminders', {
      clinicId,
      error: error.message,
    });
    return normalizeBookingCalendarReminders(null);
  }

  const settings = isRecord(data?.settings) ? data.settings : {};
  return normalizeBookingCalendarReminders(settings.reminders);
}

async function fetchActiveClinics(
  supabase: ReminderSupabaseClient
): Promise<ActiveClinic[]> {
  const { data, error } = await supabase
    .from('clinics')
    .select('id, name')
    .eq('is_active', true);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function fetchReminderReservations(
  supabase: ReminderSupabaseClient,
  clinicId: string,
  now: Date
): Promise<ReminderReservationRow[]> {
  const horizon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time'
    )
    .eq('clinic_id', clinicId)
    .eq('status', 'confirmed')
    .eq('is_deleted', false)
    .gte('start_time', now.toISOString())
    .lte('start_time', horizon.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function fetchReminderContext(
  supabase: ReminderSupabaseClient,
  row: ReminderReservationRow
): Promise<ReminderContext> {
  const [customer, resource, menu] = await Promise.all([
    supabase
      .from('customers')
      .select('email, line_user_id, name, consent_reminder')
      .eq('id', row.customer_id)
      .eq('clinic_id', row.clinic_id)
      .maybeSingle(),
    supabase
      .from('resources')
      .select('name')
      .eq('id', row.staff_id)
      .eq('clinic_id', row.clinic_id)
      .maybeSingle(),
    supabase
      .from('menus')
      .select('name')
      .eq('id', row.menu_id)
      .eq('clinic_id', row.clinic_id)
      .maybeSingle(),
  ]);

  if (customer.error) {
    logger.warn('Failed to load reminder customer', {
      reservationId: row.id,
      error: customer.error.message,
    });
  }
  if (resource.error) {
    logger.warn('Failed to load reminder resource', {
      reservationId: row.id,
      error: resource.error.message,
    });
  }
  if (menu.error) {
    logger.warn('Failed to load reminder menu', {
      reservationId: row.id,
      error: menu.error.message,
    });
  }

  return {
    customer: customer.data ?? null,
    staffName: resource.data?.name ?? '',
    menuName: menu.data?.name ?? '',
  };
}

function getReminderTemplateType(
  notificationType: DueReminder['notificationType']
): PatientReservationEmailInput['templateType'] {
  return notificationType === 'reminder_day_before'
    ? 'reminder_day_before'
    : 'reminder_same_day';
}

export async function processReservationReminders(
  supabase: ReminderSupabaseClient,
  options: ProcessReservationRemindersOptions = {}
): Promise<ProcessReservationRemindersResult> {
  const now = options.now ?? new Date();
  const window = createReminderWindow(now, options.intervalMinutes ?? 15);
  const clinics = await fetchActiveClinics(supabase);
  const result: ProcessReservationRemindersResult = {
    scanned: 0,
    enqueued: 0,
    skipped: 0,
    duplicates: 0,
  };

  for (const clinic of clinics) {
    const reminders = await fetchBookingCalendarReminders(supabase, clinic.id);
    if (!reminders.dayBefore.enabled && !reminders.sameDay.enabled) {
      continue;
    }

    const reservations = await fetchReminderReservations(
      supabase,
      clinic.id,
      now
    );

    for (const reservation of reservations) {
      const due = getDueReservationReminders(
        reservation.start_time,
        reminders,
        window
      );
      if (due.length === 0) {
        continue;
      }

      result.scanned += 1;
      const context = await fetchReminderContext(supabase, reservation);
      if (context.customer?.consent_reminder === false) {
        result.skipped += due.length;
        continue;
      }

      for (const reminder of due) {
        const outcome = await enqueuePatientReservationNotification(supabase, {
          clinicId: reservation.clinic_id,
          reservationId: reservation.id,
          customerId: reservation.customer_id,
          toEmail: context.customer?.email ?? null,
          lineUserId: context.customer?.line_user_id ?? null,
          notificationType: reminder.notificationType,
          templateType: getReminderTemplateType(reminder.notificationType),
          payload: {
            customerName: context.customer?.name ?? '',
            clinicName: clinic.name,
            startTime: reservation.start_time,
            endTime: reservation.end_time,
            staffName: context.staffName,
            menuName: context.menuName,
            myPageUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/booking/${reservation.clinic_id}/my`,
          },
          dedupeTimestamp: reminder.scheduledFor,
          scheduledFor: reminder.scheduledFor,
        });

        if (outcome === 'enqueued') {
          result.enqueued += 1;
        } else if (outcome === 'duplicate') {
          result.duplicates += 1;
        } else {
          result.skipped += 1;
        }
      }
    }
  }

  return result;
}

const mockEnqueuePatientReservationNotification = jest.fn();

jest.mock('@/lib/notifications/reservation-notifications', () => ({
  buildPublicMyPageUrl: (clinicId: string) =>
    `https://example.com/booking/${clinicId}/my`,
  enqueuePatientReservationNotification: (...args: unknown[]) =>
    mockEnqueuePatientReservationNotification(...args),
}));

import {
  createReminderWindow,
  getDueReservationReminders,
  processReservationReminders,
} from '@/lib/notifications/reservation-reminders';
import { DEFAULT_BOOKING_CALENDAR_REMINDERS } from '@/lib/booking-calendar/settings';

type QueryError = { message: string };
type QueryResult<T> = { data: T; error: QueryError | null };

function createThenableQuery<T>(result: QueryResult<T>) {
  const query = {
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then<TResult1 = QueryResult<T>, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(
        onfulfilled ?? undefined,
        onrejected ?? undefined
      );
    },
  };

  return query;
}

function buildReminderClient(
  options: {
    lastSuccessfulRunAt?: string | null;
    clinicsError?: QueryError | null;
    enqueueOutcome?: 'enqueued' | 'duplicate' | 'skipped';
  } = {}
) {
  const now = new Date('2026-07-10T09:00:00.000Z');
  const internalJobRunsSelect = createThenableQuery({
    data:
      options.lastSuccessfulRunAt === undefined
        ? null
        : { last_successful_run_at: options.lastSuccessfulRunAt },
    error: null,
  });
  const internalJobRunsUpsert = jest
    .fn()
    .mockResolvedValue({ data: null, error: null });
  const clinicsQuery = createThenableQuery({
    data: [{ id: 'clinic-001', name: 'テスト整骨院' }],
    error: options.clinicsError ?? null,
  });
  const settingsQuery = createThenableQuery({
    data: {
      settings: {
        reminders: {
          dayBefore: { enabled: false, sendAtHour: 18 },
          sameDay: { enabled: true, hoursBefore: 3 },
        },
      },
    },
    error: null,
  });
  const reservationsQuery = createThenableQuery({
    data: [
      {
        id: 'reservation-001',
        clinic_id: 'clinic-001',
        customer_id: 'customer-001',
        menu_id: 'menu-001',
        staff_id: 'staff-001',
        start_time: new Date(now.getTime() + 150 * 60 * 1000).toISOString(),
        end_time: new Date(now.getTime() + 210 * 60 * 1000).toISOString(),
      },
    ],
    error: null,
  });
  const customerQuery = createThenableQuery({
    data: {
      email: 'patient@example.com',
      line_user_id: null,
      name: '患者 太郎',
      consent_reminder: true,
    },
    error: null,
  });
  const resourceQuery = createThenableQuery({
    data: { name: '田中先生' },
    error: null,
  });
  const menuQuery = createThenableQuery({
    data: { name: '標準施術' },
    error: null,
  });
  const client = {
    from: jest.fn((table: string) => {
      if (table === 'internal_job_runs') {
        return {
          select: jest.fn(() => internalJobRunsSelect),
          upsert: internalJobRunsUpsert,
        };
      }
      if (table === 'clinics') {
        return { select: jest.fn(() => clinicsQuery) };
      }
      if (table === 'clinic_settings') {
        return { select: jest.fn(() => settingsQuery) };
      }
      if (table === 'reservations') {
        return { select: jest.fn(() => reservationsQuery) };
      }
      if (table === 'customers') {
        return { select: jest.fn(() => customerQuery) };
      }
      if (table === 'resources') {
        return { select: jest.fn(() => resourceQuery) };
      }
      if (table === 'menus') {
        return { select: jest.fn(() => menuQuery) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as Parameters<typeof processReservationReminders>[0];

  mockEnqueuePatientReservationNotification.mockResolvedValue(
    options.enqueueOutcome ?? 'enqueued'
  );

  return {
    client,
    internalJobRunsUpsert,
  };
}

describe('reservation reminder scheduling', () => {
  beforeEach(() => {
    mockEnqueuePatientReservationNotification.mockReset();
  });

  it('extracts day-before reminders inside the JST send window', () => {
    const window = createReminderWindow(
      new Date('2026-07-09T09:00:00.000Z'),
      15
    );

    const due = getDueReservationReminders(
      '2026-07-10T01:00:00.000Z',
      DEFAULT_BOOKING_CALENDAR_REMINDERS,
      window
    );

    expect(due).toEqual([
      {
        notificationType: 'reminder_day_before',
        scheduledFor: '2026-07-09T09:00:00.000Z',
      },
    ]);
  });

  it('extracts same-day reminders when enabled and inside the window', () => {
    const window = createReminderWindow(
      new Date('2026-07-10T01:00:00.000Z'),
      15
    );

    const due = getDueReservationReminders(
      '2026-07-10T04:00:00.000Z',
      {
        dayBefore: { enabled: false, sendAtHour: 18 },
        sameDay: { enabled: true, hoursBefore: 3 },
      },
      window
    );

    expect(due).toEqual([
      {
        notificationType: 'reminder_same_day',
        scheduledFor: '2026-07-10T01:00:00.000Z',
      },
    ]);
  });

  it('does not include reminders outside the previous-to-current window', () => {
    const window = createReminderWindow(
      new Date('2026-07-09T08:44:59.000Z'),
      15
    );

    const due = getDueReservationReminders(
      '2026-07-10T01:00:00.000Z',
      DEFAULT_BOOKING_CALENDAR_REMINDERS,
      window
    );

    expect(due).toEqual([]);
  });

  it('last_successful_run_at がある場合はwindow.fromに使う', () => {
    const window = createReminderWindow(
      new Date('2026-07-10T09:00:00.000Z'),
      15,
      new Date('2026-07-10T08:00:00.000Z')
    );

    expect(window.from.toISOString()).toBe('2026-07-10T08:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-07-10T09:00:00.000Z');
  });

  it('last_successful_run_at が24時間より古い場合は丸める', () => {
    const window = createReminderWindow(
      new Date('2026-07-10T09:00:00.000Z'),
      15,
      new Date('2026-07-08T08:00:00.000Z')
    );

    expect(window.from.toISOString()).toBe('2026-07-09T09:00:00.000Z');
  });

  it('60分遅延分のreminderをenqueueし成功時にwindow.toでjob runを更新する', async () => {
    const { client, internalJobRunsUpsert } = buildReminderClient({
      lastSuccessfulRunAt: '2026-07-10T08:00:00.000Z',
    });

    const result = await processReservationReminders(client, {
      now: new Date('2026-07-10T09:00:00.000Z'),
    });

    expect(result).toEqual({
      scanned: 1,
      enqueued: 1,
      skipped: 0,
      duplicates: 0,
    });
    expect(mockEnqueuePatientReservationNotification).toHaveBeenCalledWith(
      expect.objectContaining({}),
      expect.objectContaining({
        reservationId: 'reservation-001',
        notificationType: 'reminder_same_day',
        scheduledFor: '2026-07-10T08:30:00.000Z',
        dedupeTimestamp: '2026-07-10T08:30:00.000Z',
      })
    );
    expect(internalJobRunsUpsert).toHaveBeenCalledWith(
      {
        job_name: 'reservation_reminders',
        last_successful_run_at: '2026-07-10T09:00:00.000Z',
        updated_at: '2026-07-10T09:00:00.000Z',
      },
      { onConflict: 'job_name' }
    );
  });

  it('処理失敗時はjob runを更新しない', async () => {
    const { client, internalJobRunsUpsert } = buildReminderClient({
      clinicsError: { message: 'clinic load failed' },
    });

    await expect(
      processReservationReminders(client, {
        now: new Date('2026-07-10T09:00:00.000Z'),
      })
    ).rejects.toThrow('clinic load failed');

    expect(internalJobRunsUpsert).not.toHaveBeenCalled();
  });
});

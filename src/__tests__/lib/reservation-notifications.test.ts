import {
  enqueuePatientReservationEmail,
  enqueuePatientReservationNotification,
} from '@/lib/notifications/reservation-notifications';

type NotificationClient = Parameters<typeof enqueuePatientReservationEmail>[0];

function createNotificationClient(params: {
  claimData: { id: string } | null;
  claimError: { message: string; code?: string } | null;
}) {
  const maybeSingle = jest.fn().mockResolvedValue({
    data: params.claimData,
    error: params.claimError,
  });
  const selectNotification = jest.fn().mockReturnValue({ maybeSingle });
  const upsert = jest.fn().mockReturnValue({ select: selectNotification });
  const retry = {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  const update = jest.fn().mockReturnValue(retry);
  const confirmation = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: { status: 'enqueued' }, error: null }),
  };
  const emailInsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: 'outbox-001' },
        error: null,
      }),
    }),
  });

  const from = jest.fn((table: string) => {
    if (table === 'reservation_notifications') {
      return {
        upsert,
        update,
        select: jest.fn().mockReturnValue(confirmation),
      };
    }
    if (table === 'email_outbox') {
      return { insert: emailInsert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from: from as NotificationClient['from'] },
    upsert,
    update,
    emailInsert,
  };
}

const baseInput = {
  clinicId: 'clinic-001',
  reservationId: 'reservation-001',
  customerId: 'customer-001',
  toEmail: 'patient@example.com',
  notificationType: 'reminder_day_before' as const,
  templateType: 'reminder_day_before' as const,
  payload: {
    customerName: '田中太郎',
    clinicName: 'テスト整骨院',
    startTime: '2026-07-10T01:00:00.000Z',
    endTime: '2026-07-10T02:00:00.000Z',
    staffName: '山田先生',
    menuName: '標準施術',
  },
  dedupeTimestamp: '2026-07-09T09:00:00.000Z',
};

describe('reservation notification idempotency', () => {
  it('enqueues email after successfully claiming the notification log', async () => {
    const { client, upsert, update, emailInsert } = createNotificationClient({
      claimData: { id: 'notification-001' },
      claimError: null,
    });

    const result = await enqueuePatientReservationEmail(client, baseInput);

    expect(result).toBe('enqueued');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation_id: 'reservation-001',
        notification_type: 'reminder_day_before',
      }),
      {
        onConflict: 'reservation_id,notification_type',
        ignoreDuplicates: true,
      }
    );
    expect(emailInsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          enqueue: expect.objectContaining({ to_email: 'patient@example.com' }),
        }),
      }),
      expect.anything()
    );
  });

  it('does not enqueue email when the notification claim is a duplicate', async () => {
    const { client, emailInsert } = createNotificationClient({
      claimData: null,
      claimError: null,
    });

    const result = await enqueuePatientReservationEmail(client, baseInput);

    expect(result).toBe('duplicate');
    expect(emailInsert).not.toHaveBeenCalled();
  });
});

function createLineNotificationClient(params: {
  lineEnabled: boolean;
  notificationEnabled?: boolean;
  identityGeneration?: string;
}) {
  const activeGeneration = 'generation-current';
  const notificationMaybeSingle = jest.fn().mockResolvedValue({
    data: { id: 'notification-001' },
    error: null,
  });
  const notificationUpsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ maybeSingle: notificationMaybeSingle }),
  });
  const notificationUpdate = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
  const lineInsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: 'line-outbox-001' },
        error: null,
      }),
    }),
  });
  const emailInsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: 'email-outbox-001' },
        error: null,
      }),
    }),
  });

  const from = jest.fn((table: string) => {
    if (table === 'clinic_settings') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              settings: {
                channels: {
                  lineEnabled: params.lineEnabled,
                },
              },
            },
            error: null,
          }),
        }),
      };
    }
    if (table === 'clinic_feature_flags') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                line_notification_enabled: params.notificationEnabled ?? true,
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'clinic_line_credentials') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  is_active: true,
                  credential_generation_id: activeGeneration,
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'customers') {
      const customerQuery = {
        eq: jest.fn(() => customerQuery),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            line_user_id: 'U1234567890',
            line_credential_generation_id:
              params.identityGeneration ?? activeGeneration,
          },
          error: null,
        }),
      };
      return { select: jest.fn(() => customerQuery) };
    }
    if (table === 'reservation_notifications') {
      return {
        upsert: notificationUpsert,
        update: notificationUpdate,
        select: jest
          .fn()
          .mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest
              .fn()
              .mockResolvedValue({ data: { status: 'enqueued' }, error: null }),
          }),
      };
    }
    if (table === 'line_message_outbox') {
      return { insert: lineInsert };
    }
    if (table === 'email_outbox') {
      return { insert: emailInsert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from: from as NotificationClient['from'] },
    notificationUpsert,
    lineInsert,
    emailInsert,
  };
}

describe('reservation notification channel priority', () => {
  const originalKillSwitch = process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING;
  const originalLineKey = process.env.LINE_CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = 'true';
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = originalKillSwitch;
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = originalLineKey;
  });

  it('enqueues LINE when customer and clinic gates allow push', async () => {
    const { client, notificationUpsert, lineInsert, emailInsert } =
      createLineNotificationClient({ lineEnabled: true });

    const result = await enqueuePatientReservationNotification(client, {
      ...baseInput,
      lineUserId: 'U1234567890',
    });

    expect(result).toBe('enqueued');
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'line',
        notification_type: 'reminder_day_before',
      }),
      expect.objectContaining({
        onConflict: 'reservation_id,notification_type',
        ignoreDuplicates: true,
      })
    );
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          enqueue: expect.objectContaining({
            line_user_id: 'U1234567890',
            dedupe_timestamp: baseInput.dedupeTimestamp,
            payload: expect.objectContaining({ customerId: 'customer-001' }),
          }),
        }),
      }),
      expect.anything()
    );
    expect(lineInsert).not.toHaveBeenCalled();
    expect(emailInsert).not.toHaveBeenCalled();
  });

  it('falls back to email when clinic communication LINE is disabled', async () => {
    const { client, notificationUpsert, lineInsert, emailInsert } =
      createLineNotificationClient({
        lineEnabled: false,
      });

    const result = await enqueuePatientReservationNotification(client, {
      ...baseInput,
      lineUserId: 'U1234567890',
    });

    expect(result).toBe('enqueued');
    expect(lineInsert).not.toHaveBeenCalled();
    expect(emailInsert).not.toHaveBeenCalled();
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        detail: expect.objectContaining({
          enqueue: expect.objectContaining({ to_email: 'patient@example.com' }),
        }),
      }),
      expect.anything()
    );
  });

  it('falls back to email when the clinic notification feature is disabled', async () => {
    const { client, notificationUpsert, lineInsert, emailInsert } =
      createLineNotificationClient({
        lineEnabled: true,
        notificationEnabled: false,
      });

    const result = await enqueuePatientReservationNotification(client, {
      ...baseInput,
      lineUserId: 'U1234567890',
    });

    expect(result).toBe('enqueued');
    expect(lineInsert).not.toHaveBeenCalled();
    expect(emailInsert).not.toHaveBeenCalled();
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        detail: expect.objectContaining({
          enqueue: expect.objectContaining({ to_email: 'patient@example.com' }),
        }),
      }),
      expect.anything()
    );
  });

  it('falls back to email until the patient is relinked to the current provider', async () => {
    const { client, notificationUpsert, lineInsert, emailInsert } =
      createLineNotificationClient({
        lineEnabled: true,
        identityGeneration: 'generation-replaced',
      });

    const result = await enqueuePatientReservationNotification(client, {
      ...baseInput,
      lineUserId: 'U1234567890',
    });

    expect(result).toBe('enqueued');
    expect(lineInsert).not.toHaveBeenCalled();
    expect(emailInsert).not.toHaveBeenCalled();
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        detail: expect.objectContaining({
          enqueue: expect.objectContaining({ to_email: 'patient@example.com' }),
        }),
      }),
      expect.anything()
    );
  });
});

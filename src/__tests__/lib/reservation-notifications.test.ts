import { enqueuePatientReservationEmail } from '@/lib/notifications/reservation-notifications';

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
  const updateEq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq: updateEq });
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
      return { upsert, update };
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
    expect(emailInsert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
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

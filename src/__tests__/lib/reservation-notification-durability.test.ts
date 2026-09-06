import { enqueuePatientReservationEmail } from '@/lib/notifications/reservation-notifications';

type Client = Parameters<typeof enqueuePatientReservationEmail>[0];
const input = {
  clinicId: 'clinic-a',
  reservationId: 'reservation-a',
  customerId: 'customer-a',
  toEmail: 'synthetic@example.invalid',
  notificationType: 'received' as const,
  templateType: 'reservation_created' as const,
  dedupeTimestamp: '2026-09-06T00:00:00Z',
  payload: {
    customerName: '合成患者',
    clinicName: '合成院',
    staffName: '合成担当',
    menuName: '合成施術',
    startTime: '2026-09-07T01:00:00Z',
    endTime: '2026-09-07T02:00:00Z',
  },
};

function makeClient(
  options: {
    duplicate?: boolean;
    retry?: boolean;
    status?: string;
    failure?: boolean;
  } = {}
) {
  const query = {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({
        data: options.retry ? { id: 'notification-a' } : null,
        error: null,
      }),
  };
  const confirm = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({
        data: { status: options.status ?? 'enqueued' },
        error: null,
      }),
  };
  const upsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({
          data: options.duplicate ? null : { id: 'notification-a' },
          error: options.failure ? { message: 'durable insert failed' } : null,
        }),
    }),
  });
  const update = jest.fn().mockReturnValue(query);
  const from = jest.fn((table: string) => {
    if (table !== 'reservation_notifications')
      throw new Error('Outbox must be written in the notification transaction');
    return { upsert, update, select: jest.fn().mockReturnValue(confirm) };
  });
  return {
    client: { from: from as Client['from'] },
    from,
    upsert,
    update,
    query,
  };
}

describe('reservation notification durable handoff', () => {
  it('persists the prepared email in one notification write before resolving', async () => {
    const fixture = makeClient();
    await expect(
      enqueuePatientReservationEmail(fixture.client, input)
    ).resolves.toBe('enqueued');
    expect(fixture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: 'clinic-a',
        reservation_id: 'reservation-a',
        channel: 'email',
        detail: expect.objectContaining({
          enqueue: expect.objectContaining({
            customer_id: 'customer-a',
            to_email: 'synthetic@example.invalid',
            template_type: 'reservation_created',
          }),
        }),
      }),
      expect.anything()
    );
    expect(
      fixture.from.mock.calls.every(
        ([table]) => table === 'reservation_notifications'
      )
    ).toBe(true);
  });

  it('can retry a failed or incomplete claim under the same clinic scope', async () => {
    const fixture = makeClient({ duplicate: true, retry: true });
    await expect(
      enqueuePatientReservationEmail(fixture.client, input)
    ).resolves.toBe('enqueued');
    expect(fixture.query.eq).toHaveBeenCalledWith('clinic_id', 'clinic-a');
    expect(fixture.query.eq).toHaveBeenCalledWith(
      'reservation_id',
      'reservation-a'
    );
    expect(fixture.query.in).toHaveBeenCalledWith('status', [
      'claimed',
      'failed',
    ]);
  });

  it('does not replay an already completed notification', async () => {
    const fixture = makeClient({ duplicate: true });
    await expect(
      enqueuePatientReservationEmail(fixture.client, input)
    ).resolves.toBe('duplicate');
  });

  it('exposes durable insert failures to the reservation error observer', async () => {
    const fixture = makeClient({ failure: true });
    await expect(
      enqueuePatientReservationEmail(fixture.client, input)
    ).rejects.toThrow('durable insert failed');
  });

  it('fails closed when the deployed database has not confirmed an outbox insert', async () => {
    const fixture = makeClient({ status: 'claimed' });
    await expect(
      enqueuePatientReservationEmail(fixture.client, input)
    ).rejects.toThrow('Durable notification enqueue was not confirmed');
  });
});

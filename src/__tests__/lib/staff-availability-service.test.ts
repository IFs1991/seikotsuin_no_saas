import { createAndNotifyStaffAvailabilityEvent } from '@/lib/services/staff-availability-service';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';
const CURRENT_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const LEGACY_CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const GENERATION_ID = '55555555-5555-4555-8555-555555555555';

function resolvedQuery<T>(data: T) {
  const query = {
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    returns: jest.fn(async () => ({ data, error: null })),
    maybeSingle: jest.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe('staff availability notification recipients', () => {
  it('current Provider世代へ再リンク済みの患者だけを原子RPCへ渡す', async () => {
    const availableDatetime = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();
    const credentialsQuery = resolvedQuery({
      credential_generation_id: GENERATION_ID,
    });
    const preferencesQuery = resolvedQuery([
      { customer_id: CURRENT_CUSTOMER_ID },
      { customer_id: LEGACY_CUSTOMER_ID },
    ]);
    const customersQuery = resolvedQuery([
      {
        id: CURRENT_CUSTOMER_ID,
        name: '現在 太郎',
        line_user_id: 'U-current',
        line_credential_generation_id: GENERATION_ID,
        email: null,
        is_deleted: false,
      },
      {
        id: LEGACY_CUSTOMER_ID,
        name: '旧世代 花子',
        line_user_id: 'U-legacy',
        line_credential_generation_id: null,
        email: null,
        is_deleted: false,
      },
    ]);
    const historyQuery = resolvedQuery([
      { customer_id: CURRENT_CUSTOMER_ID },
      { customer_id: LEGACY_CUSTOMER_ID },
    ]);
    const staffQuery = resolvedQuery({ id: STAFF_ID, name: '担当先生' });
    const rpcSingle = jest.fn(async () => ({
      data: {
        id: '66666666-6666-4666-8666-666666666666',
        clinic_id: CLINIC_ID,
        staff_id: STAFF_ID,
        available_datetime: availableDatetime,
        reward_type: 'points',
        status: 'notified',
        created_by: '77777777-7777-4777-8777-777777777777',
        created_at: '2099-08-12T00:00:00.000Z',
        updated_at: '2099-08-12T00:00:00.000Z',
        recipient_count: 1,
      },
      error: null,
    }));
    const rpc = jest.fn(() => ({ single: rpcSingle }));
    const from = jest.fn((table: string) => {
      if (table === 'clinic_line_credentials') {
        return { select: jest.fn(() => credentialsQuery) };
      }
      if (table === 'patient_staff_preferences') {
        return { select: jest.fn(() => preferencesQuery) };
      }
      if (table === 'customers') {
        return { select: jest.fn(() => customersQuery) };
      }
      if (table === 'reservations') {
        return { select: jest.fn(() => historyQuery) };
      }
      if (table === 'resources') {
        return { select: jest.fn(() => staffQuery) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const client = { from, rpc } as Parameters<
      typeof createAndNotifyStaffAvailabilityEvent
    >[0];

    const result = await createAndNotifyStaffAvailabilityEvent(client, {
      clinicId: CLINIC_ID,
      staffId: STAFF_ID,
      availableDatetime,
      rewardType: 'points',
      createdBy: '77777777-7777-4777-8777-777777777777',
    });

    expect(customersQuery.eq).toHaveBeenCalledWith(
      'line_credential_generation_id',
      GENERATION_ID
    );
    expect(rpc).toHaveBeenCalledWith(
      'create_staff_availability_event',
      expect.objectContaining({
        p_recipients: [
          expect.objectContaining({
            customerId: CURRENT_CUSTOMER_ID,
            lineUserId: 'U-current',
          }),
        ],
      })
    );
    expect(result.recipientCount).toBe(1);
  });
});

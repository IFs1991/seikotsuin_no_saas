import {
  mapReservationUpdateToRow,
  reservationsQuerySchema,
  reservationUpdateSchema,
} from '@/app/api/reservations/schema';

const baseDto = {
  clinic_id: '123e4567-e89b-12d3-a456-426614174000',
  id: '123e4567-e89b-12d3-a456-426614174999',
};

describe('mapReservationUpdateToRow', () => {
  it('does not overwrite notes when notes is undefined', () => {
    const row = mapReservationUpdateToRow({
      ...baseDto,
      status: 'confirmed',
    });

    expect(row).not.toHaveProperty('notes');
  });

  it('maps notes when provided', () => {
    const row = mapReservationUpdateToRow({
      ...baseDto,
      notes: 'メモ更新',
    });

    expect(row).toHaveProperty('notes', 'メモ更新');
  });

  it('does not include optional fields when not provided (status-only update)', () => {
    const row = mapReservationUpdateToRow({
      ...baseDto,
      status: 'cancelled',
    });

    // 🔴 status のみ UPDATE のとき、他の optional フィールドは含まれない
    expect(row).toHaveProperty('status', 'cancelled');
    expect(row).not.toHaveProperty('start_time');
    expect(row).not.toHaveProperty('end_time');
    expect(row).not.toHaveProperty('staff_id');
    expect(row).not.toHaveProperty('selected_options');
    expect(row).not.toHaveProperty('notes');
  });

  it('includes only the fields that are explicitly provided', () => {
    const row = mapReservationUpdateToRow({
      ...baseDto,
      staffId: '123e4567-e89b-12d3-a456-426614174111',
      notes: 'メモ',
    });

    expect(row).toHaveProperty('staff_id');
    expect(row).toHaveProperty('notes', 'メモ');
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('start_time');
  });
});

// The customer visit cache (customers.total_visits / total_revenue /
// last_visit_date) is derived by the database from the reservation rows
// (spec-os-customer-stat-authority-v0.1). The PATCH contract below is what
// the API can change on those rows; it must not grow a way to write the
// cache or the counted columns directly.
describe('reservation PATCH contract used by the customer visit cache', () => {
  it('keeps completed and cancelled as updatable statuses (retries included)', () => {
    for (const status of ['completed', 'cancelled', 'completed'] as const) {
      const parsed = reservationUpdateSchema.safeParse({ ...baseDto, status });
      expect(parsed.success).toBe(true);
    }
  });

  it.each([
    ['customerId', '123e4567-e89b-12d3-a456-426614174002'],
    ['customer_id', '123e4567-e89b-12d3-a456-426614174002'],
    ['is_deleted', true],
    ['isDeleted', true],
    ['price', 1],
    ['actual_price', 1],
    ['actualPrice', 1],
    ['total_visits', 0],
    ['total_revenue', 0],
    ['last_visit_date', '2026-01-01T00:00:00.000Z'],
  ])('rejects a direct %s write', (key, value) => {
    const parsed = reservationUpdateSchema.safeParse({
      ...baseDto,
      status: 'completed',
      [key]: value,
    });

    expect(parsed.success).toBe(false);
  });

  it('maps a re-sent completed status to the status column only', () => {
    const row = mapReservationUpdateToRow({ ...baseDto, status: 'completed' });

    expect(row).toEqual({ status: 'completed' });
  });

  it('writes price only together with the repriced snapshot', () => {
    const row = mapReservationUpdateToRow(
      {
        ...baseDto,
        selectedOptions: [
          {
            optionId: 'option-1',
            name: 'Option',
            priceDelta: 500,
            durationDeltaMinutes: 0,
          },
        ],
      },
      { isStaffRequested: false, staffNominationFee: 0, price: 1500 }
    );

    expect(row).toEqual({
      selected_options: [
        {
          optionId: 'option-1',
          name: 'Option',
          priceDelta: 500,
          durationDeltaMinutes: 0,
        },
      ],
      is_staff_requested: false,
      staff_nomination_fee: 0,
      price: 1500,
    });
    expect(
      mapReservationUpdateToRow({ ...baseDto, notes: 'メモ' })
    ).not.toHaveProperty('price');
  });
});

describe('reservationsQuerySchema', () => {
  it('accepts customer_id for patient reservation history filtering', () => {
    const parsed = reservationsQuerySchema.safeParse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      customer_id: '123e4567-e89b-12d3-a456-426614174002',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customer_id).toBe(
        '123e4567-e89b-12d3-a456-426614174002'
      );
    }
  });
});

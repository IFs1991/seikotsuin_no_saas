import {
  mapReservationUpdateToRow,
  reservationsQuerySchema,
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

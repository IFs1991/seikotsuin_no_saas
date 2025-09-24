import { describe, expect, it } from '@jest/globals';
import {
  mapStaffInsertToRow,
  staffInsertSchema,
  staffQuerySchema,
} from '@/app/api/staff/schema';

describe('staff schemas', () => {
  it('validates clinic query', () => {
    const result = staffQuerySchema.safeParse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = staffInsertSchema.safeParse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テストスタッフ',
      role: 'invalid',
      email: 'staff@example.com',
      is_therapist: true,
    });

    expect(result.success).toBe(false);
  });

  it('maps insert payload', () => {
    const dto = staffInsertSchema.parse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テストスタッフ',
      role: 'manager',
      email: 'manager@example.com',
      hire_date: '2024-01-15',
      is_therapist: false,
    });

    const row = mapStaffInsertToRow(dto);

    expect(row).toEqual({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テストスタッフ',
      role: 'manager',
      email: 'manager@example.com',
      password_hash: 'temporary_hash',
      hire_date: '2024-01-15',
      is_therapist: false,
    });
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  mapStaffInsertToRow,
  mapStaffInsertToResourceRow,
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

  it('maps practitioner staff to a bookable staff resource', () => {
    const dto = staffInsertSchema.parse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: '施術 太郎',
      role: 'practitioner',
      email: 'therapist@example.com',
      is_therapist: true,
    });

    const row = mapStaffInsertToResourceRow(
      dto,
      '223e4567-e89b-12d3-a456-426614174000',
      '323e4567-e89b-12d3-a456-426614174000'
    );

    expect(row).toEqual(
      expect.objectContaining({
        id: '223e4567-e89b-12d3-a456-426614174000',
        clinic_id: '123e4567-e89b-12d3-a456-426614174000',
        name: '施術 太郎',
        type: 'staff',
        staff_code: 'staff-223e4567-e89b-12d3-a456-426614174000',
        email: 'therapist@example.com',
        max_concurrent: 1,
        is_active: true,
        is_bookable: true,
        is_deleted: false,
        created_by: '323e4567-e89b-12d3-a456-426614174000',
      })
    );
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  mapPatientInsertToRow,
  patientInsertSchema,
  patientQuerySchema,
} from '@/app/api/patients/schema';

describe('patient schemas', () => {
  it('parses valid query params', () => {
    const result = patientQuerySchema.safeParse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      analysis: 'conversion',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clinic_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.data.analysis).toBe('conversion');
    }
  });

  it('rejects invalid clinic id', () => {
    const result = patientQuerySchema.safeParse({
      clinic_id: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
  });

  it('maps insert payload to database row', () => {
    const parseResult = patientInsertSchema.parse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: '山田 太郎',
      gender: 'male',
      date_of_birth: '1990-01-01',
      phone_number: '09012345678',
      address: '東京都千代田区',
    });

    const row = mapPatientInsertToRow(parseResult);

    expect(row).toEqual({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: '山田 太郎',
      gender: 'male',
      date_of_birth: '1990-01-01',
      phone_number: '09012345678',
      address: '東京都千代田区',
    });
  });

  it('coerces blank optional fields to nullish', () => {
    const parseResult = patientInsertSchema.parse({
      clinic_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テスト',
      gender: 'female',
      date_of_birth: '',
      phone_number: '',
      address: '',
    });

    const row = mapPatientInsertToRow(parseResult);

    expect(row.date_of_birth).toBeNull();
    expect(row.phone_number).toBeNull();
    expect(row.address).toBeNull();
  });
});

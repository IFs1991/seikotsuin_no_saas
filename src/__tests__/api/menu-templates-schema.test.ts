import {
  mapMenuTemplateInsertToRow,
  mapMenuTemplateUpdateToRow,
  mapTemplateToMenuInsertRow,
} from '@/app/api/menu-templates/schema';

const ownerClinicId = '00000000-0000-0000-0000-0000000000a1';
const targetClinicId = '00000000-0000-0000-0000-0000000000b1';
const templateId = '00000000-0000-0000-0000-0000000000c1';
const userId = '00000000-0000-0000-0000-000000000001';

describe('menu template schema mapping', () => {
  it('maps parent-owned template insert fields to DB columns', () => {
    const row = mapMenuTemplateInsertToRow(
      {
        owner_clinic_id: ownerClinicId,
        name: '自費整体 60分',
        description: '全身調整',
        category: 'treatment',
        price: 6000,
        durationMinutes: 60,
        isInsuranceApplicable: false,
        isActive: true,
        displayOrder: 10,
        options: [],
      },
      userId
    );

    expect(row).toMatchObject({
      owner_clinic_id: ownerClinicId,
      created_by: userId,
      duration_minutes: 60,
      is_insurance_applicable: false,
      display_order: 10,
    });
  });

  it('omits undefined fields on template update', () => {
    const row = mapMenuTemplateUpdateToRow({
      owner_clinic_id: ownerClinicId,
      id: templateId,
      isActive: false,
    });

    expect(row).toEqual({ is_active: false });
    expect(Object.prototype.hasOwnProperty.call(row, 'description')).toBe(
      false
    );
  });

  it('copies a template into a clinic-owned menu insert row', () => {
    const row = mapTemplateToMenuInsertRow(
      {
        id: templateId,
        owner_clinic_id: ownerClinicId,
        name: '保険施術 30分',
        description: '保険適用の基本施術枠',
        category: 'treatment',
        price: 0,
        duration_minutes: 30,
        is_insurance_applicable: true,
        options: [],
        is_active: true,
        display_order: 1,
      },
      targetClinicId,
      userId
    );

    expect(row).toMatchObject({
      clinic_id: targetClinicId,
      created_by: userId,
      name: '保険施術 30分',
      duration_minutes: 30,
      is_insurance_applicable: true,
      is_active: true,
    });
  });
});

import {
  mapMenuInsertToRow,
  mapMenuRowToApi,
  mapMenuUpdateToRow,
} from '@/app/api/menus/schema';

describe('menus schema mapping', () => {
  it('maps insurance/category fields on insert', () => {
    const row = mapMenuInsertToRow(
      {
        clinic_id: '00000000-0000-0000-0000-0000000000a1',
        name: '自費整体',
        description: '標準自費メニュー',
        category: 'treatment',
        price: 6000,
        durationMinutes: 60,
        isInsuranceApplicable: false,
        isActive: true,
        options: [],
      },
      '00000000-0000-0000-0000-000000000001'
    );

    expect(row).toMatchObject({
      category: 'treatment',
      is_insurance_applicable: false,
      duration_minutes: 60,
    });
  });

  it('omits undefined fields on update', () => {
    const row = mapMenuUpdateToRow({
      clinic_id: '00000000-0000-0000-0000-0000000000a1',
      id: '00000000-0000-0000-0000-0000000000f1',
      isActive: false,
    });

    expect(row).toEqual({ is_active: false });
    expect(Object.prototype.hasOwnProperty.call(row, 'description')).toBe(
      false
    );
  });

  it('maps DB rows to the menu API shape', () => {
    const menu = mapMenuRowToApi({
      id: '00000000-0000-0000-0000-0000000000f1',
      clinic_id: '00000000-0000-0000-0000-0000000000a1',
      name: '保険施術',
      description: null,
      category: 'treatment',
      price: '1500',
      duration_minutes: 30,
      is_insurance_applicable: true,
      is_active: true,
      options: [],
    });

    expect(menu).toMatchObject({
      id: '00000000-0000-0000-0000-0000000000f1',
      clinicId: '00000000-0000-0000-0000-0000000000a1',
      durationMinutes: 30,
      price: 1500,
      isInsuranceApplicable: true,
      isActive: true,
    });
  });
});

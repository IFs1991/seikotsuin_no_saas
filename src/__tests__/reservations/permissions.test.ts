import {
  canWriteReservationsForClinic,
  isCrossClinicReservationView,
} from '@/app/(app)/reservations/permissions';

describe('reservation clinic permissions', () => {
  it('所属院を選択中のスタッフは予約を書き込める', () => {
    expect(
      canWriteReservationsForClinic({
        selectedClinicId: 'clinic-1',
        profileClinicId: 'clinic-1',
        role: 'staff',
      })
    ).toBe(true);
  });

  it('同じ親配下でも別院を選択中なら閲覧専用にする', () => {
    expect(
      canWriteReservationsForClinic({
        selectedClinicId: 'clinic-child-b',
        profileClinicId: 'clinic-child-a',
        role: 'clinic_admin',
      })
    ).toBe(false);
    expect(
      isCrossClinicReservationView({
        selectedClinicId: 'clinic-child-b',
        profileClinicId: 'clinic-child-a',
      })
    ).toBe(true);
  });

  it('未選択またはロール不明では書き込めない', () => {
    expect(
      canWriteReservationsForClinic({
        selectedClinicId: null,
        profileClinicId: 'clinic-1',
        role: 'staff',
      })
    ).toBe(false);
    expect(
      canWriteReservationsForClinic({
        selectedClinicId: 'clinic-1',
        profileClinicId: 'clinic-1',
        role: null,
      })
    ).toBe(false);
  });

  it('manager は所属院と選択院が一致しても予約を書き込めない', () => {
    expect(
      canWriteReservationsForClinic({
        selectedClinicId: 'clinic-1',
        profileClinicId: 'clinic-1',
        role: 'manager',
      })
    ).toBe(false);
  });
});

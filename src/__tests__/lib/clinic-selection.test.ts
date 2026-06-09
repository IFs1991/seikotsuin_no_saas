import { resolveInitialSelectedClinicId } from '@/lib/clinics/selection';

describe('resolveInitialSelectedClinicId', () => {
  it('profile clinic id を最優先する', () => {
    expect(
      resolveInitialSelectedClinicId({
        profileClinicId: 'profile-clinic',
        currentClinicId: 'current-clinic',
        clinics: [{ id: 'profile-clinic' }, { id: 'only-clinic' }],
      })
    ).toBe('profile-clinic');
  });

  it('profile clinic id がない場合は current clinic id を使う', () => {
    expect(
      resolveInitialSelectedClinicId({
        profileClinicId: null,
        currentClinicId: 'current-clinic',
        clinics: [{ id: 'current-clinic' }, { id: 'only-clinic' }],
      })
    ).toBe('current-clinic');
  });

  it('読み込み済み店舗に含まれない profile clinic id は選択しない', () => {
    expect(
      resolveInitialSelectedClinicId({
        profileClinicId: 'parent-clinic',
        currentClinicId: null,
        clinics: [{ id: 'child-1' }, { id: 'child-2' }],
      })
    ).toBeNull();
  });

  it('明示的な clinic id がなく単一店舗だけなら自動選択する', () => {
    expect(
      resolveInitialSelectedClinicId({
        profileClinicId: null,
        currentClinicId: null,
        clinics: [{ id: 'only-clinic' }],
      })
    ).toBe('only-clinic');
  });

  it('明示的な clinic id がなく複数店舗なら未選択にする', () => {
    expect(
      resolveInitialSelectedClinicId({
        profileClinicId: null,
        currentClinicId: null,
        clinics: [{ id: 'clinic-1' }, { id: 'clinic-2' }],
      })
    ).toBeNull();
  });

  it('manager は profile clinic id に fallback しない', () => {
    expect(
      resolveInitialSelectedClinicId({
        role: 'manager',
        profileClinicId: 'profile-clinic',
        currentClinicId: null,
        clinics: [],
      })
    ).toBeNull();
  });

  it('manager は担当店舗が1つだけならその店舗を自動選択する', () => {
    expect(
      resolveInitialSelectedClinicId({
        role: 'manager',
        profileClinicId: 'profile-clinic',
        currentClinicId: null,
        clinics: [{ id: 'assigned-clinic' }],
      })
    ).toBe('assigned-clinic');
  });
});

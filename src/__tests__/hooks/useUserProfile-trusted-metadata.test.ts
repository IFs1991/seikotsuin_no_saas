import {
  resolveTrustedClinicId,
  resolveTrustedRole,
} from '@/hooks/useUserProfile';

describe('useUserProfile trusted metadata fallback', () => {
  it('does not derive role or clinic scope from user-editable metadata', () => {
    const userWithUntrustedMetadata = {
      app_metadata: {},
      user_metadata: {
        role: 'admin',
        user_role: 'admin',
        clinic_id: 'attacker-clinic',
      },
    };

    expect(resolveTrustedRole(userWithUntrustedMetadata)).toBeNull();
    expect(resolveTrustedClinicId(userWithUntrustedMetadata)).toBeNull();
  });

  it('accepts server-controlled app_metadata claims', () => {
    const userWithTrustedMetadata = {
      app_metadata: {
        user_role: 'clinic_admin',
        clinic_id: 'clinic-1',
      },
    };

    expect(resolveTrustedRole(userWithTrustedMetadata)).toBe('clinic_admin');
    expect(resolveTrustedClinicId(userWithTrustedMetadata)).toBe('clinic-1');
  });
});

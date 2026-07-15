import {
  resolveTrustedClinicId,
  resolveTrustedRole,
} from '@/hooks/useUserProfile';

describe('useUserProfile metadata fallback', () => {
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

  it('does not treat stale app_metadata as current role or clinic authority', () => {
    const userWithStaleMetadata = {
      app_metadata: {
        user_role: 'clinic_admin',
        clinic_id: 'clinic-1',
      },
    };

    expect(resolveTrustedRole(userWithStaleMetadata)).toBeNull();
    expect(resolveTrustedClinicId(userWithStaleMetadata)).toBeNull();
  });
});

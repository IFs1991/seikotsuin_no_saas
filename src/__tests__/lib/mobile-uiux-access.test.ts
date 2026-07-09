import {
  evaluateMobileUiuxAccess,
  evaluateMobileUiuxEnvRollout,
  evaluateMobileUiuxPrincipal,
} from '@/lib/mobile-uiux/access';
import type { MobileUiuxFlags } from '@/lib/mobile-uiux/flags';
import type { UserPermissions } from '@/lib/supabase';

const BASE_FLAGS: MobileUiuxFlags = {
  enabled: true,
  useDbEntitlements: false,
  realDataEnabled: true,
  writeEnabled: false,
  reservationWriteEnabled: false,
  dailyReportWriteEnabled: false,
  settingsWriteEnabled: false,
  allowedClinicIds: [],
  allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
};

function buildPermissions(
  role: string,
  clinicScopeIds: string[] = ['clinic-a']
): UserPermissions {
  return {
    role,
    clinic_id: clinicScopeIds[0] ?? null,
    clinic_scope_ids: clinicScopeIds,
  };
}

describe('mobile-uiux access evaluators', () => {
  it.each(['clinic_admin', 'manager', 'therapist', 'staff'])(
    'allows %s with scoped clinic when allowed clinic list is empty',
    role => {
      const response = evaluateMobileUiuxAccess(
        buildPermissions(role),
        BASE_FLAGS
      );

      expect(response).toEqual({
        allowed: true,
        role,
        clinicIds: ['clinic-a'],
      });
    }
  );

  it('denies customer even when allowed clinic list is empty', () => {
    const response = evaluateMobileUiuxPrincipal(
      buildPermissions('customer'),
      BASE_FLAGS
    );

    expect(response).toEqual({
      allowed: false,
      status: 403,
      reason: 'role_denied',
    });
  });

  it('denies admin with empty clinic scope instead of bypassing the scope check', () => {
    const response = evaluateMobileUiuxPrincipal(
      buildPermissions('admin', []),
      BASE_FLAGS
    );

    expect(response).toEqual({
      allowed: false,
      status: 403,
      reason: 'clinic_scope_empty',
    });
  });

  it('applies non-empty allowlist as an additional clinic filter', () => {
    const principal = evaluateMobileUiuxPrincipal(
      buildPermissions('therapist', ['clinic-a', 'clinic-b']),
      BASE_FLAGS
    );

    expect(principal.allowed).toBe(true);
    if (principal.allowed === false) {
      return;
    }

    expect(
      evaluateMobileUiuxEnvRollout(principal, {
        ...BASE_FLAGS,
        allowedClinicIds: ['clinic-b', 'clinic-c'],
      })
    ).toEqual({
      allowed: true,
      role: 'therapist',
      clinicIds: ['clinic-b'],
    });
  });

  it('denies when non-empty allowlist has no clinic intersection', () => {
    const response = evaluateMobileUiuxAccess(buildPermissions('staff'), {
      ...BASE_FLAGS,
      allowedClinicIds: ['clinic-b'],
    });

    expect(response).toEqual({
      allowed: false,
      status: 403,
      reason: 'clinic_denied',
    });
  });
});

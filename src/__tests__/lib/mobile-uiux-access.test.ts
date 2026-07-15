import {
  evaluateMobileUiuxAccess,
  evaluateMobileUiuxEnvRollout,
  evaluateMobileUiuxPrincipal,
  resolveMobileUiuxPrincipal,
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

function createAssignmentsAdminClient(clinicIds: string[]) {
  const result = Promise.resolve({
    data: clinicIds.map(clinicId => ({ clinic_id: clinicId })),
    error: null,
  });
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => result),
  };

  return {
    builder,
    from: jest.fn((tableName: string) => {
      if (tableName !== 'manager_clinic_assignments') {
        throw new Error(`Unexpected table: ${tableName}`);
      }
      return builder;
    }),
  };
}

describe('resolveMobileUiuxPrincipal (manager scope)', () => {
  it('uses the canonical manager scope and never re-expands assignments', async () => {
    const adminClient = createAssignmentsAdminClient([
      'clinic-m1',
      'clinic-m2',
    ]);

    const decision = await resolveMobileUiuxPrincipal({
      userId: 'manager-1',
      permissions: buildPermissions('manager', ['clinic-m2']),
      flags: BASE_FLAGS,
      adminClient,
    });

    expect(decision).toEqual({
      allowed: true,
      role: 'manager',
      clinicIds: ['clinic-m2'],
    });
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it('denies an explicit empty canonical scope even if DB assignments exist', async () => {
    const adminClient = createAssignmentsAdminClient(['clinic-a']);

    const decision = await resolveMobileUiuxPrincipal({
      userId: 'manager-1',
      permissions: buildPermissions('manager', []),
      flags: BASE_FLAGS,
      adminClient,
    });

    expect(decision).toEqual({
      allowed: false,
      status: 403,
      reason: 'clinic_scope_empty',
    });
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it('denies manager by role before querying assignments when excluded from allowed roles', async () => {
    const adminClient = createAssignmentsAdminClient(['clinic-m1']);

    const decision = await resolveMobileUiuxPrincipal({
      userId: 'manager-1',
      permissions: buildPermissions('manager'),
      flags: { ...BASE_FLAGS, allowedRoles: ['admin', 'clinic_admin'] },
      adminClient,
    });

    expect(decision).toEqual({
      allowed: false,
      status: 403,
      reason: 'role_denied',
    });
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it('keeps permissions-based scope for non-manager roles without touching assignments', async () => {
    const adminClient = createAssignmentsAdminClient(['clinic-x']);

    const decision = await resolveMobileUiuxPrincipal({
      userId: 'staff-1',
      permissions: buildPermissions('staff', ['clinic-a']),
      flags: BASE_FLAGS,
      adminClient,
    });

    expect(decision).toEqual({
      allowed: true,
      role: 'staff',
      clinicIds: ['clinic-a'],
    });
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it('does not touch a secondary assignment client after canonical resolution', async () => {
    const adminClient = {
      from: jest.fn(() => {
        throw new Error('db down');
      }),
    };

    await expect(
      resolveMobileUiuxPrincipal({
        userId: 'manager-1',
        permissions: buildPermissions('manager', ['clinic-a']),
        flags: BASE_FLAGS,
        adminClient,
      })
    ).resolves.toEqual({
      allowed: true,
      role: 'manager',
      clinicIds: ['clinic-a'],
    });
    expect(adminClient.from).not.toHaveBeenCalled();
  });
});

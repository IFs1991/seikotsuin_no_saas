import {
  ScopeAccessError,
  assertClinicInEffectiveScope,
  resolveEffectiveClinicScope,
  resolveManagerAssignedClinicIds,
  type EffectiveClinicScope,
} from '@/lib/auth/manager-scope';
import type { SupabaseServerClient, UserPermissions } from '@/lib/supabase';

type AssignmentRow = {
  clinic_id: string;
};

type AssignmentResult = {
  data: AssignmentRow[] | null;
  error: Error | null;
};

function createAssignmentClient(result: AssignmentResult) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockResolvedValue(result),
  };
  const client = {
    from: jest.fn(() => query),
  } as Pick<SupabaseServerClient, 'from'>;

  return { client, query };
}

describe('resolveManagerAssignedClinicIds', () => {
  it('queries active manager assignments and returns unique clinic ids', async () => {
    const { client, query } = createAssignmentClient({
      data: [
        { clinic_id: 'clinic-a' },
        { clinic_id: 'clinic-b' },
        { clinic_id: 'clinic-a' },
      ],
      error: null,
    });

    await expect(
      resolveManagerAssignedClinicIds(client, 'manager-1')
    ).resolves.toEqual(['clinic-a', 'clinic-b']);

    expect(client.from).toHaveBeenCalledWith('manager_clinic_assignments');
    expect(query.select).toHaveBeenCalledWith('clinic_id');
    expect(query.eq).toHaveBeenCalledWith('manager_user_id', 'manager-1');
    expect(query.is).toHaveBeenCalledWith('revoked_at', null);
  });

  it('throws DB errors instead of falling back to permission scope', async () => {
    const dbError = new Error('assignment query failed');
    const { client } = createAssignmentClient({
      data: null,
      error: dbError,
    });

    await expect(
      resolveManagerAssignedClinicIds(client, 'manager-1')
    ).rejects.toBe(dbError);
  });
});

describe('resolveEffectiveClinicScope', () => {
  it('uses manager assignments even when clinic_id and JWT scope are stale', async () => {
    const { client } = createAssignmentClient({
      data: [{ clinic_id: 'assigned-clinic' }],
      error: null,
    });
    const permissions: UserPermissions = {
      role: 'manager',
      clinic_id: 'primary-clinic',
      clinic_scope_ids: ['jwt-clinic'],
    };

    await expect(
      resolveEffectiveClinicScope({
        adminClient: client,
        userId: 'manager-1',
        permissions,
      })
    ).resolves.toEqual({
      source: 'manager_assignments',
      clinicIds: ['assigned-clinic'],
    });
  });

  it('returns an empty manager scope when no active assignments exist', async () => {
    const { client } = createAssignmentClient({ data: [], error: null });
    const permissions: UserPermissions = {
      role: 'manager',
      clinic_id: 'primary-clinic',
      clinic_scope_ids: ['jwt-clinic'],
    };

    await expect(
      resolveEffectiveClinicScope({
        adminClient: client,
        userId: 'manager-1',
        permissions,
      })
    ).resolves.toEqual({
      source: 'manager_assignments',
      clinicIds: [],
    });
  });

  it('preserves clinic_scope_ids behavior for non-manager roles', async () => {
    const { client } = createAssignmentClient({ data: [], error: null });
    const permissions: UserPermissions = {
      role: 'clinic_admin',
      clinic_id: 'primary-clinic',
      clinic_scope_ids: ['clinic-a', 'clinic-b'],
    };

    await expect(
      resolveEffectiveClinicScope({
        adminClient: client,
        userId: 'clinic-admin-1',
        permissions,
      })
    ).resolves.toEqual({
      source: 'clinic_scope_ids',
      clinicIds: ['clinic-a', 'clinic-b'],
    });
  });

  it('preserves clinic_id fallback for non-manager roles', async () => {
    const { client } = createAssignmentClient({ data: [], error: null });
    const permissions: UserPermissions = {
      role: 'staff',
      clinic_id: 'primary-clinic',
    };

    await expect(
      resolveEffectiveClinicScope({
        adminClient: client,
        userId: 'staff-1',
        permissions,
      })
    ).resolves.toEqual({
      source: 'clinic_id',
      clinicIds: ['primary-clinic'],
    });
  });
});

describe('assertClinicInEffectiveScope', () => {
  const scope: EffectiveClinicScope = {
    source: 'manager_assignments',
    clinicIds: ['clinic-a'],
  };

  it('allows clinics inside the effective scope', () => {
    expect(() => assertClinicInEffectiveScope(scope, 'clinic-a')).not.toThrow();
  });

  it('throws ScopeAccessError for clinics outside the effective scope', () => {
    expect(() => assertClinicInEffectiveScope(scope, 'clinic-b')).toThrow(
      ScopeAccessError
    );
  });
});

import type { UserPermissions } from '@/lib/supabase';
import {
  createScopedAdminContext,
  createPublicClinicContext,
  ScopeNotConfiguredError,
  ScopeAccessError,
  ClinicNotFoundError,
  ClinicInactiveError,
} from '@/lib/supabase/scoped-admin';

// Shared mock admin client used via DI
const mockFrom = jest.fn();
const mockAdminClient = { from: mockFrom } as any;

// ──────────────────────────────────────────────
// createScopedAdminContext (authenticated admin APIs)
// ──────────────────────────────────────────────
describe('createScopedAdminContext', () => {
  it('returns context with resolved scopedClinicIds from clinic_scope_ids', () => {
    const permissions: UserPermissions = {
      role: 'admin',
      clinic_id: 'clinic-1',
      clinic_scope_ids: ['clinic-2', 'clinic-3'],
    };

    const ctx = createScopedAdminContext(permissions, mockAdminClient);

    expect(ctx.client).toBe(mockAdminClient);
    expect(ctx.scopedClinicIds).toEqual(['clinic-2', 'clinic-3']);
  });

  it('falls back to clinic_id when clinic_scope_ids is absent', () => {
    const permissions: UserPermissions = {
      role: 'staff',
      clinic_id: 'clinic-1',
    };

    const ctx = createScopedAdminContext(permissions, mockAdminClient);

    expect(ctx.scopedClinicIds).toEqual(['clinic-1']);
  });

  it('throws ScopeNotConfiguredError when no scope is available', () => {
    const permissions: UserPermissions = {
      role: 'staff',
      clinic_id: null,
      clinic_scope_ids: [],
    };

    expect(() => createScopedAdminContext(permissions, mockAdminClient)).toThrow(
      ScopeNotConfiguredError
    );
  });

  describe('assertClinicInScope', () => {
    it('does not throw for a clinic within scope', () => {
      const permissions: UserPermissions = {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      };

      const ctx = createScopedAdminContext(permissions, mockAdminClient);

      expect(() => ctx.assertClinicInScope('clinic-1')).not.toThrow();
      expect(() => ctx.assertClinicInScope('clinic-2')).not.toThrow();
    });

    it('throws ScopeAccessError for a clinic outside scope', () => {
      const permissions: UserPermissions = {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      };

      const ctx = createScopedAdminContext(permissions, mockAdminClient);

      expect(() => ctx.assertClinicInScope('clinic-999')).toThrow(
        ScopeAccessError
      );
    });

    it('rejects scope-absent clinic_id even with clinic_scope_ids priority', () => {
      const permissions: UserPermissions = {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-2', 'clinic-3'],
      };

      const ctx = createScopedAdminContext(permissions, mockAdminClient);

      // clinic-1 is the clinic_id but NOT in clinic_scope_ids
      expect(() => ctx.assertClinicInScope('clinic-1')).toThrow(
        ScopeAccessError
      );
    });
  });
});

// ──────────────────────────────────────────────
// createPublicClinicContext (unauthenticated public APIs)
// ──────────────────────────────────────────────
describe('createPublicClinicContext', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  function setupClinicQuery(result: { data: unknown; error: unknown }) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(result),
    };
    mockFrom.mockReturnValue(chain);
    return chain;
  }

  it('returns context with validated clinic data', async () => {
    const clinic = { id: 'clinic-1', name: 'Test Clinic', is_active: true };
    setupClinicQuery({ data: clinic, error: null });

    const ctx = await createPublicClinicContext('clinic-1', mockAdminClient);

    expect(ctx.client).toBe(mockAdminClient);
    expect(ctx.clinicId).toBe('clinic-1');
    expect(ctx.clinic).toEqual(clinic);
    expect(mockFrom).toHaveBeenCalledWith('clinics');
  });

  it('throws ClinicNotFoundError when clinic does not exist', async () => {
    setupClinicQuery({ data: null, error: { code: 'PGRST116' } });

    await expect(
      createPublicClinicContext('nonexistent', mockAdminClient)
    ).rejects.toThrow(ClinicNotFoundError);
  });

  it('throws ClinicNotFoundError on database error', async () => {
    setupClinicQuery({ data: null, error: { message: 'connection error' } });

    await expect(
      createPublicClinicContext('clinic-1', mockAdminClient)
    ).rejects.toThrow(ClinicNotFoundError);
  });

  it('throws ClinicInactiveError when clinic is not active', async () => {
    const clinic = {
      id: 'clinic-1',
      name: 'Inactive Clinic',
      is_active: false,
    };
    setupClinicQuery({ data: clinic, error: null });

    await expect(
      createPublicClinicContext('clinic-1', mockAdminClient)
    ).rejects.toThrow(ClinicInactiveError);
  });
});

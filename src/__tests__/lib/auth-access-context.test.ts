import {
  assertActiveAccount,
  buildUserAuthAccessContext,
  resolvePermissionRecord,
} from '@/lib/supabase/auth-context';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

describe('resolvePermissionRecord', () => {
  it('ignores stale JWT role and clinic_id when DB permissions are found', () => {
    const permissions = resolvePermissionRecord(
      {
        role: 'admin',
        clinic_id: null,
      },
      {
        app_metadata: {
          user_role: 'staff',
          clinic_id: 'clinic-1',
        },
      }
    );

    expect(permissions).toEqual({
      role: 'admin',
      clinic_id: null,
    });
  });

  it('does not restore authority from stale app_metadata when user_permissions is missing', () => {
    const permissions = resolvePermissionRecord(null, {
      app_metadata: {
        user_role: 'clinic_manager',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      },
    });

    expect(permissions).toBeNull();
  });
});

describe('buildUserAuthAccessContext', () => {
  it('removes all authority when the profile is inactive', () => {
    const accessContext = buildUserAuthAccessContext(
      {
        role: 'clinic_manager',
        clinic_id: 'clinic-1',
      },
      {
        is_active: false,
      }
    );

    expect(accessContext.permissions).toBeNull();
    expect(accessContext.role).toBeNull();
    expect(accessContext.normalizedRole).toBeNull();
    expect(accessContext.clinicId).toBeNull();
    expect(accessContext.isAdmin).toBe(false);
    expect(accessContext.isActive).toBe(false);
  });

  it('fails closed when profile activity status is missing', () => {
    const accessContext = buildUserAuthAccessContext({
      role: 'admin',
      clinic_id: null,
    });

    expect(accessContext.isActive).toBe(false);
  });

  it('fails closed when profile activity status is null', () => {
    const accessContext = buildUserAuthAccessContext(
      {
        role: 'admin',
        clinic_id: null,
      },
      { is_active: null }
    );

    expect(accessContext.isActive).toBe(false);
  });

  it('removes role and clinic authority for an explicit empty canonical scope', () => {
    const accessContext = buildUserAuthAccessContext(
      {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: [],
      },
      { is_active: true }
    );

    expect(accessContext.permissions).toBeNull();
    expect(accessContext.role).toBeNull();
    expect(accessContext.clinicId).toBeNull();
    expect(accessContext.isActive).toBe(true);
    expect(accessContext.isAdmin).toBe(false);
  });

  it('never exposes a primary clinic outside the canonical JWT intersection', () => {
    const accessContext = buildUserAuthAccessContext(
      {
        role: 'admin',
        clinic_id: 'clinic-primary',
        clinic_scope_ids: ['clinic-subset'],
      },
      { is_active: true }
    );

    expect(accessContext.permissions?.clinic_scope_ids).toEqual([
      'clinic-subset',
    ]);
    expect(accessContext.clinicId).toBe('clinic-subset');
    expect(accessContext.isActive).toBe(true);
  });
});

describe('assertActiveAccount', () => {
  it('throws the stable ACCOUNT_INACTIVE error for inactive contexts', () => {
    expect(() => assertActiveAccount({ isActive: false })).toThrow(
      expect.objectContaining<AppError>({
        code: ERROR_CODES.ACCOUNT_INACTIVE,
        statusCode: 403,
      })
    );
  });

  it('allows explicitly active contexts', () => {
    expect(() => assertActiveAccount({ isActive: true })).not.toThrow();
  });
});

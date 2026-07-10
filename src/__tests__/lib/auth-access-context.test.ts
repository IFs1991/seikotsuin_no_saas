import {
  assertActiveAccount,
  buildUserAuthAccessContext,
  resolvePermissionRecord,
} from '@/lib/supabase/auth-context';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

describe('resolvePermissionRecord', () => {
  it('prefers user_permissions over app_metadata', () => {
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

  it('falls back to app_metadata when user_permissions is missing', () => {
    const permissions = resolvePermissionRecord(null, {
      app_metadata: {
        user_role: 'clinic_manager',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      },
    });

    expect(permissions).toEqual({
      role: 'clinic_manager',
      clinic_id: 'clinic-1',
      clinic_scope_ids: ['clinic-1', 'clinic-2'],
    });
  });
});

describe('buildUserAuthAccessContext', () => {
  it('normalizes deprecated roles and keeps profile activity status', () => {
    const accessContext = buildUserAuthAccessContext(
      {
        role: 'clinic_manager',
        clinic_id: 'clinic-1',
      },
      {
        is_active: false,
      }
    );

    expect(accessContext.role).toBe('clinic_manager');
    expect(accessContext.normalizedRole).toBe('clinic_admin');
    expect(accessContext.clinicId).toBe('clinic-1');
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

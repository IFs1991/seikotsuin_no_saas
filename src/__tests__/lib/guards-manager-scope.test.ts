import { AppError, ERROR_CODES } from '@/lib/error-handler';

const createClientMock = jest.fn();
const createAdminClientMock = jest.fn();
const getCurrentUserMock = jest.fn();
const getUserAccessContextMock = jest.fn();
const canAccessClinicScopeMock = jest.fn();
const logUnauthorizedAccessMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createClient: () => createClientMock(),
  createAdminClient: () => createAdminClientMock(),
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  getUserAccessContext: (...args: unknown[]) =>
    getUserAccessContextMock(...args),
  canAccessClinicScope: (...args: unknown[]) => canAccessClinicScopeMock(...args),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logUnauthorizedAccess: (...args: unknown[]) =>
      logUnauthorizedAccessMock(...args),
  },
  getRequestInfo: () => ({ ipAddress: '127.0.0.1', userAgent: 'jest' }),
}));

const { ensureClinicAccess } =
  jest.requireActual<typeof import('@/lib/supabase/guards')>(
    '@/lib/supabase/guards'
  );

type AssignmentRow = {
  clinic_id: string;
};

function createAssignmentAdminClient(rows: AssignmentRow[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockResolvedValue({ data: rows, error: null }),
  };
  const adminClient = {
    from: jest.fn(() => query),
  };

  return { adminClient, query };
}

describe('ensureClinicAccess manager assignment scope', () => {
  const request = new Request('http://localhost/api/test');

  beforeEach(() => {
    createClientMock.mockReturnValue({});
    createAdminClientMock.mockReset();
    getCurrentUserMock.mockReset();
    getUserAccessContextMock.mockReset();
    canAccessClinicScopeMock.mockReset();
    logUnauthorizedAccessMock.mockClear();
  });

  it('allows a manager to access an actively assigned clinic', async () => {
    const { adminClient, query } = createAssignmentAdminClient([
      { clinic_id: 'assigned-clinic' },
    ]);
    createAdminClientMock.mockReturnValue(adminClient);
    getCurrentUserMock.mockResolvedValue({
      id: 'manager-1',
      email: 'manager@example.com',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'manager',
        clinic_id: 'primary-clinic',
        clinic_scope_ids: ['jwt-clinic'],
      },
      normalizedRole: 'manager',
      clinicId: 'primary-clinic',
      isActive: true,
      isAdmin: false,
    });
    canAccessClinicScopeMock.mockReturnValue(false);

    const result = await ensureClinicAccess(
      request,
      '/api/test',
      'assigned-clinic'
    );

    expect(result.user.id).toBe('manager-1');
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(adminClient.from).toHaveBeenCalledWith(
      'manager_clinic_assignments'
    );
    expect(query.eq).toHaveBeenCalledWith('manager_user_id', 'manager-1');
    expect(query.is).toHaveBeenCalledWith('revoked_at', null);
    expect(canAccessClinicScopeMock).not.toHaveBeenCalled();
    expect(logUnauthorizedAccessMock).not.toHaveBeenCalled();
  });

  it('denies a manager with only clinic_id or JWT scope fallback', async () => {
    const { adminClient } = createAssignmentAdminClient([]);
    createAdminClientMock.mockReturnValue(adminClient);
    getCurrentUserMock.mockResolvedValue({
      id: 'manager-1',
      email: 'manager@example.com',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'manager',
        clinic_id: 'requested-clinic',
        clinic_scope_ids: ['requested-clinic'],
      },
      normalizedRole: 'manager',
      clinicId: 'requested-clinic',
      isActive: true,
      isAdmin: false,
    });
    canAccessClinicScopeMock.mockReturnValue(true);

    await expect(
      ensureClinicAccess(request, '/api/test', 'requested-clinic')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });

    expect(canAccessClinicScopeMock).not.toHaveBeenCalled();
    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test?clinic_id=requested-clinic',
      'Forbidden clinic access (parent-scope violation)',
      'manager-1',
      'manager@example.com',
      '127.0.0.1',
      'jest'
    );
  });

  it('returns 403 when manager assignment scope rejects the requested clinic', async () => {
    const { adminClient } = createAssignmentAdminClient([
      { clinic_id: 'assigned-clinic' },
    ]);
    createAdminClientMock.mockReturnValue(adminClient);
    getCurrentUserMock.mockResolvedValue({
      id: 'manager-1',
      email: 'manager@example.com',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'manager',
        clinic_id: 'primary-clinic',
        clinic_scope_ids: ['requested-clinic'],
      },
      normalizedRole: 'manager',
      clinicId: 'primary-clinic',
      isActive: true,
      isAdmin: false,
    });
    canAccessClinicScopeMock.mockReturnValue(true);

    await expect(
      ensureClinicAccess(request, '/api/test', 'requested-clinic')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });

    expect(canAccessClinicScopeMock).not.toHaveBeenCalled();
    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test?clinic_id=requested-clinic',
      'Forbidden clinic access (parent-scope violation)',
      'manager-1',
      'manager@example.com',
      '127.0.0.1',
      'jest'
    );
  });

  it('keeps existing canAccessClinicScope behavior for non-manager roles', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'clinic-admin-1',
      email: 'clinic-admin@example.com',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'primary-clinic',
        clinic_scope_ids: ['requested-clinic'],
      },
      normalizedRole: 'clinic_admin',
      clinicId: 'primary-clinic',
      isActive: true,
      isAdmin: false,
    });
    canAccessClinicScopeMock.mockReturnValue(true);

    await expect(
      ensureClinicAccess(request, '/api/test', 'requested-clinic')
    ).resolves.toMatchObject({
      user: { id: 'clinic-admin-1' },
    });

    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(canAccessClinicScopeMock).toHaveBeenCalledWith(
      {
        role: 'clinic_admin',
        clinic_id: 'primary-clinic',
        clinic_scope_ids: ['requested-clinic'],
      },
      'requested-clinic'
    );
  });
});

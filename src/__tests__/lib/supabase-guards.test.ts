import { AppError, ERROR_CODES } from '@/lib/error-handler';

const createClientMock = jest.fn();
const getCurrentUserMock = jest.fn();
const getUserAccessContextMock = jest.fn();
const canAccessClinicScopeMock = jest.fn();
const logUnauthorizedAccessMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createClient: () => createClientMock(),
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  getUserAccessContext: (...args: unknown[]) =>
    getUserAccessContextMock(...args),
  canAccessClinicScope: (...args: unknown[]) =>
    canAccessClinicScopeMock(...args),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logUnauthorizedAccess: (...args: unknown[]) =>
      logUnauthorizedAccessMock(...args),
  },
  getRequestInfo: () => ({ ipAddress: '127.0.0.1', userAgent: 'jest' }),
}));

const { ensureClinicAccess } = jest.requireActual('@/lib/supabase/guards');

beforeEach(() => {
  createClientMock.mockReturnValue({});
  getCurrentUserMock.mockReset();
  getUserAccessContextMock.mockReset();
  canAccessClinicScopeMock.mockReset();
  logUnauthorizedAccessMock.mockClear();
});

describe('ensureClinicAccess', () => {
  const request = new Request('http://localhost/api/test');

  it('throws 401 when user is not authenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await expect(
      ensureClinicAccess(request, '/api/test', 'clinic-1')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });

    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test',
      'Authentication required',
      null,
      null,
      '127.0.0.1',
      'jest'
    );
  });

  it('throws 403 when permissions are missing', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1', email: 'user@test' });
    getUserAccessContextMock.mockResolvedValue({
      permissions: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    await expect(
      ensureClinicAccess(request, '/api/test', 'clinic-1')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });
    expect(getUserAccessContextMock).toHaveBeenCalledWith(
      'user-1',
      expect.any(Object),
      {
        user: { id: 'user-1', email: 'user@test' },
      }
    );

    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test',
      'Permissions not found',
      'user-1',
      'user@test',
      '127.0.0.1',
      'jest'
    );
  });

  it('throws ACCOUNT_INACTIVE before evaluating permissions', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1', email: 'user@test' });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-1',
      },
      normalizedRole: 'admin',
      clinicId: 'clinic-1',
      isActive: false,
      isAdmin: true,
    });

    await expect(
      ensureClinicAccess(request, '/api/test', 'clinic-1')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.ACCOUNT_INACTIVE,
      statusCode: 403,
    });

    expect(canAccessClinicScopeMock).not.toHaveBeenCalled();
    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test',
      'Account inactive or profile status unavailable',
      'user-1',
      'user@test',
      '127.0.0.1',
      'jest'
    );
  });

  it('throws 403 when clinic does not match and role is not privileged', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1', email: 'user@test' });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-allow',
      },
      normalizedRole: 'staff',
      clinicId: 'clinic-allow',
      isActive: true,
      isAdmin: false,
    });
    canAccessClinicScopeMock.mockReturnValue(false);

    await expect(
      ensureClinicAccess(request, '/api/test', 'clinic-deny')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });

    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test?clinic_id=clinic-deny',
      'Forbidden clinic access (parent-scope violation)',
      'user-1',
      'user@test',
      '127.0.0.1',
      'jest'
    );
  });

  it('allows parent-scoped access for privileged roles', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-a',
        clinic_scope_ids: ['clinic-b'],
      },
      normalizedRole: 'admin',
      clinicId: 'clinic-a',
      isActive: true,
      isAdmin: true,
    });
    canAccessClinicScopeMock.mockReturnValue(true);

    const result = await ensureClinicAccess(request, '/api/test', 'clinic-b');

    expect(result.user).toEqual({ id: 'admin-1', email: 'admin@test' });
    expect(result.permissions).toEqual({
      role: 'admin',
      clinic_id: 'clinic-a',
      clinic_scope_ids: ['clinic-b'],
    });
    expect(logUnauthorizedAccessMock).not.toHaveBeenCalled();
  });
});

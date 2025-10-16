import { AppError, ERROR_CODES } from '@/lib/error-handler';

const createClientMock = jest.fn();
const getCurrentUserMock = jest.fn();
const getUserPermissionsMock = jest.fn();
const logUnauthorizedAccessMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createClient: () => createClientMock(),
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  getUserPermissions: (...args: unknown[]) => getUserPermissionsMock(...args),
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
  getUserPermissionsMock.mockReset();
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
    getUserPermissionsMock.mockResolvedValue(null);

    await expect(
      ensureClinicAccess(request, '/api/test', 'clinic-1')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });

    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test',
      'Permissions not found',
      'user-1',
      'user@test',
      '127.0.0.1',
      'jest'
    );
  });

  it('throws 403 when clinic does not match and role is not privileged', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1', email: 'user@test' });
    getUserPermissionsMock.mockResolvedValue({
      role: 'staff',
      clinic_id: 'clinic-allow',
    });

    await expect(
      ensureClinicAccess(request, '/api/test', 'clinic-deny')
    ).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });

    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/api/test?clinic_id=clinic-deny',
      'Forbidden clinic access',
      'user-1',
      'user@test',
      '127.0.0.1',
      'jest'
    );
  });

  it('allows privileged roles to bypass clinic checks', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test',
    });
    getUserPermissionsMock.mockResolvedValue({
      role: 'admin',
      clinic_id: 'clinic-a',
    });

    const result = await ensureClinicAccess(request, '/api/test', 'clinic-b');

    expect(result.user).toEqual({ id: 'admin-1', email: 'admin@test' });
    expect(result.permissions).toEqual({
      role: 'admin',
      clinic_id: 'clinic-a',
    });
    expect(logUnauthorizedAccessMock).not.toHaveBeenCalled();
  });
});

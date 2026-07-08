const createClientMock = jest.fn();
const getCurrentUserMock = jest.fn();
const getUserAccessContextMock = jest.fn();
const createAdminClientMock = jest.fn();
const logUnauthorizedAccessMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createClient: () => createClientMock(),
  createAdminClient: () => createAdminClientMock(),
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  getUserAccessContext: (...args: unknown[]) =>
    getUserAccessContextMock(...args),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logUnauthorizedAccess: (...args: unknown[]) =>
      logUnauthorizedAccessMock(...args),
  },
  getRequestInfo: () => ({ ipAddress: '127.0.0.1', userAgent: 'jest' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

const { checkMobileUiuxAccess } = jest.requireActual<
  typeof import('@/lib/mobile-uiux/access')
>('@/lib/mobile-uiux/access');

const originalEnv = process.env;

describe('checkMobileUiuxAccess', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: 'clinic-b',
      MOBILE_UIUX_ALLOWED_ROLES: 'admin,clinic_admin,manager,therapist,staff',
    };
    createClientMock.mockReturnValue({ client: 'supabase' });
    createAdminClientMock.mockReturnValue({ from: jest.fn() });
    getCurrentUserMock.mockResolvedValue({
      id: 'clinic-admin-1',
      email: 'clinic-admin@example.com',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'clinic-a',
        clinic_scope_ids: ['clinic-a'],
      },
      role: 'clinic_admin',
      normalizedRole: 'clinic_admin',
      clinicId: 'clinic-a',
      isActive: true,
      isAdmin: true,
    });
    logUnauthorizedAccessMock.mockClear();
    loggerWarnMock.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('logs clinic_admin denial reason with role, scope, allowlist, and flag dimensions', async () => {
    const response = await checkMobileUiuxAccess(
      new Request('http://localhost/mobile-uiux/screens/home'),
      'home'
    );

    expect(response).toMatchObject({
      allowed: false,
      status: 403,
      reasonCode: 'clinic_scope_not_allowed',
    });

    const expectedDetails = expect.objectContaining({
      reasonCode: 'clinic_scope_not_allowed',
      role: 'clinic_admin',
      scopedClinicCount: 1,
      allowedClinicCount: 1,
      featureFlagEnabled: true,
      resource: 'home',
      status: 403,
    });

    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Mobile UIUX access denied',
      expectedDetails
    );
    expect(logUnauthorizedAccessMock).toHaveBeenCalledWith(
      '/mobile-uiux/screens/home',
      'clinic_scope_not_allowed',
      'clinic-admin-1',
      'clinic-admin@example.com',
      '127.0.0.1',
      'jest',
      expectedDetails
    );
  });

  it('allows clinic_admin when its scoped clinic is allowlisted', async () => {
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-a';

    const response = await checkMobileUiuxAccess(
      new Request('http://localhost/mobile-uiux/screens/home'),
      'home'
    );

    expect(response).toEqual({
      allowed: true,
      role: 'clinic_admin',
      scopedClinicCount: 1,
      allowedClinicCount: 1,
      featureFlagEnabled: true,
    });
    expect(logUnauthorizedAccessMock).not.toHaveBeenCalled();
  });
});

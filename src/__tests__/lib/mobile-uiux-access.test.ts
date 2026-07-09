const createClientMock = jest.fn();
const getCurrentUserMock = jest.fn();
const getUserAccessContextMock = jest.fn();
const createAdminClientMock = jest.fn();
const logUnauthorizedAccessMock = jest.fn();
const loggerWarnMock = jest.fn();
const resolveEffectiveClinicScopeMock = jest.fn();

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

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveEffectiveClinicScope: (...args: unknown[]) =>
    resolveEffectiveClinicScopeMock(...args),
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
    resolveEffectiveClinicScopeMock.mockResolvedValue({
      source: 'manager_assignments',
      clinicIds: ['clinic-a'],
    });
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

  it.each(['clinic_admin', 'manager', 'therapist', 'staff'])(
    'allows %s with scoped clinic when allowed clinic list is empty',
    async role => {
      process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = '';
      getUserAccessContextMock.mockResolvedValue({
        permissions: {
          role,
          clinic_id: 'clinic-a',
          clinic_scope_ids: ['clinic-a'],
        },
        role,
        normalizedRole: role,
        clinicId: 'clinic-a',
        isActive: true,
        isAdmin: role === 'clinic_admin',
      });

      const response = await checkMobileUiuxAccess(
        new Request('http://localhost/mobile-uiux/screens/reservations'),
        'reservations'
      );

      expect(response).toEqual({
        allowed: true,
        role,
        scopedClinicCount: 1,
        allowedClinicCount: 0,
        featureFlagEnabled: true,
      });
      expect(logUnauthorizedAccessMock).not.toHaveBeenCalled();
    }
  );

  it('denies customer even when allowed clinic list is empty', async () => {
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = '';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'customer',
        clinic_id: 'clinic-a',
        clinic_scope_ids: ['clinic-a'],
      },
      role: 'customer',
      normalizedRole: 'customer',
      clinicId: 'clinic-a',
      isActive: true,
      isAdmin: false,
    });

    const response = await checkMobileUiuxAccess(
      new Request('http://localhost/mobile-uiux/screens/reservations'),
      'reservations'
    );

    expect(response).toMatchObject({
      allowed: false,
      status: 403,
      reasonCode: 'role_not_allowed',
    });
  });

  it('denies admin with empty clinic scope instead of bypassing the scope check', async () => {
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = '';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: null,
      isActive: true,
      isAdmin: true,
    });

    const response = await checkMobileUiuxAccess(
      new Request('http://localhost/mobile-uiux/screens/home'),
      'home'
    );

    expect(response).toMatchObject({
      allowed: false,
      status: 403,
      reasonCode: 'clinic_scope_missing',
    });
  });

  it('denies therapist access to home screen even with valid clinic scope', async () => {
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = '';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'therapist',
        clinic_id: 'clinic-a',
        clinic_scope_ids: ['clinic-a'],
      },
      role: 'therapist',
      normalizedRole: 'therapist',
      clinicId: 'clinic-a',
      isActive: true,
      isAdmin: false,
    });

    const response = await checkMobileUiuxAccess(
      new Request('http://localhost/mobile-uiux/screens/home'),
      'home'
    );

    expect(response).toMatchObject({
      allowed: false,
      status: 403,
      reasonCode: 'screen_not_allowed',
    });
  });
});

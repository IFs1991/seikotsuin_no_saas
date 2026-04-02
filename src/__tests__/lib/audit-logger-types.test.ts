const insertMock = jest.fn();
const fromMock = jest.fn(() => ({
  insert: insertMock,
}));
const loggerErrorMock = jest.fn();
const loggerWarnMock = jest.fn();

type AuditLoggerModule = typeof import('@/lib/audit-logger');

const {
  AuditEventType,
  AuditLogger,
  resetAuditLoggerDependencies,
  setAuditLoggerDependencies,
} = jest.requireActual('@/lib/audit-logger') as AuditLoggerModule;

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  fromMock.mockClear();
  loggerErrorMock.mockClear();
  loggerWarnMock.mockClear();
  setAuditLoggerDependencies({
    createAdminClient: () =>
      ({
        from: fromMock,
      }) as any,
    createLogger: () =>
      ({
        error: loggerErrorMock,
        warn: loggerWarnMock,
      }) as any,
  });
});

afterEach(() => {
  resetAuditLoggerDependencies();
});

describe('AuditLogger - Type Safety Tests', () => {
  it('should handle optional clinic_id correctly', async () => {
    await expect(
      AuditLogger.logDataDelete(
        'test-user-id',
        'test@example.com',
        'test_table',
        'test-target-id',
        undefined,
        undefined,
        { action: 'test' }
      )
    ).resolves.toBeUndefined();

    expect(fromMock).toHaveBeenCalledWith('audit_logs');
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        event_type: AuditEventType.DATA_DELETE,
        user_id: 'test-user-id',
        user_email: 'test@example.com',
        target_table: 'test_table',
        target_id: 'test-target-id',
        details: { deleted_data: { action: 'test' } },
        success: true,
      }),
    ]);
  });

  it('should handle optional target_id correctly', async () => {
    await expect(
      AuditLogger.logAdminAction(
        'test-user-id',
        'test@example.com',
        'test-action',
        undefined,
        undefined,
        undefined
      )
    ).resolves.toBeUndefined();
  });

  it('should handle optional user data for unauthorized access', async () => {
    await expect(
      AuditLogger.logUnauthorizedAccess(
        '/admin/test',
        'Unauthorized access attempt',
        undefined,
        undefined,
        undefined,
        undefined
      )
    ).resolves.toBeUndefined();

    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        event_type: AuditEventType.UNAUTHORIZED_ACCESS,
        details: { attempted_resource: '/admin/test' },
        success: false,
        error_message: 'Unauthorized access attempt',
      }),
    ]);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Unauthorized access attempt detected',
      expect.objectContaining({
        attemptedResource: '/admin/test',
        userId: undefined,
        ipAddress: undefined,
      })
    );
  });
});

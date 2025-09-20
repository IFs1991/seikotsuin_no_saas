import { AuditLogger } from '@/lib/audit-logger';

describe('AuditLogger - Type Safety Tests', () => {

  it('should handle optional clinic_id correctly', async () => {
    // このテストは現在失敗するはず（型エラーのため）
    expect(() => {
      AuditLogger.logDataDelete(
        'test-user-id',
        'test@example.com',
        'test_table',
        'test-target-id',
        undefined, // clinic_id
        undefined, // ip_address
        { action: 'test' }
      );
    }).not.toThrow();
  });

  it('should handle optional target_id correctly', async () => {
    expect(() => {
      AuditLogger.logAdminAction(
        'test-user-id',
        'test@example.com',
        'test-action',
        undefined, // target_id
        undefined, // details
        undefined // ip_address
      );
    }).not.toThrow();
  });

  it('should handle optional user data for unauthorized access', async () => {
    expect(() => {
      AuditLogger.logUnauthorizedAccess(
        '/admin/test',
        'Unauthorized access attempt',
        undefined, // user_id
        undefined, // user_email
        undefined, // ip_address
        undefined // user_agent
      );
    }).not.toThrow();
  });
});

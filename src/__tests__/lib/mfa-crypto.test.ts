jest.mock('@/lib/env', () => ({
  assertEnv: () => 'test-encryption-key-for-mfa',
}));

import {
  decryptMfaSecret,
  encryptMfaSecret,
  hashBackupCode,
  normalizeBackupCode,
  verifyBackupCodeHash,
} from '@/lib/mfa/crypto';

describe('MFA crypto helpers', () => {
  it('encrypts TOTP secrets before storage and decrypts them for verification', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptMfaSecret(secret);

    expect(encrypted).toMatch(/^mfa_secret_v1:/);
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted)).toBe(secret);
  });

  it('hashes backup codes with a peppered HMAC format', () => {
    const hash = hashBackupCode('ABCD-1234');

    expect(hash).toMatch(/^mfa_backup_v1:/);
    expect(hash).not.toContain('ABCD1234');
    expect(verifyBackupCodeHash('abcd 1234', hash)).toBe(true);
    expect(verifyBackupCodeHash('ABCD1235', hash)).toBe(false);
  });

  it('normalizes formatted backup code input', () => {
    expect(normalizeBackupCode(' abcd-1234 ')).toBe('ABCD1234');
  });
});

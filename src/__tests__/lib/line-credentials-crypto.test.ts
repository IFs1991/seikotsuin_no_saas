import {
  decryptLineCredential,
  encryptLineCredential,
  getLineCredentialsEncryptionStatus,
  maskLineCredentialSecret,
} from '@/lib/line/crypto';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('LINE credential crypto', () => {
  it('encrypts and decrypts credentials with AES-256-GCM', () => {
    const encrypted = encryptLineCredential('channel-secret-value', TEST_KEY);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('channel-secret-value');
    expect(decryptLineCredential(encrypted, TEST_KEY)).toBe(
      'channel-secret-value'
    );
  });

  it('detects missing and invalid encryption keys for fail-closed gating', () => {
    expect(getLineCredentialsEncryptionStatus('')).toBe('missing');
    expect(getLineCredentialsEncryptionStatus('not-hex')).toBe('invalid');
    expect(getLineCredentialsEncryptionStatus(TEST_KEY)).toBe('ready');
  });

  it('masks decrypted secret values without exposing the full value', () => {
    expect(maskLineCredentialSecret('abcdef1234')).toBe('****1234');
  });
});

import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

import { assertEnv } from '@/lib/env';

const MFA_SECRET_PREFIX = 'mfa_secret_v1';
const BACKUP_CODE_PREFIX = 'mfa_backup_v1';
const AES_GCM_IV_BYTES = 12;

function getMfaKey(): Buffer {
  return createHash('sha256')
    .update(assertEnv('ENCRYPTION_KEY'), 'utf8')
    .digest();
}

export function encryptMfaSecret(secret: string): string {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getMfaKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    MFA_SECRET_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptMfaSecret(encryptedSecret: string): string {
  const [version, iv, authTag, ciphertext] = encryptedSecret.split(':');
  if (version !== MFA_SECRET_PREFIX || !iv || !authTag || !ciphertext) {
    throw new Error('MFA secret is not encrypted with the current format');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMfaKey(),
    Buffer.from(iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[-\s]/g, '').trim();
}

export function hashBackupCode(code: string): string {
  const digest = createHmac('sha256', getMfaKey())
    .update(normalizeBackupCode(code), 'utf8')
    .digest('hex');

  return `${BACKUP_CODE_PREFIX}:${digest}`;
}

export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(hashBackupCode);
}

export function verifyBackupCodeHash(
  inputCode: string,
  storedHash: string
): boolean {
  if (!storedHash.startsWith(`${BACKUP_CODE_PREFIX}:`)) {
    return false;
  }

  const expected = Buffer.from(hashBackupCode(inputCode));
  const actual = Buffer.from(storedHash);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

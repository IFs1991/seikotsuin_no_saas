import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '@/lib/env';

const AES_256_GCM_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const ENCODED_PART_COUNT = 4;
const ENCRYPTED_VALUE_VERSION = 'v1';

export type LineCredentialsEncryptionStatus = 'ready' | 'missing' | 'invalid';

export class LineCredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineCredentialCryptoError';
  }
}

export function getLineCredentialsEncryptionStatus(
  rawKey = getLineCredentialsEncryptionKey()
): LineCredentialsEncryptionStatus {
  if (rawKey.length === 0) {
    return 'missing';
  }

  return parseLineCredentialsEncryptionKey(rawKey) === null
    ? 'invalid'
    : 'ready';
}

export function isLineCredentialsEncryptionReady(
  rawKey = getLineCredentialsEncryptionKey()
): boolean {
  return getLineCredentialsEncryptionStatus(rawKey) === 'ready';
}

export function encryptLineCredential(
  plaintext: string,
  rawKey = getLineCredentialsEncryptionKey()
): string {
  const key = requireLineCredentialsEncryptionKey(rawKey);
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_VALUE_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptLineCredential(
  encryptedValue: string,
  rawKey = getLineCredentialsEncryptionKey()
): string {
  const key = requireLineCredentialsEncryptionKey(rawKey);
  const parts = encryptedValue.split(':');

  if (
    parts.length !== ENCODED_PART_COUNT ||
    parts[0] !== ENCRYPTED_VALUE_VERSION
  ) {
    throw new LineCredentialCryptoError('Invalid LINE credential payload');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const authTag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new LineCredentialCryptoError('Unable to decrypt LINE credential');
  }
}

export function maskLineCredentialSecret(plaintext: string): string {
  const suffix = plaintext.slice(-4);
  return suffix.length > 0 ? `****${suffix}` : '****';
}

function requireLineCredentialsEncryptionKey(rawKey: string): Buffer {
  const key = parseLineCredentialsEncryptionKey(rawKey);
  if (key === null) {
    throw new LineCredentialCryptoError(
      'LINE_CREDENTIALS_ENCRYPTION_KEY is not configured'
    );
  }
  return key;
}

function getLineCredentialsEncryptionKey(): string {
  return (
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY ??
    env.LINE_CREDENTIALS_ENCRYPTION_KEY
  );
}

function parseLineCredentialsEncryptionKey(rawKey: string): Buffer | null {
  if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
    return null;
  }

  const key = Buffer.from(rawKey, 'hex');
  return key.length === AES_256_GCM_KEY_BYTES ? key : null;
}

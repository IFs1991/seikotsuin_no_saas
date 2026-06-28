/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import { authorizeInternalSecret } from '@/lib/billing/internal-auth';

describe('authorizeInternalSecret', () => {
  test('rejects missing bearer token', () => {
    expect(
      authorizeInternalSecret({
        authorizationHeader: null,
        internalApiSecret: 'internal-secret',
        cronSecret: 'cron-secret',
      })
    ).toEqual({ success: false, reason: 'missing_bearer' });
  });

  test('rejects when no internal secret is configured', () => {
    expect(
      authorizeInternalSecret({
        authorizationHeader: 'Bearer presented-secret',
        internalApiSecret: '',
        cronSecret: '',
      })
    ).toEqual({ success: false, reason: 'missing_secret_configuration' });
  });

  test('accepts internal API secret before cron fallback', () => {
    expect(
      authorizeInternalSecret({
        authorizationHeader: 'Bearer internal-secret',
        internalApiSecret: 'internal-secret',
        cronSecret: 'cron-secret',
      })
    ).toEqual({ success: true, matchedSecret: 'internal_api_secret' });
  });

  test('accepts cron secret fallback', () => {
    expect(
      authorizeInternalSecret({
        authorizationHeader: 'Bearer cron-secret',
        internalApiSecret: '',
        cronSecret: 'cron-secret',
      })
    ).toEqual({ success: true, matchedSecret: 'cron_secret' });
  });

  test('rejects invalid secret', () => {
    expect(
      authorizeInternalSecret({
        authorizationHeader: 'Bearer wrong-secret',
        internalApiSecret: 'internal-secret',
        cronSecret: 'cron-secret',
      })
    ).toEqual({ success: false, reason: 'invalid' });
  });
});

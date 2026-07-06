/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import { NextRequest } from 'next/server';
import { authorizeInternalSecret } from '@/lib/billing/internal-auth';

type BillingInternalAuthModule = typeof import('@/lib/billing/internal-auth');

async function loadBillingInternalAuthModule() {
  let loadedModule: BillingInternalAuthModule | null = null;

  await jest.isolateModulesAsync(async () => {
    jest.doMock('@/lib/env', () => ({
      env: {
        INTERNAL_API_SECRET: 'internal-secret',
        CRON_SECRET: 'cron-secret',
      },
    }));
    jest.doMock('@/lib/billing/config', () => ({
      isBillingEnabled: () => true,
      isBillingInternalRoutesEnabled: () => true,
      isBillingOverridesEnabled: () => true,
    }));

    loadedModule = await import('@/lib/billing/internal-auth');
  });

  jest.dontMock('@/lib/env');
  jest.dontMock('@/lib/billing/config');

  if (loadedModule === null) {
    throw new Error('Failed to load billing internal auth module');
  }

  return loadedModule;
}

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

  test('accepts cron secret only when a caller explicitly supplies it', () => {
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

describe('requireBillingInternalRequest', () => {
  test('rejects CRON_SECRET for billing internal routes', async () => {
    const { requireBillingInternalRequest } =
      await loadBillingInternalAuthModule();
    const request = new NextRequest('http://localhost/api/internal/billing', {
      headers: {
        authorization: 'Bearer cron-secret',
      },
    });

    const result = requireBillingInternalRequest(request, {
      internalActor: 'test-billing-route',
    });

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.response.status).toBe(401);
    }
  });

  test('accepts INTERNAL_API_SECRET for billing internal routes', async () => {
    const { requireBillingInternalRequest } =
      await loadBillingInternalAuthModule();
    const request = new NextRequest('http://localhost/api/internal/billing', {
      headers: {
        authorization: 'Bearer internal-secret',
        'x-request-id': 'req-internal',
      },
    });

    const result = requireBillingInternalRequest(request, {
      internalActor: 'test-billing-route',
    });

    expect(result).toEqual({
      success: true,
      actor: {
        internalActor: 'test-billing-route',
        requestId: 'req-internal',
      },
    });
  });

  test('rejects missing or invalid billing internal secrets', async () => {
    const { requireBillingInternalRequest } =
      await loadBillingInternalAuthModule();
    const missingRequest = new NextRequest(
      'http://localhost/api/internal/billing'
    );
    const invalidRequest = new NextRequest(
      'http://localhost/api/internal/billing',
      {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      }
    );

    const missingResult = requireBillingInternalRequest(missingRequest, {
      internalActor: 'test-billing-route',
    });
    const invalidResult = requireBillingInternalRequest(invalidRequest, {
      internalActor: 'test-billing-route',
    });

    expect(missingResult.success).toBe(false);
    expect(invalidResult.success).toBe(false);
    if (missingResult.success === false) {
      expect(missingResult.response.status).toBe(401);
    }
    if (invalidResult.success === false) {
      expect(invalidResult.response.status).toBe(401);
    }
  });
});

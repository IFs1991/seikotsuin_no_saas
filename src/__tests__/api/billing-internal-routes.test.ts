/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import { NextRequest } from 'next/server';

type BillingInternalRouteModule = {
  POST: (request: NextRequest) => Response | Promise<Response>;
};

function mockEnabledBillingInternalEnv() {
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
}

async function loadCreateOverrideRoute() {
  let loadedModule: BillingInternalRouteModule | null = null;

  await jest.isolateModulesAsync(async () => {
    mockEnabledBillingInternalEnv();
    loadedModule =
      await import('@/app/api/internal/billing/create-override/route');
  });

  jest.dontMock('@/lib/env');
  jest.dontMock('@/lib/billing/config');

  if (loadedModule === null) {
    throw new Error('Failed to load create override route');
  }

  return loadedModule;
}

async function loadResyncSubscriptionRoute() {
  let loadedModule: BillingInternalRouteModule | null = null;

  await jest.isolateModulesAsync(async () => {
    mockEnabledBillingInternalEnv();
    loadedModule =
      await import('@/app/api/internal/billing/resync-subscription/route');
  });

  jest.dontMock('@/lib/env');
  jest.dontMock('@/lib/billing/config');

  if (loadedModule === null) {
    throw new Error('Failed to load resync subscription route');
  }

  return loadedModule;
}

describe('billing internal route secret separation', () => {
  test('create override route rejects CRON_SECRET', async () => {
    const route = await loadCreateOverrideRoute();
    const response = await route.POST(
      new NextRequest('http://localhost/api/internal/billing/create-override', {
        method: 'POST',
        headers: {
          authorization: 'Bearer cron-secret',
        },
      })
    );

    expect(response.status).toBe(401);
  });

  test('resync subscription route rejects CRON_SECRET', async () => {
    const route = await loadResyncSubscriptionRoute();
    const response = await route.POST(
      new NextRequest(
        'http://localhost/api/internal/billing/resync-subscription',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
    );

    expect(response.status).toBe(401);
  });
});

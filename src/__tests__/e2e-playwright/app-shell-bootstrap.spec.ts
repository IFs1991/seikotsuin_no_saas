import { expect, test } from '@playwright/test';

import { loginAsStaff } from './helpers/auth';

const TRACKED_BOOTSTRAP_PATHS = [
  '/api/auth/profile',
  '/api/clinics/accessible',
  '/api/app/bootstrap',
] as const;

test('SSR bootstrap後5秒間はclient bootstrap endpointを呼ばない', async ({
  page,
}) => {
  const requestCounts = new Map<string, number>(
    TRACKED_BOOTSTRAP_PATHS.map(path => [path, 0])
  );

  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (!requestCounts.has(pathname)) {
      return;
    }

    requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
  });

  await loginAsStaff(page, '/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5_000);

  for (const path of TRACKED_BOOTSTRAP_PATHS) {
    expect(requestCounts.get(path), `${path} request count`).toBe(0);
  }
});

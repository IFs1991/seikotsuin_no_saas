import { test } from '@playwright/test';
import { loginAsAdmin, loginAsStaff } from './helpers/auth';

test('admin login redirects to settings', async ({ page }) => {
  await loginAsAdmin(page);
});

test('staff login redirects to dashboard', async ({ page }) => {
  await loginAsStaff(page);
});

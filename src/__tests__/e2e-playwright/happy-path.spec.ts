import { test, expect } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';

test('happy path: login -> daily reports page', async ({ page }) => {
  await loginAsStaff(page);

  await page.goto('/daily-reports');
  await expect(
    page.getByRole('heading', { name: 'デジタル日報管理' })
  ).toBeVisible();
});

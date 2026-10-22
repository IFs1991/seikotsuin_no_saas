import { expect, test } from '@playwright/test';

test.describe('Tiramisu Works public LP', () => {
  test('renders the Works positioning, integration icons, and pricing', async ({
    page,
  }) => {
    await page.goto('/works');

    await expect(
      page.getByRole('heading', {
        name: /大きなシステムは.*AIでつなぐ/s,
      })
    ).toBeVisible();
    await expect(page.locator('img[src$="/line.png"]').first()).toBeVisible();
    await expect(page.locator('img[src$="/slack.png"]').first()).toBeVisible();
    await expect(
      page.locator('img[src$="/chatgpt.png"]').first()
    ).toBeVisible();
    await expect(page.getByText('250,000')).toBeVisible();
  });
});

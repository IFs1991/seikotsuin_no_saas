import { test, expect } from '@playwright/test';
test('Production相当では未承認本文をHTML/RSCへ配信せず、アプリ・請求窓口は維持', async ({
  page,
  request,
}) => {
  for (const route of ['/privacy', '/terms', '/legal']) {
    const response = await page.goto(
      `${route}?LEGAL_PUBLICATION_MODE=approved`
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByLabel('法務確認状況')).toContainText(
      '法務文書の正式公開を保留'
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/
    );
    expect(await page.content()).not.toMatch(
      /Gemini|outcome_unknown|Group Starter/
    );
    const rsc = await request.get(route, { headers: { RSC: '1' } });
    expect(rsc.ok()).toBe(true);
    expect(rsc.headers()['content-type']).toContain('text/x-component');
    expect(await rsc.text()).not.toMatch(
      /Gemini|outcome_unknown|Group Starter/
    );
  }
  await page.goto('/privacy#requests');
  await expect(
    page.locator('#requests a[href="/contact?intent=privacy"]')
  ).toBeVisible();
  await page.goto('/legal#operator-disclosure');
  await expect(
    page.locator(
      '#operator-disclosure a[href="/contact?intent=operator-disclosure"]'
    )
  ).toBeVisible();
  expect((await request.get('/os')).status()).toBe(200);
  const app = await request.get('/dashboard', { maxRedirects: 0 });
  expect([307, 308]).toContain(app.status());
  expect(app.headers().location).toContain('/login');
});

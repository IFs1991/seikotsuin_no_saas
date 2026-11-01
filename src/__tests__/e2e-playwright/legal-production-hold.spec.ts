import { test, expect } from '@playwright/test';
test('Production相当では未承認本文をHTML/RSCへ配信せず、アプリ・請求窓口は維持', async ({
  page,
  request,
}) => {
  for (const route of [
    '/privacy',
    '/terms',
    '/legal',
    '/works/privacy',
    '/works/terms',
    '/works/plugin',
  ]) {
    const response = await page.goto(
      `${route}?LEGAL_PUBLICATION_MODE=approved`
    );
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toContain("'nonce-");
    await expect(page.getByLabel('法務確認状況')).toContainText(
      '法務文書の正式公開を保留'
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/
    );
    expect(await page.content()).not.toMatch(
      /Gemini|outcome_unknown|Group Starter|一律のTTLや即時完全削除|本規約では未確定の最低利用期間/
    );
    const rsc = await request.get(route, { headers: { RSC: '1' } });
    expect(rsc.ok()).toBe(true);
    expect(rsc.headers()['content-type']).toContain('text/x-component');
    expect(await rsc.text()).not.toMatch(
      /Gemini|outcome_unknown|Group Starter|一律のTTLや即時完全削除|本規約では未確定の最低利用期間/
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

test('Worksのスマートフォン表示・相互リンク・問い合わせ目的を保持', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/works/privacy', '/works/terms', '/works/plugin']) {
    await page.goto(
      `${route}?WORKS_LEGAL_PUBLICATION_MODE=approved&approved=true`
    );
    await expect(page.locator('[data-legal-publication="hold"]')).toBeVisible();
    await expect(
      page.getByRole('link', { name: '利用規約', exact: true })
    ).toHaveAttribute('href', '/works/terms');
    await expect(
      page.getByRole('link', { name: 'プライバシーポリシー', exact: true })
    ).toHaveAttribute('href', '/works/privacy');
    await expect(
      page.getByRole('link', { name: 'お問い合わせ', exact: true })
    ).toHaveAttribute('href', '/contact?product=works&intent=support');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  }
  await page.goto('/works/privacy#requests');
  await expect(
    page.locator('#requests a[href="/contact?product=works&intent=privacy"]')
  ).toBeVisible();
  await page.goto('/contact?product=works&intent=privacy');
  await expect(
    page.getByRole('link', { name: 'Worksプライバシーポリシー', exact: true })
  ).toHaveAttribute('href', '/works/privacy#requests');
});

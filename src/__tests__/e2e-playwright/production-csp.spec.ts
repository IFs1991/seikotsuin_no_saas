import { test, expect } from '@playwright/test';

test('production CSP: loginのSSR scriptsがnonce付きで実行される', async ({
  page,
}) => {
  const violations: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (
      /Content Security Policy|violates.*directive|Refused to execute|Refused to apply/i.test(
        message.text()
      )
    ) {
      violations.push(message.text());
    }
  });
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  const csp = response?.headers()['content-security-policy'] ?? '';
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  const scripts = await page
    .locator('script')
    .evaluateAll(elements =>
      elements
        .filter(element => element.type !== 'application/ld+json')
        .map(element => ({ nonce: element.nonce, inline: !element.src }))
    );
  expect(scripts.some(script => script.inline)).toBe(true);
  expect(scripts.every(script => script.nonce === nonce)).toBe(true);
  await expect(page.getByLabel(/^メールアドレス\s*\*?$/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'ログイン', exact: true })
  ).toBeEnabled();
  // SSRの見た目だけでなく、hydration後のReactイベントを確認する。
  const password = page.getByLabel(/^パスワード\s*\*?$/);
  await password.fill('csp-local-input');
  await page.getByRole('button', { name: 'パスワードを表示' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'パスワードを隠す' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('csp-local-input');
  await page.evaluate(() => {
    document.documentElement.dataset.cspNavigation = 'client';
  });
  await page.getByRole('link', { name: '管理者の方はこちら' }).click();
  await expect.soft(page).toHaveURL(/\/admin\/login$/);
  await expect
    .soft(page.locator('html'))
    .toHaveAttribute('data-csp-navigation', 'client');
  await expect
    .soft(page.getByRole('heading', { name: '管理者ログイン' }))
    .toBeVisible();
  expect(violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

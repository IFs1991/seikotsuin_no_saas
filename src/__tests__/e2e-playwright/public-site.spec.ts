import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

// 公開サイト（共通トップ・製品LP・問い合わせ・法務）の受入検証。
// 実行: npm run build && npx playwright test --config playwright.public-site.config.ts
// 仕様: Tiramisu共通サイト・LP統合 v2.0（A01〜A26 のうちブラウザで確かめる項目）
// 外部フォームは開かず送信もしない（リンク先の確認だけ）。

const SELECTOR_TITLE = 'お店の運営に、どちらのTiramisuを。';
const SEEN_KEY = 'tiramisu.product-selector.seen.v1';
const PUBLIC_PATHS = [
  '/',
  '/works',
  '/os',
  '/contact',
  '/terms',
  '/privacy',
  '/legal',
];
const LEGACY_OS_ANCHORS = [
  'problems',
  'features',
  'ai',
  'roi',
  'pricing',
  'faq',
  'contact',
];

interface PageWatch {
  cspViolations: string[];
  runtimeErrors: string[];
}

function watch(page: Page): PageWatch {
  const result: PageWatch = { cspViolations: [], runtimeErrors: [] };
  page.on('pageerror', error => result.runtimeErrors.push(error.message));
  page.on('console', message => {
    if (
      /Content Security Policy|violates.*directive|Refused to (execute|apply|load)/i.test(
        message.text()
      )
    ) {
      result.cspViolations.push(message.text());
    }
  });
  return result;
}

async function openFreshPage(
  browser: Browser,
  options: BrowserContextOptions = {}
) {
  const context = await browser.newContext(options);
  // モーダル（<dialog>）が現れた回数を、同じタブの遷移をまたいで記録する（ちらつき検出用）。
  await context.addInitScript(() => {
    const key = '__lp_dialog_insertions';
    const read = () => {
      try {
        return Number(window.sessionStorage.getItem(key) ?? '0');
      } catch {
        return 0;
      }
    };
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLDialogElement)) return;
          try {
            window.sessionStorage.setItem(key, String(read() + 1));
          } catch {
            // storage 失敗を再現するテストでは記録しない
          }
        });
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  return { context, page, watched: watch(page) };
}

async function dialogInsertions(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(window.sessionStorage.getItem('__lp_dialog_insertions') ?? '0')
  );
}

function selectorDialog(page: Page) {
  return page.getByRole('dialog', { name: SELECTOR_TITLE });
}

function selectorTrigger(page: Page) {
  return page.getByRole('button', { name: '製品を選ぶ' });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
}

async function backgroundIsReleased(page: Page) {
  await expect(page.locator('html')).not.toHaveClass(/lp-scroll-locked/);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.locator('[inert]').count()).toBe(0);
}

test.describe('公開サイト: 本番CSPと認証不要の閲覧', () => {
  test('公開7ページは認証なしで200を返し、CSP違反・実行時エラーがない（A13/A15 一部）', async ({
    browser,
  }) => {
    const { context, page, watched } = await openFreshPage(browser);
    for (const path of PUBLIC_PATHS) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      const csp = response?.headers()['content-security-policy'] ?? '';
      expect(csp, path).toMatch(/'nonce-/);
      expect(csp, path).not.toMatch(/unsafe-inline|unsafe-eval/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/') {
        // 初回のモーダル表示中もCSP違反を出さない
        await expect(selectorDialog(page)).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
    expect(watched.cspViolations).toEqual([]);
    expect(watched.runtimeErrors).toEqual([]);
    await context.close();
  });

  test('保護ページは引き続きログインへリダイレクトされる（A15）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/dashboard');
    expect(new URL(page.url()).pathname).toBe('/login');
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(
      '/dashboard'
    );
    await context.close();
  });
});

test.describe('公開サイト: JavaScript無効', () => {
  test('本文と通常リンクで両製品・問い合わせ・法務へ進める（A01/A11）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser, {
      javaScriptEnabled: false,
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'お店の可能性を、もっと自由に。'
    );
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(selectorTrigger(page)).toBeDisabled();
    const main = page.getByRole('main');
    await expect(
      main.getByRole('link', { name: /Tiramisu Worksを見る/ }).first()
    ).toHaveAttribute('href', '/works');
    await expect(
      main.getByRole('link', { name: /Tiramisu OSを見る/ }).first()
    ).toHaveAttribute('href', '/os');

    await main
      .getByRole('link', { name: /Tiramisu Worksを見る/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/works$/);
    await expect(page.getByText('料金プラン').first()).toBeVisible();
    await expect(
      page.getByText('暫定価格（税別）／個別契約前に正式条件を案内')
    ).toBeVisible();

    for (const path of ['/os', '/contact', '/terms', '/privacy', '/legal']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('dialog')).toHaveCount(0);
    }
    await context.close();
  });
});

test.describe('公開サイト: 製品選択モーダル', () => {
  test('初回だけ1回開き、Worksへ同じタブで移動したら背景の制限を残さない（A02/A03/A10/A18）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/');
    const dialog = selectorDialog(page);
    await expect(dialog).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/lp-scroll-locked/);
    expect(
      await page.evaluate(key => window.sessionStorage.getItem(key), SEEN_KEY)
    ).toBe('1');
    // 初期フォーカスは見出し（どちらの製品にも偏らない）
    await expect(
      dialog.getByRole('heading', { name: SELECTOR_TITLE })
    ).toBeFocused();
    expect(await dialogInsertions(page)).toBe(1);

    const pagesBefore = context.pages().length;
    await dialog.getByRole('link', { name: /Tiramisu Worksを見る/ }).click();
    await expect(page).toHaveURL(/\/works$/);
    expect(context.pages()).toHaveLength(pagesBefore);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '今のツールはそのまま。'
    );
    await expect(
      page.getByRole('link', { name: /導入について相談する/ }).first()
    ).toBeVisible();
    await backgroundIsReleased(page);
    // 遷移先は普通に操作できる
    await page.getByRole('link', { name: /できることを見る/ }).click();
    await expect(page).toHaveURL(/#capabilities$/);
    await context.close();
  });

  test('OSへ移動すると既存の主要内容が見える（A04/A41）', async ({
    browser,
  }) => {
    const { context, page, watched } = await openFreshPage(browser);
    await page.goto('/');
    await selectorDialog(page)
      .getByRole('link', { name: /Tiramisu OSを見る/ })
      .click();
    await expect(page).toHaveURL(/\/os$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '店舗が増えるほど'
    );
    await backgroundIsReleased(page);
    for (const id of LEGACY_OS_ANCHORS) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    }
    await expect(page.locator('#pricing')).toContainText('Group Standard');
    // FAQ（アコーディオン）とAIデモ・計算機の動的セクションが動く
    await page.locator('#faq').scrollIntoViewIfNeeded();
    const secondFaq = page.locator('#lp-faq-trigger-1');
    await secondFaq.click();
    await expect(secondFaq).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#ai').scrollIntoViewIfNeeded();
    const scenario = page.getByRole('button', {
      name: /キャンセル率が高い店舗を見たい/,
    });
    await scenario.click();
    await expect(scenario).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#roi').scrollIntoViewIfNeeded();
    await expect(page.getByText('毎月削減できる見込み')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /この削減余地を自院で試す/ })
    ).toHaveAttribute('href', '/contact?product=os&intent=sales');
    // 追従CTAもスクロールで表示される
    await page.mouse.wheel(0, 2000);
    await expect(
      page.locator('div[aria-hidden="false"]').getByRole('link', {
        name: /デモ相談をする/,
      })
    ).toBeVisible();
    expect(watched.cspViolations).toEqual([]);
    expect(watched.runtimeErrors).toEqual([]);
    await context.close();
  });

  for (const method of [
    'close-button',
    'escape',
    'backdrop',
    'later',
  ] as const) {
    test(`閉じる操作（${method}）で閉じ、本文を操作できる（A05）`, async ({
      browser,
    }) => {
      const { context, page } = await openFreshPage(browser);
      await page.goto('/');
      const dialog = selectorDialog(page);
      await expect(dialog).toBeVisible();

      if (method === 'close-button') {
        await dialog.getByRole('button', { name: '閉じる' }).click();
      } else if (method === 'escape') {
        await page.keyboard.press('Escape');
      } else if (method === 'backdrop') {
        // 背景（ダイアログの外側）のクリック。背景のリンク等は反応しない。
        await page.mouse.click(4, 4);
      } else {
        await dialog.getByRole('button', { name: 'あとで選ぶ' }).click();
      }

      await expect(page.locator('dialog')).toHaveCount(0);
      await backgroundIsReleased(page);
      expect(new URL(page.url()).pathname).toBe('/');
      // 自動表示から閉じたら「製品を選ぶ」へフォーカスを戻す
      await expect(selectorTrigger(page)).toBeFocused();
      await page
        .getByRole('main')
        .getByRole('link', { name: /Tiramisu OSを見る/ })
        .first()
        .click();
      await expect(page).toHaveURL(/\/os$/);
      await context.close();
    });
  }

  test('再読込・戻る・再訪では自動表示しない（A06）', async ({ browser }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/');
    await expect(selectorDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(selectorTrigger(page)).toBeEnabled();
    await expect(page.locator('dialog')).toHaveCount(0);

    await page
      .getByRole('main')
      .getByRole('link', { name: /Tiramisu Worksを見る/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/works$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(selectorTrigger(page)).toBeEnabled();
    await expect(page.locator('dialog')).toHaveCount(0);

    await page.goto('/works');
    await page.goto('/');
    await expect(selectorTrigger(page)).toBeEnabled();
    await expect(page.locator('dialog')).toHaveCount(0);
    // このタブで現れたモーダルは最初の自動表示の1回だけ
    expect(await dialogInsertions(page)).toBe(1);
    await context.close();
  });

  test('手動の「製品を選ぶ」は表示済みでも開き、閉じると起動元へ戻る（A07）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/works');
    const trigger = selectorTrigger(page);
    await expect(trigger).toBeEnabled();
    await expect(page.locator('dialog')).toHaveCount(0);

    await trigger.click();
    const dialog = selectorDialog(page);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await context.close();
  });

  test('Tab・Shift+Tabでモーダル外の要素へフォーカスが移らない（A16/A17/A19）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/');
    const dialog = selectorDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
    const describedBy = await dialog.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
      '今のツールを活かすか、店舗の情報をまとめるか。目的に合わせて選べます。'
    );
    expect(
      await dialog.locator('a a, a button, button a, button button').count()
    ).toBe(0);
    for (const link of await dialog.getByRole('link').all()) {
      expect(await link.getAttribute('href')).toMatch(/^\/(works|os)$/);
    }

    const visited: string[] = [];
    for (const key of [
      ...Array(7).fill('Tab'),
      ...Array(7).fill('Shift+Tab'),
    ]) {
      await page.keyboard.press(key);
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        const insideDialog = Boolean(active?.closest('dialog'));
        return {
          insideDialog,
          isBody: active === document.body || active === null,
          label: active?.textContent?.trim().slice(0, 20) ?? '',
        };
      });
      // ダイアログ内か、ブラウザUI（document外）だけ。背景の要素には移らない。
      expect(where.insideDialog || where.isBody).toBe(true);
      if (where.insideDialog) visited.push(where.label);
    }
    expect(visited).toEqual(
      expect.arrayContaining([
        'Tiramisu Worksを見る',
        'Tiramisu OSを見る',
        'あとで選ぶ',
      ])
    );
    // 背景のリンクは開いている間クリックできない（ダイアログの背景として扱われる）
    const backgroundTarget = await page.evaluate(() => {
      const link = document.querySelector('main a[href="/os"]');
      if (!link) return null;
      const box = link.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + Math.min(box.height / 2, 10)
      );
      return hit?.closest('dialog') ? 'dialog' : (hit?.tagName ?? null);
    });
    expect(backgroundTarget === 'dialog' || backgroundTarget === null).toBe(
      true
    );
    await context.close();
  });

  test('storage の読取・書込が失敗しても例外にならず、手動で選べる（A08/A09）', async ({
    browser,
  }) => {
    for (const failing of ['getItem', 'setItem'] as const) {
      const { context, page, watched } = await openFreshPage(browser);
      await context.addInitScript(method => {
        Storage.prototype[method] = () => {
          throw new DOMException('storage blocked', 'SecurityError');
        };
      }, failing);
      await page.goto('/');
      await expect(selectorTrigger(page)).toBeEnabled();
      await expect(page.locator('dialog')).toHaveCount(0);
      expect(watched.runtimeErrors).toEqual([]);
      await selectorTrigger(page).click();
      await expect(selectorDialog(page)).toBeVisible();
      await context.close();
    }
  });

  test('製品LPへの直接アクセスでは自動表示しない（A12）', async ({
    browser,
  }) => {
    for (const path of [
      '/works',
      '/os',
      '/contact',
      '/terms',
      '/privacy',
      '/legal',
    ]) {
      const { context, page } = await openFreshPage(browser);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('dialog')).toHaveCount(0);
      expect(
        await page.evaluate(key => window.sessionStorage.getItem(key), SEEN_KEY)
      ).toBeNull();
      await context.close();
    }
  });

  test('ログイン画面には公開サイトのヘッダーやモーダルを注入しない（A14）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(selectorTrigger(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'OSログイン' })).toHaveCount(0);
    await context.close();
  });
});

test.describe('公開サイト: 旧アンカー互換と不正な入力', () => {
  for (const id of LEGACY_OS_ANCHORS) {
    test(`/#${id} は /os#${id} へ移り、モーダルや履歴ループを起こさない（A25）`, async ({
      browser,
    }) => {
      const { context, page } = await openFreshPage(browser);
      await page.goto('/works');
      await page.goto(`/#${id}`);
      await expect(page).toHaveURL(new RegExp(`/os#${id}$`));
      await expect(page.locator(`section#${id}`)).toBeInViewport();
      // 旧アンカーの解決前にモーダルを一瞬でも出していない
      expect(await dialogInsertions(page)).toBe(0);
      expect(
        await page.evaluate(key => window.sessionStorage.getItem(key), SEEN_KEY)
      ).toBeNull();
      await page.goBack();
      await expect(page).toHaveURL(/\/works$/);
      await context.close();
    });
  }

  test('未知のhash・悪意あるqueryで外部遷移やHTML注入をしない（A26）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/terms');
    const origin = new URL(page.url()).origin;
    for (const hash of [
      '#https://evil.example/',
      '#javascript:alert(1)',
      '#Pricing',
    ]) {
      await page.goto(`/${hash}`);
      await expect(selectorTrigger(page)).toBeEnabled();
      expect(new URL(page.url()).origin).toBe(origin);
      expect(new URL(page.url()).pathname).toBe('/');
      await page.keyboard.press('Escape');
    }
    await page.goto(
      '/contact?product=%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D1%3E&intent=sales&plan=standard'
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'お問い合わせ'
    );
    expect(
      await page.evaluate(() => 'xss' in window || '__xss' in window)
    ).toBe(false);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    // plan は product=works でないため採用されない
    await expect(page.getByText('希望プラン', { exact: true })).toHaveCount(0);
    await context.close();
  });

  test('問い合わせは製品・希望プランを区別し、外部フォームは新しいタブのリンクだけ（A27/A28/A31）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await page.goto('/works');
    await page
      .locator('article')
      .filter({
        has: page.getByRole('heading', { name: 'Standard', level: 3 }),
      })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(
      /\/contact\?product=works&intent=sales&plan=standard$/
    );
    const selection = page.locator('section', {
      has: page.getByRole('heading', { name: '選択中の内容' }),
    });
    await expect(selection).toContainText('Tiramisu Works');
    await expect(selection).toContainText('Standard（暫定価格');
    await expect(selection).toContainText('フォームには自動で入力されません');
    const formLink = page.getByRole('link', { name: /Googleフォームを開く/ });
    await expect(formLink).toHaveAttribute('target', '_blank');
    await expect(formLink).toHaveAttribute(
      'href',
      /^https:\/\/docs\.google\.com\/forms\//
    );
    expect(await page.content()).not.toMatch(/entry\.\d+/);
    await context.close();
  });
});

test.describe('公開サイト: 画面幅・文字拡大・動き・画像失敗', () => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
  ]) {
    test(`${viewport.width}px で横はみ出しがなく、両製品のCTAと閉じる操作に届く（A20）`, async ({
      browser,
    }) => {
      const { context, page } = await openFreshPage(browser, {
        viewport,
        isMobile: true,
        hasTouch: true,
      });
      await page.goto('/');
      const dialog = selectorDialog(page);
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: '閉じる' })
      ).toBeInViewport();
      const box = await dialog.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(
        true
      );
      for (const name of [/Tiramisu Worksを見る/, /Tiramisu OSを見る/]) {
        const link = dialog.getByRole('link', { name });
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeInViewport();
      }
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await dialog.getByRole('button', { name: '閉じる' }).click();
      for (const path of PUBLIC_PATHS) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await hasHorizontalOverflow(page), path).toBe(false);
      }
      await context.close();
    });
  }

  for (const width of [768, 1280, 1440]) {
    test(`${width}px で2列等幅・最大幅960pxのモーダルになる（A21）`, async ({
      browser,
    }) => {
      const { context, page } = await openFreshPage(browser, {
        viewport: { width, height: 900 },
      });
      await page.goto('/');
      const dialog = selectorDialog(page);
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(960);
      const cards = dialog.locator('section[aria-label]');
      await expect(cards).toHaveCount(2);
      const [first, second] = await Promise.all([
        cards.nth(0).boundingBox(),
        cards.nth(1).boundingBox(),
      ]);
      expect(first && second).toBeTruthy();
      if (first && second) {
        expect(Math.abs(first.width - second.width)).toBeLessThan(2);
        expect(Math.abs(first.y - second.y)).toBeLessThan(2);
        expect(first.x).toBeLessThan(second.x);
      }
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await context.close();
    });
  }

  test('低い画面（200%拡大相当）でもモーダル内をスクロールして全操作に届く（A22）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser, {
      viewport: { width: 640, height: 400 },
    });
    await page.goto('/');
    const dialog = selectorDialog(page);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect((box?.y ?? -1) >= 0 && (box?.height ?? 9999) <= 400).toBe(true);
    await expect(
      dialog.getByRole('button', { name: '閉じる' })
    ).toBeInViewport();
    for (const name of ['あとで選ぶ']) {
      const button = dialog.getByRole('button', { name });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
    }
    for (const name of [/Tiramisu Worksを見る/, /Tiramisu OSを見る/]) {
      const link = dialog.getByRole('link', { name });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeInViewport();
    }
    // スクロール後も閉じる操作を見失わない
    await expect(
      dialog.getByRole('button', { name: '閉じる' })
    ).toBeInViewport();
    await context.close();
  });

  test('reduced motion では動きを止め、フォーカスリングと文字コントラストを保つ（A23）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser, {
      reducedMotion: 'reduce',
    });
    await page.goto('/');
    const dialog = selectorDialog(page);
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate(element => getComputedStyle(element).animationName)
    ).toBe('none');

    await page.keyboard.press('Tab');
    const focusRing = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).boxShadow
    );
    expect(focusRing).not.toBe('none');

    const ratios = await dialog.evaluate(root => {
      function parse(color: string) {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const [r, g, b, a = '1'] = match[1].split(/[,\s/]+/).filter(Boolean);
        return [Number(r), Number(g), Number(b), Number(a)];
      }
      function luminance([r, g, b]: number[]) {
        const channel = (value: number) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      }
      function background(element: Element | null): number[] {
        let current = element;
        while (current) {
          const parsed = parse(getComputedStyle(current).backgroundColor);
          if (parsed && parsed[3] > 0.99) return parsed;
          current = current.parentElement;
        }
        return [255, 255, 255, 1];
      }
      const results: Array<{ text: string; ratio: number }> = [];
      root.querySelectorAll('h2, h3, p, a, button, li').forEach(element => {
        const text = element.textContent?.trim() ?? '';
        if (!text || element.closest('[aria-hidden="true"]')) return;
        const fg = parse(getComputedStyle(element).color);
        if (!fg) return;
        const l1 = luminance(fg);
        const l2 = luminance(background(element));
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        results.push({ text: text.slice(0, 16), ratio });
      });
      return results;
    });
    const lowContrast = ratios.filter(item => item.ratio < 4.5);
    expect(lowContrast).toEqual([]);
    await context.close();
  });

  test('画像が読み込めなくても本文・CTA・モーダルが使える（A24）', async ({
    browser,
  }) => {
    const { context, page } = await openFreshPage(browser);
    await context.route(
      /\.(png|jpe?g|webp|avif|svg)(\?|$)|\/_next\/image/,
      route => route.abort()
    );
    await page.goto('/');
    const dialog = selectorDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'あとで選ぶ' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page
      .getByRole('main')
      .getByRole('link', { name: /Tiramisu Worksを見る/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/works$/);
    await context.close();
  });
});

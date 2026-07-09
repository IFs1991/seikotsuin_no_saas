import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';

import {
  getMobileUiuxDcScriptOpeningTag,
  transformMobileUiuxHtml,
} from '@/lib/mobile-uiux/html-transform';
import type { MobileUiuxScreenResource } from '@/lib/mobile-uiux/bridge-manifest';

const FIXTURE_ROOT = path.join(process.cwd(), 'private-assets', 'mobile-uiux');

const SCREEN_RESOURCES = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
  'settings-detail',
] as const satisfies readonly MobileUiuxScreenResource[];

const EXPECTED_NAV_TARGETS = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
] as const;

async function readFixture(
  resource: MobileUiuxScreenResource
): Promise<string> {
  return readFile(path.join(FIXTURE_ROOT, `${resource}.dc.html`), 'utf-8');
}

function countDcScripts(html: string): number {
  return html.match(/<script\b(?=[^>]*\bdata-dc-script\b)/gi)?.length ?? 0;
}

function getNavTargets(html: string): string[] {
  return parse(html)
    .querySelectorAll('[data-mobile-uiux-nav-target]')
    .map(element => element.getAttribute('data-mobile-uiux-nav-target') ?? '');
}

function getRenderedShellText(html: string): string {
  const root = parse(html, {
    blockTextElements: {
      script: true,
      style: true,
      pre: true,
    },
  });

  for (const script of root.querySelectorAll('script')) {
    script.remove();
  }
  for (const style of root.querySelectorAll('style')) {
    style.remove();
  }

  return root.text;
}

describe('transformMobileUiuxHtml', () => {
  it.each(SCREEN_RESOURCES)(
    'converts %s to a production shell while preserving DC runtime',
    async resource => {
      const rawHtml = await readFixture(resource);
      const transformed = transformMobileUiuxHtml(rawHtml, {
        mode: 'production',
        resource,
      });

      expect(transformed).toContain('<x-dc>');
      expect(transformed).toContain('<helmet>');
      expect(countDcScripts(transformed)).toBe(1);
      expect(transformed).toContain(getMobileUiuxDcScriptOpeningTag(rawHtml));
      expect(transformed).toContain('class Component extends DCLogic');
      expect(transformed).toContain('ref="{{ setRoot }}"');
      expect(transformed).toContain('data-mobile-uiux-production-root');
      expect(transformed).toContain('data-mobile-uiux-shell="production"');
      expect(transformed).toContain('viewport-fit=cover');
      expect(transformed).toContain('data-mobile-uiux-production-shell');
      expect(transformed).toContain(
        '<script src="./react-runtime.js" data-mobile-uiux-react-runtime></script><script src="./support.js"></script>'
      );

      expect(transformed).not.toContain('STAGE CONTROLS');
      expect(transformed).not.toContain('iPHONE');
      expect(transformed).not.toContain('width: 390px; height: 812px');
      expect(transformed).not.toContain('width: 108px; height: 30px');
      expect(transformed).not.toContain(
        'height: 50px; flex: none; display: flex; align-items: center; justify-content: space-between'
      );

      expect(getNavTargets(transformed)).toEqual(EXPECTED_NAV_TARGETS);
    }
  );

  it('keeps app header, content, overlays, and bottom nav in production', async () => {
    const rawHtml = await readFixture('home');
    const transformed = transformMobileUiuxHtml(rawHtml, {
      mode: 'production',
      resource: 'home',
    });

    expect(transformed).toContain('APP HEADER');
    expect(transformed).toContain('CONTENT');
    expect(transformed).toContain('BOTTOM NAV');
    expect(transformed).toContain('OVERLAYS');
    expect(transformed).toContain('TOAST');
    expect(transformed).toContain('ダッシュボード');
  });

  it('adds minimal production status styles without changing dataset contracts', async () => {
    const rawHtml = await readFixture('home');
    const transformed = transformMobileUiuxHtml(rawHtml, {
      mode: 'production',
      resource: 'home',
    });

    expect(transformed).toContain('[data-mobile-uiux-bridge-fallback]');
    expect(transformed).toContain('[data-mobile-uiux-mutation-status]');
    expect(transformed).toContain('data-mobile-uiux-initial-read="hydrated"');
    expect(transformed).toContain('visibility: hidden !important');
    expect(transformed).toContain('読み込み中です');
    expect(transformed).toContain('background: var(--surface)');
    expect(transformed).toContain('color: var(--fg)');
    expect(transformed).toContain('border: 1px solid var(--border)');
    expect(transformed).not.toContain('role="status"');
  });

  it('loads the local React runtime before the DC support script', async () => {
    const rawHtml = await readFixture('home');
    const transformed = transformMobileUiuxHtml(rawHtml, {
      mode: 'production',
      resource: 'home',
    });

    const runtimeIndex = transformed.indexOf(
      '<script src="./react-runtime.js" data-mobile-uiux-react-runtime></script>'
    );
    const supportIndex = transformed.indexOf(
      '<script src="./support.js"></script>'
    );

    expect(runtimeIndex).toBeGreaterThanOrEqual(0);
    expect(supportIndex).toBeGreaterThan(runtimeIndex);
  });

  it('normalizes レポート and 日報 labels to daily-reports target', async () => {
    const reservations = transformMobileUiuxHtml(
      await readFixture('reservations'),
      {
        mode: 'production',
        resource: 'reservations',
      }
    );
    const dailyReports = transformMobileUiuxHtml(
      await readFixture('daily-reports'),
      {
        mode: 'production',
        resource: 'daily-reports',
      }
    );

    expect(reservations).toContain('>レポート</span>');
    expect(reservations).toContain(
      'data-mobile-uiux-nav-target="daily-reports"'
    );
    expect(dailyReports).toContain('>日報</span>');
    expect(dailyReports).toContain(
      'data-mobile-uiux-nav-target="daily-reports"'
    );
  });

  it('adds non-visual navigation attributes under sc-if wrappers', async () => {
    const settingsDetail = transformMobileUiuxHtml(
      await readFixture('settings-detail'),
      {
        mode: 'production',
        resource: 'settings-detail',
      }
    );
    const root = parse(settingsDetail);
    const navItems = root.querySelectorAll('[data-mobile-uiux-nav-target]');

    expect(navItems).toHaveLength(5);
    for (const item of navItems) {
      expect(item.getAttribute('role')).toBe('button');
      expect(item.getAttribute('tabindex')).toBe('0');
      expect(item.getAttribute('aria-label')).toMatch(/へ移動$/);
    }
    expect(getNavTargets(settingsDetail)).toEqual(EXPECTED_NAV_TARGETS);
  });

  it('removes the settings-detail sample menu template block in production', async () => {
    const settingsDetail = transformMobileUiuxHtml(
      await readFixture('settings-detail'),
      {
        mode: 'production',
        resource: 'settings-detail',
      }
    );

    const renderedText = getRenderedShellText(settingsDetail);

    expect(renderedText).not.toContain('メニューテンプレート');
    expect(renderedText).not.toContain('テンプレートの作成は所有院');
  });

  it('leaves preview mode unchanged', async () => {
    const rawHtml = await readFixture('home');

    expect(
      transformMobileUiuxHtml(rawHtml, {
        mode: 'preview',
        resource: 'home',
      })
    ).toBe(rawHtml);
  });
});

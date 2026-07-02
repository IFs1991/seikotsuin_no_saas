import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES,
  buildMobileUiuxProductionAsset,
  getMobileUiuxProductionAssetPath,
  getMobileUiuxSourceAssetPath,
  readMobileUiuxProductionAsset,
} from '@/lib/mobile-uiux/production-asset';

const execFileAsync = promisify(execFile);

function countDcScripts(html: string): number {
  return html.match(/<script\b(?=[^>]*\bdata-dc-script\b)/gi)?.length ?? 0;
}

function getRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected record value');
  }
  return value as Record<string, unknown>;
}

describe('mobile-uiux production assets', () => {
  it.each(MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES)(
    'builds the %s production asset with shell and hydration patch applied',
    async resource => {
      const sourceHtml = await readFile(
        getMobileUiuxSourceAssetPath(resource),
        'utf-8'
      );
      const productionHtml = buildMobileUiuxProductionAsset(
        resource,
        sourceHtml
      );

      expect(productionHtml).toContain('data-mobile-uiux-production-root');
      expect(productionHtml).toContain('ref="{{ setRoot }}"');
      expect(countDcScripts(productionHtml)).toBe(1);
      expect(productionHtml).toContain('class Component extends DCLogic');
      expect(productionHtml).toContain('__mobileUiuxOriginalRenderVals');
      expect(productionHtml).toContain(
        'window.__MOBILE_UIUX_APPLY_READ_DATA__'
      );
      expect(productionHtml).not.toContain('STAGE CONTROLS');
      expect(productionHtml).not.toContain('width: 390px; height: 812px');
      expect(productionHtml).not.toContain('data-mobile-uiux-bridge');
    }
  );

  it('keeps the generated assets in the production asset manifest', () => {
    expect(MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES).toEqual([
      'home',
      'reservations',
      'daily-reports',
    ]);
  });

  it.each(MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES)(
    'reads the generated %s asset from private-assets/mobile-uiux-production',
    async resource => {
      const actual = await readMobileUiuxProductionAsset(resource);

      expect(actual).not.toBeNull();
      expect(actual).toContain('data-mobile-uiux-production-root');
      expect(actual).toContain('__mobileUiuxOriginalRenderVals');
      expect(actual).toContain('window.__MOBILE_UIUX_APPLY_READ_DATA__');
    }
  );

  it('returns null for screens outside the generated asset scope', async () => {
    await expect(readMobileUiuxProductionAsset('patients')).resolves.toBeNull();
  });

  it.each(MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES)(
    'has an up-to-date generated %s file on disk',
    async resource => {
      const sourceHtml = await readFile(
        getMobileUiuxSourceAssetPath(resource),
        'utf-8'
      );
      const expected = buildMobileUiuxProductionAsset(resource, sourceHtml);
      const actual = await readFile(
        getMobileUiuxProductionAssetPath(resource),
        'utf-8'
      );

      expect(path.basename(getMobileUiuxProductionAssetPath(resource))).toBe(
        `${resource}.dc.html`
      );
      expect(actual).toBe(expected);
    }
  );

  it('detects generated asset drift in --check mode', async () => {
    const outputPath = getMobileUiuxProductionAssetPath('reservations');
    const original = await readFile(outputPath, 'utf-8');
    let failed = false;
    let failureText = '';

    try {
      await writeFile(outputPath, `${original}\n<!-- drift-test -->`, 'utf-8');
      await execFileAsync(
        process.execPath,
        ['scripts/mobile-uiux/generate-production-assets.ts', '--check'],
        { cwd: process.cwd() }
      );
    } catch (error) {
      failed = true;
      const record = getRecord(error);
      failureText = String(record.stderr ?? record.stdout ?? record.message);
    } finally {
      await writeFile(outputPath, original, 'utf-8');
    }

    expect(failed).toBe(true);
    expect(failureText).toContain(
      'Mobile UIUX production assets are out of date'
    );
    expect(failureText).toContain(
      'npm run mobile-uiux:generate-production-assets'
    );
  });

  it('skips writing unchanged generated assets', async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      'scripts/mobile-uiux/generate-production-assets.ts',
    ]);

    expect(stdout).toContain('up to date');
    expect(stdout).toContain('home.dc.html');
    expect(stdout).toContain('reservations.dc.html');
  });
});

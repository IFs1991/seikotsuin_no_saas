import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MobileUiuxScreenResource } from './bridge-manifest';
import { patchMobileUiuxDcScript } from './dc-script-patch';
import { transformMobileUiuxHtml } from './html-transform';

export type MobileUiuxProductionAssetResource = Extract<
  MobileUiuxScreenResource,
  | 'home'
  | 'reservations'
  | 'patients'
  | 'daily-reports'
  | 'settings'
  | 'settings-detail'
>;

export type MobileUiuxHydratedProductionAssetResource = Extract<
  MobileUiuxProductionAssetResource,
  | 'home'
  | 'reservations'
  | 'patients'
  | 'daily-reports'
  | 'settings'
  | 'settings-detail'
>;

export const MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
  'settings-detail',
] as const satisfies readonly MobileUiuxProductionAssetResource[];

export const MOBILE_UIUX_HYDRATED_PRODUCTION_ASSET_RESOURCES = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
  'settings-detail',
] as const satisfies readonly MobileUiuxHydratedProductionAssetResource[];

export const MOBILE_UIUX_PRODUCTION_ASSET_NOTES = {
  home: 'production shell + generated read hydration adapter',
  reservations: 'production shell + generated read/write bridge adapter',
  patients: 'production shell + generated patient analysis hydration adapter',
  'daily-reports': 'production shell + generated read/write bridge adapter',
  settings: 'production shell + generated settings bridge adapter',
  'settings-detail':
    'production shell + generated settings-detail bridge adapter',
} as const satisfies Record<MobileUiuxProductionAssetResource, string>;

const SOURCE_ASSET_ROOT = path.join(
  process.cwd(),
  'private-assets',
  'mobile-uiux'
);
const DEFAULT_PRODUCTION_ASSET_ROOT = path.join(
  process.cwd(),
  'private-assets',
  'mobile-uiux-production'
);

function resolveProductionAssetRoot(): string {
  const overrideRoot = process.env.MOBILE_UIUX_PRODUCTION_ASSET_ROOT?.trim();
  return overrideRoot
    ? path.resolve(overrideRoot)
    : DEFAULT_PRODUCTION_ASSET_ROOT;
}

const productionAssetContentCache = new Map<
  MobileUiuxProductionAssetResource,
  string
>();
const productionAssetReadCache = new Map<
  MobileUiuxProductionAssetResource,
  Promise<string | null>
>();

export function isMobileUiuxProductionAssetResource(
  resource: MobileUiuxScreenResource
): resource is MobileUiuxProductionAssetResource {
  return MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES.includes(
    resource as MobileUiuxProductionAssetResource
  );
}

export function isMobileUiuxHydratedProductionAssetResource(
  resource: MobileUiuxProductionAssetResource
): resource is MobileUiuxHydratedProductionAssetResource {
  return MOBILE_UIUX_HYDRATED_PRODUCTION_ASSET_RESOURCES.includes(
    resource as MobileUiuxHydratedProductionAssetResource
  );
}

export function getMobileUiuxSourceAssetPath(
  resource: MobileUiuxProductionAssetResource
): string {
  return path.join(SOURCE_ASSET_ROOT, `${resource}.dc.html`);
}

export function getMobileUiuxProductionAssetPath(
  resource: MobileUiuxProductionAssetResource
): string {
  return path.join(resolveProductionAssetRoot(), `${resource}.dc.html`);
}

export function getMobileUiuxProductionAssetRoot(): string {
  return resolveProductionAssetRoot();
}

export function buildMobileUiuxProductionAsset(
  resource: MobileUiuxProductionAssetResource,
  sourceHtml: string
): string {
  const productionShell = transformMobileUiuxHtml(sourceHtml, {
    mode: 'production',
    resource,
  });

  const productionAsset = isMobileUiuxHydratedProductionAssetResource(resource)
    ? patchMobileUiuxDcScript(productionShell, { screen: resource })
    : productionShell;

  validateMobileUiuxProductionAsset(resource, productionAsset);
  return productionAsset;
}

export function validateMobileUiuxProductionAsset(
  resource: MobileUiuxProductionAssetResource,
  html: string
): void {
  const violations = collectMobileUiuxProductionAssetViolations(resource, html);
  if (violations.length > 0) {
    throw new Error(
      `Invalid Mobile UIUX production asset for ${resource}:\n${violations
        .map(violation => `- ${violation}`)
        .join('\n')}`
    );
  }
}

function collectMobileUiuxProductionAssetViolations(
  resource: MobileUiuxProductionAssetResource,
  html: string
): string[] {
  const violations: string[] = [];
  const dcScriptCount =
    html.match(/<script\b(?=[^>]*\bdata-dc-script\b)/gi)?.length ?? 0;
  const bridgeScriptCount =
    html.match(/<script\b(?=[^>]*\bdata-mobile-uiux-bridge\b)/gi)?.length ?? 0;
  const productionStyleCount =
    html.match(/<style\b(?=[^>]*\bdata-mobile-uiux-production-shell\b)/gi)
      ?.length ?? 0;
  // ロール別ナビ非表示CSSのセレクタ([data-mobile-uiux-nav-target=…])は
  // 数えず、DOM属性としての出現のみカウントする
  const navTargetCount =
    html.match(/(?<!\[)data-mobile-uiux-nav-target=/g)?.length ?? 0;

  if (!html.includes('<x-dc')) violations.push('missing <x-dc>');
  if (!html.includes('<helmet')) violations.push('missing <helmet>');
  if (dcScriptCount !== 1) {
    violations.push(
      `expected one script[data-dc-script], found ${dcScriptCount}`
    );
  }
  if (!html.includes('class Component extends DCLogic')) {
    violations.push('missing Component DCLogic class');
  }
  if (!html.includes('ref="{{ setRoot }}"')) {
    violations.push('missing ref="{{ setRoot }}"');
  }
  if (!html.includes('data-mobile-uiux-production-root')) {
    violations.push('missing data-mobile-uiux-production-root');
  }
  if (!html.includes('data-mobile-uiux-shell="production"')) {
    violations.push('missing production shell body marker');
  }
  if (!html.includes('data-mobile-uiux-initial-read="hydrated"')) {
    violations.push('missing initial read hydration visibility guard');
  }
  if (!html.includes('visibility: hidden !important')) {
    violations.push('missing initial sample visibility guard');
  }
  if (productionStyleCount !== 1) {
    violations.push(
      `expected one production shell style, found ${productionStyleCount}`
    );
  }
  if (navTargetCount !== 5) {
    violations.push(
      `expected five Bottom Nav targets, found ${navTargetCount}`
    );
  }
  for (const target of [
    'home',
    'reservations',
    'patients',
    'daily-reports',
    'settings',
  ]) {
    if (!html.includes(`data-mobile-uiux-nav-target="${target}"`)) {
      violations.push(`missing Bottom Nav target ${target}`);
    }
  }
  for (const role of ['therapist', 'staff']) {
    const selector = `html[data-mobile-uiux-canonical-role="${role}"] [data-mobile-uiux-nav-target="home"]`;
    if (!html.includes(selector)) {
      violations.push(`missing role nav visibility rule for ${role}`);
    }
  }
  if (resource === 'settings') {
    if (!html.includes('この機能は準備中です')) {
      violations.push('missing shift stub toast message');
    }
    if (!html.includes("badge: '準備中'")) {
      violations.push('missing shift stub badge');
    }
  }
  if (bridgeScriptCount !== 0) {
    violations.push(
      `generated asset must not include bridge script, found ${bridgeScriptCount}`
    );
  }
  if (html.includes('STAGE CONTROLS')) {
    violations.push('stage controls were not removed');
  }
  if (html.includes('width: 390px; height: 812px')) {
    violations.push('iPhone mock frame was not removed');
  }
  if (html.includes('width: 108px; height: 30px')) {
    violations.push('dynamic island was not removed');
  }

  if (isMobileUiuxHydratedProductionAssetResource(resource)) {
    if (!html.includes('__mobileUiuxOriginalRenderVals')) {
      violations.push('missing generated renderVals delegate');
    }
    if (!html.includes('window.__MOBILE_UIUX_APPLY_READ_DATA__')) {
      violations.push('missing read hydration bridge registration');
    }
  } else if (html.includes('__mobileUiuxOriginalRenderVals')) {
    violations.push(
      'screen is shell-only but unexpectedly contains a hydration adapter'
    );
  }

  return violations;
}

export async function readMobileUiuxProductionAsset(
  resource: MobileUiuxScreenResource
): Promise<string | null> {
  if (!isMobileUiuxProductionAssetResource(resource)) {
    return null;
  }

  const cachedContent = productionAssetContentCache.get(resource);
  if (cachedContent !== undefined) {
    return cachedContent;
  }

  const cachedRead = productionAssetReadCache.get(resource);
  if (cachedRead) {
    return cachedRead;
  }

  const readPromise = readProductionAssetFromDisk(resource).finally(() => {
    productionAssetReadCache.delete(resource);
  });
  productionAssetReadCache.set(resource, readPromise);
  return readPromise;
}

async function readProductionAssetFromDisk(
  resource: MobileUiuxProductionAssetResource
): Promise<string | null> {
  try {
    const content = await readFile(
      getMobileUiuxProductionAssetPath(resource),
      'utf-8'
    );
    productionAssetContentCache.set(resource, content);
    return content;
  } catch (error) {
    if (!isNodeFileNotFoundError(error)) {
      throw error;
    }
    return null;
  }
}

function isNodeFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

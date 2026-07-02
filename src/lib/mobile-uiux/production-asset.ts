import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MobileUiuxScreenResource } from './bridge-manifest';
import { patchMobileUiuxDcScript } from './dc-script-patch';
import { transformMobileUiuxHtml } from './html-transform';

export type MobileUiuxProductionAssetResource = Extract<
  MobileUiuxScreenResource,
  'reservations'
>;

export const MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES = [
  'reservations',
] as const satisfies readonly MobileUiuxProductionAssetResource[];

const SOURCE_ASSET_ROOT = path.join(
  process.cwd(),
  'private-assets',
  'mobile-uiux'
);
const PRODUCTION_ASSET_ROOT = path.join(
  process.cwd(),
  'private-assets',
  'mobile-uiux-production'
);

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

export function getMobileUiuxSourceAssetPath(
  resource: MobileUiuxProductionAssetResource
): string {
  return path.join(SOURCE_ASSET_ROOT, `${resource}.dc.html`);
}

export function getMobileUiuxProductionAssetPath(
  resource: MobileUiuxProductionAssetResource
): string {
  return path.join(PRODUCTION_ASSET_ROOT, `${resource}.dc.html`);
}

export function getMobileUiuxProductionAssetRoot(): string {
  return PRODUCTION_ASSET_ROOT;
}

export function buildMobileUiuxProductionAsset(
  resource: MobileUiuxProductionAssetResource,
  sourceHtml: string
): string {
  const productionShell = transformMobileUiuxHtml(sourceHtml, {
    mode: 'production',
    resource,
  });

  return patchMobileUiuxDcScript(productionShell, { screen: resource });
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

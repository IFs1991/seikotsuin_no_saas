import 'server-only';

import path from 'node:path';
import { readFile } from 'node:fs/promises';

export interface MobileUiuxAsset {
  content: string;
  contentType: string;
}

interface MobileUiuxAssetFile {
  privateFileName: string;
  sourceFileName: string | null;
}

const HTML_SCREEN_ASSETS = {
  home: {
    privateFileName: 'home.dc.html',
    sourceFileName: 'ホームダッシュボードモバイルUI.dc.html',
  },
  reservations: {
    privateFileName: 'reservations.dc.html',
    sourceFileName: '予約モバイルUI.dc.html',
  },
  patients: {
    privateFileName: 'patients.dc.html',
    sourceFileName: '患者分析モバイルUI.dc.html',
  },
  'daily-reports': {
    privateFileName: 'daily-reports.dc.html',
    sourceFileName: '日報モバイルUI.dc.html',
  },
  settings: {
    privateFileName: 'settings.dc.html',
    sourceFileName: '設定モバイルUI.dc.html',
  },
  'settings-detail': {
    privateFileName: 'settings-detail.dc.html',
    sourceFileName: '設定詳細モバイルUI.dc.html',
  },
} as const satisfies Record<string, MobileUiuxAssetFile>;

const SCRIPT_ASSETS = {
  'support.js': {
    privateFileName: 'support.js',
    sourceFileName: 'support.js',
  },
  'clinic-shared.js': {
    privateFileName: 'clinic-shared.js',
    sourceFileName: 'clinic-shared.js',
  },
  'mobile-bridge.js': {
    privateFileName: 'mobile-bridge.js',
    sourceFileName: null,
  },
} as const satisfies Record<string, MobileUiuxAssetFile>;

function privateAssetBasePath(): string {
  return path.join(process.cwd(), 'private-assets', 'mobile-uiux');
}

function sourceAssetBasePath(): string {
  return path.join(process.cwd(), 'モバイルUIUX設計');
}

function normalizeHtmlResource(resource: string): string {
  return resource
    .replace(/\.dc\.html$/i, '')
    .replace(/\.html$/i, '')
    .trim();
}

function resolveAssetFile(resource: string): MobileUiuxAssetFile | null {
  if (resource.toLowerCase().endsWith('.js')) {
    return SCRIPT_ASSETS[resource as keyof typeof SCRIPT_ASSETS] ?? null;
  }

  const normalizedResource = normalizeHtmlResource(resource);
  return (
    HTML_SCREEN_ASSETS[normalizedResource as keyof typeof HTML_SCREEN_ASSETS] ??
    null
  );
}

function resolveContentType(resource: string): string {
  return resource.toLowerCase().endsWith('.js')
    ? 'application/javascript; charset=utf-8'
    : 'text/html; charset=utf-8';
}

async function readAssetCandidate(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

async function readAssetFile(
  assetFile: MobileUiuxAssetFile
): Promise<string | null> {
  const privateAsset = await readAssetCandidate(
    path.join(privateAssetBasePath(), assetFile.privateFileName)
  );

  if (privateAsset !== null || assetFile.sourceFileName === null) {
    return privateAsset;
  }

  return await readAssetCandidate(
    path.join(sourceAssetBasePath(), assetFile.sourceFileName)
  );
}

export async function loadMobileUiuxAsset(
  resource: string
): Promise<MobileUiuxAsset | null> {
  const assetFile = resolveAssetFile(resource);
  if (!assetFile) {
    return null;
  }

  const content = await readAssetFile(assetFile);
  if (content === null) {
    return null;
  }

  return {
    content,
    contentType: resolveContentType(resource),
  };
}

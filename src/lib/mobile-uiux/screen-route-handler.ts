import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

import { createErrorResponse } from '@/lib/api-helpers';
import {
  ADMIN_USER_ROLE_VALUES,
  normalizeRole,
  ROLE_LABELS,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { resolveMobileUiuxPrincipal } from '@/lib/mobile-uiux/access';
import {
  buildMobileUiuxBridgeScript,
  injectMobileUiuxBridgeScript,
  injectMobileUiuxInlineContext,
  isMobileUiuxScreenResource,
  MOBILE_UIUX_SCREEN_MANIFEST,
  type MobileUiuxScreenRouteResource,
} from '@/lib/mobile-uiux/bridge-manifest';
import { fetchClinicNames } from '@/lib/mobile-uiux/clinic-names';
import type {
  MobileUiuxContextResponse,
  MobileUiuxPublicFlags,
} from '@/lib/mobile-uiux/contracts';
import {
  MOBILE_UIUX_DISPLAY_MODE_COOKIE,
  normalizeMobileUiuxDisplayMode,
} from '@/lib/mobile-uiux/display-mode';
import { resolveMobileUiuxRolloutWithEntitlements } from '@/lib/mobile-uiux/entitlements';
import { getMobileUiuxFlags } from '@/lib/mobile-uiux/flags';
import { resolveStaffDisplayName } from '@/lib/mobile-uiux/identity';
import { transformMobileUiuxHtml } from '@/lib/mobile-uiux/html-transform';
import { readMobileUiuxProductionAsset } from '@/lib/mobile-uiux/production-asset';
import {
  logMobileUiuxDeniedAccess,
  mapMobileUiuxPrincipalDeniedReason,
  mapMobileUiuxRolloutDeniedReason,
} from '@/lib/mobile-uiux/route-utils';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
  resolveScopedClinicIds,
  type SupabaseServerClient,
} from '@/lib/supabase';

const ASSET_ROOT = path.join(process.cwd(), 'private-assets', 'mobile-uiux');
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

const REACT_RUNTIME_MODULES = [
  {
    name: 'scheduler',
    pathSegments: ['scheduler', 'cjs', 'scheduler.production.js'],
  },
  {
    name: 'react',
    pathSegments: ['react', 'cjs', 'react.production.js'],
  },
  {
    name: 'react-dom',
    pathSegments: ['react-dom', 'cjs', 'react-dom.production.js'],
  },
  {
    name: 'react-dom/client',
    pathSegments: ['react-dom', 'cjs', 'react-dom-client.production.js'],
  },
] as const;

const SCREEN_DEFINITIONS = {
  home: {
    fileName: 'home.dc.html',
    contentType: 'text/html; charset=utf-8',
    allowedRoles: ['admin', 'clinic_admin', 'manager'] as const,
  },
  reservations: {
    fileName: 'reservations.dc.html',
    contentType: 'text/html; charset=utf-8',
    allowedRoles: [
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ] as const,
  },
  patients: {
    fileName: 'patients.dc.html',
    contentType: 'text/html; charset=utf-8',
    allowedRoles: [
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ] as const,
  },
  'daily-reports': {
    fileName: 'daily-reports.dc.html',
    contentType: 'text/html; charset=utf-8',
    allowedRoles: [
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ] as const,
  },
  settings: {
    fileName: 'settings.dc.html',
    contentType: 'text/html; charset=utf-8',
    allowedRoles: [
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ] as const,
  },
  'settings-detail': {
    fileName: 'settings-detail.dc.html',
    contentType: 'text/html; charset=utf-8',
    allowedRoles: ['admin', 'clinic_admin', 'manager'] as const,
  },
  'support.js': {
    fileName: 'support.js',
    contentType: 'application/javascript; charset=utf-8',
    allowedRoles: ADMIN_USER_ROLE_VALUES,
  },
  'clinic-shared.js': {
    fileName: 'clinic-shared.js',
    contentType: 'application/javascript; charset=utf-8',
    allowedRoles: ADMIN_USER_ROLE_VALUES,
  },
  'react-runtime.js': {
    fileName: 'react-runtime.js',
    contentType: 'application/javascript; charset=utf-8',
    allowedRoles: ADMIN_USER_ROLE_VALUES,
  },
  'mobile-bridge.js': {
    fileName: 'mobile-bridge.js',
    contentType: 'application/javascript; charset=utf-8',
    allowedRoles: ADMIN_USER_ROLE_VALUES,
  },
} as const;

type ResourceKey = keyof typeof SCREEN_DEFINITIONS;

type ScreenRouteMode = 'production' | 'preview';

const productionShellCache = new Map<string, string>();
let reactRuntimeScriptCache: string | null = null;

function isResourceKey(value: string): value is ResourceKey {
  return Object.prototype.hasOwnProperty.call(SCREEN_DEFINITIONS, value);
}

function isAllowedRole(
  role: string | null,
  allowedRoles: readonly AdminUserRole[]
): role is AdminUserRole {
  return (
    role !== null && allowedRoles.some(allowedRole => allowedRole === role)
  );
}

function buildNoStoreHeaders(contentType: string): Headers {
  return new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });
}

function buildContentETag(content: string): string {
  return `"${createHash('sha256').update(content).digest('hex')}"`;
}

function matchesIfNoneMatch(request: NextRequest, etag: string): boolean {
  const header = request.headers.get('if-none-match');
  if (!header) {
    return false;
  }
  if (header.trim() === '*') {
    return true;
  }
  return header
    .split(',')
    .map(value => value.trim().replace(/^W\//i, ''))
    .includes(etag);
}

// Screens embed per-user state (inline context), so they must revalidate on
// every navigation; the ETag still allows a 304 to skip the ~100KB transfer.
// JS assets carry no tenant data and may be reused briefly without a round trip.
function buildCacheableHeaders(contentType: string, etag: string): Headers {
  return new Headers({
    'Content-Type': contentType,
    'Cache-Control': isHtmlContentType(contentType)
      ? 'private, no-cache'
      : 'private, max-age=3600, must-revalidate',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  });
}

function isHtmlContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith('text/html');
}

function isHtmlResource(resource: string): boolean {
  return (
    !resource.toLowerCase().endsWith('.js') &&
    !resource.toLowerCase().startsWith('api/')
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getErrorTitle(status: 401 | 403 | 404): string {
  switch (status) {
    case 401:
      return 'ログインが必要です';
    case 403:
      return 'アクセス権限がありません';
    case 404:
      return 'ページを表示できません';
  }
}

function buildMobileUiuxHtmlErrorPage(input: {
  status: 401 | 403 | 404;
  message: string;
}): string {
  const title = getErrorTitle(input.status);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #111827;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(100%, 420px);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      line-height: 1.3;
    }
    p {
      margin: 0;
      font-size: 15px;
      line-height: 1.8;
      color: #374151;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        background: #030712;
        color: #f9fafb;
      }
      p {
        color: #d1d5db;
      }
    }
  </style>
</head>
<body>
  <main data-mobile-uiux-error-page>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(input.message)}</p>
  </main>
</body>
</html>`;
}

function createScreenErrorResponse(input: {
  status: 401 | 403 | 404;
  message: string;
  contentType: string;
}) {
  if (!isHtmlContentType(input.contentType)) {
    return createErrorResponse(input.message, input.status);
  }

  return new NextResponse(buildMobileUiuxHtmlErrorPage(input), {
    status: input.status,
    headers: buildNoStoreHeaders(HTML_CONTENT_TYPE),
  });
}

function buildProductionShellCacheKey(
  resource: MobileUiuxScreenRouteResource,
  html: string
): string {
  const digest = createHash('sha256').update(html).digest('hex');
  return `${resource}:${digest}`;
}

function getProductionShell(
  resource: MobileUiuxScreenRouteResource,
  html: string
): string {
  if (!isMobileUiuxScreenResource(resource)) {
    return html;
  }

  const cacheKey = buildProductionShellCacheKey(resource, html);
  const cached = productionShellCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const transformed = transformMobileUiuxHtml(html, {
    mode: 'production',
    resource,
  });
  productionShellCache.set(cacheKey, transformed);
  return transformed;
}

function transformScreenHtml(
  resource: MobileUiuxScreenRouteResource,
  html: string,
  mode: ScreenRouteMode
): string {
  if (!isMobileUiuxScreenResource(resource)) {
    return html;
  }

  if (mode === 'preview') {
    return transformMobileUiuxHtml(html, {
      mode: 'preview',
      resource,
    });
  }

  return getProductionShell(resource, html);
}

async function readNodeModuleProductionFile(
  pathSegments: readonly string[]
): Promise<string> {
  return readFile(path.join(process.cwd(), 'node_modules', ...pathSegments), {
    encoding: 'utf-8',
  });
}

async function buildMobileUiuxReactRuntimeScript(): Promise<string> {
  if (reactRuntimeScriptCache !== null) {
    return reactRuntimeScriptCache;
  }

  const moduleFactories = await Promise.all(
    REACT_RUNTIME_MODULES.map(async moduleDefinition => {
      const source = await readNodeModuleProductionFile(
        moduleDefinition.pathSegments
      );
      return `${JSON.stringify(moduleDefinition.name)}: function(module, exports, require) {\n${source}\n}`;
    })
  );

  reactRuntimeScriptCache = `(() => {
  "use strict";

  const factories = {
    ${moduleFactories.join(',\n    ')}
  };
  const cache = Object.create(null);

  function requireModule(name) {
    if (cache[name]) {
      return cache[name].exports;
    }

    const factory = factories[name];
    if (!factory) {
      throw new Error("mobile-uiux react runtime module not found: " + name);
    }

    const module = { exports: {} };
    cache[name] = module;
    factory(module, module.exports, requireModule);
    return module.exports;
  }

  const React = requireModule("react");
  const ReactDOM = requireModule("react-dom");
  const ReactDOMClient = requireModule("react-dom/client");

  window.React = React;
  window.ReactDOM = Object.assign({}, ReactDOM, ReactDOMClient);
})();`;

  return reactRuntimeScriptCache;
}

/**
 * Builds the same payload the /api/mobile-uiux/context route returns so the
 * screen HTML can inline it and the bridge can skip one authorized fetch.
 * resolveStaffDisplayName / fetchClinicNames are fail-closed, so this never
 * rejects.
 */
async function buildInlineContextData(params: {
  request: NextRequest;
  supabase: SupabaseServerClient;
  userId: string;
  contextClinicId: string | null;
  role: MobileUiuxContextResponse['role']['canonical'];
  clinicIds: string[];
  publicFlags: MobileUiuxPublicFlags;
}): Promise<MobileUiuxContextResponse> {
  const defaultClinicId =
    params.contextClinicId && params.clinicIds.includes(params.contextClinicId)
      ? params.contextClinicId
      : params.clinicIds[0];

  const [displayName, accessibleClinics] = await Promise.all([
    resolveStaffDisplayName(params.supabase, params.userId),
    fetchClinicNames(params.supabase, params.clinicIds),
  ]);

  return {
    role: {
      canonical: params.role,
      label: ROLE_LABELS[params.role],
    },
    defaultClinicId,
    accessibleClinicIds: params.clinicIds,
    displayMode: normalizeMobileUiuxDisplayMode(
      params.request.cookies.get(MOBILE_UIUX_DISPLAY_MODE_COOKIE)?.value
    ),
    flags: params.publicFlags,
    displayName,
    accessibleClinics,
  };
}

export async function handleMobileUiuxScreenRequest(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> },
  mode: ScreenRouteMode
) {
  const { resource } = await context.params;
  const requestedContentType = isResourceKey(resource)
    ? SCREEN_DEFINITIONS[resource].contentType
    : isHtmlResource(resource)
      ? HTML_CONTENT_TYPE
      : 'application/javascript; charset=utf-8';
  const flags = getMobileUiuxFlags();
  if (!flags.enabled) {
    logMobileUiuxDeniedAccess({
      reasonCode: 'flag_disabled',
      role: null,
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount: 0,
      writeTarget: `screen:${resource}`,
      featureFlagEnabled: false,
      status: 404,
    });
    return createScreenErrorResponse({
      message: 'モバイル UI/UX は無効です',
      status: 404,
      contentType: requestedContentType,
    });
  }

  if (!isResourceKey(resource)) {
    return createScreenErrorResponse({
      message: '指定されたモバイル画面は存在しません',
      status: 404,
      contentType: requestedContentType,
    });
  }

  const definition = SCREEN_DEFINITIONS[resource];
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    return createScreenErrorResponse({
      message: '認証が必要です',
      status: 401,
      contentType: definition.contentType,
    });
  }

  const accessContext = await getUserAccessContext(user.id, supabase, { user });
  const normalizedRole = normalizeRole(accessContext.permissions?.role);
  const scopedClinicCount = accessContext.permissions
    ? (resolveScopedClinicIds(accessContext.permissions)?.length ?? 0)
    : 0;
  const principalDecision = await resolveMobileUiuxPrincipal({
    userId: user.id,
    permissions: accessContext.permissions,
    flags,
  });

  if (principalDecision.allowed === false) {
    logMobileUiuxDeniedAccess({
      reasonCode: mapMobileUiuxPrincipalDeniedReason(principalDecision.reason),
      role: normalizedRole,
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount,
      writeTarget: `screen:${resource}`,
      featureFlagEnabled: flags.enabled,
    });
    return createScreenErrorResponse({
      message: 'このモバイル UI/UX へのアクセス権限がありません',
      status: principalDecision.status,
      contentType: definition.contentType,
    });
  }

  if (!isAllowedRole(normalizedRole, definition.allowedRoles)) {
    logMobileUiuxDeniedAccess({
      reasonCode: 'role_denied',
      role: normalizedRole,
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount,
      writeTarget: `screen:${resource}`,
      featureFlagEnabled: flags.enabled,
    });
    return createScreenErrorResponse({
      message: 'このモバイル画面へのアクセス権限がありません',
      status: 403,
      contentType: definition.contentType,
    });
  }

  const rolloutDecision = await resolveMobileUiuxRolloutWithEntitlements({
    supabase,
    principal: principalDecision,
    flags,
  });

  if (rolloutDecision.allowed === false) {
    logMobileUiuxDeniedAccess({
      reasonCode: mapMobileUiuxRolloutDeniedReason(rolloutDecision.reason),
      role: normalizedRole,
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount,
      writeTarget: `screen:${resource}`,
      featureFlagEnabled: rolloutDecision.publicFlags.enabled,
    });
    return createScreenErrorResponse({
      message: 'このモバイル UI/UX へのアクセス権限がありません',
      status: rolloutDecision.status,
      contentType: definition.contentType,
    });
  }

  // Kicked off before the asset read so the display-name / clinic-name
  // queries overlap with file IO. Both helpers are fail-closed and never
  // reject, so this promise is safe to leave in flight on error paths.
  const inlineContextDataPromise =
    mode === 'production' &&
    isMobileUiuxScreenResource(resource) &&
    flags.realDataEnabled
      ? buildInlineContextData({
          request,
          supabase,
          userId: user.id,
          contextClinicId: accessContext.clinicId ?? null,
          role: rolloutDecision.role,
          clinicIds: rolloutDecision.clinicIds,
          publicFlags: rolloutDecision.publicFlags,
        })
      : null;

  let usesProductionAsset = false;
  let content: string;
  if (resource === 'mobile-bridge.js') {
    content = buildMobileUiuxBridgeScript({
      realDataEnabled: flags.realDataEnabled,
      manifest: MOBILE_UIUX_SCREEN_MANIFEST,
    });
  } else if (resource === 'react-runtime.js') {
    content = await buildMobileUiuxReactRuntimeScript();
  } else if (mode === 'production' && isMobileUiuxScreenResource(resource)) {
    const productionAsset = await readMobileUiuxProductionAsset(resource);
    if (productionAsset !== null) {
      content = productionAsset;
      usesProductionAsset = true;
    } else {
      content = await readFile(
        path.join(ASSET_ROOT, definition.fileName),
        'utf-8'
      );
    }
  } else {
    content = await readFile(
      path.join(ASSET_ROOT, definition.fileName),
      'utf-8'
    );
  }

  const shellContent = definition.contentType.startsWith('text/html')
    ? usesProductionAsset
      ? content
      : transformScreenHtml(resource, content, mode)
    : content;
  const baseContent =
    mode === 'production' && isMobileUiuxScreenResource(resource)
      ? injectMobileUiuxBridgeScript(shellContent, resource)
      : shellContent;

  let responseContent = baseContent;
  // generatedAt changes per response, so the ETag hashes the stable parts
  // (shell + context data) to keep 304 revalidation effective.
  let etagSource = baseContent;
  if (inlineContextDataPromise) {
    const contextData = await inlineContextDataPromise;
    etagSource = `${baseContent} ${JSON.stringify(contextData)}`;
    responseContent = injectMobileUiuxInlineContext(baseContent, {
      success: true,
      data: contextData,
      generatedAt: new Date().toISOString(),
    });
  }

  const etag = buildContentETag(etagSource);
  const headers = buildCacheableHeaders(definition.contentType, etag);

  if (matchesIfNoneMatch(request, etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(responseContent, { status: 200, headers });
}

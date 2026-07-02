import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

import { createErrorResponse } from '@/lib/api-helpers';
import {
  ADMIN_USER_ROLE_VALUES,
  normalizeRole,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { evaluateMobileUiuxAccess } from '@/lib/mobile-uiux/access';
import {
  buildMobileUiuxBridgeScript,
  injectMobileUiuxBridgeScript,
  isMobileUiuxScreenResource,
  MOBILE_UIUX_SCREEN_MANIFEST,
  type MobileUiuxScreenRouteResource,
} from '@/lib/mobile-uiux/bridge-manifest';
import { getMobileUiuxFlags } from '@/lib/mobile-uiux/flags';
import { transformMobileUiuxHtml } from '@/lib/mobile-uiux/html-transform';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

const ASSET_ROOT = path.join(process.cwd(), 'private-assets', 'mobile-uiux');

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
    allowedRoles: ['admin', 'clinic_admin', 'manager', 'staff'] as const,
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
  'mobile-bridge.js': {
    fileName: 'mobile-bridge.js',
    contentType: 'application/javascript; charset=utf-8',
    allowedRoles: ADMIN_USER_ROLE_VALUES,
  },
} as const;

type ResourceKey = keyof typeof SCREEN_DEFINITIONS;

type ScreenRouteMode = 'production' | 'preview';

const productionShellCache = new Map<string, string>();

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

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
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

export async function handleMobileUiuxScreenRequest(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> },
  mode: ScreenRouteMode
) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled) {
    return createErrorResponse('モバイル UI/UX は無効です', 404);
  }

  const { resource } = await context.params;

  if (!isResourceKey(resource)) {
    return createErrorResponse('指定されたモバイル画面は存在しません', 404);
  }

  const definition = SCREEN_DEFINITIONS[resource];
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    if (definition.contentType.startsWith('text/html')) {
      return buildLoginRedirect(request);
    }
    return createErrorResponse('認証が必要です', 401);
  }

  const accessContext = await getUserAccessContext(user.id, supabase, { user });
  const normalizedRole = normalizeRole(accessContext.permissions?.role);
  const mobileAccess = evaluateMobileUiuxAccess(
    accessContext.permissions,
    flags
  );

  if (mobileAccess.allowed === false) {
    return createErrorResponse(
      'このモバイル UI/UX へのアクセス権限がありません',
      mobileAccess.status
    );
  }

  if (!isAllowedRole(normalizedRole, definition.allowedRoles)) {
    return createErrorResponse(
      'このモバイル画面へのアクセス権限がありません',
      403
    );
  }

  const filePath = path.join(ASSET_ROOT, definition.fileName);
  const content =
    resource === 'mobile-bridge.js'
      ? buildMobileUiuxBridgeScript({
          realDataEnabled: flags.realDataEnabled,
          manifest: MOBILE_UIUX_SCREEN_MANIFEST,
        })
      : await readFile(filePath, 'utf-8');

  const shellContent = definition.contentType.startsWith('text/html')
    ? transformScreenHtml(resource, content, mode)
    : content;
  const responseContent =
    mode === 'production' && isMobileUiuxScreenResource(resource)
      ? injectMobileUiuxBridgeScript(shellContent, resource)
      : shellContent;

  return new NextResponse(responseContent, {
    status: 200,
    headers: buildNoStoreHeaders(definition.contentType),
  });
}

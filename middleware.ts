import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  applyRateLimits,
  getPathRateLimit,
} from '@/lib/rate-limiting/middleware';
import { CSPConfig } from '@/lib/security/csp-config';
import {
  canAccessAdminUIWithCompat,
  canAccessCrossClinicWithCompat,
} from '@/lib/constants/roles';
import {
  buildUserAuthAccessContext,
  fetchProfileStatus,
  fetchUserPermissionsRecord,
  resolvePermissionRecord,
} from '@/lib/supabase/auth-context';

/**
 * 保護対象ルート（認証必須）
 * @spec docs/認証と権限制御_MVP仕様書.md
 */
const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/staff',
  '/patients',
  '/revenue',
  '/reservations',
  '/daily-reports',
  '/chat',
  '/ai-insights',
  '/blocks',
  '/onboarding',
  '/multi-store',
  '/master-data',
] as const;

/**
 * Admin専用ルート（HQロールのみアクセス可）
 */
const ADMIN_ONLY_PREFIXES = ['/admin'] as const;
const HQ_ONLY_PREFIXES = ['/multi-store'] as const;
const CLINIC_ONLY_PREFIXES = ['/reservations'] as const;
const PILOT_BLOCKED_ROUTE_PREFIXES = [
  '/chat',
  '/ai-insights',
  '/admin/security-',
  '/admin/beta-monitoring',
  '/admin/session-management',
  '/admin/master',
  '/admin/chat',
  '/blocks',
  '/master-data',
] as const;

/**
 * 公開ルート（認証不要）
 */
const ADMIN_PUBLIC_ROUTES = ['/admin/login', '/admin/callback'] as const;
const CLINIC_PUBLIC_ROUTES = ['/login', '/invite'] as const;

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(prefix => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPilotMode = process.env.NEXT_PUBLIC_PILOT_MODE === 'true';

  const rateLimitMiddlewares = getPathRateLimit(pathname);
  if (rateLimitMiddlewares.length > 0) {
    const rateLimitResponse = await applyRateLimits(
      request,
      rateLimitMiddlewares
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  const response = NextResponse.next({ request });

  const nonce = CSPConfig.generateNonce();
  response.headers.set('x-nonce', nonce);
  response.headers.set('x-nonce-timestamp', Date.now().toString());

  try {
    const phaseEnv =
      (process.env.CSP_ROLLOUT_PHASE as
        | 'report-only'
        | 'partial-enforce'
        | 'full-enforce'
        | undefined) ?? 'report-only';
    const rollout = CSPConfig.getGradualRolloutCSP(phaseEnv, nonce);
    if (rollout.csp) {
      response.headers.set('Content-Security-Policy', rollout.csp);
    }
    if (rollout.cspReportOnly) {
      response.headers.set(
        'Content-Security-Policy-Report-Only',
        rollout.cspReportOnly
      );
    }
  } catch (error) {
    // Fail open: CSP should not take the whole app down.
    console.warn('CSP header application failed:', error);
  }

  const isProtectedRoute = matchesAnyPrefix(pathname, PROTECTED_ROUTE_PREFIXES);
  if (!isProtectedRoute) {
    return response;
  }

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  // 公開ルートのチェック
  const isAdminPublicRoute = matchesAnyPrefix(pathname, ADMIN_PUBLIC_ROUTES);
  const isClinicPublicRoute = matchesAnyPrefix(pathname, CLINIC_PUBLIC_ROUTES);
  if (isAdminPublicRoute || isClinicPublicRoute) {
    return response;
  }

  if (isPilotMode && matchesAnyPrefix(pathname, PILOT_BLOCKED_ROUTE_PREFIXES)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const isAdminRoute = matchesAnyPrefix(pathname, ADMIN_ONLY_PREFIXES);
  const isHQRoute = matchesAnyPrefix(pathname, HQ_ONLY_PREFIXES);
  const isClinicRoute = matchesAnyPrefix(pathname, CLINIC_ONLY_PREFIXES);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // 未認証時のリダイレクト先を分岐
    // /admin/** → /admin/login、その他 → /login
    const loginPath = isAdminRoute ? '/admin/login' : '/login';
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute || isHQRoute || isClinicRoute) {
    const [permissionsRecord, profileStatus] = await Promise.all([
      fetchUserPermissionsRecord(supabase, user.id),
      fetchProfileStatus(supabase, user.id),
    ]);
    const permissions = resolvePermissionRecord(permissionsRecord, user);
    const accessContext = buildUserAuthAccessContext(
      permissions,
      profileStatus
    );
    const role = accessContext.normalizedRole;
    const isActive = accessContext.isActive;

    if (isAdminRoute) {
      // Admin UIロールのみ /admin/** にアクセス可能
      // 互換マッピング適用: clinic_manager → clinic_admin
      // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
      if (!role || !isActive || !canAccessAdminUIWithCompat(role)) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }

    if (isHQRoute) {
      if (!role || !isActive || !canAccessCrossClinicWithCompat(role)) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }

    if (isClinicRoute && role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

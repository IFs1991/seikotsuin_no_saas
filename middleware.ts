import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  applyRateLimits,
  getPathRateLimit,
} from '@/lib/rate-limiting/middleware';
import { ADMIN_ROUTE_PATH_HEADER } from '@/lib/admin/routes';
import { CSPConfig } from '@/lib/security/csp-config';
import type { Database } from '@/types/supabase';

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
 * Admin系ルートの判定
 * 未認証時のリダイレクト先を `/admin/login` に切り替えるために使う。
 */
const ADMIN_ONLY_PREFIXES = ['/admin'] as const;
const ADMIN_PUBLIC_ROUTES = ['/admin/login', '/admin/callback'] as const;
const CLINIC_PUBLIC_ROUTES = ['/login', '/invite'] as const;
const AUTH_COOKIE_PREFIX = 'sb-';
const AUTH_COOKIE_SUFFIX = '-auth-token';
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

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(prefix => pathname.startsWith(prefix));
}

function createNextResponse(request: NextRequest, pathname: string) {
  if (!matchesAnyPrefix(pathname, ADMIN_ONLY_PREFIXES)) {
    return NextResponse.next({ request });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ADMIN_ROUTE_PATH_HEADER, pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(cookie => {
    const baseName = cookie.name.split('.')[0];
    return (
      baseName.startsWith(AUTH_COOKIE_PREFIX) &&
      baseName.endsWith(AUTH_COOKIE_SUFFIX)
    );
  });
}

async function hasVerifiedSupabaseSession(
  request: NextRequest,
  response: NextResponse
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  try {
    const requestCookies = request.cookies.getAll();
    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return requestCookies;
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    return !error && Boolean(user);
  } catch {
    return false;
  }
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

  const response = createNextResponse(request, pathname);

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

  if (
    matchesAnyPrefix(pathname, ADMIN_PUBLIC_ROUTES) ||
    matchesAnyPrefix(pathname, CLINIC_PUBLIC_ROUTES)
  ) {
    return response;
  }

  if (isPilotMode && matchesAnyPrefix(pathname, PILOT_BLOCKED_ROUTE_PREFIXES)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (
    !hasSupabaseAuthCookie(request) ||
    !(await hasVerifiedSupabaseSession(request, response))
  ) {
    // 未認証時のリダイレクト先を分岐
    // /admin/** → /admin/login、その他 → /login
    const isAdminRoute = matchesAnyPrefix(pathname, ADMIN_ONLY_PREFIXES);
    const loginPath = isAdminRoute ? '/admin/login' : '/login';
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  applyRateLimits,
  getPathRateLimit,
} from '@/lib/rate-limiting/middleware';
import { CSPConfig } from '@/lib/security/csp-config';

const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/staff',
  '/patients',
  '/revenue',
] as const;

const ADMIN_ONLY_PREFIXES = ['/admin'] as const;
const ADMIN_PUBLIC_ROUTES = ['/admin/login', '/admin/callback'] as const;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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

  const isProtectedRoute = PROTECTED_ROUTE_PREFIXES.some(prefix =>
    pathname.startsWith(prefix)
  );
  if (!isProtectedRoute) {
    return response;
  }

  const isAdminPublicRoute = ADMIN_PUBLIC_ROUTES.some(route =>
    pathname.startsWith(route)
  );
  if (isAdminPublicRoute) {
    return response;
  }

  const isAdminRoute = ADMIN_ONLY_PREFIXES.some(prefix =>
    pathname.startsWith(prefix)
  );

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
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, clinic_id, is_active')
      .eq('user_id', user.id)
      .single();

    type ProfileData = {
      role: string;
      clinic_id: string | null;
      is_active: boolean;
    } | null;
    const typedProfile = profile as ProfileData;

    if (
      !typedProfile ||
      !typedProfile.is_active ||
      !['admin', 'manager'].includes(typedProfile.role)
    ) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

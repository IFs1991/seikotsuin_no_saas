import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  applyRateLimits,
  getPathRateLimit,
} from '@/lib/rate-limiting/middleware';
import { CSPConfig } from '@/lib/security/csp-config';
import {
  normalizeRole,
  canAccessAdminUIWithCompat,
} from '@/lib/constants/roles';

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
  '/master-data',
] as const;

/**
 * Admin専用ルート（HQロールのみアクセス可）
 */
const ADMIN_ONLY_PREFIXES = ['/admin'] as const;
const CLINIC_ONLY_PREFIXES = ['/reservations'] as const;

/**
 * 公開ルート（認証不要）
 */
const ADMIN_PUBLIC_ROUTES = ['/admin/login', '/admin/callback'] as const;
const CLINIC_PUBLIC_ROUTES = ['/login', '/invite'] as const;

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

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  // 公開ルートのチェック
  const isAdminPublicRoute = ADMIN_PUBLIC_ROUTES.some(route =>
    pathname.startsWith(route)
  );
  const isClinicPublicRoute = CLINIC_PUBLIC_ROUTES.some(route =>
    pathname.startsWith(route)
  );
  if (isAdminPublicRoute || isClinicPublicRoute) {
    return response;
  }

  const isAdminRoute = ADMIN_ONLY_PREFIXES.some(prefix =>
    pathname.startsWith(prefix)
  );
  const isClinicRoute = CLINIC_ONLY_PREFIXES.some(prefix =>
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
    // 未認証時のリダイレクト先を分岐
    // /admin/** → /admin/login、その他 → /login
    const loginPath = isAdminRoute ? '/admin/login' : '/login';
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute || isClinicRoute) {
    // user_permissions テーブルを優先的に使用（仕様: single source of truth）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    type PermissionsData = {
      role: string;
      clinic_id: string | null;
    } | null;

    let permissions: PermissionsData = null;
    let isActive = true;

    const { data: userPermissions } = await supabase
      .from('user_permissions')
      .select('role, clinic_id')
      .eq('staff_id', user.id)
      .single();

    if (userPermissions) {
      permissions = userPermissions as PermissionsData;
      // user_permissions にはアクティブフラグがないため、profiles から取得
      const { data: profileActive } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('user_id', user.id)
        .single();
      isActive =
        (profileActive as { is_active?: boolean } | null)?.is_active ?? true;
    } else {
      // フォールバック: profiles テーブルから取得
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, clinic_id, is_active')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const typedProfile = profile as {
          role: string;
          clinic_id: string | null;
          is_active: boolean;
        };
        permissions = {
          role: typedProfile.role,
          clinic_id: typedProfile.clinic_id,
        };
        isActive = typedProfile.is_active;
      }
    }

    if (isAdminRoute) {
      // Admin UIロールのみ /admin/** にアクセス可能
      // 互換マッピング適用: clinic_manager → clinic_admin
      // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
      if (
        !permissions ||
        !isActive ||
        !canAccessAdminUIWithCompat(permissions.role)
      ) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }

    if (isClinicRoute && permissions?.role === 'admin') {
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

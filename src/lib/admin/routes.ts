import {
  canAccessAdminUIWithCompat,
  isAreaManagerRole,
  normalizeRole,
} from '@/lib/constants/roles';

export const ADMIN_ROUTE_PATH_HEADER = 'x-current-path';
export const AREA_MANAGER_ADMIN_HOME_PATH = '/admin';
export const AREA_MANAGER_ADMIN_DEFAULT_PATH = AREA_MANAGER_ADMIN_HOME_PATH;
export const AREA_MANAGER_ADMIN_USERS_PATH = '/admin/users';
export const AREA_MANAGER_ADMIN_SETTINGS_PATH = '/admin/settings';
export const AREA_MANAGER_ADMIN_SHIFT_REQUESTS_PATH = '/admin/shift-requests';
export const ADMIN_MANAGER_ASSIGNMENTS_PATH = '/admin/managers';

const AREA_MANAGER_ADMIN_ROUTE_PREFIXES = [
  AREA_MANAGER_ADMIN_USERS_PATH,
  AREA_MANAGER_ADMIN_SETTINGS_PATH,
  AREA_MANAGER_ADMIN_SHIFT_REQUESTS_PATH,
] as const;

const HQ_ADMIN_ONLY_ROUTE_PREFIXES = [ADMIN_MANAGER_ASSIGNMENTS_PATH] as const;

interface AdminRouteAccessInput {
  readonly role: string | null | undefined;
  readonly pathname: string | null | undefined;
}

function matchesAdminRoutePrefix(
  pathname: string,
  prefix:
    | (typeof AREA_MANAGER_ADMIN_ROUTE_PREFIXES)[number]
    | (typeof HQ_ADMIN_ONLY_ROUTE_PREFIXES)[number]
): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isHqAdminOnlyAdminRoute(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }

  return HQ_ADMIN_ONLY_ROUTE_PREFIXES.some(prefix =>
    matchesAdminRoutePrefix(pathname, prefix)
  );
}

export function canAccessAreaManagerAdminRoute(
  pathname: string | null | undefined
): boolean {
  if (!pathname) {
    return false;
  }

  return (
    pathname === AREA_MANAGER_ADMIN_HOME_PATH ||
    AREA_MANAGER_ADMIN_ROUTE_PREFIXES.some(prefix =>
      matchesAdminRoutePrefix(pathname, prefix)
    )
  );
}

export function canAccessAdminRouteWithCompat({
  role,
  pathname,
}: AdminRouteAccessInput): boolean {
  const normalizedRole = normalizeRole(role);
  if (isHqAdminOnlyAdminRoute(pathname)) {
    return normalizedRole === 'admin';
  }

  if (canAccessAdminUIWithCompat(normalizedRole)) {
    return true;
  }

  return (
    isAreaManagerRole(normalizedRole) &&
    canAccessAreaManagerAdminRoute(pathname)
  );
}

export function shouldRedirectAreaManagerAdminHome({
  role: _role,
  pathname: _pathname,
}: AdminRouteAccessInput): boolean {
  return false;
}

import {
  canAccessAdminUIWithCompat,
  isAreaManagerRole,
  normalizeRole,
} from '@/lib/constants/roles';

export const ADMIN_ROUTE_PATH_HEADER = 'x-current-path';
export const AREA_MANAGER_ADMIN_HOME_PATH = '/admin';
export const AREA_MANAGER_ADMIN_DEFAULT_PATH = '/admin/users';

const AREA_MANAGER_ADMIN_ROUTE_PREFIXES = [
  AREA_MANAGER_ADMIN_DEFAULT_PATH,
] as const;

interface AdminRouteAccessInput {
  readonly role: string | null | undefined;
  readonly pathname: string | null | undefined;
}

function matchesAdminRoutePrefix(
  pathname: string,
  prefix: (typeof AREA_MANAGER_ADMIN_ROUTE_PREFIXES)[number]
): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function canAccessAreaManagerAdminRoute(
  pathname: string | null | undefined
): boolean {
  if (!pathname) {
    return false;
  }

  return AREA_MANAGER_ADMIN_ROUTE_PREFIXES.some(prefix =>
    matchesAdminRoutePrefix(pathname, prefix)
  );
}

export function canAccessAdminRouteWithCompat({
  role,
  pathname,
}: AdminRouteAccessInput): boolean {
  const normalizedRole = normalizeRole(role);
  if (canAccessAdminUIWithCompat(normalizedRole)) {
    return true;
  }

  return (
    isAreaManagerRole(normalizedRole) &&
    canAccessAreaManagerAdminRoute(pathname)
  );
}

export function shouldRedirectAreaManagerAdminHome({
  role,
  pathname,
}: AdminRouteAccessInput): boolean {
  return isAreaManagerRole(role) && pathname === AREA_MANAGER_ADMIN_HOME_PATH;
}
